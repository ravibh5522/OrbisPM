package service

import (
	"context"

	"github.com/orbispm/orbispm/internal/search"
)

// SearchService handles full-text search business logic.
type SearchService struct {
	client *search.Client
}

// NewSearchService creates a new SearchService.
func NewSearchService(client *search.Client) *SearchService {
	return &SearchService{client: client}
}

// SearchResult holds search results.
type SearchResult struct {
	Hits             interface{} `json:"hits"`
	EstimatedTotal   int64       `json:"estimated_total"`
	ProcessingTimeMs int64       `json:"processing_time_ms"`
	Query            string      `json:"query"`
}

// SearchTasks searches tasks.
func (s *SearchService) SearchTasks(ctx context.Context, query, orgID string, limit, offset int) (*SearchResult, error) {
	resp, err := s.client.SearchTasks(ctx, query, orgID, int64(limit), int64(offset))
	if err != nil {
		return nil, err
	}
	return &SearchResult{
		Hits:             resp.Hits,
		EstimatedTotal:   resp.EstimatedTotalHits,
		ProcessingTimeMs: resp.ProcessingTimeMs,
		Query:            resp.Query,
	}, nil
}

// SearchProjects searches projects.
func (s *SearchService) SearchProjects(ctx context.Context, query, orgID string, limit, offset int) (*SearchResult, error) {
	resp, err := s.client.SearchProjects(ctx, query, orgID, int64(limit), int64(offset))
	if err != nil {
		return nil, err
	}
	return &SearchResult{
		Hits:             resp.Hits,
		EstimatedTotal:   resp.EstimatedTotalHits,
		ProcessingTimeMs: resp.ProcessingTimeMs,
		Query:            resp.Query,
	}, nil
}
