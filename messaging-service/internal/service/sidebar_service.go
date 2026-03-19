package service

import (
	"context"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/orbispm/messaging-service/internal/domain"
	"github.com/orbispm/messaging-service/internal/middleware"
	"github.com/orbispm/messaging-service/internal/pkg/tenant"
	"github.com/orbispm/messaging-service/internal/repository"
)

// SidebarService provides hierarchical channel sidebar data and user search.
type SidebarService struct {
	pool     *pgxpool.Pool
	txMgr    *repository.TxManager
	channelR repository.ChannelRepository
	memberR  repository.ChannelMemberRepository
	catRepo  repository.CategoryRepository
}

// NewSidebarService creates a new SidebarService.
func NewSidebarService(
	pool *pgxpool.Pool,
	txMgr *repository.TxManager,
	channelR repository.ChannelRepository,
	memberR repository.ChannelMemberRepository,
	catRepo repository.CategoryRepository,
) *SidebarService {
	return &SidebarService{pool: pool, txMgr: txMgr, channelR: channelR, memberR: memberR, catRepo: catRepo}
}

// GetSidebar returns a hierarchical view of the user's channels.
func (s *SidebarService) GetSidebar(ctx context.Context) (*domain.SidebarData, error) {
	userID := middleware.UserIDFromCtx(ctx)
	orgID := tenant.OrgID(ctx)

	var sidebar domain.SidebarData

	err := s.txMgr.WithTx(ctx, func(tx pgx.Tx) error {
		// Get all channels the user is a member of
		channels, _, err := s.channelR.ListByUser(ctx, tx, userID, 500, 0)
		if err != nil {
			return err
		}

		// Collect unique team IDs from channels the user is a member of
		teamIDSet := make(map[uuid.UUID]bool)
		for _, ch := range channels {
			if ch.TeamID != nil {
				teamIDSet[*ch.TeamID] = true
			}
		}

		// Build team map from teams table for team IDs found in channels
		teamMap := make(map[uuid.UUID]*domain.SidebarTeam)
		if len(teamIDSet) > 0 {
			teamIDs := make([]uuid.UUID, 0, len(teamIDSet))
			for id := range teamIDSet {
				teamIDs = append(teamIDs, id)
			}
			teamRows, err := s.pool.Query(ctx,
				`SELECT id, name, manager_id
				 FROM teams WHERE id = ANY($1) ORDER BY name`, teamIDs)
			if err != nil {
				return err
			}
			defer teamRows.Close()

			for teamRows.Next() {
				var t domain.SidebarTeam
				if err := teamRows.Scan(&t.ID, &t.Name, &t.ManagerID); err != nil {
					return err
				}
				t.Channels = []domain.Channel{}
				teamMap[t.ID] = &t
			}
		}

		// Build project → teams map using project_teams + projects.team_id
		projectTeamMap := make(map[uuid.UUID][]uuid.UUID) // projectID → []teamID
		ptRows, err := s.pool.Query(ctx,
			`SELECT DISTINCT pt.project_id, pt.team_id FROM project_teams pt
			 JOIN teams t ON t.id = pt.team_id
			 WHERE t.org_id = $1
			 UNION
			 SELECT p.id, p.team_id FROM projects p
			 WHERE p.org_id = $1 AND p.team_id IS NOT NULL`, orgID)
		if err != nil {
			return err
		}
		defer ptRows.Close()
		for ptRows.Next() {
			var pid, tid uuid.UUID
			if err := ptRows.Scan(&pid, &tid); err != nil {
				return err
			}
			projectTeamMap[pid] = append(projectTeamMap[pid], tid)
		}

		// Categorize channels
		for _, ch := range channels {
			switch ch.Type {
			case domain.ChannelTypeTeam:
				if ch.TeamID != nil {
					if team, ok := teamMap[*ch.TeamID]; ok {
						team.Channels = append(team.Channels, ch)
					} else {
						sidebar.GroupChannels = append(sidebar.GroupChannels, ch)
					}
				} else {
					sidebar.GroupChannels = append(sidebar.GroupChannels, ch)
				}
			case domain.ChannelTypeProject:
				// Place project channels inside their linked team(s)
				placed := false
				if ch.ProjectID != nil {
					if teamIDs, ok := projectTeamMap[*ch.ProjectID]; ok {
						for _, tid := range teamIDs {
							if team, ok := teamMap[tid]; ok {
								team.Channels = append(team.Channels, ch)
								placed = true
							}
						}
					}
				}
				if !placed {
					sidebar.ProjectChannels = append(sidebar.ProjectChannels, ch)
				}
			case domain.ChannelTypeDM:
				sidebar.DMChannels = append(sidebar.DMChannels, ch)
			default:
				sidebar.GroupChannels = append(sidebar.GroupChannels, ch)
			}
		}

		// Enrich DM channel names with other user's display name
		if len(sidebar.DMChannels) > 0 {
			for i := range sidebar.DMChannels {
				dm := &sidebar.DMChannels[i]
				if dm.DMPair == "" {
					continue
				}
				parts := strings.Split(dm.DMPair, ":")
				var otherID string
				for _, p := range parts {
					if p != userID.String() && p != "00000000-0000-0000-0000-000000000000" {
						otherID = p
						break
					}
				}
				if otherID == "" {
					continue
				}
				otherUUID, err := uuid.Parse(otherID)
				if err != nil {
					continue
				}
				var displayName, email, avatarURL string
				_ = s.pool.QueryRow(ctx,
					`SELECT COALESCE(display_name, ''), COALESCE(email, ''), COALESCE(avatar_url, '')
					 FROM users WHERE id = $1`, otherUUID,
				).Scan(&displayName, &email, &avatarURL)
				if displayName != "" {
					dm.Name = displayName
				} else if email != "" {
					dm.Name = email
				}
				if dm.Description == "" && email != "" {
					dm.Description = email
				}
			}
		}

		// Convert map to slice
		for _, team := range teamMap {
			sidebar.Teams = append(sidebar.Teams, *team)
		}

		return nil
	})

	if err != nil {
		return nil, err
	}

	// Ensure non-nil slices for JSON
	if sidebar.Teams == nil {
		sidebar.Teams = []domain.SidebarTeam{}
	}
	if sidebar.ProjectChannels == nil {
		sidebar.ProjectChannels = []domain.Channel{}
	}
	if sidebar.DMChannels == nil {
		sidebar.DMChannels = []domain.Channel{}
	}
	if sidebar.GroupChannels == nil {
		sidebar.GroupChannels = []domain.Channel{}
	}

	return &sidebar, nil
}

