/**
 * Authentication routes: signup, login, logout.
 * Proxies to the Matrix homeserver for actual account management.
 */

import { Router } from "express";
import { MatrixApiError, MatrixClient } from "../matrix.js";

interface SignupRequestBody {
  email: string;
  password: string;
}

interface LoginRequestBody {
  email: string;
  password: string;
}

interface LogoutRequestBody {
  access_token: string;
}

/** Derive a Matrix-safe username from an email address. */
function emailToUsername(email: string): string {
  return email
    .split("@")[0]
    .toLowerCase()
    .replace(/[^a-z0-9._=-]/g, "_")
    .slice(0, 64);
}

function isSignupBody(body: unknown): body is SignupRequestBody {
  if (typeof body !== "object" || body === null) return false;
  const obj = body as Record<string, unknown>;
  return typeof obj.email === "string" && typeof obj.password === "string";
}

function isLoginBody(body: unknown): body is LoginRequestBody {
  if (typeof body !== "object" || body === null) return false;
  const obj = body as Record<string, unknown>;
  return typeof obj.email === "string" && typeof obj.password === "string";
}

function isLogoutBody(body: unknown): body is LogoutRequestBody {
  if (typeof body !== "object" || body === null) return false;
  const obj = body as Record<string, unknown>;
  return typeof obj.access_token === "string";
}

function handleMatrixError(
  err: unknown,
  res: { status: (code: number) => { json: (body: unknown) => void } },
): void {
  if (err instanceof MatrixApiError) {
    const statusCode =
      err.errcode === "M_USER_IN_USE"
        ? 409
        : err.errcode === "M_FORBIDDEN"
          ? 403
          : err.errcode === "M_INVALID_USERNAME"
            ? 400
            : err.statusCode >= 400
              ? err.statusCode
              : 502;

    res.status(statusCode).json({
      error: err.errcode,
      message: err.matrixMessage,
    });
    return;
  }

  console.error("[auth] unexpected error:", err);
  res.status(500).json({ error: "INTERNAL_ERROR", message: "An unexpected error occurred" });
}

export function createAuthRouter(matrix: MatrixClient): Router {
  const router = Router();

  /**
   * POST /api/auth/signup
   * Creates a new Matrix account and returns the session.
   */
  router.post("/signup", async (req, res) => {
    if (!isSignupBody(req.body)) {
      res.status(400).json({
        error: "INVALID_REQUEST",
        message: "email and password are required",
      });
      return;
    }

    const { email, password } = req.body;
    const username = emailToUsername(email);

    if (!username) {
      res.status(400).json({
        error: "INVALID_EMAIL",
        message: "Could not derive a username from that email address",
      });
      return;
    }

    if (password.length < 8) {
      res.status(400).json({
        error: "WEAK_PASSWORD",
        message: "Password must be at least 8 characters",
      });
      return;
    }

    try {
      const result = await matrix.registerUser(username, password, email);

      res.status(201).json({
        user_id: result.user_id,
        access_token: result.access_token,
        device_id: result.device_id,
      });
    } catch (err: unknown) {
      handleMatrixError(err, res);
    }
  });

  /**
   * POST /api/auth/login
   * Authenticates a user and returns a session.
   */
  router.post("/login", async (req, res) => {
    if (!isLoginBody(req.body)) {
      res.status(400).json({
        error: "INVALID_REQUEST",
        message: "email and password are required",
      });
      return;
    }

    const { email, password } = req.body;
    const username = emailToUsername(email);

    try {
      const result = await matrix.loginUser(username, password);

      res.status(200).json({
        user_id: result.user_id,
        access_token: result.access_token,
        device_id: result.device_id,
      });
    } catch (err: unknown) {
      handleMatrixError(err, res);
    }
  });

  /**
   * POST /api/auth/logout
   * Invalidates the user's access token.
   */
  router.post("/logout", async (req, res) => {
    if (!isLogoutBody(req.body)) {
      res.status(400).json({
        error: "INVALID_REQUEST",
        message: "access_token is required",
      });
      return;
    }

    const { access_token } = req.body;

    try {
      await matrix.logoutUser(access_token);
      res.status(200).json({ success: true });
    } catch (err: unknown) {
      handleMatrixError(err, res);
    }
  });

  return router;
}
