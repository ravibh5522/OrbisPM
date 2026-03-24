package service

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rs/zerolog/log"

	"github.com/orbispm/messaging-service/internal/domain"
	"github.com/orbispm/messaging-service/internal/repository"
)

// SyncService auto-creates and syncs channels for teams and projects
// by directly reading the main backend tables (shared DB).
type SyncService struct {
	pool     *pgxpool.Pool
	txMgr    *repository.TxManager
	channelR repository.ChannelRepository
	memberR  repository.ChannelMemberRepository
}

// NewSyncService creates a new SyncService.
func NewSyncService(
	pool *pgxpool.Pool,
	txMgr *repository.TxManager,
	channelR repository.ChannelRepository,
	memberR repository.ChannelMemberRepository,
) *SyncService {
	return &SyncService{pool: pool, txMgr: txMgr, channelR: channelR, memberR: memberR}
}

// teamRow represents a team from the main backend.
type teamRow struct {
	ID    uuid.UUID
	OrgID uuid.UUID
	Name  string
}

// projectRow represents a project from the main backend.
type projectRow struct {
	ID    uuid.UUID
	OrgID uuid.UUID
	Name  string
}

// memberRow represents a user from membership tables.
type memberRow struct {
	UserID      uuid.UUID
	DisplayName string
}

// Start runs an initial sync and then periodically.
func (s *SyncService) Start(ctx context.Context, interval time.Duration) {
	log.Info().Dur("interval", interval).Msg("sync service started")
	s.runSync(ctx)

	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			s.runSync(ctx)
		}
	}
}

func (s *SyncService) runSync(ctx context.Context) {
	if err := s.syncTeamChannels(ctx); err != nil {
		log.Error().Err(err).Msg("sync team channels failed")
	}
	if err := s.syncProjectChannels(ctx); err != nil {
		log.Error().Err(err).Msg("sync project channels failed")
	}
}

// syncTeamChannels ensures every team has a #general channel with correct members.
func (s *SyncService) syncTeamChannels(ctx context.Context) error {
	// Read all teams directly from the main backend table
	rows, err := s.pool.Query(ctx, `SELECT id, org_id, name FROM teams`)
	if err != nil {
		return err
	}
	defer rows.Close()

	var teams []teamRow
	for rows.Next() {
		var t teamRow
		if err := rows.Scan(&t.ID, &t.OrgID, &t.Name); err != nil {
			return err
		}
		teams = append(teams, t)
	}
	rows.Close() // close before opening more queries

	for _, team := range teams {
		if err := s.ensureTeamChannel(ctx, team); err != nil {
			log.Error().Err(err).Str("team_id", team.ID.String()).Msg("sync team channel error")
		}
	}
	return nil
}

// syncProjectChannels ensures every project has a channel with correct members.
func (s *SyncService) syncProjectChannels(ctx context.Context) error {
	rows, err := s.pool.Query(ctx, `SELECT id, org_id, name FROM projects WHERE status = 'active'`)
	if err != nil {
		return err
	}
	defer rows.Close()

	var projects []projectRow
	for rows.Next() {
		var p projectRow
		if err := rows.Scan(&p.ID, &p.OrgID, &p.Name); err != nil {
			return err
		}
		projects = append(projects, p)
	}
	rows.Close() // close before opening more queries

	for _, proj := range projects {
		if err := s.ensureProjectChannel(ctx, proj); err != nil {
			log.Error().Err(err).Str("project_id", proj.ID.String()).Msg("sync project channel error")
		}
	}
	return nil
}

