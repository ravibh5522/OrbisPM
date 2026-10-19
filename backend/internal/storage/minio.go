package storage

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/url"
	"strings"
	"time"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
	"github.com/rs/zerolog/log"
)

// Client wraps the MinIO SDK to provide object storage operations.
type Client struct {
	mc          *minio.Client // internal — used for uploads, downloads, bucket ops
	presignMC   *minio.Client // public  — used for presigned URLs (browser-reachable host)
	bucket      string
	presignBase string // public base URL, e.g. "https://minioapi.simplifyai.id"
}

// NewClient creates a new MinIO storage client and ensures the bucket exists.
// publicURL is the browser-reachable base URL (e.g. "https://minioapi.simplifyai.id");
// it is used when generating presigned URLs so the browser can reach them.
// public sets an anonymous public-read policy on the bucket; private buckets
// (Drive) are only reachable through presigned URLs.
func NewClient(endpoint, accessKey, secretKey, bucket, publicURL string, useSSL, public bool) (*Client, error) {
	mc, err := minio.New(endpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(accessKey, secretKey, ""),
		Secure: useSSL,
	})
	if err != nil {
		return nil, fmt.Errorf("minio client: %w", err)
	}

	// Build a second client using the public-facing hostname so that presigned
	// URLs contain the browser-reachable host (TLS termination is handled by
	// the reverse proxy; MinIO itself runs plain HTTP behind it).
	var presignMC *minio.Client
	parsedPublic, parseErr := url.Parse(publicURL)
	if parseErr == nil && parsedPublic.Host != "" {
		publicSecure := parsedPublic.Scheme == "https"
		// Region is fixed so presigning never asks MinIO for the bucket
		// location: that request goes to the public host, which from inside
		// Docker (e.g. localhost:9020) isn't MinIO and fails with a 500.
		presignMC, _ = minio.New(parsedPublic.Host, &minio.Options{
			Creds:  credentials.NewStaticV4(accessKey, secretKey, ""),
			Secure: publicSecure,
			Region: "us-east-1",
		})
	}
	if presignMC == nil {
		presignMC = mc // fallback: same client
	}

	c := &Client{mc: mc, presignMC: presignMC, bucket: bucket, presignBase: strings.TrimRight(publicURL, "/")}

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

	if !public {
		// A leftover policy would silently expose every object in a private bucket.
		if policy, err := mc.GetBucketPolicy(ctx, bucket); err == nil && policy != "" {
			log.Error().Str("bucket", bucket).Msg("private MinIO bucket has a bucket policy; objects may be publicly readable")
		}
		return c, nil
	}

	// Set public-read policy so browser can load avatars/logos directly.
	publicPolicy := fmt.Sprintf(`{
	"Version":"2012-10-17",
	"Statement":[{
		"Effect":"Allow",
		"Principal":{"AWS":"*"},
		"Action":["s3:GetObject"],
		"Resource":["arn:aws:s3:::%s/*"]
	}]
}`, bucket)
	if err := mc.SetBucketPolicy(ctx, bucket, publicPolicy); err != nil {
		log.Warn().Err(err).Str("bucket", bucket).Msg("failed to set bucket public-read policy (objects may not be publicly accessible)")
	} else {
		log.Info().Str("bucket", bucket).Msg("MinIO bucket public-read policy set")
	}

	return c, nil
}

// Upload stores an object in the bucket and returns the storage path.
func (c *Client) Upload(ctx context.Context, objectName string, reader io.Reader, size int64, contentType string) (string, error) {
	opts := minio.PutObjectOptions{ContentType: contentType}
	if size < 0 {
		// Unknown size: minio-go would otherwise size parts for a 5 TiB object
		// and buffer ~560 MB per upload.
		opts.PartSize = 8 << 20
	}
	_, err := c.mc.PutObject(ctx, c.bucket, objectName, reader, size, opts)
	if err != nil {
		return "", fmt.Errorf("upload %s: %w", objectName, err)
	}
	return objectName, nil
}

// ErrObjectNotFound is returned by Download when the object doesn't exist,
// e.g. a database record whose upload never completed.
var ErrObjectNotFound = errors.New("object not found in storage")

// Download retrieves an object from the bucket.
func (c *Client) Download(ctx context.Context, objectName string) (io.ReadCloser, error) {
	obj, err := c.mc.GetObject(ctx, c.bucket, objectName, minio.GetObjectOptions{})
	if err != nil {
		return nil, fmt.Errorf("download %s: %w", objectName, err)
	}
	// GetObject is lazy: a missing object only shows up on first read, after a
	// caller may already have sent response headers. Check now.
	if _, err := obj.Stat(); err != nil {
		obj.Close()
		if minio.ToErrorResponse(err).Code == "NoSuchKey" {
			return nil, ErrObjectNotFound
		}
		return nil, fmt.Errorf("download %s: %w", objectName, err)
	}
	return obj, nil
}

// PresignedGetURL generates a pre-signed download URL using the public-facing
// MinIO host so the URL is accessible from the browser.
func (c *Client) PresignedGetURL(ctx context.Context, objectName string, expires time.Duration) (string, error) {
	return c.PresignedGetURLWithParams(ctx, objectName, expires, make(url.Values))
}

// PresignedGetURLWithParams is PresignedGetURL with S3 response overrides
// (e.g. response-content-type, response-content-disposition).
func (c *Client) PresignedGetURLWithParams(ctx context.Context, objectName string, expires time.Duration, reqParams url.Values) (string, error) {
	u, err := c.presignMC.PresignedGetObject(ctx, c.bucket, objectName, expires, reqParams)
	if err != nil {
		return "", fmt.Errorf("presign get %s: %w", objectName, err)
	}
	return u.String(), nil
}

// PresignedPutURL generates a pre-signed upload URL using the public-facing
// MinIO host so the browser can PUT directly to MinIO.
func (c *Client) PresignedPutURL(ctx context.Context, objectName string, expires time.Duration) (string, error) {
	u, err := c.presignMC.PresignedPutObject(ctx, c.bucket, objectName, expires)
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
