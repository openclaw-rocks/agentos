#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
SYNAPSE_DIR="$SCRIPT_DIR/synapse"
HOMESERVER_URL="http://localhost:8008"
SERVER_NAME="localhost"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() { echo -e "${GREEN}[setup]${NC} $1"; }
warn() { echo -e "${YELLOW}[setup]${NC} $1"; }
err() { echo -e "${RED}[setup]${NC} $1"; }

# Step 1: Generate Synapse config if needed
if [ ! -f "$SYNAPSE_DIR/homeserver.yaml" ]; then
  log "Generating Synapse configuration..."
  mkdir -p "$SYNAPSE_DIR"

  # Generate a signing key
  SIGNING_KEY="ed25519 a_$(openssl rand -hex 4) $(openssl rand -base64 32)"
  echo "$SIGNING_KEY" > "$SYNAPSE_DIR/localhost.signing.key"

  # Generate a macaroon secret and other secrets
  MACAROON_SECRET="$(openssl rand -hex 32)"
  FORM_SECRET="$(openssl rand -hex 32)"
  REG_SHARED_SECRET="$(openssl rand -hex 32)"

  # Write homeserver config directly
  cat > "$SYNAPSE_DIR/homeserver.yaml" <<YAML
server_name: "$SERVER_NAME"
pid_file: /data/homeserver.pid
listeners:
  - port: 8008
    tls: false
    type: http
    x_forwarded: true
    bind_addresses: ["0.0.0.0"]
    resources:
      - names: [client, federation]
        compress: false
database:
  name: sqlite3
  args:
    database: /data/homeserver.db
log_config: "/data/localhost.log.config"
media_store_path: /data/media_store
signing_key_path: "/data/localhost.signing.key"
macaroon_secret_key: "$MACAROON_SECRET"
form_secret: "$FORM_SECRET"
registration_shared_secret: "$REG_SHARED_SECRET"
report_stats: false
trusted_key_servers:
  - server_name: "matrix.org"

# Dev overrides
enable_registration: true
enable_registration_without_verification: true
suppress_key_server_warning: true

# Application Service registration
app_service_config_files:
  - /data/appservice-openclaw.yaml

# Allow agents to use larger messages
max_event_bytes: 1048576

# Disable rate limiting for local dev
rc_login:
  address:
    per_second: 100
    burst_count: 100
  account:
    per_second: 100
    burst_count: 100
rc_message:
  per_second: 100
  burst_count: 100
rc_registration:
  per_second: 100
  burst_count: 100
YAML

  # Write a basic log config
  cat > "$SYNAPSE_DIR/localhost.log.config" <<LOGCONF
version: 1
formatters:
  precise:
    format: '%(asctime)s - %(name)s - %(lineno)d - %(levelname)s - %(request)s - %(message)s'
handlers:
  console:
    class: logging.StreamHandler
    formatter: precise
loggers:
  synapse.storage.SQL:
    level: WARNING
root:
  level: WARNING
  handlers: [console]
disable_existing_loggers: false
LOGCONF

  log "Synapse config generated at $SYNAPSE_DIR/homeserver.yaml"
else
  log "Synapse config already exists, skipping generation."
fi

# Step 2: Generate AS tokens
AS_TOKEN="as_openclaw_$(openssl rand -hex 16)"
HS_TOKEN="hs_openclaw_$(openssl rand -hex 16)"

# Write AS registration without the exclusive namespace first,
# so we can register the agent-echo user via normal registration.
# We'll update it after user registration.
cat > "$SYNAPSE_DIR/appservice-openclaw.yaml" <<YAML
id: openclaw-agent-service
url: "http://host.docker.internal:9000"
as_token: "$AS_TOKEN"
hs_token: "$HS_TOKEN"
sender_localpart: "openclaw-service"
namespaces:
  users:
    - exclusive: false
      regex: "@agent-.*:$SERVER_NAME"
  rooms: []
  aliases: []
rate_limited: false
YAML

log "Application Service registration written (non-exclusive for initial setup)."

# Step 3: Start Synapse
log "Starting Synapse..."
cd "$ROOT_DIR"
docker compose up -d synapse

log "Waiting for Synapse to be healthy..."
for i in $(seq 1 30); do
  if curl -sf "$HOMESERVER_URL/health" > /dev/null 2>&1; then
    log "Synapse is ready!"
    break
  fi
  if [ "$i" -eq 30 ]; then
    err "Synapse failed to start. Check: docker compose logs synapse"
    exit 1
  fi
  sleep 2
done

