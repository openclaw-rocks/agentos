/**
 * Health check endpoint.
 */

import { Router } from "express";

export function createHealthRouter(): Router {
  const router = Router();

  router.get("/", (_req, res) => {
    res.json({
      status: "ok",
      service: "hosted-api",
      timestamp: new Date().toISOString(),
    });
  });

  return router;
}
