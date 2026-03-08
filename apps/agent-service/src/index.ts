import "dotenv/config";
import express from "express";
import { AppServiceHandler } from "./handlers/appservice.js";
import { AgentRegistry } from "./services/agent-registry.js";
import { RoomWatcher } from "./services/room-watcher.js";
import { AgentDeployer } from "./services/agent-deployer.js";

const PORT = parseInt(process.env.PORT ?? "9000", 10);
const HS_TOKEN = process.env.HS_TOKEN ?? "";
const AS_TOKEN = process.env.AS_TOKEN ?? "";
const HOMESERVER_URL = process.env.HOMESERVER_URL ?? "http://localhost:8008";
const HOMESERVER_DOMAIN = process.env.HOMESERVER_DOMAIN ?? "localhost";
const AGENT_PREFIX = process.env.AGENT_PREFIX ?? "agent-";

if (!HS_TOKEN || !AS_TOKEN) {
  console.error("HS_TOKEN and AS_TOKEN must be set");
  process.exit(1);
}

async function main() {
  const app = express();
  app.use(express.json());

  // Core services
  const registry = new AgentRegistry();
  const deployer = new AgentDeployer(HOMESERVER_URL, AS_TOKEN, HOMESERVER_DOMAIN, AGENT_PREFIX);
  const watcher = new RoomWatcher(registry, deployer);

  // Application Service HTTP handler (receives events from homeserver)
  const asHandler = new AppServiceHandler(HS_TOKEN, watcher, registry);
  asHandler.register(app);

  // Health check
  app.get("/health", (_req, res) => {
    res.json({
      status: "ok",
      agents: registry.listAgents().length,
      timestamp: Date.now(),
    });
  });

  app.listen(PORT, () => {
    console.log(`[agent-service] Listening on port ${PORT}`);
    console.log(`[agent-service] Homeserver: ${HOMESERVER_URL}`);
    console.log(`[agent-service] Registered agents: ${registry.listAgents().length}`);
  });
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
