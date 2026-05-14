set -eu

cd /js && npm ci
cd /py && uv sync --locked
