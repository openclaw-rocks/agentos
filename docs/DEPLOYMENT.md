# AgentOS Production Deployment

## Architecture Overview

A production AgentOS deployment consists of three operator-managed layers:

```
┌─────────────────────────────────────────────────────┐
│                   AgentOS Shell                       │
│  Static React app served via CDN / Kubernetes Ingress │
└───────────────────────┬─────────────────────────────┘
                        │ Matrix Client-Server API
┌───────────────────────┴─────────────────────────────┐
│              Tuwunel (Matrix Homeserver)               │
│  Managed by: tuwunel-operator (TuwunelInstance CRD)    │
│  - One CRD per homeserver                              │
│  - Auto-creates: StatefulSet, ConfigMap, Service,      │
│    NetworkPolicy, PVC, PDB, Ingress, monitoring        │
│  - RocksDB storage, federation optional                │
└───────────────────────┬─────────────────────────────┘
                        │ Matrix events
┌───────────────────────┴─────────────────────────────┐
│              OpenClaw Agent Instances                  │
│  Managed by: openclaw-operator (OpenClawInstance CRD)  │
│  - One CRD per agent                                   │
│  - Each gets: Matrix credentials, agentos-agent skill, │
│    SOUL.md, HEARTBEAT.md, resource limits              │
└─────────────────────────────────────────────────────┘
```

## Tuwunel Operator

The tuwunel operator ([openclaw-rocks/tuwunel-operator](https://github.com/openclaw-rocks/tuwunel-operator)) manages Matrix homeserver instances on Kubernetes. One `TuwunelInstance` CRD creates and manages 10+ resources automatically.

### Installation

```bash
helm install tuwunel-operator \
  oci://ghcr.io/openclaw-rocks/charts/tuwunel-operator \
  --namespace tuwunel-operator-system \
  --create-namespace
```

### Example: AgentOS Homeserver

```yaml
apiVersion: matrix.openclaw.rocks/v1alpha1
kind: TuwunelInstance
metadata:
  name: agentos-matrix
  namespace: agentos
spec:
  serverName: "matrix.openclaw.rocks"

  image:
    repository: ghcr.io/matrix-construct/tuwunel
    tag: "latest"

  storage:
    database:
      enabled: true
      size: "20Gi"
      storageClass: "fast-ssd"

  federation:
    enabled: true
    wellKnown:
      server: "matrix.openclaw.rocks:443"
      client: "https://matrix.openclaw.rocks"

  registration:
    allowRegistration: true
    registrationTokenSecretRef:
      name: agent-registration-token
      key: token

  security:
    networkPolicy:
      enabled: true
      allowedIngressNamespaces:
        - agentos

  resources:
    requests:
      cpu: "500m"
      memory: "512Mi"
    limits:
      cpu: "2000m"
      memory: "2Gi"

  observability:
    serviceMonitor:
      enabled: true
      interval: "30s"
    prometheusRules:
      enabled: true
```

### What the Operator Creates

| Resource | Purpose |
|----------|---------|
| StatefulSet | Main tuwunel process (1 replica, persistent volume) |
| ConfigMap | Generated `tuwunel.toml` configuration |
| PersistentVolumeClaim | RocksDB database + media storage |
| Service | Ports 8008 (client), 8448 (federation) |
| NetworkPolicy | Default-deny with allowlist |
| PodDisruptionBudget | Availability during disruptions |
| Ingress | External access (if enabled) |
| ServiceMonitor | Prometheus scraping (if enabled) |
| CronJob (Backup) | Automated S3 backups (if enabled) |
| CronJob (Maintenance) | DB vacuum/compaction (if enabled) |

Config changes automatically trigger rolling updates via config-hash annotations.

## Agent Deployment

Agents are OpenClaw instances deployed via the OpenClaw operator (planned). Each agent gets:

1. **Matrix user account** — registered on the Tuwunel homeserver
2. **agentos-agent skill** — teaches the agent the AgentOS protocol and A2UI
3. **SOUL.md** — agent personality and behavioral instructions
4. **HEARTBEAT.md** — proactive check schedule (cron-based)
5. **Environment variables** — Matrix credentials (`OC_AGENTOS_*`)

### Example: Agent CRD (planned)

```yaml
apiVersion: openclaw.rocks/v1alpha1
kind: OpenClawAgent
metadata:
  name: k8s-operator-agent
  namespace: agentos
spec:
  agentName: "k8s-operator"
  image:
    repository: ghcr.io/openclawrocks/openclaw
    tag: latest
  env:
    - name: OC_AGENTOS_HOMESERVER
      value: "http://agentos-matrix.agentos.svc:8008"
    - name: OC_AGENTOS_USER_ID
      value: "@k8s-operator:matrix.openclaw.rocks"
    - name: OC_AGENTOS_ACCESS_TOKEN
      valueFrom:
        secretKeyRef:
          name: k8s-operator-matrix-creds
          key: access_token
    - name: OC_AGENTOS_AGENT_NAME
      value: "K8s Operator"
    - name: OC_AGENTOS_CAPABILITIES
      value: "kubernetes,monitoring,deployments,incidents"
  resources:
    requests:
      cpu: "200m"
      memory: "256Mi"
    limits:
      cpu: "1000m"
      memory: "1Gi"
```

## Hosted Version (openclaw.rocks)

The hosted version adds operator wiring that automatically provisions infrastructure for new users:

### Flow: New Space Creation

```
User clicks "Create Space"
        │
        ▼
Hosted API creates:
  1. TuwunelInstance CRD → tuwunel-operator provisions homeserver
  2. Matrix users for the space owner
  3. Default rooms (#general, #random)
  4. OpenClawAgent CRDs → openclaw-operator provisions agents
  5. Billing record
```

### Hosted vs Open-Source

| Feature | Open Source | Hosted |
|---------|-----------|--------|
| Login | Raw Matrix URL + credentials | Email/password, magic link |
| Space creation | Manual Matrix room/space setup | One-click wizard |
| Agent deployment | Manual OpenClaw setup | Auto-provisioned per space |
| Homeserver | Self-managed | Managed Tuwunel instance |
| Billing | N/A | Subscription per space |

The hosted version is controlled by `VITE_IS_HOSTED=true` at build time. See `apps/shell/src/lib/platform.ts` for the `isHosted()` flag and `apps/shell/src/ee/` for hosted-only components.

## Development → Production Path

1. **Local dev**: Synapse (Docker) + `pnpm dev` — see `dev/setup.sh`
2. **Staging**: Tuwunel on Kubernetes + OpenClaw agents with `agentos-agent` skill
3. **Production (self-hosted)**: Same as staging, user-managed
4. **Production (hosted)**: openclaw.rocks — tuwunel-operator + openclaw-operator + billing
