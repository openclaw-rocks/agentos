import React, { createContext, useContext, useEffect, useState, useRef } from "react";
import * as sdk from "matrix-js-sdk";

interface MatrixContextValue {
  client: sdk.MatrixClient;
  ready: boolean;
}

const MatrixContext = createContext<MatrixContextValue | null>(null);

export function useMatrix(): MatrixContextValue {
  const ctx = useContext(MatrixContext);
  if (!ctx) throw new Error("useMatrix must be used within MatrixProvider");
  return ctx;
}

interface MatrixProviderProps {
  homeserverUrl: string;
  userId: string;
  accessToken: string;
  children: React.ReactNode;
}

export function MatrixProvider({ homeserverUrl, userId, accessToken, children }: MatrixProviderProps) {
  const [ready, setReady] = useState(false);
  const clientRef = useRef<sdk.MatrixClient | null>(null);

  if (!clientRef.current) {
    clientRef.current = sdk.createClient({
      baseUrl: homeserverUrl,
      userId,
      accessToken,
    });
  }

  useEffect(() => {
    const client = clientRef.current!;

    const onSync = (state: string) => {
      if (state === "PREPARED") {
        setReady(true);
      }
    };

    client.on(sdk.ClientEvent.Sync, onSync);
    client.startClient({ initialSyncLimit: 20 });

    return () => {
      client.removeListener(sdk.ClientEvent.Sync, onSync);
      client.stopClient();
    };
  }, []);

  return (
    <MatrixContext.Provider value={{ client: clientRef.current!, ready }}>
      {children}
    </MatrixContext.Provider>
  );
}
