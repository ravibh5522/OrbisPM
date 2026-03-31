package repository

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// RoleMemberChecker checks if a role slug is in use by any members.
type RoleMemberChecker struct {
	pool *pgxpool.Pool
}

func NewRoleMemberChecker(pool *pgxpool.Pool) *RoleMemberChecker {
	return &RoleMemberChecker{pool: pool}
}

// CountMembersWithRole returns how many members have a given role slug in the specified scope.
func (c *RoleMemberChecker) CountMembersWithRole(ctx context.Context, orgID uuid.UUID, scope, roleSlug string) (int, error) {
	var count int
	var err error

	switch scope {
	case "org":
		err = c.pool.QueryRow(ctx,
			`SELECT COUNT(*) FROM org_members WHERE org_id = $1 AND role = $2`,
			orgID, roleSlug).Scan(&count)
	case "team":
		err = c.pool.QueryRow(ctx,
			`SELECT COUNT(*) FROM team_members tm
			 JOIN teams t ON t.id = tm.team_id
			 WHERE t.org_id = $1 AND tm.role = $2`,
			orgID, roleSlug).Scan(&count)
	case "project":
		err = c.pool.QueryRow(ctx,
			`SELECT COUNT(*) FROM project_members pm
			 JOIN projects p ON p.id = pm.project_id
			 WHERE p.org_id = $1 AND pm.role = $2`,
			orgID, roleSlug).Scan(&count)
	default:
		return 0, fmt.Errorf("unknown scope: %s", scope)
	}

	if err != nil {
		return 0, fmt.Errorf("count members with role: %w", err)
	}
	return count, nil
}
