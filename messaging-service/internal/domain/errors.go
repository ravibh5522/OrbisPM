package domain

import (
	"errors"
	"fmt"
	"net/http"
)

// ErrCodeValidation is used for file validation errors.
const ErrCodeValidation = http.StatusBadRequest

// Sentinel errors for common domain cases.
var (
	ErrNotFound         = &AppError{Code: http.StatusNotFound, Message: "resource not found"}
	ErrConflict         = &AppError{Code: http.StatusConflict, Message: "resource already exists"}
	ErrForbidden        = &AppError{Code: http.StatusForbidden, Message: "access denied"}
	ErrUnauthorized     = &AppError{Code: http.StatusUnauthorized, Message: "unauthorized"}
	ErrBadRequest       = &AppError{Code: http.StatusBadRequest, Message: "bad request"}
	ErrInternal         = &AppError{Code: http.StatusInternalServerError, Message: "internal server error"}
	ErrNotChannelMember = &AppError{Code: http.StatusForbidden, Message: "not a member of this channel"}
	ErrEditWindowClosed = &AppError{Code: http.StatusUnprocessableEntity, Message: "edit window has expired"}
	ErrMessageTooLong   = &AppError{Code: http.StatusBadRequest, Message: "message exceeds maximum length"}
	ErrChannelArchived  = &AppError{Code: http.StatusUnprocessableEntity, Message: "channel is archived"}
	ErrDMCannotAddMore  = &AppError{Code: http.StatusUnprocessableEntity, Message: "cannot add members to a DM channel"}
	ErrDMSelf           = &AppError{Code: http.StatusBadRequest, Message: "cannot create DM with yourself"}
	ErrRateLimited      = &AppError{Code: http.StatusTooManyRequests, Message: "rate limit exceeded"}
	ErrInvalidRole      = &AppError{Code: http.StatusBadRequest, Message: "invalid role"}
	ErrInsufficientRank = &AppError{Code: http.StatusForbidden, Message: "cannot modify a user with an equal or higher role"}
	ErrViewerReadOnly   = &AppError{Code: http.StatusForbidden, Message: "viewers have read-only access"}
)

// AppError is the application-level error type that carries an HTTP status code.
type AppError struct {
	Code    int    `json:"-"`
	Message string `json:"message"`
	Detail  string `json:"detail,omitempty"`
}

func (e *AppError) Error() string {
	if e.Detail != "" {
		return fmt.Sprintf("%s: %s", e.Message, e.Detail)
	}
	return e.Message
}

// NewAppError creates a new AppError with the given code and message.
func NewAppError(code int, message string) *AppError {
	return &AppError{Code: code, Message: message}
}

// WithDetail returns a copy of the error with additional detail.
func (e *AppError) WithDetail(detail string) *AppError {
	return &AppError{Code: e.Code, Message: e.Message, Detail: detail}
}

// IsAppError checks if an error is an AppError and returns it.
func IsAppError(err error) (*AppError, bool) {
	var appErr *AppError
	if errors.As(err, &appErr) {
		return appErr, true
	}
	return nil, false
}
