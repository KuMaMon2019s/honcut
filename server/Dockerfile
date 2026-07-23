# Build stage - Go 1.26 to match go.mod
FROM golang:1.26-alpine AS builder

WORKDIR /build

# Install build dependencies
RUN apk add --no-cache git

# Copy go mod files
COPY go.mod go.sum ./

# Download dependencies
RUN go mod download

# Copy source code
COPY . .

# Build honcut-server
RUN CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -ldflags="-w -s" -o honcut-server ./cmd/honcut-server

# Build honcut-mcp
RUN CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -ldflags="-w -s" -o honcut-mcp ./cmd/honcut-mcp

# Runtime stage - Alpine with ffmpeg + chromium
FROM alpine:3.19

RUN apk add --no-cache \
    ca-certificates \
    ffmpeg \
    chromium

WORKDIR /app

# Copy binaries
COPY --from=builder /build/honcut-server .
COPY --from=builder /build/honcut-mcp .

# Create data directories
RUN mkdir -p /root/.honcut/uploads

# Expose ports
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:8080/health || exit 1

# Default command
CMD ["./honcut-server"]
