package middleware

import (
	"compress/gzip"
	"io"
	"net/http"
	"strings"
	"sync"
)

const minCompressSize = 512

var gzipWriterPool = sync.Pool{
	New: func() any {
		w, _ := gzip.NewWriterLevel(io.Discard, gzip.DefaultCompression)
		return w
	},
}

// gzipResponseWriter wraps http.ResponseWriter to transparently compress the
// response body. Compression is deferred until we know the response is large
// enough and eligible.
type gzipResponseWriter struct {
	http.ResponseWriter
	gzWriter    *gzip.Writer
	buf         []byte
	code        int
	headerSent  bool
	skipCompress bool
}

func (g *gzipResponseWriter) WriteHeader(code int) {
	g.code = code

	// Check content type for SSE – must skip compression.
	ct := g.Header().Get("Content-Type")
	if strings.HasPrefix(ct, "text/event-stream") {
		g.skipCompress = true
	}

	if g.skipCompress {
		g.headerSent = true
		g.ResponseWriter.WriteHeader(code)
	}
	// Otherwise defer WriteHeader until we know whether to compress.
}

func (g *gzipResponseWriter) Write(b []byte) (int, error) {
	if g.skipCompress {
		return g.ResponseWriter.Write(b)
	}

	// If gzip writer already active, write directly.
	if g.gzWriter != nil {
		return g.gzWriter.Write(b)
	}

	// Buffer data until we reach the threshold.
	g.buf = append(g.buf, b...)
	if len(g.buf) < minCompressSize {
		return len(b), nil
	}

	// Threshold reached – enable compression and flush buffer.
	g.enableGzip()
	return len(b), nil
}

func (g *gzipResponseWriter) enableGzip() {
	g.Header().Set("Content-Encoding", "gzip")
	g.Header().Set("Vary", "Accept-Encoding")
	g.Header().Del("Content-Length")

	if g.code == 0 {
		g.code = http.StatusOK
	}
	g.ResponseWriter.WriteHeader(g.code)
	g.headerSent = true

	gz := gzipWriterPool.Get().(*gzip.Writer)
	gz.Reset(g.ResponseWriter)
	g.gzWriter = gz

	if len(g.buf) > 0 {
		g.gzWriter.Write(g.buf)
		g.buf = nil
	}
}

// finish flushes any remaining buffered data. If the total response was below
// the compression threshold the data is written uncompressed.
func (g *gzipResponseWriter) finish() {
	if g.gzWriter != nil {
		g.gzWriter.Close()
		gzipWriterPool.Put(g.gzWriter)
		return
	}

	// Response was smaller than threshold – send uncompressed.
	if !g.headerSent {
		if g.code == 0 {
			g.code = http.StatusOK
		}
		g.ResponseWriter.WriteHeader(g.code)
	}
	if len(g.buf) > 0 {
		g.ResponseWriter.Write(g.buf)
	}
}

// Flush implements http.Flusher so SSE and streaming still work.
func (g *gzipResponseWriter) Flush() {
	if g.gzWriter != nil {
		g.gzWriter.Flush()
	}
	if f, ok := g.ResponseWriter.(http.Flusher); ok {
		f.Flush()
	}
}

// Compress is HTTP middleware that gzip-compresses responses when the client
// advertises gzip support via Accept-Encoding. Small responses (< 512 bytes),
// WebSocket upgrades, and SSE streams are not compressed.
func Compress(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Only compress when the client supports gzip.
		if !strings.Contains(r.Header.Get("Accept-Encoding"), "gzip") {
			next.ServeHTTP(w, r)
			return
		}

		// Skip WebSocket upgrades.
		if strings.EqualFold(r.Header.Get("Upgrade"), "websocket") {
			next.ServeHTTP(w, r)
			return
		}

		// Always set Vary so caches know the response depends on encoding.
		w.Header().Set("Vary", "Accept-Encoding")

		grw := &gzipResponseWriter{
			ResponseWriter: w,
		}
		defer grw.finish()

		next.ServeHTTP(grw, r)
	})
}
