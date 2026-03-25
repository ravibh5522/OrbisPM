package main

import (
	"fmt"
	"log"
	"net/url"
	"os"
	"strings"

	"github.com/golang-migrate/migrate/v4"
	_ "github.com/golang-migrate/migrate/v4/database/postgres"
	_ "github.com/golang-migrate/migrate/v4/source/file"
)

func main() {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		log.Fatal("DATABASE_URL environment variable is required")
	}

	// Use a separate migrations table so messaging-service migrations do not
	// conflict with the main backend's schema_migrations table in the shared DB.
	dbURL = addMigrationsTable(dbURL, "messaging_schema_migrations")

	migrationsPath := os.Getenv("MIGRATIONS_PATH")
	if migrationsPath == "" {
		migrationsPath = "file://db/migrations"
	}

	m, err := migrate.New(migrationsPath, dbURL)
	if err != nil {
		log.Fatalf("failed to create migrate instance: %v", err)
	}

	cmd := "up"
	if len(os.Args) > 1 {
		cmd = os.Args[1]
	}

	switch cmd {
	case "up":
		if err := m.Up(); err != nil && err != migrate.ErrNoChange {
			log.Fatalf("migration up failed: %v", err)
		}
		fmt.Println("messaging-service migrations applied successfully")
	case "down":
		if err := m.Down(); err != nil && err != migrate.ErrNoChange {
			log.Fatalf("migration down failed: %v", err)
		}
		fmt.Println("messaging-service migrations rolled back successfully")
	case "version":
		version, dirty, err := m.Version()
		if err != nil {
			log.Fatalf("failed to get version: %v", err)
		}
		fmt.Printf("version: %d, dirty: %v\n", version, dirty)
	case "force":
		if len(os.Args) < 3 {
			log.Fatal("usage: migrate force <version>")
		}
		var version int
		if _, err := fmt.Sscanf(os.Args[2], "%d", &version); err != nil {
			log.Fatalf("invalid version: %v", err)
		}
		if err := m.Force(version); err != nil {
			log.Fatalf("force failed: %v", err)
		}
		fmt.Printf("forced to version %d\n", version)
	default:
		log.Fatalf("unknown command: %s (use: up, down, version, force)", cmd)
	}
}

// addMigrationsTable appends x-migrations-table to a postgres URL without
// overwriting any existing query parameters or fragment.
func addMigrationsTable(dbURL, table string) string {
	u, err := url.Parse(dbURL)
	if err != nil || !strings.HasPrefix(u.Scheme, "postgres") {
		return dbURL
	}
	q := u.Query()
	q.Set("x-migrations-table", table)
	u.RawQuery = q.Encode()
	return u.String()
}
