package storage

import (
	"context"
	"fmt"
	"io"
	"net/url"
	"time"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
	"github.com/rs/zerolog/log"
)

// Client wraps the MinIO SDK to provide object storage operations.
type Client struct {
	mc     *minio.Client
	bucket string
}

// NewClient creates a new MinIO storage client and ensures the bucket exists.
func NewClient(endpoint, accessKey, secretKey, bucket string, useSSL bool) (*Client, error) {
	mc, err := minio.New(endpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(accessKey, secretKey, ""),
		Secure: useSSL,
	})
	if err != nil {
		return nil, fmt.Errorf("minio client: %w", err)
	}

	c := &Client{mc: mc, bucket: bucket}

	// Ensure bucket exists
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	exists, err := mc.BucketExists(ctx, bucket)
	if err != nil {
		return nil, fmt.Errorf("check bucket: %w", err)
	}
	if !exists {
		if err := mc.MakeBucket(ctx, bucket, minio.MakeBucketOptions{}); err != nil {
			return nil, fmt.Errorf("create bucket %q: %w", bucket, err)
		}
		log.Info().Str("bucket", bucket).Msg("created MinIO bucket")
	}
	return c, nil
}

// Upload stores an object in the bucket and returns the storage path.
func (c *Client) Upload(ctx context.Context, objectName string, reader io.Reader, size int64, contentType string) (string, error) {
	_, err := c.mc.PutObject(ctx, c.bucket, objectName, reader, size, minio.PutObjectOptions{
		ContentType: contentType,
	})
	if err != nil {
		return "", fmt.Errorf("upload %s: %w", objectName, err)
	}
	return objectName, nil
}

// Download retrieves an object from the bucket.
func (c *Client) Download(ctx context.Context, objectName string) (io.ReadCloser, error) {
	obj, err := c.mc.GetObject(ctx, c.bucket, objectName, minio.GetObjectOptions{})
	if err != nil {
		return nil, fmt.Errorf("download %s: %w", objectName, err)
	}
	return obj, nil
}

// PresignedGetURL generates a pre-signed URL for downloading an object.
func (c *Client) PresignedGetURL(ctx context.Context, objectName string, expires time.Duration) (string, error) {
	reqParams := make(url.Values)
	u, err := c.mc.PresignedGetObject(ctx, c.bucket, objectName, expires, reqParams)
	if err != nil {
		return "", fmt.Errorf("presign get %s: %w", objectName, err)
	}
	return u.String(), nil
}

// PresignedPutURL generates a pre-signed URL for uploading an object.
func (c *Client) PresignedPutURL(ctx context.Context, objectName string, expires time.Duration) (string, error) {
	u, err := c.mc.PresignedPutObject(ctx, c.bucket, objectName, expires)
	if err != nil {
		return "", fmt.Errorf("presign put %s: %w", objectName, err)
	}
	return u.String(), nil
}

// Delete removes an object from the bucket.
func (c *Client) Delete(ctx context.Context, objectName string) error {
	if err := c.mc.RemoveObject(ctx, c.bucket, objectName, minio.RemoveObjectOptions{}); err != nil {
		return fmt.Errorf("delete %s: %w", objectName, err)
	}
	return nil
}

// Stat retrieves metadata about an object.
func (c *Client) Stat(ctx context.Context, objectName string) (*minio.ObjectInfo, error) {
	info, err := c.mc.StatObject(ctx, c.bucket, objectName, minio.StatObjectOptions{})
	if err != nil {
		return nil, fmt.Errorf("stat %s: %w", objectName, err)
	}
	return &info, nil
}

// HealthCheck checks MinIO connectivity.
func (c *Client) HealthCheck(ctx context.Context) error {
	_, err := c.mc.BucketExists(ctx, c.bucket)
	return err
}
