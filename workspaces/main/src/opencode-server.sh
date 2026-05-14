#!/bin/sh

set -eu

HOSTNAME="${OPENCODE_HOSTNAME:-127.0.0.1}"
PORT="${OPENCODE_PORT:-4096}"
IMAGE="${VIBEO_WORKER_IMAGE:-localhost/vibeo-worker:latest}"
WORKSPACE_DIR="${VIBEO_WORKSPACE_DIR:-$PWD}"

exec podman run --rm -i \
  --pull=never \
  -p "${HOSTNAME}:${PORT}:${PORT}" \
  -v "${WORKSPACE_DIR}:/workspace" \
  -e ANTHROPIC_API_KEY \
  -e OPENAI_API_KEY \
  -e OPENCODE_CONFIG_CONTENT \
  -e OPENCODE_SERVER_PASSWORD \
  -e OPENCODE_SERVER_USERNAME \
  "${IMAGE}" \
  opencode serve --hostname=0.0.0.0 --port="${PORT}" "$@"
