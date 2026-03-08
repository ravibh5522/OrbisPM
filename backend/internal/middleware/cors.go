package middleware

import (
	"github.com/go-chi/cors"
)

// CORS returns a configured CORS middleware handler.
func CORS(frontendURL string) func(next interface{}) interface{} {
	_ = cors.New(cors.Options{
		AllowedOrigins:   []string{frontendURL},
		AllowedMethods:   []string{"GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "X-Request-ID", "X-API-Key"},
		ExposedHeaders:   []string{"X-Request-ID"},
		AllowCredentials: true,
		MaxAge:           300,
	})
	// Return nil — we'll use chi cors directly in the router setup
	return nil
}

// NewCORSHandler creates a cors.Handler for use in chi middleware chain.
func NewCORSHandler(frontendURL string) *cors.Cors {
	return cors.New(cors.Options{
		AllowedOrigins:   []string{frontendURL},
		AllowedMethods:   []string{"GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "X-Request-ID", "X-API-Key"},
		ExposedHeaders:   []string{"X-Request-ID"},
		AllowCredentials: true,
		MaxAge:           300,
	})
}
