// Package evaluator provides alert rule evaluation
package evaluator

import (
	"time"
)

// Alert represents a firing alert
type Alert struct {
	Name        string            `json:"alertname"`
	Severity    string            `json:"severity"`
	Status      string            `json:"status"`
	Labels      map[string]string `json:"labels"`
	Annotations map[string]string `json:"annotations"`
	StartsAt    time.Time         `json:"startsAt"`
	EndsAt      time.Time         `json:"endsAt,omitempty"`
	Fingerprint string            `json:"fingerprint"`
}

// AlertRule represents a configured alert rule
type AlertRule struct {
	ID          string
	OrgID       string
	Name        string
	RuleType    string // "metric", "log", "business"
	Expression  string
	Threshold   map[string]interface{}
	Severity    string
	Channels    []string
	IsActive    bool
	Cooldown    time.Duration
}
