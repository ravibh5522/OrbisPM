package service

import (
	"context"
	"encoding/json"
	"fmt"
	"html"
	"io"
	"net"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"

	"github.com/redis/go-redis/v9"
)

// LinkPreview is the Open Graph summary of a URL.
type LinkPreview struct {
	URL         string `json:"url"`
	Title       string `json:"title"`
	Description string `json:"description"`
	Image       string `json:"image"`
	Site        string `json:"site"`
}

// UnfurlService fetches a URL server-side and extracts a preview. It is
// SSRF-hardened: only http(s), and any host that resolves to a private,
// loopback, link-local or metadata address is refused — checked again at dial
// time to defeat DNS-rebinding.
type UnfurlService struct {
	rdb    *redis.Client
	client *http.Client
}

func NewUnfurlService(rdb *redis.Client) *UnfurlService {
	transport := &http.Transport{
		DialContext: func(ctx context.Context, network, addr string) (net.Conn, error) {
			host, port, err := net.SplitHostPort(addr)
			if err != nil {
				return nil, err
			}
			ips, err := net.LookupIP(host)
			if err != nil || len(ips) == 0 {
				return nil, fmt.Errorf("cannot resolve host")
			}
			for _, ip := range ips {
				if isBlockedIP(ip) {
					return nil, fmt.Errorf("blocked host")
				}
			}
			d := net.Dialer{Timeout: 5 * time.Second}
			return d.DialContext(ctx, network, net.JoinHostPort(ips[0].String(), port))
		},
		MaxIdleConns:      10,
		IdleConnTimeout:   30 * time.Second,
		DisableKeepAlives: true,
	}
	return &UnfurlService{
		rdb: rdb,
		client: &http.Client{
			Timeout:   6 * time.Second,
			Transport: transport,
			CheckRedirect: func(req *http.Request, via []*http.Request) error {
				if len(via) >= 3 {
					return fmt.Errorf("too many redirects")
				}
				return validatePublicURL(req.URL)
			},
		},
	}
}

func isBlockedIP(ip net.IP) bool {
	if ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast() ||
		ip.IsLinkLocalMulticast() || ip.IsUnspecified() || ip.IsMulticast() {
		return true
	}
	// Cloud metadata endpoint.
	return ip.Equal(net.ParseIP("169.254.169.254"))
}

func validatePublicURL(u *url.URL) error {
	if u.Scheme != "http" && u.Scheme != "https" {
		return fmt.Errorf("unsupported scheme")
	}
	ips, err := net.LookupIP(u.Hostname())
	if err != nil || len(ips) == 0 {
		return fmt.Errorf("cannot resolve host")
	}
	for _, ip := range ips {
		if isBlockedIP(ip) {
			return fmt.Errorf("blocked host")
		}
	}
	return nil
}

var (
	metaOGTitle = regexp.MustCompile(`(?is)<meta[^>]+(?:property|name)=["']og:title["'][^>]*content=["']([^"']*)["']`)
	metaOGTitle2 = regexp.MustCompile(`(?is)<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']og:title["']`)
	metaOGDesc  = regexp.MustCompile(`(?is)<meta[^>]+(?:property|name)=["']og:description["'][^>]*content=["']([^"']*)["']`)
	metaOGImage = regexp.MustCompile(`(?is)<meta[^>]+(?:property|name)=["']og:image["'][^>]*content=["']([^"']*)["']`)
	metaOGSite  = regexp.MustCompile(`(?is)<meta[^>]+(?:property|name)=["']og:site_name["'][^>]*content=["']([^"']*)["']`)
	metaDesc    = regexp.MustCompile(`(?is)<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)["']`)
	htmlTitle   = regexp.MustCompile(`(?is)<title[^>]*>([^<]*)</title>`)
)

func firstMatch(re *regexp.Regexp, s string) string {
	m := re.FindStringSubmatch(s)
	if len(m) > 1 {
		return strings.TrimSpace(html.UnescapeString(m[1]))
	}
	return ""
}

// Unfurl returns a preview for the URL, cached in Redis for an hour.
func (s *UnfurlService) Unfurl(ctx context.Context, raw string) (*LinkPreview, error) {
	u, err := url.Parse(raw)
	if err != nil {
		return nil, fmt.Errorf("invalid url")
	}
	if err := validatePublicURL(u); err != nil {
		return nil, err
	}

	cacheKey := "chat:unfurl:" + raw
	if s.rdb != nil {
		if cached, err := s.rdb.Get(ctx, cacheKey).Result(); err == nil {
			var lp LinkPreview
			if json.Unmarshal([]byte(cached), &lp) == nil {
				return &lp, nil
			}
		}
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, raw, nil)
	if err != nil {
		return nil, fmt.Errorf("invalid url")
	}
	req.Header.Set("User-Agent", "OrbisPM-LinkPreview/1.0 (+bot)")
	req.Header.Set("Accept", "text/html,application/xhtml+xml")

	resp, err := s.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("fetch failed")
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("fetch status %d", resp.StatusCode)
	}
	if ct := resp.Header.Get("Content-Type"); !strings.Contains(ct, "text/html") &&
		!strings.Contains(ct, "application/xhtml") {
		return nil, fmt.Errorf("not html")
	}

	body, _ := io.ReadAll(io.LimitReader(resp.Body, 512*1024)) // 512KB cap
	doc := string(body)

	lp := &LinkPreview{URL: raw, Site: u.Hostname()}
	lp.Title = firstMatch(metaOGTitle, doc)
	if lp.Title == "" {
		lp.Title = firstMatch(metaOGTitle2, doc)
	}
	if lp.Title == "" {
		lp.Title = firstMatch(htmlTitle, doc)
	}
	lp.Description = firstMatch(metaOGDesc, doc)
	if lp.Description == "" {
		lp.Description = firstMatch(metaDesc, doc)
	}
	lp.Image = firstMatch(metaOGImage, doc)
	if site := firstMatch(metaOGSite, doc); site != "" {
		lp.Site = site
	}
	// Resolve a relative image URL against the page.
	if lp.Image != "" {
		if imgURL, err := u.Parse(lp.Image); err == nil {
			lp.Image = imgURL.String()
		}
	}

	if s.rdb != nil {
		if data, err := json.Marshal(lp); err == nil {
			s.rdb.Set(ctx, cacheKey, data, time.Hour)
		}
	}
	return lp, nil
}
