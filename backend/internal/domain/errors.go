package domain

import (
	"errors"
	"fmt"
	"net/http"
)

// Sentinel errors for common domain cases.
var (
	ErrNotFound      = &AppError{Code: http.StatusNotFound, Message: "resource not found"}
	ErrConflict      = &AppError{Code: http.StatusConflict, Message: "resource already exists"}
	ErrForbidden     = &AppError{Code: http.StatusForbidden, Message: "access denied"}
	ErrUnauthorized  = &AppError{Code: http.StatusUnauthorized, Message: "unauthorized"}
	ErrBadRequest    = &AppError{Code: http.StatusBadRequest, Message: "bad request"}
	ErrInternal      = &AppError{Code: http.StatusInternalServerError, Message: "internal server error"}
	ErrMaxDepth      = &AppError{Code: http.StatusUnprocessableEntity, Message: fmt.Sprintf("maximum subtask depth exceeded (max %d levels)", MaxTaskDepth+1)}
	ErrRulesNotMet   = &AppError{Code: http.StatusUnprocessableEntity, Message: "task completion rules not satisfied"}
	ErrPlanLimitHit  = &AppError{Code: http.StatusPaymentRequired, Message: "plan limit reached"}
	ErrCyclicDep     = &AppError{Code: http.StatusUnprocessableEntity, Message: "cyclic dependency detected"}
	ErrInvalidStatus = &AppError{Code: http.StatusUnprocessableEntity, Message: "invalid status transition"}
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
