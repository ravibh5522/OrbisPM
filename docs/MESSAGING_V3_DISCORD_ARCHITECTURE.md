# OrbisPM Messaging V3 — Discord-Style Architecture with gRPC Microservices

> **Goal:** Transform OrbisPM into a fully integrated collaboration platform with Discord-like messaging, auto-managed teams/projects, gRPC-based microservice communication, and comprehensive user management.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [gRPC Microservice Integration](#2-grpc-microservice-integration)
3. [Auto Team Management](#3-auto-team-management)
4. [Auto Project Management](#4-auto-project-management)
5. [Discord-Like Messaging Features](#5-discord-like-messaging-features)
6. [User Management System](#6-user-management-system)
7. [Event-Driven Triggers](#7-event-driven-triggers)
8. [Database Schema Updates](#8-database-schema-updates)
9. [Implementation Phases](#9-implementation-phases)
10. [API Specifications](#10-api-specifications)

---

## 1. Architecture Overview

### High-Level System Design

```
┌────────────────────────────────────────────────────────────────────────────────┐
│                              FRONTEND (Next.js 15)                             │
│  ┌──────────────────────────────────────────────────────────────────────────┐  │
│  │                    Discord-Style 3-Panel Layout                          │  │
│  │  ┌────────────┬─────────────────────────────┬─────────────────────────┐  │  │
│  │  │  Server    │       Channel View          │    Member/Thread        │  │  │
│  │  │  Sidebar   │  (Messages + Media + @refs) │       Panel             │  │  │
│  │  │            │                             │                         │  │  │
│  │  │  Orgs/DMs  │   ├─ Message bubbles        │   ├─ Online users       │  │  │
│  │  │  Teams     │   ├─ File attachments       │   ├─ User roles         │  │  │
│  │  │  Channels  │   ├─ Reactions              │   ├─ Member mgmt        │  │  │
│  │  │  Projects  │   ├─ Threads (inline)       │   ├─ Permissions        │  │  │
│  │  │  Users     │   └─ Typing indicators      │   └─ Channel info       │  │  │
│  │  └────────────┴─────────────────────────────┴─────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────────────┘
                                       │
                                Kong Gateway (:8000)
                                       │
         ┌─────────────────────────────┼─────────────────────────────┐
         │                             │                             │
         ▼                             ▼                             ▼
┌─────────────────────┐   ┌─────────────────────┐   ┌─────────────────────┐
│   Main Backend      │   │  Messaging Service  │   │   User Service      │
│  (Go, Chi, :8080)   │   │  (Go, Chi, :8082)   │   │   (Go, :8083)       │
│                     │◄─gRPC─►│                 │◄─gRPC─►│              │
│  ├─ Orgs/Teams      │   │  ├─ Channels        │   │  ├─ Profiles       │
│  ├─ Projects        │   │  ├─ Messages        │   │  ├─ Presence       │
│  ├─ Tasks           │   │  ├─ WebSocket Hub   │   │  ├─ Status         │
│  └─ RBAC            │   │  └─ NATS Events     │   │  └─ Settings       │
└─────────────────────┘   └─────────────────────┘   └─────────────────────┘
         │                             │                             │
         └─────────────────────────────┼─────────────────────────────┘
                                       │
                              ┌────────┴────────┐
                              │   NATS + Redis  │
                              │   Event Bus     │
                              └─────────────────┘
                                       │
                    ┌──────────────────┼──────────────────┐
                    │                  │                  │
                    ▼                  ▼                  ▼
            ┌────────────┐     ┌────────────┐     ┌────────────┐
            │ PostgreSQL │     │   MinIO    │     │  Zitadel   │
            │ (RLS)      │     │  Storage   │     │   Auth     │
            └────────────┘     └────────────┘     └────────────┘
```

### Service Communication Matrix

| From \ To        | Main Backend  | Messaging | User Service  | Frontend |
| ---------------- | ------------- | --------- | ------------- | -------- |
| **Main Backend** | —             | gRPC      | gRPC          | REST+WS  |
| **Messaging**    | gRPC          | —         | gRPC          | REST+WS  |
| **User Service** | gRPC          | gRPC      | —             | REST     |
| **Frontend**     | REST via Kong | REST+WS   | REST via Kong | —        |

---

## 2. gRPC Microservice Integration

### 2.1 Proto Definitions

Create new directory: `proto/` at repository root with shared proto files.

```protobuf
// proto/common/common.proto
syntax = "proto3";
package orbispm.common;
option go_package = "github.com/orbispm/proto/common";

import "google/protobuf/timestamp.proto";

message UUID {
  string value = 1;
}

message Pagination {
  int32 page = 1;
  int32 page_size = 2;
  int32 total = 3;
}

message UserInfo {
  UUID id = 1;
  string email = 2;
  string display_name = 3;
  string avatar_url = 4;
  string status = 5;  // online, away, dnd, offline
}
```

```protobuf
// proto/team/team.proto
syntax = "proto3";
package orbispm.team;
option go_package = "github.com/orbispm/proto/team";

import "common/common.proto";
import "google/protobuf/timestamp.proto";

service TeamService {
  // Team Management
  rpc GetTeam(GetTeamRequest) returns (Team);
  rpc ListTeams(ListTeamsRequest) returns (ListTeamsResponse);
  rpc CreateTeam(CreateTeamRequest) returns (Team);
  rpc UpdateTeam(UpdateTeamRequest) returns (Team);
  rpc DeleteTeam(DeleteTeamRequest) returns (DeleteTeamResponse);

  // Member Management
  rpc GetMembers(GetMembersRequest) returns (GetMembersResponse);
  rpc AddMember(AddMemberRequest) returns (TeamMember);
  rpc RemoveMember(RemoveMemberRequest) returns (RemoveMemberResponse);
  rpc UpdateMemberRole(UpdateMemberRoleRequest) returns (TeamMember);

  // Manager Management
  rpc SetManager(SetManagerRequest) returns (Team);
  rpc GetTeamsByManager(GetTeamsByManagerRequest) returns (ListTeamsResponse);

  // Auto-Creation
  rpc AutoCreateTeam(AutoCreateTeamRequest) returns (Team);
}

message Team {
  common.UUID id = 1;
  common.UUID org_id = 2;
  string name = 3;
  string description = 4;
  common.UUID manager_id = 5;     // Team manager/lead
  common.UserInfo manager = 6;     // Populated on fetch
  int32 member_count = 7;
  bool is_auto_managed = 8;        // Auto-created team
  string auto_source = 9;          // 'department', 'project', etc.
  google.protobuf.Timestamp created_at = 10;
  google.protobuf.Timestamp updated_at = 11;
}

message TeamMember {
  common.UUID team_id = 1;
  common.UUID user_id = 2;
  common.UserInfo user = 3;
  string role = 4;                 // team_lead, member, viewer
  bool is_manager = 5;
  google.protobuf.Timestamp joined_at = 6;
}

message CreateTeamRequest {
  common.UUID org_id = 1;
  string name = 2;
  string description = 3;
  common.UUID manager_id = 4;
  repeated common.UUID initial_member_ids = 5;
}

message AutoCreateTeamRequest {
  common.UUID org_id = 1;
  string source = 2;               // 'department', 'project_group'
  string source_id = 3;            // External identifier
  string name = 4;
  common.UUID manager_id = 5;
  map<string, string> metadata = 6;
}

message SetManagerRequest {
  common.UUID team_id = 1;
  common.UUID manager_id = 2;
  bool auto_promote_to_lead = 3;   // Promote to team_lead role if not already
}

message GetTeamsByManagerRequest {
  common.UUID manager_id = 1;
  common.UUID org_id = 2;
}

// ... additional messages for remaining RPCs
```

```protobuf
// proto/project/project.proto
syntax = "proto3";
package orbispm.project;
option go_package = "github.com/orbispm/proto/project";

import "common/common.proto";
import "team/team.proto";

service ProjectService {
  // Project Management
  rpc GetProject(GetProjectRequest) returns (Project);
  rpc ListProjects(ListProjectsRequest) returns (ListProjectsResponse);
  rpc CreateProject(CreateProjectRequest) returns (Project);
  rpc UpdateProject(UpdateProjectRequest) returns (Project);
  rpc DeleteProject(DeleteProjectRequest) returns (DeleteProjectResponse);

  // Team Linking (Multi-Team Projects)
  rpc LinkTeams(LinkTeamsRequest) returns (Project);
  rpc UnlinkTeam(UnlinkTeamRequest) returns (Project);
  rpc GetLinkedTeams(GetLinkedTeamsRequest) returns (GetLinkedTeamsResponse);

  // Member Management
  rpc GetMembers(GetProjectMembersRequest) returns (GetProjectMembersResponse);
  rpc AddMember(AddProjectMemberRequest) returns (ProjectMember);
  rpc RemoveMember(RemoveProjectMemberRequest) returns (RemoveMemberResponse);

  // Auto-Creation
  rpc AutoCreateProject(AutoCreateProjectRequest) returns (Project);
  rpc CreateSharedProject(CreateSharedProjectRequest) returns (Project);
}

message Project {
  common.UUID id = 1;
  common.UUID org_id = 2;
  string name = 3;
  string slug = 4;
  string description = 5;
  string status = 6;               // active, archived, completed
  common.UUID lead_id = 7;
  common.UserInfo lead = 8;
  repeated team.Team linked_teams = 9;  // Multi-team support
  int32 member_count = 10;
  bool is_auto_managed = 11;
  string auto_source = 12;
  map<string, string> settings = 13;
  google.protobuf.Timestamp created_at = 14;
}

message ProjectMember {
  common.UUID project_id = 1;
  common.UUID user_id = 2;
  common.UserInfo user = 3;
  string role = 4;                 // lead, contributor, reviewer, observer
  string source = 5;               // 'direct' or 'team'
  common.UUID source_team_id = 6;
  string source_team_name = 7;
  google.protobuf.Timestamp joined_at = 8;
}

message CreateSharedProjectRequest {
  common.UUID org_id = 1;
  string name = 2;
  string description = 3;
  repeated common.UUID team_ids = 4;  // Multiple teams share this project
  common.UUID lead_id = 5;
  bool auto_sync_members = 6;         // Auto-add team members
}

message AutoCreateProjectRequest {
  common.UUID org_id = 1;
  string source = 2;               // 'template', 'workflow', 'external'
  string source_id = 3;
  string name = 4;
  repeated common.UUID team_ids = 5;
  map<string, string> metadata = 6;
}
```

```protobuf
// proto/messaging/messaging.proto
syntax = "proto3";
package orbispm.messaging;
option go_package = "github.com/orbispm/proto/messaging";

import "common/common.proto";

service MessagingService {
  // Channel Management
  rpc CreateChannel(CreateChannelRequest) returns (Channel);
  rpc GetChannel(GetChannelRequest) returns (Channel);
  rpc UpdateChannel(UpdateChannelRequest) returns (Channel);
  rpc DeleteChannel(DeleteChannelRequest) returns (DeleteChannelResponse);
  rpc ArchiveChannel(ArchiveChannelRequest) returns (Channel);

  // Auto-Channel Sync
  rpc SyncTeamChannel(SyncTeamChannelRequest) returns (Channel);
  rpc SyncProjectChannel(SyncProjectChannelRequest) returns (Channel);
  rpc SyncMembership(SyncMembershipRequest) returns (SyncMembershipResponse);

  // Member Management
  rpc AddMembers(AddMembersRequest) returns (AddMembersResponse);
  rpc RemoveMembers(RemoveMembersRequest) returns (RemoveMembersResponse);
  rpc UpdateMemberRole(UpdateChannelMemberRoleRequest) returns (ChannelMember);

  // DM
  rpc GetOrCreateDM(GetOrCreateDMRequest) returns (Channel);

  // Messages
  rpc SendMessage(SendMessageRequest) returns (Message);
  rpc GetMessages(GetMessagesRequest) returns (GetMessagesResponse);

  // Cross-Service Queries
  rpc GetUserChannels(GetUserChannelsRequest) returns (GetUserChannelsResponse);
  rpc NotifyChannel(NotifyChannelRequest) returns (NotifyChannelResponse);
}

message Channel {
  common.UUID id = 1;
  common.UUID org_id = 2;
  string name = 3;
  string description = 4;
  ChannelType type = 5;
  common.UUID team_id = 6;
  common.UUID project_id = 7;
  bool is_archived = 8;
  bool is_auto_managed = 9;
  string auto_source = 10;
  common.UUID auto_source_id = 11;
  int32 member_count = 12;
  int32 unread_count = 13;
  google.protobuf.Timestamp last_activity_at = 14;
  google.protobuf.Timestamp created_at = 15;
}

enum ChannelType {
  CHANNEL_TYPE_UNSPECIFIED = 0;
  CHANNEL_TYPE_DM = 1;
  CHANNEL_TYPE_GROUP = 2;
  CHANNEL_TYPE_TEAM = 3;
  CHANNEL_TYPE_PROJECT = 4;
  CHANNEL_TYPE_ANNOUNCEMENT = 5;
}

message ChannelMember {
  common.UUID channel_id = 1;
  common.UUID user_id = 2;
  common.UserInfo user = 3;
  string role = 4;                   // owner, admin, member
  bool is_muted = 5;
  bool is_pinned = 6;
  google.protobuf.Timestamp last_read_at = 7;
  google.protobuf.Timestamp joined_at = 8;
}

message SyncTeamChannelRequest {
  common.UUID org_id = 1;
  common.UUID team_id = 2;
  string team_name = 3;
  repeated common.UUID member_ids = 4;
  common.UUID manager_id = 5;
}

message SyncProjectChannelRequest {
  common.UUID org_id = 1;
  common.UUID project_id = 2;
  string project_name = 3;
  repeated ProjectMemberSync members = 4;
  repeated common.UUID team_ids = 5;
}

message ProjectMemberSync {
  common.UUID user_id = 1;
  string role = 2;
  string source = 3;
  common.UUID source_team_id = 4;
}

message SyncMembershipRequest {
  common.UUID channel_id = 1;
  repeated common.UUID add_user_ids = 2;
  repeated common.UUID remove_user_ids = 3;
  string source = 4;  // 'team_sync', 'project_sync', 'manual'
}

message NotifyChannelRequest {
  common.UUID channel_id = 1;
  string notification_type = 2;  // 'task_created', 'task_assigned', 'mention', etc.
  string title = 3;
  string body = 4;
  common.UUID actor_id = 5;
  map<string, string> metadata = 6;  // Additional context for rendering
}
```

```protobuf
// proto/user/user.proto
syntax = "proto3";
package orbispm.user;
option go_package = "github.com/orbispm/proto/user";

import "common/common.proto";

service UserService {
  // User Queries
  rpc GetUser(GetUserRequest) returns (User);
  rpc GetUsers(GetUsersRequest) returns (GetUsersResponse);
  rpc SearchUsers(SearchUsersRequest) returns (GetUsersResponse);

  // Presence
  rpc SetPresence(SetPresenceRequest) returns (Presence);
  rpc GetPresence(GetPresenceRequest) returns (Presence);
  rpc GetBulkPresence(GetBulkPresenceRequest) returns (GetBulkPresenceResponse);
  rpc SubscribePresence(SubscribePresenceRequest) returns (stream PresenceUpdate);

  // User Status (Custom Status)
  rpc SetStatus(SetStatusRequest) returns (UserStatus);
  rpc GetStatus(GetStatusRequest) returns (UserStatus);

  // User Settings
  rpc GetSettings(GetSettingsRequest) returns (UserSettings);
  rpc UpdateSettings(UpdateSettingsRequest) returns (UserSettings);
}

message User {
  common.UUID id = 1;
  common.UUID org_id = 2;
  string email = 3;
  string display_name = 4;
  string avatar_url = 5;
  string timezone = 6;
  Presence presence = 7;
  UserStatus status = 8;
  google.protobuf.Timestamp created_at = 9;
}

message Presence {
  common.UUID user_id = 1;
  PresenceState state = 2;
  google.protobuf.Timestamp last_seen_at = 3;
  string current_channel_id = 4;  // Optional: which channel they're viewing
}

enum PresenceState {
  PRESENCE_UNKNOWN = 0;
  PRESENCE_ONLINE = 1;
  PRESENCE_AWAY = 2;
  PRESENCE_DND = 3;       // Do Not Disturb
  PRESENCE_OFFLINE = 4;
  PRESENCE_INVISIBLE = 5; // Online but shown as offline
}

message UserStatus {
  common.UUID user_id = 1;
  string emoji = 2;           // Custom emoji, e.g., "🏠"
  string text = 3;            // Custom status text, e.g., "Working from home"
  google.protobuf.Timestamp clear_at = 4;  // When to auto-clear
}

message UserSettings {
  common.UUID user_id = 1;
  NotificationSettings notifications = 2;
  PrivacySettings privacy = 3;
  DisplaySettings display = 4;
}

message NotificationSettings {
  bool mute_all = 1;
  bool desktop_notifications = 2;
  bool email_notifications = 3;
  bool mobile_push = 4;
  repeated string muted_channels = 5;
  string quiet_hours_start = 6;  // "22:00"
  string quiet_hours_end = 7;    // "08:00"
  string quiet_hours_timezone = 8;
}

message PresenceUpdate {
  common.UUID user_id = 1;
  PresenceState old_state = 2;
  PresenceState new_state = 3;
  google.protobuf.Timestamp timestamp = 4;
}
```

### 2.2 gRPC Service Implementation

#### Directory Structure

```
proto/
├── common/
│   └── common.proto
├── team/
│   └── team.proto
├── project/
│   └── project.proto
├── messaging/
│   └── messaging.proto
├── user/
│   └── user.proto
└── buf.yaml                    # Buf configuration for code generation

backend/
├── internal/
│   └── grpc/
│       ├── server.go           # gRPC server setup
│       ├── team_server.go      # TeamService implementation
│       ├── project_server.go   # ProjectService implementation
│       └── interceptors.go     # Auth, logging, recovery interceptors
└── cmd/
    └── api/
        └── main.go             # Add gRPC server startup

messaging-service/
├── internal/
│   └── grpc/
│       ├── server.go
│       ├── messaging_server.go
│       └── client.go           # gRPC clients for backend, user-service
└── cmd/
    └── api/
        └── main.go

user-service/                   # NEW SERVICE
├── cmd/
│   └── api/
│       └── main.go
├── internal/
│   ├── grpc/
│   │   ├── server.go
│   │   └── user_server.go
│   ├── service/
│   │   ├── presence_service.go
│   │   └── user_service.go
│   └── repository/
│       └── user_repo.go
└── Dockerfile
```

#### gRPC Server Interceptors

```go
// backend/internal/grpc/interceptors.go
package grpc

import (
    "context"
    "github.com/rs/zerolog/log"
    "google.golang.org/grpc"
    "google.golang.org/grpc/codes"
    "google.golang.org/grpc/metadata"
    "google.golang.org/grpc/status"
)

// AuthInterceptor validates service-to-service tokens
func AuthInterceptor(ctx context.Context, req interface{}, info *grpc.UnaryServerInfo, handler grpc.UnaryHandler) (interface{}, error) {
    md, ok := metadata.FromIncomingContext(ctx)
    if !ok {
        return nil, status.Error(codes.Unauthenticated, "missing metadata")
    }

    tokens := md.Get("x-service-token")
    if len(tokens) == 0 {
        return nil, status.Error(codes.Unauthenticated, "missing service token")
    }

    // Validate service token (shared secret or mTLS in production)
    if !validateServiceToken(tokens[0]) {
        return nil, status.Error(codes.Unauthenticated, "invalid service token")
    }

    // Extract org_id and user_id from metadata for context
    ctx = extractContext(ctx, md)

    return handler(ctx, req)
}

// LoggingInterceptor logs all gRPC calls
func LoggingInterceptor(ctx context.Context, req interface{}, info *grpc.UnaryServerInfo, handler grpc.UnaryHandler) (interface{}, error) {
    start := time.Now()
    resp, err := handler(ctx, req)
    duration := time.Since(start)

    log.Debug().
        Str("method", info.FullMethod).
        Dur("duration", duration).
        Err(err).
        Msg("gRPC call")

    return resp, err
}

// RecoveryInterceptor catches panics
func RecoveryInterceptor(ctx context.Context, req interface{}, info *grpc.UnaryServerInfo, handler grpc.UnaryHandler) (resp interface{}, err error) {
    defer func() {
        if r := recover(); r != nil {
            log.Error().Interface("panic", r).Str("method", info.FullMethod).Msg("gRPC panic recovered")
            err = status.Error(codes.Internal, "internal server error")
        }
    }()
    return handler(ctx, req)
}
```

---

## 3. Auto Team Management

### 3.1 Team Auto-Creation Rules

Teams can be auto-created based on:

| Trigger             | Source             | Team Name Pattern        | Members Added      |
| ------------------- | ------------------ | ------------------------ | ------------------ |
| Department sync     | External HR system | `{department_name}`      | All dept employees |
| Project creation    | Project settings   | `project-{project_slug}` | Project members    |
| Manager assignment  | Org admin action   | `{manager_name}-team`    | Direct reports     |
| Integration webhook | External tool      | Custom                   | From payload       |

### 3.2 Manager Management

#### Database Schema

```sql
-- backend/db/migrations/000020_team_manager.up.sql
ALTER TABLE teams ADD COLUMN manager_id UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE teams ADD COLUMN is_auto_managed BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE teams ADD COLUMN auto_source TEXT;  -- 'department', 'project', 'manual'
ALTER TABLE teams ADD COLUMN auto_source_id TEXT;  -- External identifier
ALTER TABLE teams ADD COLUMN metadata JSONB DEFAULT '{}';

CREATE INDEX idx_teams_manager ON teams(manager_id) WHERE manager_id IS NOT NULL;
CREATE INDEX idx_teams_auto_source ON teams(auto_source, auto_source_id) WHERE is_auto_managed = true;

-- Manager change history
CREATE TABLE team_manager_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    previous_manager_id UUID REFERENCES users(id),
    new_manager_id UUID REFERENCES users(id),
    changed_by UUID NOT NULL REFERENCES users(id),
    reason TEXT,
    changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

#### Manager Assignment Flow

```go
// backend/internal/service/team_service.go

// SetManager changes the team manager and handles role transitions
func (s *TeamService) SetManager(ctx context.Context, teamID, newManagerID uuid.UUID, autoPromote bool) (*domain.Team, error) {
    userID := tenant.UserID(ctx)
    orgID := tenant.OrgID(ctx)

    var team *domain.Team
    err := s.txMgr.WithTx(ctx, func(tx pgx.Tx) error {
        var err error
        team, err = s.teamRepo.GetByID(ctx, tx, teamID)
        if err != nil {
            return err
        }

        oldManagerID := team.ManagerID

        // Update manager
        team.ManagerID = &newManagerID
        if err := s.teamRepo.Update(ctx, tx, team); err != nil {
            return err
        }

        // Auto-promote new manager to team_lead if requested
        if autoPromote {
            member, err := s.memberRepo.GetByUserID(ctx, tx, teamID, newManagerID)
            if err == nil && member.Role != domain.TeamRoleLead {
                member.Role = domain.TeamRoleLead
                if err := s.memberRepo.Update(ctx, tx, member); err != nil {
                    return err
                }
            } else if errors.Is(err, domain.ErrNotFound) {
                // Add new manager as member with team_lead role
                if err := s.memberRepo.Add(ctx, tx, &domain.TeamMember{
                    TeamID: teamID,
                    UserID: newManagerID,
                    Role:   domain.TeamRoleLead,
                }); err != nil {
                    return err
                }
            }
        }

        // Record history
        return s.managerHistoryRepo.Add(ctx, tx, &domain.TeamManagerHistory{
            TeamID:            teamID,
            PreviousManagerID: oldManagerID,
            NewManagerID:      &newManagerID,
            ChangedBy:         userID,
        })
    })

    if err != nil {
        return nil, err
    }

    // Publish event for messaging service
    s.eventBus.Publish(ctx, domain.EventTeamManagerChanged, map[string]any{
        "org_id":             orgID,
        "team_id":            teamID,
        "new_manager_id":     newManagerID,
        "old_manager_id":     team.ManagerID,
    })

    return team, nil
}
```

### 3.3 Auto-Sync with Projects

When a team is created or manager changes:

1. **Team Created** → Create team channels (#general, #announcements)
2. **Manager Assigned** → Manager gets `team_lead` role, admin in team channels
3. **Team Linked to Project** → All team members (including manager) added to project
4. **Manager Changed** → Update project lead if team is primary team

```go
// messaging-service/internal/service/sync_service.go

// HandleTeamManagerChanged updates channel permissions when manager changes
func (s *SyncService) HandleTeamManagerChanged(ctx context.Context, event *nats.Msg) {
    var payload struct {
        OrgID        uuid.UUID `json:"org_id"`
        TeamID       uuid.UUID `json:"team_id"`
        NewManagerID uuid.UUID `json:"new_manager_id"`
        OldManagerID uuid.UUID `json:"old_manager_id"`
    }
    if err := json.Unmarshal(event.Data, &payload); err != nil {
        return
    }

    // Get team channels
    channels, _ := s.channelRepo.ListByTeam(ctx, nil, payload.TeamID)

    for _, ch := range channels {
        // Demote old manager if exists
        if payload.OldManagerID != uuid.Nil {
            s.memberRepo.UpdateRole(ctx, nil, ch.ID, payload.OldManagerID, domain.MemberRoleMember)
        }

        // Promote new manager to admin
        existing, err := s.memberRepo.Get(ctx, nil, ch.ID, payload.NewManagerID)
        if err != nil {
            // Add as admin
            s.memberRepo.Add(ctx, nil, &domain.ChannelMember{
                ChannelID: ch.ID,
                UserID:    payload.NewManagerID,
                Role:      domain.MemberRoleAdmin,
            })
        } else {
            existing.Role = domain.MemberRoleAdmin
            s.memberRepo.Update(ctx, nil, existing)
        }
    }
}
```

---

## 4. Auto Project Management

### 4.1 Auto-Creation Sources

| Source      | Trigger                    | Configuration             |
| ----------- | -------------------------- | ------------------------- |
| Template    | User selects template      | `project_templates` table |
| Workflow    | Task reaches milestone     | `workflow_rules` JSONB    |
| Integration | Webhook from external tool | Integration settings      |
| Recurring   | Scheduled job              | Cron-like settings        |

### 4.2 Shared Projects (Multi-Team)

Multiple teams can share a project with different access levels:

```sql
-- backend/db/migrations/000021_shared_projects.up.sql
ALTER TABLE project_teams ADD COLUMN access_level TEXT NOT NULL DEFAULT 'full';
-- access_level: 'full', 'read', 'limited' (specific task types only)

ALTER TABLE project_teams ADD COLUMN added_by UUID REFERENCES users(id);
ALTER TABLE project_teams ADD COLUMN note TEXT;

-- Track which team "owns" the project for billing/reporting
ALTER TABLE projects ADD COLUMN owner_team_id UUID REFERENCES teams(id);
```

#### Creating a Shared Project

```go
// backend/internal/service/project_service.go

// CreateSharedProject creates a project accessible by multiple teams
func (s *ProjectService) CreateSharedProject(ctx context.Context, params *domain.CreateSharedProjectParams) (*domain.Project, error) {
    userID := tenant.UserID(ctx)
    orgID := tenant.OrgID(ctx)

    var project *domain.Project
    err := s.txMgr.WithTx(ctx, func(tx pgx.Tx) error {
        // Create project
        project = &domain.Project{
            OrgID:       orgID,
            Name:        params.Name,
            Description: params.Description,
            Status:      domain.ProjectStatusActive,
            CreatedBy:   &userID,
            OwnerTeamID: &params.OwnerTeamID,
        }

        if err := s.projectRepo.Create(ctx, tx, project); err != nil {
            return err
        }

        // Link all teams
        for _, teamID := range params.TeamIDs {
            accessLevel := "full"
            if teamID != params.OwnerTeamID {
                accessLevel = params.DefaultAccessLevel // 'full', 'read', etc.
            }

            if err := s.projectTeamRepo.Link(ctx, tx, &domain.ProjectTeam{
                ProjectID:   project.ID,
                TeamID:      teamID,
                AccessLevel: accessLevel,
                AddedBy:     userID,
            }); err != nil {
                return err
            }

            // Auto-sync team members if enabled
            if params.AutoSyncMembers {
                teamMembers, _ := s.teamMemberRepo.ListByTeam(ctx, tx, teamID)
                for _, tm := range teamMembers {
                    role := domain.DefaultTeamProjectRoleMap[tm.Role]
                    s.projectMemberRepo.Add(ctx, tx, &domain.ProjectMember{
                        ProjectID:    project.ID,
                        UserID:       tm.UserID,
                        Role:         role,
                        Source:       domain.MemberSourceTeam,
                        SourceTeamID: &teamID,
                    })
                }
            }
        }

        // Add creator as lead (direct)
        return s.projectMemberRepo.Add(ctx, tx, &domain.ProjectMember{
            ProjectID: project.ID,
            UserID:    userID,
            Role:      domain.ProjectRoleLead,
            Source:    domain.MemberSourceDirect,
        })
    })

    if err != nil {
        return nil, err
    }

    // Trigger channel creation via gRPC
    go s.syncProjectChannel(ctx, project)

    return project, nil
}
```

---

## 5. Discord-Like Messaging Features

### 5.1 Server/Category/Channel Hierarchy

Unlike current flat channel list, implement Discord-style organization:

```
Organization (= Discord Server)
├── Categories
│   ├── General
│   │   ├── #welcome
│   │   ├── #rules
│   │   └── #introductions
│   ├── Team: Engineering
│   │   ├── #general
│   │   ├── #code-review
│   │   └── #deployments
│   └── Project: Website Redesign
│       ├── #general
│       ├── #design
│       └── #feedback
├── Direct Messages
│   ├── John Doe
│   └── Jane Smith
└── Group DMs
    └── Design Team Hangout
```

#### Database Schema

```sql
-- messaging-service/db/migrations/000005_categories.up.sql
CREATE TABLE channel_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL,
    name TEXT NOT NULL,
    position INT NOT NULL DEFAULT 0,
    is_collapsed BOOLEAN NOT NULL DEFAULT false,
    auto_source TEXT,          -- 'team', 'project', null for manual
    auto_source_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE channels ADD COLUMN category_id UUID REFERENCES channel_categories(id) ON DELETE SET NULL;
ALTER TABLE channels ADD COLUMN position INT NOT NULL DEFAULT 0;

-- User-specific category collapse state
CREATE TABLE user_category_states (
    user_id UUID NOT NULL,
    category_id UUID NOT NULL REFERENCES channel_categories(id) ON DELETE CASCADE,
    is_collapsed BOOLEAN NOT NULL DEFAULT false,
    PRIMARY KEY (user_id, category_id)
);
```

### 5.2 Channel Types & Permissions

| Type             | Auto-Created     | Who Can Post    | Who Can View    | Admin Control   |
| ---------------- | ---------------- | --------------- | --------------- | --------------- |
| `#general`       | Per team         | All members     | All members     | Team lead/Admin |
| `#announcements` | Per team         | Admins only     | All members     | Team lead       |
| `#project-*`     | Per project      | Project members | Project members | Project lead    |
| `#private`       | Manual           | Invited only    | Invited only    | Creator/Admins  |
| `dm`             | On first message | Participants    | Participants    | —               |
| `group`          | Manual           | Group members   | Group members   | Creator         |

#### Permission Model

```sql
-- messaging-service/db/migrations/000006_channel_permissions.up.sql
CREATE TABLE channel_permissions (
    channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    role TEXT NOT NULL,  -- 'everyone', 'admin', 'moderator', 'member', or specific user_id
    permission TEXT NOT NULL,  -- 'send_messages', 'add_reactions', 'manage_messages', 'manage_channel', 'invite_members'
    allowed BOOLEAN NOT NULL DEFAULT true,
    PRIMARY KEY (channel_id, role, permission)
);

-- Default permissions
INSERT INTO channel_permissions (channel_id, role, permission, allowed) VALUES
-- Template for new channels (applied on creation)
('00000000-0000-0000-0000-000000000000', 'everyone', 'send_messages', true),
('00000000-0000-0000-0000-000000000000', 'everyone', 'add_reactions', true),
('00000000-0000-0000-0000-000000000000', 'admin', 'manage_messages', true),
('00000000-0000-0000-0000-000000000000', 'admin', 'manage_channel', true),
('00000000-0000-0000-0000-000000000000', 'admin', 'invite_members', true);
```

### 5.3 Rich Message Features

#### Threads (Inline Discord-Style)

```sql
-- Messages with threads shown inline, expandable
ALTER TABLE messages ADD COLUMN thread_last_reply_at TIMESTAMPTZ;
ALTER TABLE messages ADD COLUMN thread_participant_ids UUID[] DEFAULT '{}';
```

#### Reactions

```sql
-- Already exists, enhance with custom emoji support
ALTER TABLE message_reactions ADD COLUMN is_custom_emoji BOOLEAN DEFAULT false;
ALTER TABLE message_reactions ADD COLUMN custom_emoji_url TEXT;
```

#### Mentions & References

| Syntax          | Entity         | Action                           |
| --------------- | -------------- | -------------------------------- |
| `@user`         | User mention   | Notification + highlight         |
| `@here`         | Online members | Notification to online users     |
| `@everyone`     | All members    | Notification to all (admin only) |
| `#channel`      | Channel        | Link to channel                  |
| `!task-123`     | Task           | Task preview card                |
| `!project-slug` | Project        | Project preview card             |

### 5.4 Voice/Video (Future Phase)

Placeholder for Jitsi/LiveKit integration:

```sql
-- Future: Voice channels
ALTER TABLE channels ADD COLUMN is_voice BOOLEAN DEFAULT false;
ALTER TABLE channels ADD COLUMN voice_settings JSONB DEFAULT '{}';
-- voice_settings: { "bitrate": 64000, "user_limit": 99, "region": "auto" }
```

---

## 6. User Management System

### 6.1 New User Service

Create dedicated microservice for user management:

```
user-service/
├── cmd/api/main.go
├── internal/
│   ├── config/
│   ├── domain/
│   │   ├── user.go
│   │   ├── presence.go
│   │   └── settings.go
│   ├── grpc/
│   │   └── server.go
│   ├── handler/
│   │   └── rest_handler.go
│   ├── repository/
│   │   ├── user_repo.go
│   │   └── presence_repo.go  # Redis-backed
│   └── service/
│       ├── user_service.go
│       └── presence_service.go
└── Dockerfile
```

### 6.2 Presence System

Real-time user presence tracked in Redis:

```go
// user-service/internal/service/presence_service.go

type PresenceService struct {
    redis      *redis.Client
    natsClient *nats.Conn
}

const (
    presenceKeyPrefix = "presence:"
    presenceTTL       = 2 * time.Minute  // Auto-expire if no heartbeat
)

func (s *PresenceService) SetPresence(ctx context.Context, userID uuid.UUID, state PresenceState) error {
    key := presenceKeyPrefix + userID.String()
    data := &PresenceData{
        UserID:     userID,
        State:      state,
        LastSeenAt: time.Now(),
    }

    // Set with TTL
    if err := s.redis.SetEx(ctx, key, data, presenceTTL).Err(); err != nil {
        return err
    }

    // Publish presence change
    s.publishPresenceUpdate(ctx, userID, state)
    return nil
}

func (s *PresenceService) Heartbeat(ctx context.Context, userID uuid.UUID) error {
    key := presenceKeyPrefix + userID.String()
    return s.redis.Expire(ctx, key, presenceTTL).Err()
}

func (s *PresenceService) GetBulkPresence(ctx context.Context, userIDs []uuid.UUID) (map[uuid.UUID]PresenceState, error) {
    pipe := s.redis.Pipeline()
    cmds := make(map[uuid.UUID]*redis.StringCmd)

    for _, id := range userIDs {
        cmds[id] = pipe.Get(ctx, presenceKeyPrefix+id.String())
    }

    pipe.Exec(ctx)

    result := make(map[uuid.UUID]PresenceState)
    for id, cmd := range cmds {
        if val, err := cmd.Result(); err == nil {
            var data PresenceData
            json.Unmarshal([]byte(val), &data)
            result[id] = data.State
        } else {
            result[id] = PresenceOffline
        }
    }

    return result, nil
}
```

### 6.3 User Settings

```go
// user-service/internal/domain/settings.go

type UserSettings struct {
    UserID        uuid.UUID           `json:"user_id"`
    Notifications NotificationSettings `json:"notifications"`
    Privacy       PrivacySettings      `json:"privacy"`
    Display       DisplaySettings      `json:"display"`
}

type NotificationSettings struct {
    MuteAll              bool     `json:"mute_all"`
    DesktopNotifications bool     `json:"desktop_notifications"`
    EmailNotifications   bool     `json:"email_notifications"`
    MobilePush           bool     `json:"mobile_push"`
    MutedChannels        []string `json:"muted_channels"`
    QuietHoursStart      string   `json:"quiet_hours_start"`  // "22:00"
    QuietHoursEnd        string   `json:"quiet_hours_end"`    // "08:00"
    QuietHoursTimezone   string   `json:"quiet_hours_timezone"`
    MentionsOnly         bool     `json:"mentions_only"`       // Only notify on @mentions
}

type PrivacySettings struct {
    ShowPresence    bool `json:"show_presence"`     // Show online/offline status
    ShowLastSeen    bool `json:"show_last_seen"`
    AllowDMs        bool `json:"allow_dms"`         // Allow DMs from non-contacts
    ShowActivity    bool `json:"show_activity"`     // Show "typing..." indicator
}

type DisplaySettings struct {
    Theme           string `json:"theme"`            // "light", "dark", "system"
    CompactMode     bool   `json:"compact_mode"`     // Reduce spacing
    MessageGrouping bool   `json:"message_grouping"` // Group consecutive messages
    TimeFormat      string `json:"time_format"`      // "12h", "24h"
    FontSize        string `json:"font_size"`        // "small", "medium", "large"
}
```

---

## 7. Event-Driven Triggers

### 7.1 Event Catalog

All events published to NATS JetStream:

| Event                    | Subject                                   | Trigger                | Messaging Action             |
| ------------------------ | ----------------------------------------- | ---------------------- | ---------------------------- |
| `team.created`           | `orbispm.team.{org_id}.created`           | Team creation          | Create team channels         |
| `team.deleted`           | `orbispm.team.{org_id}.deleted`           | Team deletion          | Archive team channels        |
| `team.member_added`      | `orbispm.team.{org_id}.member.added`      | User joins team        | Add to team channels         |
| `team.member_removed`    | `orbispm.team.{org_id}.member.removed`    | User leaves team       | Remove from team channels    |
| `team.manager_changed`   | `orbispm.team.{org_id}.manager.changed`   | Manager update         | Update channel admins        |
| `project.created`        | `orbispm.project.{org_id}.created`        | Project creation       | Create project channel       |
| `project.deleted`        | `orbispm.project.{org_id}.deleted`        | Project deletion       | Archive project channel      |
| `project.team_linked`    | `orbispm.project.{org_id}.team.linked`    | Team linked            | Sync team members to channel |
| `project.team_unlinked`  | `orbispm.project.{org_id}.team.unlinked`  | Team unlinked          | Remove team-sourced members  |
| `project.member_added`   | `orbispm.project.{org_id}.member.added`   | Direct member added    | Add to project channel       |
| `project.member_removed` | `orbispm.project.{org_id}.member.removed` | Member removed         | Remove from project channel  |
| `task.created`           | `orbispm.task.{org_id}.created`           | Task creation          | Notify channel (optional)    |
| `task.assigned`          | `orbispm.task.{org_id}.assigned`          | Task assignment        | Notify assignees             |
| `task.mentioned`         | `orbispm.task.{org_id}.mentioned`         | User mentioned in task | Send notification            |

### 7.2 Event Handler Implementation

```go
// messaging-service/internal/service/event_handler.go

type EventHandler struct {
    channelSvc *ChannelService
    memberSvc  *MemberService
    notifySvc  *NotificationService
    grpcClient pb.TeamServiceClient
}

func (h *EventHandler) RegisterHandlers(js nats.JetStreamContext) {
    // Team events
    h.subscribe(js, "orbispm.team.*.created", h.handleTeamCreated)
    h.subscribe(js, "orbispm.team.*.deleted", h.handleTeamDeleted)
    h.subscribe(js, "orbispm.team.*.member.added", h.handleTeamMemberAdded)
    h.subscribe(js, "orbispm.team.*.member.removed", h.handleTeamMemberRemoved)
    h.subscribe(js, "orbispm.team.*.manager.changed", h.handleTeamManagerChanged)

    // Project events
    h.subscribe(js, "orbispm.project.*.created", h.handleProjectCreated)
    h.subscribe(js, "orbispm.project.*.team.linked", h.handleProjectTeamLinked)
    h.subscribe(js, "orbispm.project.*.team.unlinked", h.handleProjectTeamUnlinked)

    // Task events (optional notifications)
    h.subscribe(js, "orbispm.task.*.assigned", h.handleTaskAssigned)
}

func (h *EventHandler) handleTeamCreated(msg *nats.Msg) {
    var event struct {
        OrgID     uuid.UUID `json:"org_id"`
        TeamID    uuid.UUID `json:"team_id"`
        Name      string    `json:"name"`
        ManagerID uuid.UUID `json:"manager_id"`
    }
    json.Unmarshal(msg.Data, &event)

    ctx := context.Background()

    // Create category for team
    category, _ := h.channelSvc.CreateCategory(ctx, &domain.Category{
        OrgID:        event.OrgID,
        Name:         event.Name,
        AutoSource:   "team",
        AutoSourceID: event.TeamID,
    })

    // Create default channels
    channels := []struct {
        Name        string
        Description string
        Type        string
    }{
        {"general", "General discussion", domain.ChannelTypeTeam},
        {"announcements", "Team announcements", domain.ChannelTypeAnnouncement},
    }

    for _, ch := range channels {
        channel, _ := h.channelSvc.Create(ctx, &domain.Channel{
            OrgID:        event.OrgID,
            Name:         ch.Name,
            Description:  ch.Description,
            Type:         ch.Type,
            CategoryID:   &category.ID,
            TeamID:       &event.TeamID,
            IsAutoManaged: true,
            AutoSource:   "team",
            AutoSourceID: event.TeamID,
        })

        // Fetch team members via gRPC
        members, _ := h.grpcClient.GetMembers(ctx, &pb.GetMembersRequest{
            TeamId: event.TeamID.String(),
        })

        // Add all members
        for _, m := range members.Members {
            role := domain.MemberRoleMember
            if m.UserId == event.ManagerID.String() || m.Role == "team_lead" {
                role = domain.MemberRoleAdmin
            }
            h.memberSvc.Add(ctx, channel.ID, uuid.MustParse(m.UserId), role)
        }
    }

    msg.Ack()
}

func (h *EventHandler) handleTaskAssigned(msg *nats.Msg) {
    var event struct {
        OrgID      uuid.UUID   `json:"org_id"`
        TaskID     uuid.UUID   `json:"task_id"`
        TaskTitle  string      `json:"task_title"`
        ProjectID  uuid.UUID   `json:"project_id"`
        AssigneeIDs []uuid.UUID `json:"assignee_ids"`
        ActorID    uuid.UUID   `json:"actor_id"`
    }
    json.Unmarshal(msg.Data, &event)

    // Find project channel
    channel, err := h.channelSvc.GetByProject(ctx, event.ProjectID)
    if err != nil {
        msg.Ack()
        return
    }

    // Send system message to channel
    actorName := h.getUserName(ctx, event.ActorID)
    assigneeNames := h.getUserNames(ctx, event.AssigneeIDs)

    h.messageSvc.SendSystemMessage(ctx, channel.ID, &domain.SystemMessage{
        Type: "task_assigned",
        Body: fmt.Sprintf("%s assigned task **%s** to %s", actorName, event.TaskTitle, strings.Join(assigneeNames, ", ")),
        Metadata: map[string]any{
            "task_id":     event.TaskID,
            "assignee_ids": event.AssigneeIDs,
        },
    })

    msg.Ack()
}
```

### 7.3 Configurable Triggers

Allow organizations to configure which events trigger messages:

```sql
-- messaging-service/db/migrations/000007_trigger_config.up.sql
CREATE TABLE channel_trigger_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL,
    channel_id UUID REFERENCES channels(id) ON DELETE CASCADE,  -- NULL = org-wide default
    event_type TEXT NOT NULL,  -- 'task.created', 'task.assigned', etc.
    enabled BOOLEAN NOT NULL DEFAULT true,
    template TEXT,  -- Custom message template
    filters JSONB DEFAULT '{}',  -- {"status": ["done"], "priority": ["high"]}
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (org_id, channel_id, event_type)
);

-- Default triggers for new orgs
INSERT INTO channel_trigger_config (org_id, channel_id, event_type, enabled, template)
VALUES
    ('00000000-0000-0000-0000-000000000000', NULL, 'task.assigned', true, '{{actor}} assigned **{{task.title}}** to {{assignees}}'),
    ('00000000-0000-0000-0000-000000000000', NULL, 'task.status_changed', true, '{{actor}} moved **{{task.title}}** to {{new_status}}'),
    ('00000000-0000-0000-0000-000000000000', NULL, 'project.member_added', true, '{{actor}} added {{user}} to the project');
```

---

## 8. Database Schema Updates Summary

### Main Backend (`backend/db/migrations/`)

```sql
-- 000020_team_manager.up.sql (Team manager support)
-- 000021_shared_projects.up.sql (Multi-team project enhancements)
-- 000022_auto_entity_tracking.up.sql (Auto-creation metadata)
```

### Messaging Service (`messaging-service/db/migrations/`)

```sql
-- 000005_categories.up.sql (Discord-style categories)
-- 000006_channel_permissions.up.sql (Granular permissions)
-- 000007_trigger_config.up.sql (Configurable event triggers)
-- 000008_system_messages.up.sql (System/bot messages)
```

### User Service (`user-service/db/migrations/`)

```sql
-- 000001_user_service_schema.up.sql (Initial schema)
CREATE TABLE user_profiles (
    user_id UUID PRIMARY KEY,
    org_id UUID NOT NULL,
    display_name TEXT,
    avatar_url TEXT,
    bio TEXT,
    timezone TEXT DEFAULT 'UTC',
    locale TEXT DEFAULT 'en',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE user_settings (
    user_id UUID PRIMARY KEY REFERENCES user_profiles(user_id) ON DELETE CASCADE,
    notification_settings JSONB DEFAULT '{}',
    privacy_settings JSONB DEFAULT '{}',
    display_settings JSONB DEFAULT '{}',
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE custom_statuses (
    user_id UUID PRIMARY KEY REFERENCES user_profiles(user_id) ON DELETE CASCADE,
    emoji TEXT,
    text TEXT,
    clear_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ DEFAULT now()
);
```

---

## 9. Implementation Phases

### Phase 1: gRPC Infrastructure (Week 1-2)

- [ ] Set up `proto/` directory with shared proto definitions
- [ ] Configure buf.yaml for code generation
- [ ] Add gRPC server to main backend
- [ ] Add gRPC client to messaging-service
- [ ] Implement basic team/project gRPC services
- [ ] Add interceptors (auth, logging, recovery)

### Phase 2: User Service (Week 2-3)

- [ ] Create user-service microservice
- [ ] Implement presence system (Redis-backed)
- [ ] Implement user settings management
- [ ] Add gRPC endpoints
- [ ] Integrate presence with messaging WebSocket

### Phase 3: Auto Team/Project Management (Week 3-4)

- [ ] Add manager_id to teams table
- [ ] Implement SetManager service method
- [ ] Add auto-creation tracking columns
- [ ] Implement auto-sync event handlers
- [ ] Test multi-team project creation

### Phase 4: Discord-Style UI (Week 4-6)

- [ ] Implement channel categories (backend)
- [ ] Update frontend sidebar to category view
- [ ] Add category collapse/expand
- [ ] Implement drag-drop channel reordering
- [ ] Add channel permission UI

### Phase 5: Event Triggers (Week 6-7)

- [ ] Implement full event catalog
- [ ] Add trigger configuration table
- [ ] Create trigger management UI
- [ ] Implement system messages
- [ ] Test end-to-end event flow

### Phase 6: Polish & Testing (Week 7-8)

- [ ] Load testing (10K concurrent users)
- [ ] End-to-end integration tests
- [ ] Documentation updates
- [ ] Performance optimization
- [ ] Security audit

---

## 10. API Specifications

### REST Endpoints (via Kong Gateway)

#### Team Management

```
POST   /api/v1/orgs/{orgId}/teams                    # Create team
GET    /api/v1/orgs/{orgId}/teams                    # List teams
GET    /api/v1/orgs/{orgId}/teams/{teamId}           # Get team
PUT    /api/v1/orgs/{orgId}/teams/{teamId}           # Update team
DELETE /api/v1/orgs/{orgId}/teams/{teamId}           # Delete team
POST   /api/v1/orgs/{orgId}/teams/{teamId}/manager   # Set manager
GET    /api/v1/orgs/{orgId}/teams/{teamId}/members   # List members
POST   /api/v1/orgs/{orgId}/teams/{teamId}/members   # Add member
DELETE /api/v1/orgs/{orgId}/teams/{teamId}/members/{userId}  # Remove member
```

#### Project Management

```
POST   /api/v1/orgs/{orgId}/projects                       # Create project
POST   /api/v1/orgs/{orgId}/projects/shared                # Create shared project
GET    /api/v1/orgs/{orgId}/projects/{projectId}/teams     # Get linked teams
POST   /api/v1/orgs/{orgId}/projects/{projectId}/teams     # Link teams
DELETE /api/v1/orgs/{orgId}/projects/{projectId}/teams/{teamId}  # Unlink team
```

#### Messaging

```
GET    /api/v1/chat/categories                         # List categories
POST   /api/v1/chat/categories                         # Create category
PUT    /api/v1/chat/categories/{catId}                 # Update category
DELETE /api/v1/chat/categories/{catId}                 # Delete category
PUT    /api/v1/chat/channels/{channelId}/category      # Move channel to category
GET    /api/v1/chat/channels/{channelId}/permissions   # Get permissions
PUT    /api/v1/chat/channels/{channelId}/permissions   # Update permissions
```

#### User Service

```
GET    /api/v1/users/me                           # Get current user
PUT    /api/v1/users/me                           # Update profile
GET    /api/v1/users/me/settings                  # Get settings
PUT    /api/v1/users/me/settings                  # Update settings
GET    /api/v1/users/me/presence                  # Get own presence
PUT    /api/v1/users/me/presence                  # Set presence
PUT    /api/v1/users/me/status                    # Set custom status
GET    /api/v1/users/presence/bulk                # Get bulk presence
```

### WebSocket Events

```typescript
// Client → Server
interface WSClientMessage {
  type:
    | "subscribe_channel"
    | "unsubscribe_channel"
    | "typing_start"
    | "typing_stop"
    | "presence_update"
    | "heartbeat";
  channel_id?: string;
  presence_state?: "online" | "away" | "dnd";
}

// Server → Client
interface WSServerMessage {
  type:
    | "message"
    | "reaction"
    | "typing"
    | "presence"
    | "channel_update"
    | "member_update"
    | "system";
  channel_id?: string;
  user_id?: string;
  data: any;
}
```

---

## Conclusion

This V3 architecture transforms OrbisPM into a comprehensive collaboration platform with:

1. **gRPC-based microservices** for efficient inter-service communication
2. **Auto-managed teams** with manager tracking and role inheritance
3. **Multi-team shared projects** with configurable access levels
4. **Discord-style messaging** with categories, permissions, and rich features
5. **Comprehensive user management** with presence, settings, and custom status
6. **Event-driven automation** for seamless integration between entities

The implementation follows the existing 4-layer DAO pattern while introducing new services and communication patterns. Each phase builds on the previous, allowing incremental deployment and testing.
