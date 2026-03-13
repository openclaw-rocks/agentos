/**
 * Matrix Client-Server API client for the hosted backend.
 * Handles user registration, authentication, and room/space creation
 * via direct HTTP calls to the Tuwunel homeserver.
 */

interface MatrixErrorResponse {
  errcode: string;
  error: string;
}

interface RegisterResponse {
  user_id: string;
  access_token: string;
  device_id: string;
}

interface LoginResponse {
  user_id: string;
  access_token: string;
  device_id: string;
}

interface CreateRoomResponse {
  room_id: string;
}

interface MatrixClientConfig {
  homeserverUrl: string;
  serverName: string;
  registrationToken: string;
}

function isMatrixError(body: unknown): body is MatrixErrorResponse {
  return (
    typeof body === "object" &&
    body !== null &&
    "errcode" in body &&
    typeof (body as Record<string, unknown>).errcode === "string"
  );
}

function isUiaResponse(body: unknown): boolean {
  return typeof body === "object" && body !== null && "flows" in body && "session" in body;
}

async function matrixFetch<T>(
  baseUrl: string,
  path: string,
  options: {
    method: string;
    token?: string;
    body?: Record<string, unknown>;
  },
): Promise<T> {
  const url = `${baseUrl}${path}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (options.token) {
    headers["Authorization"] = `Bearer ${options.token}`;
  }

  const response = await fetch(url, {
    method: options.method,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const responseBody: unknown = await response.json();

  if (!response.ok) {
    // Handle UIA (User-Interactive Authentication) 401 responses
    if (response.status === 401 && isUiaResponse(responseBody)) {
      throw new MatrixApiError(
        "M_USER_INTERACTIVE_AUTH",
        "User-Interactive Authentication required",
        401,
        (responseBody as { session?: string }).session,
      );
    }
    if (isMatrixError(responseBody)) {
      throw new MatrixApiError(responseBody.errcode, responseBody.error, response.status);
    }
    throw new MatrixApiError("M_UNKNOWN", `HTTP ${response.status}`, response.status);
  }

  return responseBody as T;
}

export class MatrixApiError extends Error {
  public readonly session?: string;

  constructor(
    public readonly errcode: string,
    public readonly matrixMessage: string,
    public readonly statusCode: number,
    session?: string,
  ) {
    super(`${errcode}: ${matrixMessage}`);
    this.name = "MatrixApiError";
    this.session = session;
  }
}

export class MatrixClient {
  private readonly config: MatrixClientConfig;

  constructor(config: MatrixClientConfig) {
    this.config = config;
  }

  /**
   * Register a new user on the homeserver using the registration token flow.
   * Step 1: POST empty body to get a session ID.
   * Step 2: POST with m.login.registration_token auth and the session.
   */
  async registerUser(
    username: string,
    password: string,
    displayName?: string,
  ): Promise<RegisterResponse> {
    // Step 1: Get session from the UIA flow
    let session: string;
    try {
      await matrixFetch<unknown>(this.config.homeserverUrl, "/_matrix/client/v3/register", {
        method: "POST",
        body: { username },
      });
      // If this succeeds without UIA, unlikely but handle it
      throw new MatrixApiError("M_UNKNOWN", "Unexpected registration flow", 500);
    } catch (err) {
      if (err instanceof MatrixApiError && err.errcode === "M_USER_INTERACTIVE_AUTH") {
        session = err.session ?? "";
      } else if (err instanceof MatrixApiError && err.errcode === "M_FORBIDDEN") {
        throw new MatrixApiError("M_FORBIDDEN", "Registration is disabled on this server", 403);
      } else {
        throw err;
      }
    }

    // Step 2: Complete registration with the token
    const result = await matrixFetch<RegisterResponse>(
      this.config.homeserverUrl,
      "/_matrix/client/v3/register",
      {
        method: "POST",
        body: {
          auth: {
            type: "m.login.registration_token",
            token: this.config.registrationToken,
            session,
          },
          username,
          password,
          initial_device_display_name: displayName ?? "AgentOS Web",
          inhibit_login: false,
        },
      },
    );

    // Set display name if provided
    if (displayName) {
      await this.setDisplayName(result.user_id, result.access_token, displayName);
    }

    return result;
  }

  /**
   * Log in an existing user with username/password.
   */
  async loginUser(username: string, password: string): Promise<LoginResponse> {
    return matrixFetch<LoginResponse>(this.config.homeserverUrl, "/_matrix/client/v3/login", {
      method: "POST",
      body: {
        type: "m.login.password",
        identifier: {
          type: "m.id.user",
          user: username,
        },
        password,
        initial_device_display_name: "AgentOS Web",
      },
    });
  }

  /**
   * Invalidate a user's access token (logout).
   */
  async logoutUser(accessToken: string): Promise<void> {
    await matrixFetch<Record<string, never>>(
      this.config.homeserverUrl,
      "/_matrix/client/v3/logout",
      {
        method: "POST",
        token: accessToken,
        body: {},
      },
    );
  }

  /**
   * Set a user's display name.
   */
  private async setDisplayName(
    userId: string,
    accessToken: string,
    displayName: string,
  ): Promise<void> {
    await matrixFetch<Record<string, never>>(
      this.config.homeserverUrl,
      `/_matrix/client/v3/profile/${encodeURIComponent(userId)}/displayname`,
      {
        method: "PUT",
        token: accessToken,
        body: { displayname: displayName },
      },
    );
  }

  /**
   * Create a Matrix space (a room with m.space type).
   */
  async createSpace(
    accessToken: string,
    name: string,
    topic?: string,
  ): Promise<CreateRoomResponse> {
    return matrixFetch<CreateRoomResponse>(
      this.config.homeserverUrl,
      "/_matrix/client/v3/createRoom",
      {
        method: "POST",
        token: accessToken,
        body: {
          name,
          topic: topic ?? "",
          visibility: "private",
          creation_content: {
            type: "m.space",
          },
          initial_state: [
            {
              type: "m.room.history_visibility",
              state_key: "",
              content: { history_visibility: "shared" },
            },
          ],
          power_level_content_override: {
            events_default: 0,
            invite: 0,
          },
        },
      },
    );
  }

  /**
   * Create a room as a child of a space.
   */
  async createChannel(
    accessToken: string,
    spaceRoomId: string,
    name: string,
  ): Promise<CreateRoomResponse> {
    const room = await matrixFetch<CreateRoomResponse>(
      this.config.homeserverUrl,
      "/_matrix/client/v3/createRoom",
      {
        method: "POST",
        token: accessToken,
        body: {
          name,
          visibility: "private",
          initial_state: [
            {
              type: "m.room.history_visibility",
              state_key: "",
              content: { history_visibility: "shared" },
            },
          ],
        },
      },
    );

    // Add the room as a child of the space
    await matrixFetch<Record<string, never>>(
      this.config.homeserverUrl,
      `/_matrix/client/v3/rooms/${encodeURIComponent(spaceRoomId)}/state/m.space.child/${encodeURIComponent(room.room_id)}`,
      {
        method: "PUT",
        token: accessToken,
        body: {
          via: [this.config.serverName],
          suggested: true,
        },
      },
    );

    return room;
  }

  /**
   * Send a state event to a room.
   */
  async sendStateEvent(
    accessToken: string,
    roomId: string,
    eventType: string,
    stateKey: string,
    content: Record<string, unknown>,
  ): Promise<void> {
    await matrixFetch<{ event_id: string }>(
      this.config.homeserverUrl,
      `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/state/${encodeURIComponent(eventType)}/${encodeURIComponent(stateKey)}`,
      {
        method: "PUT",
        token: accessToken,
        body: content,
      },
    );
  }

  /**
   * Invite a user to a room.
   */
  async inviteUser(accessToken: string, roomId: string, userId: string): Promise<void> {
    await matrixFetch<Record<string, never>>(
      this.config.homeserverUrl,
      `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/invite`,
      {
        method: "POST",
        token: accessToken,
        body: { user_id: userId },
      },
    );
  }
}
