import "dotenv/config";
import { BaseAgent, UIBuilder } from "@openclaw/agent-sdk";

const HOMESERVER_URL = process.env.HOMESERVER_URL ?? "http://localhost:8008";
const BOT_USER_ID = process.env.BOT_USER_ID ?? "@agent-echo:localhost";
const BOT_ACCESS_TOKEN = process.env.BOT_ACCESS_TOKEN ?? "";

if (!BOT_ACCESS_TOKEN) {
  console.error("BOT_ACCESS_TOKEN must be set");
  process.exit(1);
}

const agent = new BaseAgent(
  {
    homeserverUrl: HOMESERVER_URL,
    userId: BOT_USER_ID,
    accessToken: BOT_ACCESS_TOKEN,
    info: {
      id: "echo",
      displayName: "Echo Agent",
      description: "A demo agent that echoes messages and showcases A2UI components",
      capabilities: ["echo", "demo-ui", "help"],
    },
  },
  {
    async onMessage(roomId, sender, content) {
      const ctx = agent.context(roomId);
      const command = content.trim().toLowerCase();

      // Help command
      if (command === "!help" || command === "!echo help") {
        const ui = new UIBuilder()
          .card("Echo Agent — Commands", (card) =>
            card.text("Available commands:").table(
              [
                ["!echo <text>", "Echo back a message"],
                ["!demo card", "Show a demo approval card"],
                ["!demo progress", "Show a demo progress indicator"],
                ["!demo form", "Show a demo form"],
                ["!demo diff", "Show a demo code diff"],
                ["!demo log", "Show a demo log output"],
                ["!demo status", "Show status indicators"],
                ["!help", "Show this help message"],
              ],
              ["Command", "Description"],
            ),
          )
          .build();

        await ctx.sendUI(ui);
        return;
      }

      // Echo command
      if (command.startsWith("!echo ")) {
        const text = content.slice(6);
        await ctx.sendText(`🔊 ${text}`);
        return;
      }

      // Demo: approval card
      if (command === "!demo card") {
        const ui = new UIBuilder()
          .card("Deploy Request — v2.3.1", (card) =>
            card
              .text("Production deployment ready for review")
              .divider()
              .status("Tests", "success", "142/142 passed")
              .status("Coverage", "warning", "78% (threshold: 80%)")
              .status("Security Scan", "success", "No vulnerabilities found")
              .divider()
              .table(
                [
                  ["Service", "api-gateway"],
                  ["Image", "ghcr.io/openclaw/api:v2.3.1"],
                  ["Replicas", "3"],
                  ["Region", "eu-west-1"],
                ],
                ["Key", "Value"],
              )
              .divider()
              .buttonGroup([
                { label: "Approve & Deploy", action: "deploy_approve", style: "primary" },
                { label: "Request Changes", action: "deploy_changes", style: "secondary" },
                { label: "Reject", action: "deploy_reject", style: "danger" },
              ]),
          )
          .build();

        await ctx.sendUI(ui);
        return;
      }

      // Demo: progress
      if (command === "!demo progress") {
        const ui = new UIBuilder()
          .card("Deployment Progress", (card) =>
            card
              .progress(100, "Building image", "Complete")
              .progress(100, "Running tests", "Complete")
              .progress(65, "Rolling update", "3/5 pods ready")
              .progress(0, "Health checks", "Waiting"),
          )
          .build();

        await ctx.sendUI(ui);
        return;
      }

      // Demo: form
      if (command === "!demo form") {
        const ui = new UIBuilder()
          .card("Create New Agent", (card) =>
            card
              .text("Configure and deploy a new agent to this space.")
              .divider()
              .form(
                "create_agent",
                (form) =>
                  form
                    .input("name", "Agent Name", { placeholder: "my-agent", required: true })
                    .input("description", "Description", {
                      inputType: "textarea",
                      placeholder: "What does this agent do?",
                    })
                    .input("model", "LLM Model", {
                      inputType: "select",
                      options: [
                        { label: "Claude Opus 4.6", value: "claude-opus-4-6" },
                        { label: "Claude Sonnet 4.6", value: "claude-sonnet-4-6" },
                        { label: "Claude Haiku 4.5", value: "claude-haiku-4-5" },
                      ],
                    })
                    .input("auto_join", "Auto-join Pattern", {
                      placeholder: "incident-*",
                    }),
                "Deploy Agent",
              ),
          )
          .build();

        await ctx.sendUI(ui);
        return;
      }

      // Demo: diff
      if (command === "!demo diff") {
        const ui = new UIBuilder()
          .card("Code Review — PR #142", (card) =>
            card
              .diff("src/services/auth.ts", 12, 3, [
                {
                  header: "@@ -45,8 +45,17 @@ export class AuthService {",
                  lines: [
                    "   async validateToken(token: string): Promise<User | null> {",
                    "-    const decoded = jwt.verify(token, this.secret);",
                    "-    return this.userRepo.findById(decoded.sub);",
                    "+    try {",
                    "+      const decoded = jwt.verify(token, this.secret);",
                    "+      if (decoded.exp && decoded.exp < Date.now() / 1000) {",
                    "+        return null;",
                    "+      }",
                    "+      return this.userRepo.findById(decoded.sub);",
                    "+    } catch {",
                    "+      return null;",
                    "+    }",
                    "   }",
                  ],
                },
              ])
              .divider()
              .buttonGroup([
                { label: "Approve", action: "pr_approve", style: "primary" },
                { label: "Comment", action: "pr_comment", style: "secondary" },
              ]),
          )
          .build();

        await ctx.sendUI(ui);
        return;
      }

      // Demo: log output
      if (command === "!demo log") {
        const ui = new UIBuilder()
          .card("Agent Execution Log", (card) =>
            card.log(
              [
                { timestamp: "12:00:01", level: "info", message: "Agent started" },
                { timestamp: "12:00:01", level: "info", message: "Connected to Matrix homeserver" },
                {
                  timestamp: "12:00:02",
                  level: "info",
                  message: "Joined room #incident-db-outage",
                },
                {
                  timestamp: "12:00:02",
                  level: "info",
                  message: "Loading context from room state...",
                },
                {
                  timestamp: "12:00:03",
                  level: "info",
                  message: "Fetching Prometheus metrics for db-primary",
                },
                {
                  timestamp: "12:00:05",
                  level: "warn",
                  message: "Connection pool saturation at 94%",
                },
                {
                  timestamp: "12:00:06",
                  level: "error",
                  message: "Replica lag exceeds 30s threshold",
                },
                {
                  timestamp: "12:00:06",
                  level: "info",
                  message: "Triggering runbook: db-connection-pool-recovery",
                },
              ],
              300,
            ),
          )
          .build();

        await ctx.sendUI(ui);
        return;
      }

      // Demo: status indicators
      if (command === "!demo status") {
        const ui = new UIBuilder()
          .card("System Status", (card) =>
            card
              .status("API Gateway", "success", "Healthy — 12ms p99 latency")
              .status("Database Primary", "error", "Connection pool saturated")
              .status("Database Replica", "warning", "Replication lag: 28s")
              .status("Cache Layer", "success", "Hit rate: 94.2%")
              .status("Queue Workers", "info", "Scaling up: 3 → 5 instances")
              .status("Deployment", "pending", "Rolling update in progress"),
          )
          .build();

        await ctx.sendUI(ui);
        return;
      }
    },

    async onAction(action) {
      const ctx = agent.context(action.room_id);
      await ctx.sendNotice(
        `Action received: ${action.action} (data: ${JSON.stringify(action.data ?? {})})`,
      );
    },

    async onInvite(roomId, inviter) {
      const ctx = agent.context(roomId);
      const ui = new UIBuilder()
        .card("Echo Agent Online", (card) =>
          card
            .text(`Thanks for inviting me, ${inviter}!`)
            .text(
              "I'm a demo agent that showcases A2UI components. Type **!help** to see what I can do.",
            ),
        )
        .build();

      // Small delay to ensure we've fully joined
      setTimeout(() => ctx.sendUI(ui).catch(console.error), 1000);
    },

    async onStart() {
      console.log("[echo-agent] Ready! Listening for commands...");
    },
  },
);

// Graceful shutdown
process.on("SIGINT", async () => {
  await agent.stop();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await agent.stop();
  process.exit(0);
});

agent.start().catch((err) => {
  console.error("[echo-agent] Failed to start:", err);
  process.exit(1);
});
