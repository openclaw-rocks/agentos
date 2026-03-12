/**
 * Matrix account registration utilities.
 *
 * Supports the User-Interactive Authentication API (UIAA) for registration
 * flows that require m.login.dummy auth.
 */

export interface RegistrationResult {
  userId: string;
  accessToken: string;
  deviceId: string;
  homeserver: string;
}

/** Known Matrix error codes returned during registration. */
export type MatrixErrorCode =
  | "M_USER_IN_USE"
  | "M_INVALID_USERNAME"
  | "M_EXCLUSIVE"
  | "M_WEAK_PASSWORD"
  | "M_THREEPID_IN_USE"
  | "M_UNKNOWN";

export interface MatrixError {
  errcode: MatrixErrorCode;
  error: string;
}

export interface UIAAFlow {
  stages: string[];
}

export interface UIAAResponse {
  flows: UIAAFlow[];
  session?: string;
  params?: Record<string, unknown>;
}

/**
 * Checks whether a UIAA response indicates that m.login.dummy is sufficient.
 */
export function hasDummyFlow(uiaa: UIAAResponse): boolean {
  return uiaa.flows.some((flow) => flow.stages.length === 1 && flow.stages[0] === "m.login.dummy");
}

/**
 * Checks whether a UIAA response requires m.login.recaptcha.
 */
export function hasRecaptchaFlow(uiaa: UIAAResponse): boolean {
  return uiaa.flows.some((flow) => flow.stages.includes("m.login.recaptcha"));
}

/**
 * Translate Matrix error codes into human-readable messages.
 */
export function describeRegistrationError(errcode: string, serverMessage: string): string {
  switch (errcode) {
    case "M_USER_IN_USE":
      return "That username is already taken. Please choose a different one.";
    case "M_INVALID_USERNAME":
      return "The username is invalid. Use only lowercase letters, numbers, dots, hyphens, and underscores.";
    case "M_EXCLUSIVE":
      return "That username is reserved by the server.";
    case "M_WEAK_PASSWORD":
      return serverMessage || "The password is too weak. Please choose a stronger password.";
    case "M_THREEPID_IN_USE":
      return "That email address is already associated with an account.";
    default:
      return serverMessage || "Registration failed. Please try again.";
  }
}

/**
 * Register a new account on a Matrix homeserver.
 *
 * Handles UIAA flows:
 * - m.login.dummy: completes automatically
 * - m.login.recaptcha: throws with a descriptive message (not supported in-app)
 *
 * @throws Error with a descriptive message on failure
 */
export async function registerAccount(
  homeserver: string,
  username: string,
  password: string,
  email?: string,
): Promise<RegistrationResult> {
  const base = homeserver.replace(/\/+$/, "");
  const registerUrl = `${base}/_matrix/client/v3/register`;

  // Build the registration body
  const body: Record<string, unknown> = {
    username,
    password,
    initial_device_display_name: "AgentOS",
    auth: { type: "m.login.dummy" },
  };

  if (email) {
    body.bind_email = false;
  }

  // First attempt: try with m.login.dummy auth
  const res = await fetch(registerUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  // Success — the server accepted m.login.dummy directly
  if (res.ok) {
    return parseRegistrationResponse(await res.json(), base);
  }

  // 401 — UIAA challenge
  if (res.status === 401) {
    const uiaa: UIAAResponse = await res.json();

    // If dummy flow is available, retry with the session
    if (hasDummyFlow(uiaa)) {
      const retryBody = {
        ...body,
        auth: {
          type: "m.login.dummy",
          session: uiaa.session,
        },
      };

      const retryRes = await fetch(registerUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(retryBody),
      });

      if (retryRes.ok) {
        return parseRegistrationResponse(await retryRes.json(), base);
      }

      // Retry also failed with an error
      const retryError = await retryRes.json();
      throw new Error(
        describeRegistrationError(
          (retryError as MatrixError).errcode ?? "M_UNKNOWN",
          (retryError as MatrixError).error ?? "Registration failed",
        ),
      );
    }

    // If recaptcha is required
    if (hasRecaptchaFlow(uiaa)) {
      throw new Error(
        "This server requires CAPTCHA verification for registration, which is not yet supported in AgentOS. Please register through the server's web interface.",
      );
    }

    // Unknown UIAA flow
    const stageNames = uiaa.flows.map((f) => f.stages.join(" + ")).join(", ");
    throw new Error(`This server requires authentication steps not yet supported: ${stageNames}`);
  }

  // Other HTTP errors (400, 403, etc.)
  const errorBody = await res
    .json()
    .catch(() => ({ errcode: "M_UNKNOWN", error: "Registration failed" }));
  throw new Error(
    describeRegistrationError(
      (errorBody as MatrixError).errcode ?? "M_UNKNOWN",
      (errorBody as MatrixError).error ?? "Registration failed",
    ),
  );
}

function parseRegistrationResponse(data: unknown, homeserver: string): RegistrationResult {
  const record = data as Record<string, unknown>;
  const userId = record.user_id as string;
  const accessToken = record.access_token as string;
  const deviceId = record.device_id as string;

  if (!userId || !accessToken) {
    throw new Error("Server returned an incomplete registration response.");
  }

  return {
    userId,
    accessToken,
    deviceId: deviceId ?? "",
    homeserver,
  };
}
