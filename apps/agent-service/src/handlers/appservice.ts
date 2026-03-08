import type { Express, Request, Response } from "express";
import type { RoomWatcher } from "../services/room-watcher.js";
import type { AgentRegistry } from "../services/agent-registry.js";

/**
 * Handles incoming HTTP requests from the Matrix homeserver.
 * Implements the Application Service API transaction endpoint.
 */
export class AppServiceHandler {
  constructor(
    private hsToken: string,
    private watcher: RoomWatcher,
    private registry: AgentRegistry,
  ) {}

  register(app: Express): void {
    // Transaction endpoint — receives batches of events from homeserver
    app.put("/transactions/:txnId", (req: Request, res: Response) => {
      if (!this.authenticate(req)) {
        res.status(401).json({ errcode: "M_UNAUTHORIZED" });
        return;
      }

      const events = req.body?.events ?? [];
      this.processEvents(events).catch((err) =>
        console.error("[appservice] Error processing events:", err),
      );

      // Always return 200 quickly to not block the homeserver
      res.json({});
    });

    // Room alias query — homeserver asks if we handle an alias
    app.get("/rooms/:alias", (req: Request, res: Response) => {
      if (!this.authenticate(req)) {
        res.status(401).json({ errcode: "M_UNAUTHORIZED" });
        return;
      }
      // We don't claim room aliases for now
      res.status(404).json({ errcode: "M_NOT_FOUND" });
    });

    // User query — homeserver asks if we handle a user ID
    app.get("/users/:userId", (req: Request, res: Response) => {
      if (!this.authenticate(req)) {
        res.status(401).json({ errcode: "M_UNAUTHORIZED" });
        return;
      }

      const userId = req.params.userId as string;
      const agent = this.registry.getAgentByUserId(userId);
      if (agent) {
        res.json({});
      } else {
        res.status(404).json({ errcode: "M_NOT_FOUND" });
      }
    });
  }

  private authenticate(req: Request): boolean {
    const queryToken = req.query.access_token;
    const token = (typeof queryToken === "string" ? queryToken : undefined) ?? req.headers.authorization?.replace("Bearer ", "");
    return token === this.hsToken;
  }

  private async processEvents(events: MatrixEvent[]): Promise<void> {
    for (const event of events) {
      try {
        await this.watcher.handleEvent(event);
      } catch (err) {
        console.error(`[appservice] Error handling event ${event.event_id}:`, err);
      }
    }
  }
}

/** Minimal Matrix event shape from the Application Service API */
interface MatrixEvent {
  event_id: string;
  type: string;
  room_id: string;
  sender: string;
  content: Record<string, unknown>;
  state_key?: string;
  origin_server_ts: number;
}
