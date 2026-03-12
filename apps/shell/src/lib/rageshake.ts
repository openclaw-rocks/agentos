/**
 * Rageshake / bug report helpers.
 *
 * Provides console log interception, payload building, and submission
 * for rageshake-style bug reports.
 */

/** A single captured console log entry. */
export interface LogEntry {
  level: "log" | "warn" | "error" | "info" | "debug";
  timestamp: number;
  args: string[];
}

/** Ring buffer that stores recent console log entries. */
const LOG_BUFFER: LogEntry[] = [];
const MAX_LOG_BUFFER = 2000;
let intercepted = false;

/**
 * Install console interceptors to capture log output into a ring buffer.
 * Safe to call multiple times — only the first call installs hooks.
 */
export function interceptConsole(): void {
  if (intercepted) return;
  intercepted = true;

  const levels = ["log", "warn", "error", "info", "debug"] as const;

  for (const level of levels) {
    const original = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
      const entry: LogEntry = {
        level,
        timestamp: Date.now(),
        args: args.map((a) => {
          try {
            return typeof a === "string" ? a : JSON.stringify(a);
          } catch {
            return String(a);
          }
        }),
      };

      if (LOG_BUFFER.length >= MAX_LOG_BUFFER) {
        LOG_BUFFER.shift();
      }
      LOG_BUFFER.push(entry);

      original(...args);
    };
  }
}

/**
 * Return the last N console log entries from the ring buffer.
 */
export function collectLogs(maxLines: number = 500): LogEntry[] {
  const start = Math.max(0, LOG_BUFFER.length - maxLines);
  return LOG_BUFFER.slice(start);
}

/** Structured rageshake payload ready for submission. */
export interface RageshakePayload {
  description: string;
  logs: string;
  userAgent: string;
  appVersion: string;
}

/**
 * Build a rageshake payload object from the given parameters.
 */
export function buildRageshakePayload(
  description: string,
  logs: LogEntry[],
  userAgent: string,
  appVersion: string,
): RageshakePayload {
  const logsText = logs
    .map(
      (entry) =>
        `[${new Date(entry.timestamp).toISOString()}] [${entry.level.toUpperCase()}] ${entry.args.join(" ")}`,
    )
    .join("\n");

  return {
    description,
    logs: logsText,
    userAgent,
    appVersion,
  };
}

/**
 * Submit a rageshake payload to the given server URL.
 */
export async function submitRageshake(serverUrl: string, payload: RageshakePayload): Promise<void> {
  const formData = new FormData();
  formData.append("text", payload.description);
  formData.append("user_agent", payload.userAgent);
  formData.append("app", `AgentOS ${payload.appVersion}`);
  formData.append("logs", new Blob([payload.logs], { type: "text/plain" }), "logs.txt");

  const response = await fetch(`${serverUrl}/api/submit`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`Rageshake submission failed: ${response.status} ${response.statusText}`);
  }
}
