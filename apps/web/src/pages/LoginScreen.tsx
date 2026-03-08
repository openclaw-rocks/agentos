import React, { useState } from "react";

interface LoginScreenProps {
  onLogin: (homeserverUrl: string, userId: string, accessToken: string) => void;
}

export function LoginScreen({ onLogin }: LoginScreenProps) {
  const [homeserver, setHomeserver] = useState("http://localhost:8008");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch(`${homeserver}/_matrix/client/v3/login`, {
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
      onLogin(homeserver, data.user_id, data.access_token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-0">
      <div className="w-full max-w-sm">
        <div className="bg-surface-1 rounded-xl border border-border p-8">
          <div className="mb-8 text-center">
            <h1 className="text-2xl font-bold text-white mb-1">OpenClaw</h1>
            <p className="text-sm text-gray-400">Agent-first workspace</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">
                Homeserver
              </label>
              <input
                type="url"
                value={homeserver}
                onChange={(e) => setHomeserver(e.target.value)}
                className="w-full px-3 py-2 bg-surface-2 border border-border rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-accent"
                placeholder="https://matrix.example.com"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">
                Username
              </label>
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
              <label className="block text-xs font-medium text-gray-400 mb-1.5">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 bg-surface-2 border border-border rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-accent"
                required
              />
            </div>

            {error && (
              <p className="text-sm text-status-error">{error}</p>
            )}

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