# Step 4: Register users
register_user() {
  local username="$1"
  local password="$2"

  local response
  response=$(curl -s "$HOMESERVER_URL/_matrix/client/v3/register" \
    -H "Content-Type: application/json" \
    -d "{\"username\": \"$username\", \"password\": \"$password\", \"auth\": {\"type\": \"m.login.dummy\"}, \"inhibit_login\": false}" 2>/dev/null) || true

  if echo "$response" | grep -q "access_token"; then
    echo -e "${GREEN}[setup]${NC} Created user @$username:$SERVER_NAME" >&2
    echo "$response"
    return 0
  elif echo "$response" | grep -q "M_USER_IN_USE"; then
    echo -e "${YELLOW}[setup]${NC} User @$username:$SERVER_NAME exists, logging in..." >&2
    response=$(curl -s "$HOMESERVER_URL/_matrix/client/v3/login" \
      -H "Content-Type: application/json" \
      -d "{\"type\": \"m.login.password\", \"identifier\": {\"type\": \"m.id.user\", \"user\": \"$username\"}, \"password\": \"$password\"}" 2>/dev/null)
    echo "$response"
    return 0
  else
    echo -e "${RED}[setup]${NC} Failed to register $username: $response" >&2
    return 1
  fi
}

log "Registering users..."

ADMIN_RESPONSE=$(register_user "admin" "admin123")
ADMIN_TOKEN=$(echo "$ADMIN_RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])" 2>/dev/null || echo "")

USER1_RESPONSE=$(register_user "user1" "user123")
USER1_TOKEN=$(echo "$USER1_RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])" 2>/dev/null || echo "")

ECHO_RESPONSE=$(register_user "agent-echo" "agent123")
ECHO_TOKEN=$(echo "$ECHO_RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])" 2>/dev/null || echo "")

# Now switch AS registration to exclusive mode and restart Synapse
cat > "$SYNAPSE_DIR/appservice-openclaw.yaml" <<YAML
id: openclaw-agent-service
url: "http://host.docker.internal:9000"
as_token: "$AS_TOKEN"
hs_token: "$HS_TOKEN"
sender_localpart: "openclaw-service"
namespaces:
  users:
    - exclusive: true
      regex: "@agent-.*:$SERVER_NAME"
  rooms: []
  aliases: []
rate_limited: false
YAML

log "Updated AS registration to exclusive mode, restarting Synapse..."
docker compose restart synapse > /dev/null 2>&1
sleep 3

if [ -z "$USER1_TOKEN" ]; then
  err "Failed to get user1 access token"
  exit 1
fi

if [ -z "$ECHO_TOKEN" ]; then
  err "Failed to get agent-echo access token"
  exit 1
fi

# Step 5: Create Spaces and rooms
log "Creating Spaces and rooms..."

# --- OpenClaw HQ Space ---
log "Creating 'OpenClaw HQ' Space..."
HQ_SPACE_RESPONSE=$(curl -s "$HOMESERVER_URL/_matrix/client/v3/createRoom" \
  -H "Authorization: Bearer $USER1_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "OpenClaw HQ",
    "topic": "Main space for the OpenClaw team",
    "preset": "public_chat",
    "creation_content": {"type": "m.space"},
    "room_alias_name": "openclaw-hq"
  }') || true
HQ_SPACE_ID=$(echo "$HQ_SPACE_RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('room_id',''))" 2>/dev/null || echo "")

if [ -n "$HQ_SPACE_ID" ]; then
  log "Created Space 'OpenClaw HQ': $HQ_SPACE_ID"
else
  warn "OpenClaw HQ Space may already exist, skipping."
fi

# Create #general room
GENERAL_RESPONSE=$(curl -s "$HOMESERVER_URL/_matrix/client/v3/createRoom" \
  -H "Authorization: Bearer $USER1_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "General",
    "topic": "Main channel",
    "preset": "public_chat",
    "room_alias_name": "general"
  }') || true
GENERAL_ROOM_ID=$(echo "$GENERAL_RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('room_id',''))" 2>/dev/null || echo "")

if [ -n "$GENERAL_ROOM_ID" ]; then
  log "Created room #general: $GENERAL_ROOM_ID"
else
  warn "#general room may already exist, skipping."
fi

# Create #incident-test room
INCIDENT_RESPONSE=$(curl -s "$HOMESERVER_URL/_matrix/client/v3/createRoom" \
  -H "Authorization: Bearer $USER1_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "incident-test",
    "topic": "Test incident channel for agent auto-deploy",
    "preset": "public_chat",
    "room_alias_name": "incident-test"
  }') || true
INCIDENT_ROOM_ID=$(echo "$INCIDENT_RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('room_id',''))" 2>/dev/null || echo "")

if [ -n "$INCIDENT_ROOM_ID" ]; then
  log "Created room #incident-test: $INCIDENT_ROOM_ID"
else
  warn "#incident-test room may already exist, skipping."
fi

# Add #general and #incident-test as children of OpenClaw HQ
if [ -n "$HQ_SPACE_ID" ] && [ -n "$GENERAL_ROOM_ID" ]; then
  ENCODED_GENERAL=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$GENERAL_ROOM_ID'))")
  curl -s "$HOMESERVER_URL/_matrix/client/v3/rooms/$HQ_SPACE_ID/state/m.space.child/$ENCODED_GENERAL" \
    -X PUT \
    -H "Authorization: Bearer $USER1_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"via": ["localhost"]}' > /dev/null 2>&1 || true
  log "Added #general as child of OpenClaw HQ"
fi

