/**
 * US-3.4: OpenClaw Gateway Integration
 *
 * Provides the `OpenClawGateway` client for communicating with the OpenClaw
 * Gateway over WebSocket. The gateway exposes LLM reasoning, tool execution,
 * and skill installation from ClawHub.
 *
 * This is a contract / interface layer — the actual WebSocket transport is
 * pluggable and will be wired in when integrating with a real gateway instance.
 * All methods validate inputs and manage connection state so that calling code
 * receives clear errors when the gateway is unavailable and can fall back to
 * direct LLM API calls.
 */

// ── Public types ────────────────────────────────────────────────────────

export interface GatewayConfig {
  /** WebSocket URL for the OpenClaw Gateway */
  url: string;
  /** API key for authentication */
  apiKey?: string;
  /** Connection timeout in ms (default 10 000) */
  connectTimeoutMs?: number;
  /** Whether to auto-reconnect on disconnect (default true) */
  autoReconnect?: boolean;
  /** Max reconnect attempts (default 5) */
  maxReconnectAttempts?: number;
}

export interface ReasonOptions {
  /** System prompt */
  system?: string;
  /** User prompt */
  prompt: string;
  /** Available tools */
  tools?: GatewayTool[];
  /** Max tokens */
  maxTokens?: number;
  /** Temperature */
  temperature?: number;
  /** Model override */
  model?: string;
}

export interface GatewayTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema
}

export interface ReasonResult {
  text: string;
  toolCalls?: { name: string; arguments: Record<string, unknown> }[];
  model: string;
  usage: { inputTokens: number; outputTokens: number };
}

export interface ToolExecutionResult {
  success: boolean;
  output: unknown;
  error?: string;
  durationMs: number;
}

export type GatewayState = "disconnected" | "connecting" | "connected" | "error";

// ── Resolved config with defaults applied ────────────────────────────

interface ResolvedGatewayConfig {
  url: string;
  apiKey?: string;
  connectTimeoutMs: number;
  autoReconnect: boolean;
  maxReconnectAttempts: number;
}

function resolveConfig(config: GatewayConfig): ResolvedGatewayConfig {
  return {
    url: config.url,
    apiKey: config.apiKey,
    connectTimeoutMs: config.connectTimeoutMs ?? 10_000,
    autoReconnect: config.autoReconnect ?? true,
    maxReconnectAttempts: config.maxReconnectAttempts ?? 5,
  };
}

// ── Gateway client ──────────────────────────────────────────────────────

export class OpenClawGateway {
  private state: GatewayState = "disconnected";
  private reconnectAttempts = 0;
  private readonly resolvedConfig: ResolvedGatewayConfig;

  constructor(private readonly config: GatewayConfig) {
    this.resolvedConfig = resolveConfig(config);
  }

  // ── State helpers ─────────────────────────────────────────────────

  /** Get current connection state. */
  getState(): GatewayState {
    return this.state;
  }

  /** Check if gateway is connected. */
  isConnected(): boolean {
    return this.state === "connected";
  }

  /** Get the resolved (defaults-applied) config. */
  getConfig(): Readonly<ResolvedGatewayConfig> {
    return this.resolvedConfig;
  }

  // ── Connection lifecycle ──────────────────────────────────────────

  /**
   * Connect to the gateway.
   *
   * Transitions: disconnected | error -> connecting -> connected
   *
   * In this stub implementation the connection succeeds immediately.  A
   * real transport layer would open a WebSocket here.
   */
  async connect(): Promise<void> {
    if (this.state === "connected") return;

    this.state = "connecting";

    // Placeholder — the real implementation would open a WebSocket to
    // `this.resolvedConfig.url` with a connect-timeout of
    // `this.resolvedConfig.connectTimeoutMs`.
    this.state = "connected";
    this.reconnectAttempts = 0;
  }

  /**
   * Disconnect from the gateway.
   *
   * Transitions: * -> disconnected
   */
  async disconnect(): Promise<void> {
    this.state = "disconnected";
  }

  // ── LLM reasoning ────────────────────────────────────────────────

  /**
   * Send a reasoning request (LLM call) through the gateway.
   *
   * @throws if not connected
   * @throws if `prompt` is missing or empty
   */
  async reason(options: ReasonOptions): Promise<ReasonResult> {
    this.assertConnected("reason");

    if (!options.prompt || options.prompt.trim().length === 0) {
      throw new Error("reason() requires a non-empty prompt");
    }

    // Stub — a real implementation would serialise the request, send it
    // over the WebSocket, and await the gateway's streamed response.
    throw new Error(
      "Gateway transport not yet implemented. " + "Use a direct LLM API call as fallback.",
    );
  }

  // ── Tool execution ───────────────────────────────────────────────

  /**
   * Execute a tool via the gateway's runtime.
   *
   * @throws if not connected
   * @throws if `name` is missing or empty
   */
  async executeTool(name: string, _args: Record<string, unknown>): Promise<ToolExecutionResult> {
    this.assertConnected("executeTool");

    if (!name || name.trim().length === 0) {
      throw new Error("executeTool() requires a non-empty tool name");
    }

    // Stub — a real implementation would send the tool-call request and
    // wait for the result.
    throw new Error(
      "Gateway transport not yet implemented. " + "Use a direct tool execution as fallback.",
    );
  }

  // ── Skill installation ───────────────────────────────────────────

  /**
   * Install a skill from ClawHub.
   *
   * @throws if not connected
   * @throws if `skillId` is missing or empty
   */
  async installSkill(skillId: string): Promise<{ installed: boolean; version: string }> {
    this.assertConnected("installSkill");

    if (!skillId || skillId.trim().length === 0) {
      throw new Error("installSkill() requires a non-empty skill ID");
    }

    // Stub — a real implementation would request installation from the
    // gateway and return the resolved version.
    throw new Error(
      "Gateway transport not yet implemented. " + "Skill installation unavailable without gateway.",
    );
  }

  // ── Health / diagnostics ─────────────────────────────────────────

  /**
   * Check if gateway is reachable.
   *
   * Returns `false` when not connected (no-throw convenience method).
   */
  async ping(): Promise<boolean> {
    if (!this.isConnected()) return false;

    // Stub — a real implementation would send a lightweight ping frame
    // or an application-level heartbeat and check the round-trip.
    return true;
  }

  // ── Reconnect bookkeeping ────────────────────────────────────────

  /** Get the number of reconnect attempts since last successful connect. */
  getReconnectAttempts(): number {
    return this.reconnectAttempts;
  }

  /** Reset the reconnect counter (e.g. after a successful recovery). */
  resetReconnectAttempts(): void {
    this.reconnectAttempts = 0;
  }

  /**
   * Compute the exponential backoff delay for the current attempt.
   * Schedule: 1 s, 2 s, 4 s, 8 s, 16 s (doubles each attempt, capped
   * at attempt index 4 = 16 s).
   */
  getBackoffDelay(): number {
    const cap = 4; // max exponent
    const exponent = Math.min(this.reconnectAttempts, cap);
    return 2 ** exponent * 1_000; // ms
  }

  /**
   * Record a reconnect attempt. Returns the backoff delay in ms.
   *
   * Intended to be called by a reconnect loop that the transport layer
   * drives.
   */
  recordReconnectAttempt(): number {
    const delay = this.getBackoffDelay();
    this.reconnectAttempts++;
    return delay;
  }

  // ── Internal ─────────────────────────────────────────────────────

  private assertConnected(method: string): void {
    if (this.state !== "connected") {
      throw new Error(`${method}() requires a connected gateway (current state: ${this.state})`);
    }
  }
}
