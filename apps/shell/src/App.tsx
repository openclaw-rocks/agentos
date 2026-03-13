import React, { useState, useCallback, useEffect, lazy, Suspense } from "react";
import { MatrixProvider } from "./lib/matrix-context";
import { createPersistenceAdapter } from "./lib/persistence";
import { isHosted } from "./lib/platform";
import { AgentOS } from "./pages/AgentOS";
import { LoginScreen } from "./pages/LoginScreen";

// Lazy-load hosted-only auth component — tree-shaken in open-source builds
const HostedAuth = lazy(() => import("./ee/hosted-auth").then((m) => ({ default: m.HostedAuth })));

const persistence = createPersistenceAdapter();

export function App() {
  const [session, setSession] = useState<{
    homeserverUrl: string;
    userId: string;
    accessToken: string;
    isGuest?: boolean;
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

  const handleLogin = useCallback(
    (homeserverUrl: string, userId: string, accessToken: string, isGuest?: boolean) => {
      const s = { homeserverUrl, userId, accessToken, isGuest };
      setSession(s);
      // Don't persist guest sessions
      if (!isGuest) {
        persistence.saveSession(s);
      }
    },
    [],
  );

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
    if (isHosted()) {
      return (
        <Suspense
          fallback={
            <div className="min-h-screen flex items-center justify-center bg-surface-0">
              <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            </div>
          }
        >
          <HostedAuth onLogin={handleLogin} />
        </Suspense>
      );
    }
    return <LoginScreen onLogin={handleLogin} />;
  }

  return (
    <MatrixProvider
      homeserverUrl={session.homeserverUrl}
      userId={session.userId}
      accessToken={session.accessToken}
      onLogout={handleLogout}
    >
      {session.isGuest && (
        <div className="bg-accent/20 border-b border-accent/30 px-4 py-2 text-center">
          <p className="text-sm text-accent">
            You are browsing as a guest.{" "}
            <button
              onClick={handleLogout}
              className="underline hover:text-primary transition-colors font-medium"
            >
              Sign up to participate.
            </button>
          </p>
        </div>
      )}
      <AgentOS />
    </MatrixProvider>
  );
}