// SearchOrgMembers searches org members by name/email for DM creation and mentions.
func (s *SidebarService) SearchOrgMembers(ctx context.Context, query string, limit int) ([]domain.OrgMemberInfo, error) {
	orgID := tenant.OrgID(ctx)

	if limit <= 0 || limit > 50 {
		limit = 20
	}

	// Search by display_name or email (case-insensitive)
	q := "%" + strings.ToLower(query) + "%"
	rows, err := s.pool.Query(ctx, `
		SELECT om.user_id, COALESCE(u.display_name, ''), COALESCE(u.email, ''), COALESCE(u.avatar_url, '')
		FROM org_members om
		LEFT JOIN users u ON u.id = om.user_id
		WHERE om.org_id = $1
		  AND (LOWER(u.display_name) LIKE $2 OR LOWER(u.email) LIKE $2)
		ORDER BY u.display_name
		LIMIT $3`, orgID, q, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var members []domain.OrgMemberInfo
	for rows.Next() {
		var m domain.OrgMemberInfo
		if err := rows.Scan(&m.UserID, &m.DisplayName, &m.Email, &m.AvatarURL); err != nil {
			return nil, err
		}
		members = append(members, m)
	}

	if members == nil {
		members = []domain.OrgMemberInfo{}
	}
	return members, nil
}
