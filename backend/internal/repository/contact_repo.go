package repository

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type ContactSubmission struct {
	ID        uuid.UUID `json:"id"`
	Name      string    `json:"name"`
	Email     string    `json:"email"`
	Company   string    `json:"company"`
	Message   string    `json:"message"`
	IPAddress string    `json:"ip_address"`
	CreatedAt time.Time `json:"created_at"`
}

type ContactRepo struct {
	pool *pgxpool.Pool
}

func NewContactRepo(pool *pgxpool.Pool) *ContactRepo {
	return &ContactRepo{pool: pool}
}

func (r *ContactRepo) Create(ctx context.Context, name, email, company, message, ipAddress string) (*ContactSubmission, error) {
	cs := &ContactSubmission{
		ID:        uuid.New(),
		Name:      name,
		Email:     email,
		Company:   company,
		Message:   message,
		IPAddress: ipAddress,
		CreatedAt: time.Now(),
	}

	_, err := r.pool.Exec(ctx,
		`INSERT INTO public.contact_submissions (id, name, email, company, message, ip_address, created_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
		cs.ID, cs.Name, cs.Email, cs.Company, cs.Message, cs.IPAddress, cs.CreatedAt,
	)
	if err != nil {
		return nil, err
	}
	return cs, nil
}

func (r *ContactRepo) List(ctx context.Context, limit, offset int) ([]ContactSubmission, int, error) {
	var total int
	err := r.pool.QueryRow(ctx, `SELECT COUNT(*) FROM public.contact_submissions`).Scan(&total)
	if err != nil {
		return nil, 0, err
	}

	rows, err := r.pool.Query(ctx,
		`SELECT id, name, email, company, message, ip_address, created_at
		 FROM public.contact_submissions ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
		limit, offset,
	)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var submissions []ContactSubmission
	for rows.Next() {
		var cs ContactSubmission
		if err := rows.Scan(&cs.ID, &cs.Name, &cs.Email, &cs.Company, &cs.Message, &cs.IPAddress, &cs.CreatedAt); err != nil {
			return nil, 0, err
		}
		submissions = append(submissions, cs)
	}
	return submissions, total, nil
}
