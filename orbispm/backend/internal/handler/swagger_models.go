package handler

import (
	"github.com/orbispm/orbispm/internal/domain"
	"github.com/orbispm/orbispm/internal/service"
)

// Swagger model aliases for swag doc generation.
// These allow swag to resolve cross-package domain types.

// swaggerOrg is a swagger alias for domain.Org.
// @Description Organization entity
type swaggerOrg = domain.Org

// swaggerOrgMember is a swagger alias for domain.OrgMember.
// @Description Organization member with role
type swaggerOrgMember = domain.OrgMember

// swaggerTeam is a swagger alias for domain.Team.
// @Description Team entity
type swaggerTeam = domain.Team

// swaggerTeamMember is a swagger alias for domain.TeamMember.
// @Description Team member
type swaggerTeamMember = domain.TeamMember

// swaggerProject is a swagger alias for domain.Project.
// @Description Project entity
type swaggerProject = domain.Project

// swaggerProjectMember is a swagger alias for domain.ProjectMember.
// @Description Project member
type swaggerProjectMember = domain.ProjectMember

// swaggerTask is a swagger alias for domain.Task.
// @Description Task entity
type swaggerTask = domain.Task

// swaggerTaskTree is a swagger alias for domain.TaskTree.
// @Description Task with subtask tree
type swaggerTaskTree = domain.TaskTree

// swaggerChecklist is a swagger alias for domain.Checklist.
// @Description Checklist item
type swaggerChecklist = domain.Checklist

// swaggerComment is a swagger alias for domain.Comment.
// @Description Comment on a task
type swaggerComment = domain.Comment

// swaggerTaskRule is a swagger alias for domain.TaskRule.
// @Description Automation rule for a task
type swaggerTaskRule = domain.TaskRule

// swaggerTaskDependency is a swagger alias for domain.TaskDependency.
// @Description Task dependency relationship
type swaggerTaskDependency = domain.TaskDependency

// swaggerTaskWatcher is a swagger alias for domain.TaskWatcher.
// @Description Task watcher
type swaggerTaskWatcher = domain.TaskWatcher

// swaggerAttachment is a swagger alias for domain.Attachment.
// @Description File attachment
type swaggerAttachment = domain.Attachment

// swaggerTaskTemplate is a swagger alias for domain.TaskTemplate.
// @Description Reusable task template
type swaggerTaskTemplate = domain.TaskTemplate

// swaggerWebhook is a swagger alias for domain.Webhook.
// @Description Webhook configuration
type swaggerWebhook = domain.Webhook

// swaggerAPIKey is a swagger alias for domain.APIKey.
// @Description API key
type swaggerAPIKey = domain.APIKey

// swaggerBillingPlan is a swagger alias for domain.BillingPlan.
// @Description Billing plan
type swaggerBillingPlan = domain.BillingPlan

// swaggerOrgSubscription is a swagger alias for domain.OrgSubscription.
// @Description Organization subscription
type swaggerOrgSubscription = domain.OrgSubscription

// swaggerCustomRole is a swagger alias for domain.CustomRole.
// @Description Custom RBAC role
type swaggerCustomRole = domain.CustomRole

// swaggerNotification is a swagger alias for domain.Notification.
// @Description User notification
type swaggerNotification = domain.Notification

// swaggerNotificationPreference is a swagger alias for domain.NotificationPreference.
// @Description Notification preference setting
type swaggerNotificationPreference = domain.NotificationPreference

// swaggerActivityLog is a swagger alias for domain.ActivityLog.
// @Description Activity log entry
type swaggerActivityLog = domain.ActivityLog

// swaggerImportJob is a swagger alias for domain.ImportJob.
// @Description CSV import job
type swaggerImportJob = domain.ImportJob

// --- Service param aliases ---

type swaggerCreateOrgParams = service.CreateOrgParams
type swaggerUpdateOrgParams = service.UpdateOrgParams
type swaggerCreateTeamParams = service.CreateTeamParams
type swaggerUpdateTeamParams = service.UpdateTeamParams
type swaggerCreateProjectParams = service.CreateProjectParams
type swaggerUpdateProjectParams = service.UpdateProjectParams
type swaggerCreateTaskParams = service.CreateTaskParams
type swaggerUpdateTaskParams = service.UpdateTaskParams
type swaggerCreateChecklistParams = service.CreateChecklistParams
type swaggerUpdateChecklistParams = service.UpdateChecklistParams
type swaggerCreateCommentParams = service.CreateCommentParams
type swaggerCreateRuleParams = service.CreateRuleParams
type swaggerCreateTemplateParams = service.CreateTemplateParams
type swaggerUpdateTemplateParams = service.UpdateTemplateParams
type swaggerCreateWebhookParams = service.CreateWebhookParams
type swaggerUpdateWebhookParams = service.UpdateWebhookParams
type swaggerCreateAPIKeyParams = service.CreateAPIKeyParams
type swaggerCreateCustomRoleParams = service.CreateCustomRoleParams
type swaggerUpdateCustomRoleParams = service.UpdateCustomRoleParams
type swaggerUpsertNotifPrefParams = service.UpsertPrefParams
