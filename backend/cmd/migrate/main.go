package main

import (
	"errors"
	"fmt"
	"log"
	"os"

	"github.com/golang-migrate/migrate/v4"
	_ "github.com/golang-migrate/migrate/v4/database/postgres"
	_ "github.com/golang-migrate/migrate/v4/source/file"
)

func main() {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		dbURL = "postgres://orbispm:orbispm@localhost:5432/orbispm?sslmode=disable"
	}

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
		if err := runUp(m); err != nil {
			log.Fatalf("migration up failed: %v", err)
		}
		fmt.Println("migrations applied successfully")
	case "down":
		if err := m.Down(); err != nil && !errors.Is(err, migrate.ErrNoChange) {
			log.Fatalf("migration down failed: %v", err)
		}
		fmt.Println("migrations rolled back successfully")
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

// runUp runs migrations up, auto-healing a dirty database state by forcing back
// to the last clean version and retrying once. This handles crashes mid-migration.
func runUp(m *migrate.Migrate) error {
	err := m.Up()
	if err == nil || errors.Is(err, migrate.ErrNoChange) {
		return nil
	}

	var dirtyErr migrate.ErrDirty
	if !errors.As(err, &dirtyErr) {
		return err
	}

	// Auto-heal: a dirty state means the previous migration attempt failed
	// mid-execution. Force back to the last clean version (dirtyErr.Version - 1)
	// so the migration can be retried from scratch.
	prevVersion := dirtyErr.Version - 1
	log.Printf("dirty database at version %d detected — forcing back to version %d and retrying", dirtyErr.Version, prevVersion)

	if forceErr := m.Force(prevVersion); forceErr != nil {
		return fmt.Errorf("failed to force version %d during dirty-state recovery: %w", prevVersion, forceErr)
	}

	if retryErr := m.Up(); retryErr != nil && !errors.Is(retryErr, migrate.ErrNoChange) {
		return fmt.Errorf("migration failed after dirty-state recovery (version %d → %d): %w", prevVersion, dirtyErr.Version, retryErr)
	}

	log.Printf("dirty-state recovery successful — now at clean version %d", dirtyErr.Version)
	return nil
}
