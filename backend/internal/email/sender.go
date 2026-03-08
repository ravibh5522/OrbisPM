package email

import (
	"fmt"
	"net/smtp"
	"strings"
)

// Sender sends emails via SMTP.
type Sender struct {
	host     string
	port     int
	user     string
	password string
	from     string
	enabled  bool
}

// Config holds SMTP configuration.
type Config struct {
	Host     string
	Port     int
	User     string
	Password string
	From     string
	Enabled  bool
}

// NewSender creates a new email sender.
func NewSender(cfg Config) *Sender {
	return &Sender{
		host:     cfg.Host,
		port:     cfg.Port,
		user:     cfg.User,
		password: cfg.Password,
		from:     cfg.From,
		enabled:  cfg.Enabled,
	}
}

// Message represents an email message.
type Message struct {
	To      string
	Subject string
	Body    string
}

// Send sends an email message.
func (s *Sender) Send(msg Message) error {
	if !s.enabled {
		return nil
	}

	headers := []string{
		fmt.Sprintf("From: %s", s.from),
		fmt.Sprintf("To: %s", msg.To),
		fmt.Sprintf("Subject: %s", msg.Subject),
		"MIME-Version: 1.0",
		`Content-Type: text/html; charset="utf-8"`,
	}

	raw := strings.Join(headers, "\r\n") + "\r\n\r\n" + msg.Body

	addr := fmt.Sprintf("%s:%d", s.host, s.port)

	var auth smtp.Auth
	if s.user != "" {
		auth = smtp.PlainAuth("", s.user, s.password, s.host)
	}

	return smtp.SendMail(addr, auth, s.from, []string{msg.To}, []byte(raw))
}

// IsEnabled returns whether email sending is enabled.
func (s *Sender) IsEnabled() bool {
	return s.enabled
}

// FormatNotificationEmail builds an HTML email body for a notification.
func FormatNotificationEmail(title, body, frontendURL string) string {
	return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
body{font-family:sans-serif;margin:0;padding:0;background:#f5f5f5}
.c{max-width:600px;margin:0 auto;padding:20px}
.card{background:#fff;border-radius:8px;padding:24px;box-shadow:0 1px 3px rgba(0,0,0,.1)}
.hdr{color:#6366f1;font-size:14px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;margin-bottom:16px}
h2{font-size:18px;color:#1f2937;margin:0 0 8px}
p{font-size:14px;color:#4b5563;line-height:1.6;margin:0}
.cta{display:inline-block;margin-top:16px;padding:10px 20px;background:#6366f1;color:#fff;text-decoration:none;border-radius:6px;font-size:14px}
.ft{margin-top:24px;text-align:center;font-size:12px;color:#9ca3af}
</style>
</head>
<body>
<div class="c">
<div class="card">
<div class="hdr">OrbisPM Notification</div>
<h2>` + title + `</h2>
<p>` + body + `</p>
<a href="` + frontendURL + `" class="cta">Open OrbisPM</a>
</div>
<div class="ft">You received this because of your notification preferences.</div>
</div>
</body>
</html>`
}