func (s *SyncService) ensureTeamChannel(ctx context.Context, team teamRow) error {
	// ── Fetch members OUTSIDE the transaction ──────────────────────────────
	// pool.Query inside a WithOrgTx callback races with the open transaction
	// and may hit a different connection with no RLS context, causing a policy
	// violation that aborts the transaction (SQLSTATE 25P02).
	memberRows, err := s.pool.Query(ctx,
		`SELECT tm.user_id, COALESCE(u.display_name, '')
		 FROM team_members tm
		 LEFT JOIN users u ON u.id = tm.user_id
		 WHERE tm.team_id = $1`, team.ID)
	if err != nil {
		return fmt.Errorf("fetch team members: %w", err)
	}
	var members []memberRow
	for memberRows.Next() {
		var m memberRow
		if err := memberRows.Scan(&m.UserID, &m.DisplayName); err != nil {
			memberRows.Close()
			return fmt.Errorf("scan team member: %w", err)
		}
		members = append(members, m)
	}
	memberRows.Close()

	// ── All writes inside a single transaction ────────────────────────────
	return s.txMgr.WithOrgTx(ctx, team.OrgID, func(tx pgx.Tx) error {
		var channelID uuid.UUID
		err := tx.QueryRow(ctx,
			`SELECT id FROM channels WHERE auto_source = 'team' AND auto_source_id = $1 AND name = 'general' LIMIT 1`,
			team.ID,
		).Scan(&channelID)

		if err != nil {
			if err != pgx.ErrNoRows {
				return fmt.Errorf("lookup team channel: %w", err)
			}
			// Channel doesn't exist — create it
			ch := &domain.Channel{
				OrgID:       team.OrgID,
				Name:        "general",
				Description: "General discussion for " + team.Name,
				Type:        domain.ChannelTypeTeam,
				TeamID:      &team.ID,
			}
			if err := s.channelR.Create(ctx, tx, ch); err != nil {
				return err
			}
			if _, err := tx.Exec(ctx,
				`UPDATE channels SET is_auto_managed = true, auto_source = 'team', auto_source_id = $1 WHERE id = $2`,
				team.ID, ch.ID,
			); err != nil {
				return err
			}
			channelID = ch.ID
		}

		for _, m := range members {
			isMember, err := s.memberR.IsMember(ctx, tx, channelID, m.UserID)
			if err != nil {
				return err
			}
			if !isMember {
				cm := &domain.ChannelMember{
					ChannelID: channelID,
					UserID:    m.UserID,
					Role:      domain.MemberRoleMember,
				}
				if err := s.memberR.Add(ctx, tx, cm); err != nil {
					log.Warn().Err(err).Str("user_id", m.UserID.String()).Msg("failed to add team member to channel")
				}
			}
		}
		return nil
	})
}

func (s *SyncService) ensureProjectChannel(ctx context.Context, proj projectRow) error {
	// ── Fetch members OUTSIDE the transaction (same reason as ensureTeamChannel) ──
	memberRows, err := s.pool.Query(ctx,
		`SELECT DISTINCT pm.user_id, COALESCE(u.display_name,'')
		 FROM project_members pm
		 LEFT JOIN users u ON u.id = pm.user_id
		 WHERE pm.project_id = $1`, proj.ID)
	if err != nil {
		return fmt.Errorf("fetch project members: %w", err)
	}
	var members []memberRow
	for memberRows.Next() {
		var m memberRow
		if err := memberRows.Scan(&m.UserID, &m.DisplayName); err != nil {
			memberRows.Close()
			return fmt.Errorf("scan project member: %w", err)
		}
		members = append(members, m)
	}
	memberRows.Close()

	// ── All writes inside a single transaction ────────────────────────────
	return s.txMgr.WithOrgTx(ctx, proj.OrgID, func(tx pgx.Tx) error {
		var channelID uuid.UUID
		err := tx.QueryRow(ctx,
			`SELECT id FROM channels WHERE auto_source = 'project' AND auto_source_id = $1 LIMIT 1`,
			proj.ID,
		).Scan(&channelID)

		if err != nil {
			if err != pgx.ErrNoRows {
				return fmt.Errorf("lookup project channel: %w", err)
			}
			// Channel doesn't exist — create it
			ch := &domain.Channel{
				OrgID:       proj.OrgID,
				Name:        proj.Name,
				Description: "Project channel for " + proj.Name,
				Type:        domain.ChannelTypeProject,
				ProjectID:   &proj.ID,
			}
			if err := s.channelR.Create(ctx, tx, ch); err != nil {
				return err
			}
			if _, err := tx.Exec(ctx,
				`UPDATE channels SET is_auto_managed = true, auto_source = 'project', auto_source_id = $1 WHERE id = $2`,
				proj.ID, ch.ID,
			); err != nil {
				return err
			}
			channelID = ch.ID
		}

		for _, m := range members {
			isMember, err := s.memberR.IsMember(ctx, tx, channelID, m.UserID)
			if err != nil {
				return err
			}
			if !isMember {
				cm := &domain.ChannelMember{
					ChannelID: channelID,
					UserID:    m.UserID,
					Role:      domain.MemberRoleMember,
				}
				if err := s.memberR.Add(ctx, tx, cm); err != nil {
					log.Warn().Err(err).Str("user_id", m.UserID.String()).Msg("failed to add project member to channel")
				}
			}
		}
		return nil
	})
}
