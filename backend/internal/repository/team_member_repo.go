package repository

import (
	"context"
	"fmt"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/orbispm/orbispm/internal/domain"
)

type teamMemberRepo struct {
	pool *pgxpool.Pool
}

func NewTeamMemberRepo(pool *pgxpool.Pool) TeamMemberRepository {
	return &teamMemberRepo{pool: pool}
}

func (r *teamMemberRepo) Add(ctx context.Context, tx pgx.Tx, m *domain.TeamMember) error {
	q := conn(r.pool, tx)
	_, err := q.Exec(ctx,
		`INSERT INTO team_members (team_id, user_id, role) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
		m.TeamID, m.UserID, m.Role)
	if err != nil {
		return fmt.Errorf("add team member: %w", err)
	}
	return nil
}

func (r *teamMemberRepo) Remove(ctx context.Context, tx pgx.Tx, teamID, userID uuid.UUID) error {
	q := conn(r.pool, tx)
	_, err := q.Exec(ctx, `DELETE FROM team_members WHERE team_id = $1 AND user_id = $2`, teamID, userID)
	return err
}

func (r *teamMemberRepo) UpdateRole(ctx context.Context, tx pgx.Tx, teamID, userID uuid.UUID, role string) error {
	q := conn(r.pool, tx)
	tag, err := q.Exec(ctx,
		`UPDATE team_members SET role = $3 WHERE team_id = $1 AND user_id = $2`,
		teamID, userID, role)
	if err != nil {
		return fmt.Errorf("update team member role: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("team member not found")
	}
	return nil
}

func (r *teamMemberRepo) ListByTeam(ctx context.Context, teamID uuid.UUID) ([]*domain.TeamMember, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT m.team_id, m.user_id, COALESCE(u.email, ''), COALESCE(u.display_name, ''), COALESCE(u.avatar_url, ''), m.role, m.joined_at
		 FROM team_members m
		 LEFT JOIN users u ON u.id = m.user_id
		 WHERE m.team_id = $1 ORDER BY m.joined_at`, teamID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var members []*domain.TeamMember
	for rows.Next() {
		var m domain.TeamMember
		if err := rows.Scan(&m.TeamID, &m.UserID, &m.Email, &m.DisplayName, &m.AvatarURL, &m.Role, &m.JoinedAt); err != nil {
			return nil, err
		}
		members = append(members, &m)
	}
	return members, rows.Err()
}

func (r *teamMemberRepo) ListByTeamPaginated(ctx context.Context, teamID uuid.UUID, f MemberFilter) ([]*domain.TeamMember, int, error) {
	where := []string{"m.team_id = $1"}
	args := []any{teamID}
	argIdx := 2

	if f.Search != nil && *f.Search != "" {
		where = append(where, fmt.Sprintf("(u.display_name ILIKE $%d OR u.email ILIKE $%d)", argIdx, argIdx))
		args = append(args, "%"+*f.Search+"%")
		argIdx++
	}
	if f.Role != nil && *f.Role != "" {
		where = append(where, fmt.Sprintf("m.role = $%d", argIdx))
		args = append(args, *f.Role)
		argIdx++
	}

	whereClause := strings.Join(where, " AND ")

	// Count
	var total int
	countQuery := fmt.Sprintf(
		`SELECT COUNT(*) FROM team_members m LEFT JOIN users u ON u.id = m.user_id WHERE %s`, whereClause)
	if err := r.pool.QueryRow(ctx, countQuery, args...).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("count team members: %w", err)
	}

	// Sort
	orderClause := "m.joined_at ASC"
	allowedSortCols := map[string]string{
		"display_name": "u.display_name",
		"email":        "u.email",
		"role":         "m.role",
		"joined_at":    "m.joined_at",
	}
	if f.SortBy != "" {
		if col, ok := allowedSortCols[f.SortBy]; ok {
			dir := "ASC"
			if f.SortOrder == "desc" {
				dir = "DESC"
			}
			orderClause = fmt.Sprintf("%s %s", col, dir)
		}
	}

	limit := f.Limit
	if limit <= 0 {
		limit = 20
	}
	offset := f.Offset
	if offset < 0 {
		offset = 0
	}

	query := fmt.Sprintf(
		`SELECT m.team_id, m.user_id, COALESCE(u.email, ''), COALESCE(u.display_name, ''), COALESCE(u.avatar_url, ''), m.role, m.joined_at
		 FROM team_members m
		 LEFT JOIN users u ON u.id = m.user_id
		 WHERE %s
		 ORDER BY %s
		 LIMIT $%d OFFSET $%d`, whereClause, orderClause, argIdx, argIdx+1)
	args = append(args, limit, offset)

	rows, err := r.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, 0, fmt.Errorf("list team members paginated: %w", err)
	}
	defer rows.Close()

	var members []*domain.TeamMember
	for rows.Next() {
		var m domain.TeamMember
		if err := rows.Scan(&m.TeamID, &m.UserID, &m.Email, &m.DisplayName, &m.AvatarURL, &m.Role, &m.JoinedAt); err != nil {
			return nil, 0, err
		}
		members = append(members, &m)
	}
	return members, total, rows.Err()
}

func (r *teamMemberRepo) GetByTeamAndUser(ctx context.Context, teamID, userID uuid.UUID) (*domain.TeamMember, error) {
	row := r.pool.QueryRow(ctx,
		`SELECT m.team_id, m.user_id, COALESCE(u.email, ''), COALESCE(u.display_name, ''), COALESCE(u.avatar_url, ''), m.role, m.joined_at
		 FROM team_members m
		 LEFT JOIN users u ON u.id = m.user_id
		 WHERE m.team_id = $1 AND m.user_id = $2`, teamID, userID)
	var m domain.TeamMember
	err := row.Scan(&m.TeamID, &m.UserID, &m.Email, &m.DisplayName, &m.AvatarURL, &m.Role, &m.JoinedAt)
	if err != nil {
		return nil, err
	}
	return &m, nil
}
