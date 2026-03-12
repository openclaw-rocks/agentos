/**
 * SSO / OIDC login helper utilities for Matrix homeservers.
 */

export interface SSOProvider {
  id: string;
  name: string;
  icon?: string;
  brand?: string;
}

export interface LoginFlow {
  type: string;
  identity_providers?: Array<{
    id: string;
    name: string;
    icon?: string;
    brand?: string;
  }>;
}

export interface LoginFlowsResponse {
  flows: LoginFlow[];
}

export interface OIDCDiscovery {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  [key: string]: unknown;
}

export interface WellKnownResponse {
  "m.homeserver"?: { base_url?: string };
  "org.matrix.msc2965.authentication"?: {
    issuer?: string;
    account?: string;
  };
}

/**
 * Fetch the login flows from a Matrix homeserver and extract SSO providers.
 * Returns an empty array when no SSO/CAS flows are available.
 */
export async function discoverSSOProviders(homeserverUrl: string): Promise<SSOProvider[]> {
  const url = `${homeserverUrl.replace(/\/+$/, "")}/_matrix/client/v3/login`;
  const res = await fetch(url);

  if (!res.ok) {
    return [];
  }

  const data: LoginFlowsResponse = await res.json();
  return extractSSOProviders(data);
}

/**
 * Extract SSO providers from a login flows response.
 */
export function extractSSOProviders(data: LoginFlowsResponse): SSOProvider[] {
  const providers: SSOProvider[] = [];

  for (const flow of data.flows) {
    if (flow.type !== "m.login.sso" && flow.type !== "m.login.cas") {
      continue;
    }

    if (flow.identity_providers && flow.identity_providers.length > 0) {
      for (const idp of flow.identity_providers) {
        providers.push({
          id: idp.id,
          name: idp.name,
          icon: idp.icon,
          brand: idp.brand,
        });
      }
    } else {
      // Generic SSO/CAS flow without specific identity providers
      providers.push({
        id: flow.type === "m.login.cas" ? "__cas__" : "__sso__",
        name: flow.type === "m.login.cas" ? "CAS" : "SSO",
      });
    }
  }

  return providers;
}

/**
 * Build the URL to redirect the user to for SSO authentication.
 */
export function buildSSORedirectUrl(
  homeserverUrl: string,
  providerId: string,
  redirectUrl: string,
): string {
  const base = homeserverUrl.replace(/\/+$/, "");
  const encodedRedirect = encodeURIComponent(redirectUrl);

  // Generic SSO without a specific provider id
  if (providerId === "__sso__" || providerId === "__cas__") {
    return `${base}/_matrix/client/v3/login/sso/redirect?redirectUrl=${encodedRedirect}`;
  }

  return `${base}/_matrix/client/v3/login/sso/redirect/${encodeURIComponent(providerId)}?redirectUrl=${encodedRedirect}`;
}

/**
 * Complete an SSO login by exchanging a login token for credentials.
 * Returns the user_id and access_token from the homeserver.
 */
export async function completeSSOLogin(
  homeserverUrl: string,
  loginToken: string,
): Promise<{ userId: string; accessToken: string }> {
  const base = homeserverUrl.replace(/\/+$/, "");
  const res = await fetch(`${base}/_matrix/client/v3/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "m.login.token",
      token: loginToken,
    }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `SSO login failed (${res.status})`);
  }

  const data: { user_id: string; access_token: string } = await res.json();
  return { userId: data.user_id, accessToken: data.access_token };
}

/**
 * Discover OIDC configuration from a homeserver's .well-known endpoint.
 * Returns null if OIDC is not configured.
 */
export async function discoverOIDC(
  homeserverUrl: string,
): Promise<{ issuer: string; account?: string } | null> {
  const base = homeserverUrl.replace(/\/+$/, "");

  try {
    const res = await fetch(`${base}/.well-known/matrix/client`, {
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) return null;

    const data: WellKnownResponse = await res.json();
    const auth = data["org.matrix.msc2965.authentication"];

    if (auth?.issuer) {
      return { issuer: auth.issuer, account: auth.account };
    }
  } catch {
    // Discovery failed
  }

  return null;
}

/**
 * Check whether the homeserver's login flows include password login.
 */
export function hasPasswordLogin(data: LoginFlowsResponse): boolean {
  return data.flows.some((f) => f.type === "m.login.password");
}

/**
 * Request a password reset email token.
 */
export async function requestPasswordResetEmail(
  homeserverUrl: string,
  email: string,
  clientSecret: string,
  sendAttempt: number,
): Promise<{ sid: string }> {
  const base = homeserverUrl.replace(/\/+$/, "");
  const res = await fetch(`${base}/_matrix/client/v3/account/password/email/requestToken`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      client_secret: clientSecret,
      send_attempt: sendAttempt,
    }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      (body as { error?: string }).error ?? `Failed to send reset email (${res.status})`,
    );
  }

  const data: { sid: string } = await res.json();
  return { sid: data.sid };
}

/**
 * Set a new password using an email identity validation.
 */
export async function resetPassword(
  homeserverUrl: string,
  newPassword: string,
  sid: string,
  clientSecret: string,
): Promise<void> {
  const base = homeserverUrl.replace(/\/+$/, "");
  const res = await fetch(`${base}/_matrix/client/v3/account/password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      new_password: newPassword,
      auth: {
        type: "m.login.email.identity",
        threepid_creds: {
          sid,
          client_secret: clientSecret,
        },
        threepidCreds: {
          sid,
          client_secret: clientSecret,
        },
      },
    }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `Password reset failed (${res.status})`);
  }
}

/**
 * Generate a client secret string for password reset flows.
 */
export function generateClientSecret(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
