import React, { useState } from "react";

const HOSTED_API_URL = import.meta.env.VITE_HOSTED_API_URL || "/api";
const HOSTED_HOMESERVER = "https://matrix.openclaw.rocks";

/**
 * Map raw API/server errors to plain-language messages.
 * These should make sense to someone who has never heard of Matrix.
 */
function friendlyError(raw: string): string {
  const lower = raw.toLowerCase();

  if (lower.includes("email") && lower.includes("already")) {
    return "An account with that email already exists. Try signing in instead.";
  }
  if (lower.includes("invalid email") || (lower.includes("email") && lower.includes("invalid"))) {
    return "That email address doesn't look right. Please check it and try again.";
  }
  if (
    lower.includes("forbidden") ||
    lower.includes("invalid password") ||
    lower.includes("invalid credentials") ||
    lower.includes("incorrect")
  ) {
    return "Incorrect email or password. Please double-check and try again.";
  }
  if (lower.includes("not found") || lower.includes("no account")) {
    return "We couldn't find an account with that email. Would you like to create one?";
  }
  if (
    lower.includes("limit_exceeded") ||
    (lower.includes("rate") && lower.includes("limit")) ||
    lower.includes("too many")
  ) {
    return "Too many attempts. Please wait a moment and try again.";
  }
  if (
    lower.includes("password") &&
    (lower.includes("too short") || lower.includes("too weak") || lower.includes("not strong"))
  ) {
    return "That password is too weak. Please use at least 8 characters with a mix of letters and numbers.";
  }
  if (
    lower.includes("failed to fetch") ||
    lower.includes("network") ||
    lower.includes("econnrefused") ||
    lower.includes("timeout") ||
    lower.includes("timed out")
  ) {
    return "Can't reach the server. Check your internet connection and try again.";
  }
  if (lower.includes("cors") || lower.includes("blocked")) {
    return "The server can't be reached from this browser. Please try again later.";
  }

  // If short and non-technical, keep it; otherwise genericize
  if (raw.length > 120 || lower.includes("m.") || lower.includes("errcode")) {
    return "Something went wrong. Please try again or contact support.";
  }

  return raw;
}

/** Error banner with icon -- soft, non-alarming presentation */
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

interface HostedAuthProps {
  onLogin: (homeserverUrl: string, userId: string, accessToken: string) => void;
}

type AuthMode = "sign-in" | "create-account";
type ScreenView = "auth" | "forgot-password" | "check-email";

export function HostedAuth({ onLogin }: HostedAuthProps): React.ReactElement {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [authMode, setAuthMode] = useState<AuthMode>("sign-in");
  const [view, setView] = useState<ScreenView>("auth");
  const [resetEmail, setResetEmail] = useState("");

  const switchAuthMode = (mode: AuthMode): void => {
    setAuthMode(mode);
    setError("");
    setStatus("");
    setConfirmPassword("");
  };

  const handleSignIn = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      setStatus("Signing in...");
      const res = await fetch(`${HOSTED_API_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "Login failed" }));
        throw new Error((body as Record<string, string>).error ?? "Login failed");
      }
      const data: { homeserver_url: string; user_id: string; access_token: string } =
        await res.json();
      onLogin(data.homeserver_url ?? HOSTED_HOMESERVER, data.user_id, data.access_token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
      setStatus("");
    }
  };

  const handleSignUp = async (e: React.FormEvent): Promise<void> => {
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
    if (!email.trim()) {
      setError("Email is required");
      return;
    }
    setLoading(true);
    try {
      setStatus("Creating your account...");
      const res = await fetch(`${HOSTED_API_URL}/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "Signup failed" }));
        throw new Error((body as Record<string, string>).error ?? "Signup failed");
      }
      const data: { homeserver_url: string; user_id: string; access_token: string } =
        await res.json();
      onLogin(data.homeserver_url ?? HOSTED_HOMESERVER, data.user_id, data.access_token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Signup failed");
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
      setStatus("Sending reset link...");
      const res = await fetch(`${HOSTED_API_URL}/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: resetEmail.trim() }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "Request failed" }));
        throw new Error((body as Record<string, string>).error ?? "Failed to send reset email");
      }
      setView("check-email");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send reset email");
    } finally {
      setLoading(false);
      setStatus("");
    }
  };

  const handleBackToAuth = (): void => {
    setView("auth");
    setError("");
    setStatus("");
    setResetEmail("");
  };

  const cardClass = "w-full max-w-sm glass rounded-2xl p-8 card-enter";

  // Forgot password view
  if (view === "forgot-password") {
    return (
      <div className="min-h-screen flex items-center justify-center login-bg px-4">
        <div className={cardClass}>
          <div className="mb-6 text-center">
            <h1 className="text-xl font-semibold text-primary mb-1">Reset Password</h1>
            <p className="text-sm text-muted">Enter your email and we will send you a reset link</p>
          </div>
          <form onSubmit={handleForgotPassword} className="space-y-4">
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
                autoFocus
              />
            </div>
            {error && <ErrorBanner message={friendlyError(error)} />}
            {status && !error && <p className="text-sm text-muted">{status}</p>}
            <button type="submit" disabled={loading} className="btn-primary">
              <span key={String(loading)} className="btn-text-enter">
                {loading ? "Sending..." : "Send Reset Link"}
              </span>
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

  // Check email confirmation view
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
              We sent a password reset link to{" "}
              <span className="font-medium text-primary">{resetEmail}</span>. Follow the link in the
              email to reset your password.
            </p>
          </div>
          <button type="button" onClick={handleBackToAuth} className="btn-primary">
            <span className="btn-text-enter">Back to sign in</span>
          </button>
        </div>
      </div>
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

        {/* Unified form -- shared fields + conditional extras */}
        <form
          onSubmit={authMode === "sign-in" ? handleSignIn : handleSignUp}
          className="space-y-3.5"
        >
          <div>
            <label className="block text-xs font-medium text-secondary mb-1.5">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="glass-input w-full"
              placeholder="you@example.com"
              required
              autoComplete="email"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-secondary mb-1.5">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="glass-input w-full"
              placeholder={authMode === "create-account" ? "At least 8 characters" : "password"}
              required
              minLength={authMode === "create-account" ? 8 : undefined}
              autoComplete={authMode === "sign-in" ? "current-password" : "new-password"}
            />
          </div>

          {/* Confirm password -- smooth height expand for create account */}
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
                    autoComplete="new-password"
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
                    ? "Signing in..."
                    : "Creating account..."
                  : authMode === "sign-in"
                    ? "Sign In"
                    : "Create Account"}
              </span>
            </button>
          </div>
        </form>

        {/* Forgot password link -- only visible during sign-in */}
        <div className={`expand-section ${authMode === "sign-in" ? "open" : ""}`}>
          <div>
            <div className="mt-4 flex items-center justify-center">
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
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
