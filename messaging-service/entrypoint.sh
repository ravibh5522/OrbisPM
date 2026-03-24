#!/bin/sh
set -e

echo "Running messaging-service migrations..."
./migrate

echo "Starting messaging-service..."
exec ./messaging-service
