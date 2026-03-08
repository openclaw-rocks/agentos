import React, { useState, useCallback } from "react";
import { LoginScreen } from "./pages/LoginScreen";
import { Workspace } from "./pages/Workspace";
import { MatrixProvider } from "./lib/matrix-context";

export function App() {
  const [session, setSession] = useState<{
    homeserverUrl: string;
    userId: string;
    accessToken: string;
  } | null>(null);

  const handleLogin = useCallback(
    (homeserverUrl: string, userId: string, accessToken: string) => {
      setSession({ homeserverUrl, userId, accessToken });
    },
    [],
  );

  const handleLogout = useCallback(() => {
    setSession(null);
  }, []);

  if (!session) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  return (
    <MatrixProvider
      homeserverUrl={session.homeserverUrl}
      userId={session.userId}
      accessToken={session.accessToken}
    >
      <Workspace onLogout={handleLogout} />
    </MatrixProvider>
  );
}
