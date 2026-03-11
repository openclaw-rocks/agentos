import React, { useState, useCallback, useEffect } from "react";
import { MatrixProvider } from "./lib/matrix-context";
import { createPersistenceAdapter } from "./lib/persistence";
import { AgentOS } from "./pages/AgentOS";
import { LoginScreen } from "./pages/LoginScreen";

const persistence = createPersistenceAdapter();

export function App() {
  const [session, setSession] = useState<{
    homeserverUrl: string;
    userId: string;
    accessToken: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  // Restore session from persistence on mount, validating the token first
  useEffect(() => {
    persistence.loadSession().then(async (saved) => {
      if (saved) {
        try {
          const res = await fetch(`${saved.homeserverUrl}/_matrix/client/v3/account/whoami`, {
            headers: { Authorization: `Bearer ${saved.accessToken}` },
            signal: AbortSignal.timeout(5000),
          });
          if (res.ok) {
            setSession(saved);
          } else {
            // Token expired or invalid — clear and show login
            persistence.clearSession();
          }
        } catch {
          // Network error — clear stale session so user can re-login
          persistence.clearSession();
        }
      }
      setLoading(false);
    });
  }, []);

  const handleLogin = useCallback((homeserverUrl: string, userId: string, accessToken: string) => {
    const s = { homeserverUrl, userId, accessToken };
    setSession(s);
    persistence.saveSession(s);
  }, []);

  const handleLogout = useCallback(() => {
    setSession(null);
    persistence.clearSession();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-0">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!session) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  return (
    <MatrixProvider
      homeserverUrl={session.homeserverUrl}
      userId={session.userId}
      accessToken={session.accessToken}
      onLogout={handleLogout}
    >
      <AgentOS />
    </MatrixProvider>
  );
}