if [ -n "$HQ_SPACE_ID" ] && [ -n "$INCIDENT_ROOM_ID" ]; then
  ENCODED_INCIDENT=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$INCIDENT_ROOM_ID'))")
  curl -s "$HOMESERVER_URL/_matrix/client/v3/rooms/$HQ_SPACE_ID/state/m.space.child/$ENCODED_INCIDENT" \
    -X PUT \
    -H "Authorization: Bearer $USER1_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"via": ["localhost"]}' > /dev/null 2>&1 || true
  log "Added #incident-test as child of OpenClaw HQ"
fi

# Invite echo agent to #general and have it join
if [ -n "$GENERAL_ROOM_ID" ]; then
  curl -s "$HOMESERVER_URL/_matrix/client/v3/rooms/$GENERAL_ROOM_ID/invite" \
    -H "Authorization: Bearer $USER1_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"user_id\": \"@agent-echo:$SERVER_NAME\"}" > /dev/null 2>&1 || true

  ENCODED_GENERAL_JOIN=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$GENERAL_ROOM_ID'))")
  curl -s "$HOMESERVER_URL/_matrix/client/v3/join/$ENCODED_GENERAL_JOIN" \
    -H "Authorization: Bearer $ECHO_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{}' > /dev/null 2>&1 || true

  log "Echo agent joined #general"
fi

# --- Side Projects Space ---
log "Creating 'Side Projects' Space..."
SIDE_SPACE_RESPONSE=$(curl -s "$HOMESERVER_URL/_matrix/client/v3/createRoom" \
  -H "Authorization: Bearer $USER1_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Side Projects",
    "topic": "A space for side projects and experiments",
    "preset": "public_chat",
    "creation_content": {"type": "m.space"},
    "room_alias_name": "side-projects"
  }') || true
SIDE_SPACE_ID=$(echo "$SIDE_SPACE_RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('room_id',''))" 2>/dev/null || echo "")

if [ -n "$SIDE_SPACE_ID" ]; then
  log "Created Space 'Side Projects': $SIDE_SPACE_ID"
else
  warn "Side Projects Space may already exist, skipping."
fi

# Create #random room
RANDOM_RESPONSE=$(curl -s "$HOMESERVER_URL/_matrix/client/v3/createRoom" \
  -H "Authorization: Bearer $USER1_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Random",
    "topic": "Off-topic and random discussion",
    "preset": "public_chat",
    "room_alias_name": "random"
  }') || true
RANDOM_ROOM_ID=$(echo "$RANDOM_RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('room_id',''))" 2>/dev/null || echo "")

if [ -n "$RANDOM_ROOM_ID" ]; then
  log "Created room #random: $RANDOM_ROOM_ID"
else
  warn "#random room may already exist, skipping."
fi

# Add #random as child of Side Projects
if [ -n "$SIDE_SPACE_ID" ] && [ -n "$RANDOM_ROOM_ID" ]; then
  ENCODED_RANDOM=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$RANDOM_ROOM_ID'))")
  curl -s "$HOMESERVER_URL/_matrix/client/v3/rooms/$SIDE_SPACE_ID/state/m.space.child/$ENCODED_RANDOM" \
    -X PUT \
    -H "Authorization: Bearer $USER1_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"via": ["localhost"]}' > /dev/null 2>&1 || true
  log "Added #random as child of Side Projects"
fi

# Step 6: Write .env files
cat > "$ROOT_DIR/apps/runtime/.env" <<ENV
HOMESERVER_URL=$HOMESERVER_URL
AS_TOKEN=$AS_TOKEN
HS_TOKEN=$HS_TOKEN
PORT=9000
AGENT_PREFIX=agent-
HOMESERVER_DOMAIN=$SERVER_NAME
ENV

cat > "$ROOT_DIR/agents/echo/.env" <<ENV
HOMESERVER_URL=$HOMESERVER_URL
BOT_USER_ID=@agent-echo:$SERVER_NAME
BOT_ACCESS_TOKEN=$ECHO_TOKEN
ENV

log "Environment files written."

# Summary
echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  OpenClaw Local Dev Environment Ready  ${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "  Synapse:     $HOMESERVER_URL"
echo -e "  Server name: $SERVER_NAME"
echo ""
echo -e "  ${YELLOW}Users:${NC}"
echo -e "    admin  / admin123"
echo -e "    user1  / user123"
echo ""
echo -e "  ${YELLOW}Spaces & Rooms:${NC}"
echo -e "    [Space] OpenClaw HQ       (#openclaw-hq:$SERVER_NAME)"
echo -e "      ├── #general:$SERVER_NAME"
echo -e "      └── #incident-test:$SERVER_NAME"
echo -e "    [Space] Side Projects      (#side-projects:$SERVER_NAME)"
echo -e "      └── #random:$SERVER_NAME"
echo ""
echo -e "  ${YELLOW}Next steps:${NC}"
echo -e "    1. pnpm dev              # Start web client + agents"
echo -e "    2. Open http://localhost:5173"
echo -e "    3. Login as user1 / user123"
echo -e "    4. Go to #general and type !help"
echo ""
