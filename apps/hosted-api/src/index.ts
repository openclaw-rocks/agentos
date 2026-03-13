/**
 * AgentOS Hosted API — Express service for openclaw.rocks operator wiring.
 *
 * Handles user signup/login (via Matrix), space provisioning (Matrix rooms +
 * Kubernetes agent CRDs), and serves as the backend for the hosted AgentOS.
 */

import "dotenv/config";
import express from "express";
import { AgentCrdClient } from "./k8s.js";
import { MatrixClient } from "./matrix.js";
import { createAuthRouter } from "./routes/auth.js";
import { createHealthRouter } from "./routes/health.js";
import { createSpacesRouter } from "./routes/spaces.js";

const PORT = parseInt(process.env.PORT ?? "3001", 10);
const MATRIX_HOMESERVER_URL = process.env.MATRIX_HOMESERVER_URL ?? "http://localhost:8008";
const MATRIX_SERVER_NAME = process.env.MATRIX_SERVER_NAME ?? "localhost";
const MATRIX_REGISTRATION_TOKEN = process.env.MATRIX_REGISTRATION_TOKEN ?? "";
const K8S_NAMESPACE = process.env.K8S_NAMESPACE ?? "agentos";

function validateConfig(): void {
  if (!MATRIX_REGISTRATION_TOKEN) {
    console.error("[hosted-api] MATRIX_REGISTRATION_TOKEN must be set");
    process.exit(1);
  }
}

async function main(): Promise<void> {
  validateConfig();

  const app = express();
  app.use(express.json());

  // Initialize clients
  const matrix = new MatrixClient({
    homeserverUrl: MATRIX_HOMESERVER_URL,
    serverName: MATRIX_SERVER_NAME,
    registrationToken: MATRIX_REGISTRATION_TOKEN,
  });

  const k8s = new AgentCrdClient(K8S_NAMESPACE);

  // Mount routes
  app.use("/health", createHealthRouter());
  app.use("/api/auth", createAuthRouter(matrix));
  app.use("/api/spaces", createSpacesRouter(matrix, k8s));

  // 404 handler
  app.use((_req, res) => {
    res.status(404).json({ error: "NOT_FOUND", message: "Endpoint not found" });
  });

  app.listen(PORT, () => {
    console.log(`[hosted-api] listening on port ${PORT}`);
    console.log(`[hosted-api] Matrix homeserver: ${MATRIX_HOMESERVER_URL}`);
    console.log(`[hosted-api] Matrix server name: ${MATRIX_SERVER_NAME}`);
    console.log(`[hosted-api] K8s namespace: ${K8S_NAMESPACE}`);
  });
}

main().catch((err: unknown) => {
  console.error("[hosted-api] fatal error:", err);
  process.exit(1);
});
