import React, { useCallback, useEffect, useMemo, useState } from "react";
import { generateQRCodeSVG } from "~/lib/qr-code";
import { buildQrLoginData, generateQrSessionId, isValidHomeserverUrl } from "~/lib/qr-login";
import { registerAccount } from "~/lib/registration";
import {
  buildSSORedirectUrl,
  completeSSOLogin,
  discoverOIDC,
  discoverSSOProviders,
  generateClientSecret,
  requestPasswordResetEmail,
  resetPassword,
  type SSOProvider,
} from "~/lib/sso-utils";

/**
 * Map raw Matrix/server errors to plain-language messages.
 * These should make sense to someone who has never heard of Matrix.
 */
function friendlyError(raw: string): string {
  const lower = raw.toLowerCase();

  // Registration disabled
  if (
    lower.includes("registration") &&
    (lower.includes("disabled") || lower.includes("not allowed"))
  ) {
    return "This server doesn't allow new accounts right now. Ask your administrator for an invite, or try a different server.";
  }
  if (lower.includes("m.login.application_service")) {
    return "This server doesn't allow new accounts right now. Ask your administrator for an invite, or try a different server.";
  }

  // Wrong credentials
  if (
    lower.includes("forbidden") ||
    lower.includes("invalid password") ||
    lower.includes("invalid username or password")
  ) {
    return "Incorrect username or password. Please double-check and try again.";
  }

  // User not found
  if (
    lower.includes("not found") ||
    lower.includes("unknown user") ||
    lower.includes("m_not_found")
  ) {
    return "We couldn't find that account. Check your username and server address.";
  }

  // Username taken
  if (
    lower.includes("user_in_use") ||
    lower.includes("already taken") ||
    lower.includes("username is not available")
  ) {
    return "That username is already taken. Please choose a different one.";
  }

  // Invalid username format
  if (
    lower.includes("invalid username") ||
    (lower.includes("user id") && lower.includes("invalid"))
  ) {
    return "That username isn't valid. Use only letters, numbers, dashes, and underscores.";
  }

  // Rate limiting
  if (
    lower.includes("limit_exceeded") ||
    (lower.includes("rate") && lower.includes("limit")) ||
    lower.includes("too many")
  ) {
    return "Too many attempts. Please wait a moment and try again.";
  }

  // Guest access denied
  if (
    lower.includes("guest") &&
    (lower.includes("not allowed") || lower.includes("forbidden") || lower.includes("disabled"))
  ) {
    return "This server doesn't allow guest access. Try signing in with an account instead.";
  }

  // Network / fetch errors
  if (
    lower.includes("failed to fetch") ||
    lower.includes("network") ||
    lower.includes("econnrefused") ||
    lower.includes("timeout") ||
    lower.includes("timed out")
  ) {
    return "Can't reach the server. Check your internet connection and make sure the server address is correct.";
  }

  // CORS or mixed-content
  if (lower.includes("cors") || lower.includes("blocked")) {
    return "The server can't be reached from this browser. Make sure the server address is correct.";
  }

  // Weak password
  if (
    lower.includes("password") &&
    (lower.includes("too short") || lower.includes("too weak") || lower.includes("not strong"))
  ) {
    return "That password is too weak. Please use at least 8 characters with a mix of letters and numbers.";
  }

  // Unrecognized — if it's already short and non-technical, keep it; otherwise genericize
  if (raw.length > 120 || lower.includes("m.") || lower.includes("errcode")) {
    return "Something went wrong. Please try again or contact your server administrator.";
  }

  return raw;
}

/** Error banner with icon — soft, non-alarming presentation */
function ErrorBanner({ message }: { message: string }): React.ReactElement {
  return (
    <div className="error-banner" role="alert">
      <svg
        className="error-icon w-4 h-4"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
        />
      </svg>
      <span className="error-text">{message}</span>
    </div>
  );
}

interface LoginScreenProps {
  onLogin: (homeserverUrl: string, userId: string, accessToken: string, isGuest?: boolean) => void;
}

type AuthMode = "sign-in" | "create-account";
type ScreenView = "auth" | "forgot-password" | "check-email" | "new-password" | "qr-login";

