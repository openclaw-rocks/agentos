export interface SessionData {
  homeserverUrl: string;
  userId: string;
  accessToken: string;
  deviceId?: string;
}

export interface PersistenceAdapter {
  saveSession(session: SessionData): Promise<void>;
  loadSession(): Promise<SessionData | null>;
  clearSession(): Promise<void>;
}

export function createPersistenceAdapter(): PersistenceAdapter {
  // SQLite persistence will be added when Tauri is set up.
  // For now, use localStorage for session persistence on all platforms.
  return new LocalStoragePersistence();
}

class LocalStoragePersistence implements PersistenceAdapter {
  private key = "openclaw_session";

  async saveSession(session: SessionData): Promise<void> {
    try {
      localStorage.setItem(this.key, JSON.stringify(session));
    } catch {
      // localStorage may be unavailable
    }
  }

  async loadSession(): Promise<SessionData | null> {
    try {
      const raw = localStorage.getItem(this.key);
      if (!raw) return null;
      return JSON.parse(raw) as SessionData;
    } catch {
      return null;
    }
  }

  async clearSession(): Promise<void> {
    try {
      localStorage.removeItem(this.key);
    } catch {
      // ignore
    }
  }
}
