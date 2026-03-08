import React, { createContext, useContext, useEffect, useState, useRef } from "react";
import * as sdk from "matrix-js-sdk";
import { EventTypes } from "@openclaw/matrix-events";

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

/** All custom event types that should appear in room timelines */
const CUSTOM_TIMELINE_TYPES = [
  EventTypes.UI,
  EventTypes.Task,
  EventTypes.ToolCall,
  EventTypes.ToolResult,
];

const CUSTOM_STATE_TYPES = [
  EventTypes.Status,
  EventTypes.Register,
  EventTypes.Config,
];

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

    // Include custom agent event types in the sync filter so they
    // appear in room timelines alongside standard m.room.message events
    const filter = {
      room: {
        timeline: {
          // Don't limit types - include everything
          lazy_load_members: true,
        },
        state: {
          lazy_load_members: true,
        },
      },
    };

    client.startClient({
      initialSyncLimit: 20,
      filter: sdk.Filter.fromJson(client.getUserId()!, "openclaw-filter", filter),
    });

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