/**
 * Resolve a user-entered server name to a homeserver base URL.
 * Tries .well-known discovery first, then falls back to the domain directly.
 */
async function resolveHomeserver(input: string): Promise<string> {
  const domain = input.trim().replace(/\/+$/, "");

  if (domain.includes("/_matrix")) {
    return domain.split("/_matrix")[0];
  }

  const hasProtocol = /^https?:\/\//i.test(domain);
  const baseForDiscovery = hasProtocol ? domain : `https://${domain}`;

  try {
    const res = await fetch(`${baseForDiscovery}/.well-known/matrix/client`, {
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const data = await res.json();
      const discovered = data?.["m.homeserver"]?.base_url;
      if (discovered) {
        return discovered.replace(/\/+$/, "");
      }
    }
  } catch {
    // Discovery failed
  }

  if (hasProtocol) {
    return domain;
  }

  try {
    const matrixUrl = `https://matrix.${domain}`;
    const res = await fetch(`${matrixUrl}/_matrix/client/versions`, {
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) return matrixUrl;
  } catch {
    // fallback
  }

  return `https://${domain}`;
}

// ---------------------------------------------------------------------------
// QR Login View
// ---------------------------------------------------------------------------

function QrLoginView({
  homeserver,
  discoveredHomeserver,
  onChangeHomeserver,
  onBack,
}: {
  homeserver: string;
  discoveredHomeserver: string | null;
  onChangeHomeserver: (value: string) => void;
  onBack: () => void;
}): React.ReactElement {
  const sessionId = useMemo(() => generateQrSessionId(), []);
  const hsUrl = discoveredHomeserver ?? (homeserver.trim() ? `https://${homeserver.trim()}` : "");
  const hasValidUrl = isValidHomeserverUrl(hsUrl);
  const qrData = hasValidUrl ? buildQrLoginData(hsUrl, sessionId) : "";
  const qrSvg = hasValidUrl ? generateQRCodeSVG(qrData, 200) : "";

  return (
    <div className="min-h-screen flex items-center justify-center login-bg px-4">
      <div className="w-full max-w-sm glass rounded-2xl p-8 card-enter">
        <div className="mb-6 text-center">
          <h1 className="text-xl font-semibold text-primary mb-1">QR Code Login</h1>
          <p className="text-sm text-muted">
            Scan with your signed-in device to verify this session
          </p>
        </div>

        <div className="mb-4">
          <label className="block text-xs font-medium text-muted mb-1.5">Server</label>
          <input
            type="text"
            value={homeserver}
            onChange={(e) => onChangeHomeserver(e.target.value)}
            className="glass-input w-full"
            placeholder="openclaw.rocks"
          />
        </div>

        {hasValidUrl ? (
          <div className="flex flex-col items-center gap-4 mb-4">
            <div
              className="bg-white p-3 rounded-xl border border-border"
              dangerouslySetInnerHTML={{ __html: qrSvg }}
            />
            <p className="text-xs text-muted text-center">
              Open AgentOS on your signed-in device, go to Settings, and scan this code.
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 py-8 mb-4">
            <div className="w-14 h-14 rounded-xl bg-surface-2 flex items-center justify-center">
              <svg
                className="w-7 h-7 text-muted"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5zM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5zM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0113.5 9.375v-4.5z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M13.5 14.625v1.875m0 3v.375m0-3.375h1.875m3 0h.375m-5.25 0h1.875m3 0h.375"
                />
              </svg>
            </div>
            <p className="text-xs text-muted text-center">
              Enter your homeserver address to generate a QR code
            </p>
          </div>
        )}

        <button
          type="button"
          onClick={onBack}
          className="w-full py-2 text-sm text-muted hover:text-siri-purple transition-colors duration-200"
        >
          Back to sign in
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main LoginScreen
// ---------------------------------------------------------------------------

export function LoginScreen({ onLogin }: LoginScreenProps): React.ReactElement {
  const [homeserver, setHomeserver] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [authMode, setAuthMode] = useState<AuthMode>("sign-in");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [email, setEmail] = useState("");
  const [ssoProviders, setSSOProviders] = useState<SSOProvider[]>([]);
  const [oidcAvailable, setOIDCAvailable] = useState(false);
  const [discoveredHomeserver, setDiscoveredHomeserver] = useState<string | null>(null);
  const [view, setView] = useState<ScreenView>("auth");
  const [resetEmail, setResetEmail] = useState("");
  const [resetSid, setResetSid] = useState("");
  const [resetClientSecret, setResetClientSecret] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordConfirm, setNewPasswordConfirm] = useState("");

  const discoverProviders = useCallback(async (serverInput: string) => {
    if (!serverInput.trim()) {
      setSSOProviders([]);
      setOIDCAvailable(false);
      setDiscoveredHomeserver(null);
      return;
    }
    try {
      const baseUrl = await resolveHomeserver(serverInput);
      setDiscoveredHomeserver(baseUrl);
      const [providers, oidc] = await Promise.all([
        discoverSSOProviders(baseUrl),
        discoverOIDC(baseUrl),
      ]);
      setSSOProviders(providers);
      setOIDCAvailable(oidc !== null);
    } catch {
      setSSOProviders([]);
      setOIDCAvailable(false);
    }
  }, []);

  useEffect(() => {
    if (!homeserver.trim()) {
      setSSOProviders([]);
      setOIDCAvailable(false);
      return;
    }
    const timeout = setTimeout(() => discoverProviders(homeserver), 800);
    return () => clearTimeout(timeout);
  }, [homeserver, discoverProviders]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const loginToken = params.get("loginToken");
    const storedHomeserver = sessionStorage.getItem("openclaw_sso_homeserver");
    if (loginToken && storedHomeserver) {
      window.history.replaceState({}, "", window.location.pathname);
      sessionStorage.removeItem("openclaw_sso_homeserver");
      setLoading(true);
      setStatus("Completing SSO login...");
      completeSSOLogin(storedHomeserver, loginToken)
        .then(({ userId, accessToken }) => onLogin(storedHomeserver, userId, accessToken))
        .catch((err) => setError(err instanceof Error ? err.message : "SSO login failed"))
        .finally(() => {
          setLoading(false);
          setStatus("");
        });
    }
  }, [onLogin]);

  const handleSignIn = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      setStatus("Discovering homeserver...");
      const baseUrl = await resolveHomeserver(homeserver);
      setStatus(`Signing in to ${baseUrl}...`);
      const res = await fetch(`${baseUrl}/_matrix/client/v3/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "m.login.password",
          identifier: { type: "m.id.user", user: username },
          password,
        }),
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error ?? "Login failed");
      }
      const data = await res.json();
      onLogin(baseUrl, data.user_id, data.access_token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
      setStatus("");
    }
  };

  const handleRegister = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setError("");
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (!username.trim()) {
      setError("Username is required");
      return;
    }
    setLoading(true);
    try {
      setStatus("Discovering homeserver...");
      const baseUrl = await resolveHomeserver(homeserver);
      setStatus(`Creating account on ${baseUrl}...`);
      const result = await registerAccount(
        baseUrl,
        username.trim(),
        password,
        email.trim() || undefined,
      );
      onLogin(result.homeserver, result.userId, result.accessToken);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setLoading(false);
      setStatus("");
    }
  };

  const handleSSOLogin = (provider: SSOProvider): void => {
    if (!discoveredHomeserver) return;
    sessionStorage.setItem("openclaw_sso_homeserver", discoveredHomeserver);
    const redirectUrl = `${window.location.origin}${window.location.pathname}`;
    window.location.href = buildSSORedirectUrl(discoveredHomeserver, provider.id, redirectUrl);
  };

  const handleOIDCLogin = (): void => {
    if (!discoveredHomeserver) return;
    sessionStorage.setItem("openclaw_sso_homeserver", discoveredHomeserver);
    const redirectUrl = `${window.location.origin}${window.location.pathname}`;
    window.location.href = buildSSORedirectUrl(discoveredHomeserver, "__sso__", redirectUrl);
  };

  const handleGuestLogin = async (): Promise<void> => {
    setError("");
    setLoading(true);
    try {
      setStatus("Discovering homeserver...");
      const baseUrl = homeserver.trim()
        ? await resolveHomeserver(homeserver)
        : "https://matrix.org";
      setStatus("Registering as guest...");
      const res = await fetch(`${baseUrl}/_matrix/client/v3/register?kind=guest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initial_device_display_name: "AgentOS (Guest)" }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "Guest registration failed" }));
        throw new Error(
          (body as Record<string, string>).error ?? "Guest access is not enabled on this server",
        );
      }
      const data = await res.json();
      onLogin(baseUrl, data.user_id, data.access_token, true);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Guest access failed. This server may not allow guest accounts.",
      );
    } finally {
      setLoading(false);
      setStatus("");
    }
  };

  const handleForgotPassword = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const baseUrl = discoveredHomeserver ?? (await resolveHomeserver(homeserver));
      const secret = generateClientSecret();
      setResetClientSecret(secret);
      setStatus("Sending reset email...");
      const { sid } = await requestPasswordResetEmail(baseUrl, resetEmail, secret, 1);
      setResetSid(sid);
      setDiscoveredHomeserver(baseUrl);
      setView("check-email");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send reset email");
    } finally {
      setLoading(false);
      setStatus("");
    }
  };

  const handleResetPassword = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setError("");
    if (newPassword !== newPasswordConfirm) {
      setError("Passwords do not match");
      return;
    }
    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    setLoading(true);
    try {
      const baseUrl = discoveredHomeserver ?? (await resolveHomeserver(homeserver));
      setStatus("Resetting password...");
      await resetPassword(baseUrl, newPassword, resetSid, resetClientSecret);
      setView("auth");
      setAuthMode("sign-in");
      setError("");
      setNewPassword("");
      setNewPasswordConfirm("");
      setResetEmail("");
      setStatus("Password reset successful. Please sign in.");
      setTimeout(() => setStatus(""), 5000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Password reset failed");
    } finally {
      setLoading(false);
    }
  };

  const handleBackToAuth = (): void => {
    setView("auth");
    setError("");
    setStatus("");
    setResetEmail("");
    setNewPassword("");
    setNewPasswordConfirm("");
  };

  const switchAuthMode = (mode: AuthMode): void => {
    setAuthMode(mode);
    setError("");
    setStatus("");
    setConfirmPassword("");
    setEmail("");
  };

  // --- Card wrapper: frosted glass card with entrance animation ---
  const cardClass = "w-full max-w-sm glass rounded-2xl p-8 card-enter";

  // Forgot password
  if (view === "forgot-password") {
    return (
      <div className="min-h-screen flex items-center justify-center login-bg px-4">
        <div className={cardClass}>
          <div className="mb-6 text-center">
            <h1 className="text-xl font-semibold text-primary mb-1">Reset Password</h1>
            <p className="text-sm text-muted">Enter your email to receive a reset link</p>
          </div>
          <form onSubmit={handleForgotPassword} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-secondary mb-1.5">Server</label>
              <input
                type="text"
                value={homeserver}
                onChange={(e) => setHomeserver(e.target.value)}
                className="glass-input w-full"
                placeholder="openclaw.rocks"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-secondary mb-1.5">
                Email address
              </label>
              <input
                type="email"
                value={resetEmail}
                onChange={(e) => setResetEmail(e.target.value)}
                className="glass-input w-full"
                placeholder="you@example.com"
                required
              />
            </div>
            {error && <ErrorBanner message={friendlyError(error)} />}
            {status && !error && <p className="text-sm text-muted">{status}</p>}
            <button type="submit" disabled={loading} className="btn-primary">
              {loading ? "Sending..." : "Send Reset Email"}
            </button>
            <button
              type="button"
              onClick={handleBackToAuth}
              className="w-full py-2 text-sm text-muted hover:text-siri-purple transition-colors duration-200"
            >
              Back to sign in
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Check email
  if (view === "check-email") {
    return (
      <div className="min-h-screen flex items-center justify-center login-bg px-4">
        <div className={cardClass}>
          <div className="mb-6 text-center">
            <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center mx-auto mb-4">
              <svg
                className="w-6 h-6 text-accent"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                />
              </svg>
            </div>
            <h1 className="text-xl font-semibold text-primary mb-1">Check Your Email</h1>
            <p className="text-sm text-muted">
              We sent a verification link to{" "}
              <span className="font-medium text-primary">{resetEmail}</span>. Click the link, then
              continue here.
            </p>
          </div>
          <button type="button" onClick={() => setView("new-password")} className="btn-primary">
            I have verified my email
          </button>
          <button
            type="button"
            onClick={handleBackToAuth}
            className="w-full py-2 mt-3 text-sm text-muted hover:text-siri-purple transition-colors duration-200"
          >
            Back to sign in
          </button>
        </div>
      </div>
    );
  }

  // New password
  if (view === "new-password") {
    return (
      <div className="min-h-screen flex items-center justify-center login-bg px-4">
        <div className={cardClass}>
          <div className="mb-6 text-center">
            <h1 className="text-xl font-semibold text-primary mb-1">New Password</h1>
            <p className="text-sm text-muted">Enter your new password below</p>
          </div>
          <form onSubmit={handleResetPassword} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-secondary mb-1.5">
                New password
              </label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="glass-input w-full"
                placeholder="At least 8 characters"
                required
                minLength={8}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-secondary mb-1.5">
                Confirm password
              </label>
              <input
                type="password"
                value={newPasswordConfirm}
                onChange={(e) => setNewPasswordConfirm(e.target.value)}
                className="glass-input w-full"
                placeholder="Repeat your new password"
                required
                minLength={8}
              />
            </div>
            {error && <ErrorBanner message={friendlyError(error)} />}
            {status && !error && <p className="text-sm text-muted">{status}</p>}
            <button type="submit" disabled={loading} className="btn-primary">
              {loading ? "Resetting..." : "Reset Password"}
            </button>
            <button
              type="button"
              onClick={handleBackToAuth}
              className="w-full py-2 text-sm text-muted hover:text-siri-purple transition-colors duration-200"
            >
              Back to sign in
            </button>
          </form>
        </div>
      </div>
    );
  }

  // QR login
  if (view === "qr-login") {
    return (
      <QrLoginView
        homeserver={homeserver}
        discoveredHomeserver={discoveredHomeserver}
        onChangeHomeserver={setHomeserver}
        onBack={handleBackToAuth}
      />
    );
  }

  // Main auth view
  return (
    <div className="min-h-screen flex justify-center login-bg px-4 pt-[max(2rem,12vh)]">
      <div className={cardClass + " h-fit"}>
        {/* Title */}
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold tracking-tight mb-0.5 siri-text">AgentOS</h1>
          <p className="text-sm text-muted">Agent-first operating system</p>
        </div>

        {/* Tab toggle */}
        <div className="tab-group flex mb-6 bg-surface-2/60 rounded-lg p-0.5 backdrop-blur-sm">
          <div className="tab-group-indicator" data-index={authMode === "sign-in" ? "0" : "1"} />
          <button
            type="button"
            onClick={() => switchAuthMode("sign-in")}
            className={`tab-btn flex-1 py-1.5 text-sm font-medium rounded-md ${
              authMode === "sign-in" ? "active text-primary" : "text-muted"
            }`}
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={() => switchAuthMode("create-account")}
            className={`tab-btn flex-1 py-1.5 text-sm font-medium rounded-md ${
              authMode === "create-account" ? "active text-primary" : "text-muted"
            }`}
          >
            Create account
          </button>
        </div>

        {/* Unified form — shared fields + conditional extras */}
        <form
          onSubmit={authMode === "sign-in" ? handleSignIn : handleRegister}
          className="space-y-3.5"
        >
          <div>
            <label className="block text-xs font-medium text-secondary mb-1.5">Server</label>
            <input
              type="text"
              value={homeserver}
              onChange={(e) => setHomeserver(e.target.value)}
              className="glass-input w-full"
              placeholder="openclaw.rocks"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-secondary mb-1.5">Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="glass-input w-full"
              placeholder="username"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-secondary mb-1.5">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="glass-input w-full"
              placeholder="password"
              required
              minLength={authMode === "create-account" ? 8 : undefined}
            />
          </div>

          {/* Extra fields for create account — smooth height expand */}
          <div className={`expand-section ${authMode === "create-account" ? "open" : ""}`}>
            <div>
              <div className="space-y-3.5 pt-0.5">
                <div>
                  <label className="block text-xs font-medium text-secondary mb-1.5">
                    Confirm password
                  </label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="glass-input w-full"
                    placeholder="Repeat your password"
                    required={authMode === "create-account"}
                    minLength={8}
                    tabIndex={authMode === "create-account" ? 0 : -1}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-secondary mb-1.5">
                    Email <span className="text-muted font-normal">(optional)</span>
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="glass-input w-full"
                    placeholder="you@example.com"
                    tabIndex={authMode === "create-account" ? 0 : -1}
                  />
                </div>
              </div>
            </div>
          </div>

          {error && <ErrorBanner message={friendlyError(error)} />}
          {status && !error && <p className="text-sm text-muted">{status}</p>}
          <div className="pt-1">
            <button type="submit" disabled={loading} className="btn-primary">
              <span key={authMode + String(loading)} className="btn-text-enter">
                {loading
                  ? authMode === "sign-in"
                    ? "Connecting..."
                    : "Creating account..."
                  : authMode === "sign-in"
                    ? "Sign In"
                    : "Create Account"}
              </span>
            </button>
          </div>
        </form>

        {/* Sign-in alternatives — smooth expand/collapse in sync */}
        <div className={`expand-section ${authMode === "sign-in" ? "open" : ""}`}>
          <div>
            <div className="mt-4 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setError("");
                  setStatus("");
                  setView("forgot-password");
                }}
                className="text-xs text-muted hover:text-siri-purple transition-colors duration-200"
                tabIndex={authMode === "sign-in" ? 0 : -1}
              >
                Forgot password?
              </button>
              <span className="text-faint">·</span>
              <button
                type="button"
                onClick={() => {
                  setError("");
                  setStatus("");
                  setView("qr-login");
                }}
                className="text-xs text-muted hover:text-siri-purple transition-colors duration-200"
                tabIndex={authMode === "sign-in" ? 0 : -1}
              >
                QR code
              </button>
            </div>

            {/* SSO */}
            {(ssoProviders.length > 0 || oidcAvailable) && (
              <div>
                <div className="flex items-center gap-3 my-5">
                  <div className="flex-1 h-px bg-border" />
                  <span className="text-xs text-muted">or</span>
                  <div className="flex-1 h-px bg-border" />
                </div>
                <div className="space-y-2">
                  {oidcAvailable && (
                    <button
                      type="button"
                      onClick={handleOIDCLogin}
                      disabled={loading}
                      className="btn-secondary flex items-center justify-center gap-2"
                      tabIndex={authMode === "sign-in" ? 0 : -1}
                    >
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
                        />
                      </svg>
                      Sign in with OIDC
                    </button>
                  )}
                  {ssoProviders.map((provider) => (
                    <button
                      key={provider.id}
                      type="button"
                      onClick={() => handleSSOLogin(provider)}
                      disabled={loading}
                      className="btn-secondary flex items-center justify-center gap-2"
                      tabIndex={authMode === "sign-in" ? 0 : -1}
                    >
                      {provider.icon ? (
                        <img src={provider.icon} alt="" className="w-4 h-4" />
                      ) : (
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1"
                          />
                        </svg>
                      )}
                      Sign in with {provider.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center gap-3 my-5">
              <div className="flex-1 h-px bg-border" />
              <span className="text-xs text-muted">guest</span>
              <div className="flex-1 h-px bg-border" />
            </div>
            <button
              type="button"
              onClick={handleGuestLogin}
              disabled={loading}
              className="btn-secondary flex items-center justify-center gap-2 mb-1"
              tabIndex={authMode === "sign-in" ? 0 : -1}
            >
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"
                />
              </svg>
              Continue as guest
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
