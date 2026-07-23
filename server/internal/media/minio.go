package media

import (
	"context"
	"fmt"
	"io"
	"os"
	"time"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

// MinIOClient wraps MinIO operations
type MinIOClient struct {
	client *minio.Client
	bucket string
}

// NewMinIOClient creates a MinIO client from environment variables
func NewMinIOClient() (*MinIOClient, error) {
	endpoint := os.Getenv("MINIO_ENDPOINT")
	if endpoint == "" {
		endpoint = "localhost:9000"
	}
	accessKey := os.Getenv("MINIO_ACCESS_KEY")
	if accessKey == "" {
		accessKey = "minioadmin"
	}
	secretKey := os.Getenv("MINIO_SECRET_KEY")
	if secretKey == "" {
		secretKey = "minioadmin"
	}
	bucket := os.Getenv("MINIO_BUCKET")
	if bucket == "" {
		bucket = "honcut-media"
	}
	useSSL := os.Getenv("MINIO_USE_SSL") == "true"

	client, err := minio.New(endpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(accessKey, secretKey, ""),
		Secure: useSSL,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to create MinIO client: %w", err)
	}

	return &MinIOClient{
		client: client,
		bucket: bucket,
	}, nil
}

// EnsureBucket creates the bucket if it doesn't exist
func (m *MinIOClient) EnsureBucket(ctx context.Context) error {
	exists, err := m.client.BucketExists(ctx, m.bucket)
	if err != nil {
		return fmt.Errorf("failed to check bucket: %w", err)
	}
	if !exists {
		err = m.client.MakeBucket(ctx, m.bucket, minio.MakeBucketOptions{})
		if err != nil {
			return fmt.Errorf("failed to create bucket: %w", err)
		}
	}
	return nil
}

// Upload uploads a file to MinIO
func (m *MinIOClient) Upload(ctx context.Context, objectName string, reader io.Reader, objectSize int64, contentType string) (string, error) {
	opts := minio.PutObjectOptions{
		ContentType: contentType,
	}
	_, err := m.client.PutObject(ctx, m.bucket, objectName, reader, objectSize, opts)
	if err != nil {
		return "", fmt.Errorf("failed to upload to MinIO: %w", err)
	}
	return fmt.Sprintf("minio://%s/%s", m.bucket, objectName), nil
}

// Download downloads a file from MinIO
func (m *MinIOClient) Download(ctx context.Context, objectName string) (io.ReadCloser, error) {
	obj, err := m.client.GetObject(ctx, m.bucket, objectName, minio.GetObjectOptions{})
	if err != nil {
		return nil, fmt.Errorf("failed to download from MinIO: %w", err)
	}
	return obj, nil
}

// Delete deletes a file from MinIO
func (m *MinIOClient) Delete(ctx context.Context, objectName string) error {
	err := m.client.RemoveObject(ctx, m.bucket, objectName, minio.RemoveObjectOptions{})
	if err != nil {
		return fmt.Errorf("failed to delete from MinIO: %w", err)
	}
	return nil
}

// GetPresignedURL generates a presigned URL for temporary access
func (m *MinIOClient) GetPresignedURL(ctx context.Context, objectName string, expirySeconds int) (string, error) {
	url, err := m.client.PresignedGetObject(ctx, m.bucket, objectName, time.Duration(expirySeconds)*time.Second, nil)
	if err != nil {
		return "", fmt.Errorf("failed to generate presigned URL: %w", err)
	}
	return url.String(), nil
}
