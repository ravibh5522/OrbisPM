package search

import (
	"context"
	"fmt"

	"github.com/meilisearch/meilisearch-go"
	"github.com/rs/zerolog/log"
)

// Client wraps the Meilisearch SDK.
type Client struct {
	ms *meilisearch.ServiceManager
}

// NewClient creates a new Meilisearch client.
func NewClient(host, masterKey string) (*Client, error) {
	ms := meilisearch.New(host, meilisearch.WithAPIKey(masterKey))
	c := &Client{ms: &ms}

	// Ensure indexes exist
	if err := c.ensureIndexes(); err != nil {
		return nil, fmt.Errorf("ensure indexes: %w", err)
	}

	return c, nil
}

func (c *Client) ensureIndexes() error {
	indexes := []struct {
		uid        string
		primaryKey string
	}{
		{"tasks", "id"},
		{"projects", "id"},
		{"comments", "id"},
	}

	for _, idx := range indexes {
		task, err := (*c.ms).CreateIndex(&meilisearch.IndexConfig{
			Uid:        idx.uid,
			PrimaryKey: idx.primaryKey,
		})
		if err != nil {
			return fmt.Errorf("create index %s: %w", idx.uid, err)
		}
		log.Debug().Str("index", idx.uid).Int64("task_uid", task.TaskUID).Msg("search index ensured")
	}

	// Configure filterable attributes
	filterables := map[string][]string{
		"tasks":    {"org_id", "project_id", "status", "priority", "assignee_id"},
		"projects": {"org_id", "status"},
		"comments": {"org_id", "task_id"},
	}
	for idxName, attrs := range filterables {
		idx := (*c.ms).Index(idxName)
		filterAttrs := make([]interface{}, len(attrs))
		for i, a := range attrs {
			filterAttrs[i] = a
		}
		if _, err := idx.UpdateFilterableAttributes(&filterAttrs); err != nil {
			return fmt.Errorf("set filterable attrs for %s: %w", idxName, err)
		}
	}

	return nil
}

// IndexTask adds or updates a task in the search index.
func (c *Client) IndexTask(ctx context.Context, doc map[string]any) error {
	idx := (*c.ms).Index("tasks")
	_, err := idx.AddDocuments([]map[string]any{doc}, nil)
	if err != nil {
		return fmt.Errorf("index task: %w", err)
	}
	return nil
}

// IndexProject adds or updates a project in the search index.
func (c *Client) IndexProject(ctx context.Context, doc map[string]any) error {
	idx := (*c.ms).Index("projects")
	_, err := idx.AddDocuments([]map[string]any{doc}, nil)
	if err != nil {
		return fmt.Errorf("index project: %w", err)
	}
	return nil
}

// DeleteTask removes a task from the search index.
func (c *Client) DeleteTask(ctx context.Context, taskID string) error {
	idx := (*c.ms).Index("tasks")
	_, err := idx.DeleteDocument(taskID, nil)
	if err != nil {
		return fmt.Errorf("delete task from index: %w", err)
	}
	return nil
}

// SearchTasks searches the tasks index.
func (c *Client) SearchTasks(ctx context.Context, query string, orgID string, limit, offset int64) (*meilisearch.SearchResponse, error) {
	idx := (*c.ms).Index("tasks")
	resp, err := idx.Search(query, &meilisearch.SearchRequest{
		Filter: fmt.Sprintf("org_id = %q", orgID),
		Limit:  limit,
		Offset: offset,
	})
	if err != nil {
		return nil, fmt.Errorf("search tasks: %w", err)
	}
	return resp, nil
}

// SearchProjects searches the projects index.
func (c *Client) SearchProjects(ctx context.Context, query string, orgID string, limit, offset int64) (*meilisearch.SearchResponse, error) {
	idx := (*c.ms).Index("projects")
	resp, err := idx.Search(query, &meilisearch.SearchRequest{
		Filter: fmt.Sprintf("org_id = %q", orgID),
		Limit:  limit,
		Offset: offset,
	})
	if err != nil {
		return nil, fmt.Errorf("search projects: %w", err)
	}
	return resp, nil
}

// HealthCheck checks Meilisearch connectivity.
func (c *Client) HealthCheck(ctx context.Context) error {
	ok := (*c.ms).IsHealthy()
	if !ok {
		return fmt.Errorf("meilisearch unhealthy")
	}
	return nil
}
