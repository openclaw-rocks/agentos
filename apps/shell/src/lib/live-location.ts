import type { MatrixClient } from "matrix-js-sdk";

export interface LiveLocationState {
  watchId: number;
  roomId: string;
  beaconInfoEventId: string;
  expiresAt: number;
  timeoutId: ReturnType<typeof setTimeout> | null;
}

/**
 * Start sharing live location in a room for the given duration.
 * Sends an `m.beacon_info` state event and begins watching the device position.
 */
export async function startLiveLocation(
  client: MatrixClient,
  roomId: string,
  durationMs: number,
): Promise<LiveLocationState> {
  const userId = client.getUserId();
  if (!userId) throw new Error("Not logged in");

  const now = Date.now();
  const expiresAt = now + durationMs;

  const beaconInfoContent = {
    description: "Live location sharing",
    live: true,
    timeout: durationMs,
    "org.matrix.msc3488.ts": now,
    "org.matrix.msc3488.asset": { type: "m.self" },
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = await (client as any).sendStateEvent(
    roomId,
    "org.matrix.msc3672.beacon_info",
    beaconInfoContent,
    userId,
  );

  const beaconInfoEventId: string =
    typeof res === "string" ? res : (res as { event_id: string }).event_id;

  const state: LiveLocationState = {
    watchId: -1,
    roomId,
    beaconInfoEventId,
    expiresAt,
    timeoutId: null,
  };

  // Auto-stop when duration expires
  state.timeoutId = setTimeout(() => {
    stopLiveLocation(state);
  }, durationMs);

  // Start watching position and sending beacon events
  if (typeof navigator !== "undefined" && "geolocation" in navigator) {
    state.watchId = navigator.geolocation.watchPosition(
      (position) => {
        updateLiveLocation(client, state, position.coords).catch(() => {
          /* best-effort */
        });
      },
      () => {
        /* ignore position errors */
      },
      { enableHighAccuracy: true, maximumAge: 10_000 },
    );
  }

  return state;
}

/**
 * Send an updated beacon event with the latest coordinates.
 */
export async function updateLiveLocation(
  client: MatrixClient,
  state: LiveLocationState,
  coords: GeolocationCoordinates,
): Promise<void> {
  if (Date.now() >= state.expiresAt) {
    stopLiveLocation(state);
    return;
  }

  const beaconContent = {
    "m.relates_to": {
      rel_type: "m.reference",
      event_id: state.beaconInfoEventId,
    },
    "org.matrix.msc3488.location": {
      uri: `geo:${coords.latitude},${coords.longitude}`,
      description: "Live location",
    },
    "org.matrix.msc3488.ts": Date.now(),
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await client.sendEvent(state.roomId, "org.matrix.msc3672.beacon" as any, beaconContent);
}

/**
 * Stop live location sharing: clears the geolocation watch and expiry timeout.
 */
export function stopLiveLocation(state: LiveLocationState): void {
  if (state.watchId !== -1 && typeof navigator !== "undefined" && "geolocation" in navigator) {
    navigator.geolocation.clearWatch(state.watchId);
    state.watchId = -1;
  }
  if (state.timeoutId !== null) {
    clearTimeout(state.timeoutId);
    state.timeoutId = null;
  }
}

/**
 * Format a duration in milliseconds to a short human-readable label.
 */
export function formatDuration(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  return hours === 1 ? "1 hour" : `${hours} hours`;
}

/** Common duration presets for live location sharing. */
export const LIVE_LOCATION_DURATIONS: ReadonlyArray<{ label: string; ms: number }> = [
  { label: "15 minutes", ms: 15 * 60 * 1000 },
  { label: "1 hour", ms: 60 * 60 * 1000 },
  { label: "8 hours", ms: 8 * 60 * 60 * 1000 },
];
