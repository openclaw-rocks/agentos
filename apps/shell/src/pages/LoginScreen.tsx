import React, { useState } from "react";

interface LoginScreenProps {
  onLogin: (homeserverUrl: string, userId: string, accessToken: string) => void;
}

/**
 * Resolve a user-entered server name to a homeserver base URL.
 * Tries .well-known discovery first, then falls back to the domain directly.
 */
async function resolveHomeserver(input: string): Promise<string> {
  const domain = input.trim().replace(/\/+$/, "");

  // If the user typed a full URL with /_matrix, use it directly
  if (domain.includes("/_matrix")) {
    return domain.split("/_matrix")[0];
  }

  // If no protocol, assume https
  const hasProtocol = /^https?:\/\//i.test(domain);
  const baseForDiscovery = hasProtocol ? domain : `https://${domain}`;

  // Try .well-known discovery
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
    // Discovery failed, continue with fallbacks
  }

  // If user gave a full URL (e.g. https://matrix.example.com), try it directly
  if (hasProtocol) {
    return domain;
  }

  // Try https://matrix.<domain> as a common convention
  try {
    const matrixUrl = `https://matrix.${domain}`;
    const res = await fetch(`${matrixUrl}/_matrix/client/versions`, {
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) return matrixUrl;
  } catch {
    // Not a matrix server at matrix.<domain>
  }

  // Fall back to https://<domain>
  return `https://${domain}`;
}

export function LoginScreen({ onLogin }: LoginScreenProps) {
  const [homeserver, setHomeserver] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
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

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-0">
      <div className="w-full max-w-sm">
        <div className="bg-surface-1 rounded-xl border border-border p-8">
          <div className="mb-8 text-center">
            <h1 className="text-2xl font-bold text-white mb-1">AgentOS</h1>
            <p className="text-sm text-gray-400">Agent-first operating system</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Server</label>
              <input
                type="text"
                value={homeserver}
                onChange={(e) => setHomeserver(e.target.value)}
                className="w-full px-3 py-2 bg-surface-2 border border-border rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-accent"
                placeholder="openclaw.rocks"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-3 py-2 bg-surface-2 border border-border rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-accent"
                placeholder="@user:example.com"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 bg-surface-2 border border-border rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-accent"
                required
              />
            </div>

            {error && <p className="text-sm text-status-error">{error}</p>}

            {status && !error && <p className="text-sm text-gray-400">{status}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-accent hover:bg-accent-hover disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
            >
              {loading ? "Connecting..." : "Sign In"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
