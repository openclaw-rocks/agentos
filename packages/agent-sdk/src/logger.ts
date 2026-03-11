export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  agentId?: string;
  roomId?: string;
  correlationId?: string;
  metadata?: Record<string, unknown>;
}

export interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
  child(context: Record<string, unknown>): Logger;
}

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export interface LoggerConfig {
  agentId?: string;
  level?: LogLevel;
  /** Override output for testing; defaults to process.stdout.write */
  output?: (line: string) => void;
}

class StructuredLogger implements Logger {
  private readonly minLevel: number;
  private readonly context: Record<string, unknown>;
  private readonly writeLine: (line: string) => void;

  constructor(config: LoggerConfig, parentContext?: Record<string, unknown>) {
    this.minLevel = LOG_LEVEL_PRIORITY[config.level ?? "info"];
    this.context = { ...parentContext };
    if (config.agentId) {
      this.context.agentId = config.agentId;
    }
    this.writeLine = config.output ?? ((line: string) => process.stdout.write(line + "\n"));
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    this.log("debug", message, meta);
  }

  info(message: string, meta?: Record<string, unknown>): void {
    this.log("info", message, meta);
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    this.log("warn", message, meta);
  }

  error(message: string, meta?: Record<string, unknown>): void {
    this.log("error", message, meta);
  }

  child(context: Record<string, unknown>): Logger {
    const childLogger = new StructuredLogger(
      {
        level: this.levelFromPriority(this.minLevel),
        output: this.writeLine,
      },
      { ...this.context, ...context },
    );
    return childLogger;
  }

  private log(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
    if (LOG_LEVEL_PRIORITY[level] < this.minLevel) {
      return;
    }

    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      ...this.context,
      ...(meta ? { metadata: meta } : {}),
    };

    this.writeLine(JSON.stringify(entry));
  }

  private levelFromPriority(priority: number): LogLevel {
    const levels: LogLevel[] = ["debug", "info", "warn", "error"];
    return levels[priority] ?? "info";
  }
}

/** Create a structured JSON logger */
export function createLogger(config: LoggerConfig): Logger {
  return new StructuredLogger(config);
}
