import * as sdk from "matrix-js-sdk";
import React, { createContext, useContext, useEffect, useState, useRef } from "react";
import { AgentRegistry } from "./agent-registry";
import { EventStore } from "./event-store";
import { createPersistenceAdapter, type PersistenceAdapter } from "./persistence";

interface MatrixContextValue {
  client: sdk.MatrixClient;
  eventStore: EventStore;
  agentRegistry: AgentRegistry;
  ready: boolean;
  logout: () => void;
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
  onLogout: () => void;
  children: React.ReactNode;
}

function createMatrixClient(baseUrl: string, userId: string, accessToken: string) {
  const c = sdk.createClient({ baseUrl, userId, accessToken });

  // matrix-js-sdk v36 sync crashes with "this.callEventHandler.start is not
  // an object" when VoIP call handlers aren't initialised. Stub them out.
  const noop = { start: () => {}, stop: () => {} };
  /* eslint-disable @typescript-eslint/no-explicit-any */
  if (!(c as any).callEventHandler) (c as any).callEventHandler = noop;
  if (!(c as any).groupCallEventHandler) (c as any).groupCallEventHandler = noop;
  /* eslint-enable @typescript-eslint/no-explicit-any */

  return c;
}

export function MatrixProvider({
  homeserverUrl,
  userId,
  accessToken,
  onLogout,
  children,
}: MatrixProviderProps) {
  const [ready, setReady] = useState(false);
  const [client, setClient] = useState<sdk.MatrixClient | null>(null);
  const eventStoreRef = useRef<EventStore>(new EventStore());
  const agentRegistryRef = useRef<AgentRegistry>(new AgentRegistry());
  const persistenceRef = useRef<PersistenceAdapter>(createPersistenceAdapter());

  useEffect(() => {
    const c = createMatrixClient(homeserverUrl, userId, accessToken);
    const eventStore = eventStoreRef.current;
    const agentRegistry = agentRegistryRef.current;
    const persistence = persistenceRef.current;

    // Wire registry into event store for isAgent resolution
    eventStore.setAgentRegistry(agentRegistry);

    setClient(c);
    setReady(false);

    persistence.saveSession({ homeserverUrl, userId, accessToken });

    const loadAllRooms = () => {
      const rooms = c.getRooms();
      for (const room of rooms) {
        eventStore.loadRoom(room);
        agentRegistry.loadRoom(room);
      }
    };

    let isReady = false;
    const onSync = (
      state: sdk.SyncState,
      prevState: sdk.SyncState | null,
      data?: sdk.SyncStateData,
    ) => {
      console.log(`[Matrix] sync state: ${prevState} -> ${state}`, data?.error ?? "");
      if (state === "PREPARED" || state === "SYNCING") {
        loadAllRooms();
        if (!isReady) {
          isReady = true;
          setReady(true);
        }
      }
      if (state === "ERROR") {
        console.error("[Matrix] sync error:", data?.error);
        // Auto-logout on expired / invalid token so the user sees the login screen
        // instead of an infinite spinner.
        const errcode = (data?.error as { errcode?: string } | undefined)?.errcode;
        if (errcode === "M_UNKNOWN_TOKEN" || errcode === "M_MISSING_TOKEN") {
          persistence.clearSession();
          onLogout();
        }
      }
    };

    c.on(sdk.ClientEvent.Sync, onSync);

    c.startClient({
      initialSyncLimit: 50,
      lazyLoadMembers: true,
    });

    // Poll room timelines every second as a fallback for real-time updates.
    // The EventStore deduplicates via seenIds so this is cheap.
    const pollInterval = setInterval(loadAllRooms, 1000);

    return () => {
      c.removeListener(sdk.ClientEvent.Sync, onSync);
      clearInterval(pollInterval);
      c.stopClient();
    };
  }, [homeserverUrl, userId, accessToken]);

  const logout = () => {
    persistenceRef.current.clearSession();
    onLogout();
  };

  if (!client) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-0">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <MatrixContext.Provider
      value={{
        client,
        eventStore: eventStoreRef.current,
        agentRegistry: agentRegistryRef.current,
        ready,
        logout,
      }}
    >
      {children}
    </MatrixContext.Provider>
  );
}
