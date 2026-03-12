import React, { useState, useCallback } from "react";
import { buildGeoUri } from "~/lib/geo-uri";
import {
  startLiveLocation,
  stopLiveLocation,
  LIVE_LOCATION_DURATIONS,
  type LiveLocationState,
} from "~/lib/live-location";
import { useMatrix } from "~/lib/matrix-context";

type PickerMode = "static" | "live" | "pinDrop";

interface LocationPickerProps {
  roomId: string;
  onClose: () => void;
}

/**
 * Modal for sharing a location in a chat room.
 * Supports three modes:
 * - Static: manual lat/lng or "Use my location"
 * - Live: share live location for a chosen duration
 * - Pin Drop: pick a location on an interactive OSM map or enter coords
 */
export function LocationPicker({ roomId, onClose }: LocationPickerProps) {
  const { client } = useMatrix();
  const [mode, setMode] = useState<PickerMode>("static");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [label, setLabel] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [geoError, setGeoError] = useState("");
  const [liveState, setLiveState] = useState<LiveLocationState | null>(null);
  const [liveStarting, setLiveStarting] = useState(false);

  const handleUseMyLocation = useCallback(() => {
    setGeoError("");
    if (!("geolocation" in navigator)) {
      setGeoError("Geolocation is not supported by your browser.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLat(String(position.coords.latitude));
        setLng(String(position.coords.longitude));
        setGeoError("");
      },
      (err) => {
        switch (err.code) {
          case err.PERMISSION_DENIED:
            setGeoError("Location permission denied.");
            break;
          case err.POSITION_UNAVAILABLE:
            setGeoError("Location unavailable.");
            break;
          case err.TIMEOUT:
            setGeoError("Location request timed out.");
            break;
          default:
            setGeoError("Failed to get location.");
        }
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }, []);

  const handleShare = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const latNum = Number(lat);
    const lngNum = Number(lng);

    if (!Number.isFinite(latNum) || latNum < -90 || latNum > 90) {
      setError("Latitude must be between -90 and 90.");
      return;
    }
    if (!Number.isFinite(lngNum) || lngNum < -180 || lngNum > 180) {
      setError("Longitude must be between -180 and 180.");
      return;
    }

    const geoUri = buildGeoUri(latNum, lngNum);
    const description = label.trim() || undefined;
    const bodyText = description
      ? `${description} (${latNum}, ${lngNum})`
      : `Location: ${latNum}, ${lngNum}`;

    const content: Record<string, unknown> = {
      msgtype: "m.location",
      body: bodyText,
      geo_uri: geoUri,
      "m.location": {
        uri: geoUri,
        ...(description ? { description } : {}),
      },
      "m.text": bodyText,
    };

    setSending(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await client.sendEvent(roomId, "m.room.message" as any, content);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send location.");
      setSending(false);
    }
  };

  const handleStartLive = async (durationMs: number) => {
    setLiveStarting(true);
    setError("");
    try {
      const state = await startLiveLocation(client, roomId, durationMs);
      setLiveState(state);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start live location.");
    } finally {
      setLiveStarting(false);
    }
  };

  const handleStopLive = () => {
    if (liveState) {
      stopLiveLocation(liveState);
      setLiveState(null);
    }
    onClose();
  };

  const handlePinDropMessage = useCallback((event: React.MouseEvent<HTMLIFrameElement>) => {
    // The iframe approach doesn't give us click coordinates directly.
    // Users can enter coordinates in the inputs or use the iframe to visually find them.
    void event;
  }, []);

  const modeButtons: Array<{ key: PickerMode; label: string }> = [
    { key: "static", label: "Current" },
    { key: "pinDrop", label: "Pick on Map" },
    { key: "live", label: "Live" },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-surface-1 border border-border rounded-xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 mb-1">
          <svg
            className="w-5 h-5 text-accent"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z"
            />
          </svg>
          <h2 className="text-lg font-bold text-primary">Share Location</h2>
        </div>

        {/* Mode tabs */}
        <div className="flex gap-1 mb-4 bg-surface-2 rounded-lg p-1">
          {modeButtons.map((m) => (
            <button
              key={m.key}
              onClick={() => setMode(m.key)}
              className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                mode === m.key ? "bg-accent text-inverse" : "text-secondary hover:text-primary"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        {/* Static location mode */}
        {mode === "static" && (
          <>
            <p className="text-sm text-secondary mb-4">
              Enter coordinates or use your current location.
            </p>
            <form onSubmit={handleShare} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-secondary mb-1.5">Latitude</label>
                <input
                  type="number"
                  step="any"
                  value={lat}
                  onChange={(e) => setLat(e.target.value)}
                  className="w-full px-3 py-2 bg-surface-2 border border-border rounded-lg text-sm text-primary placeholder-muted focus:outline-none focus:border-accent"
                  placeholder="52.520008"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-secondary mb-1.5">Longitude</label>
                <input
                  type="number"
                  step="any"
                  value={lng}
                  onChange={(e) => setLng(e.target.value)}
                  className="w-full px-3 py-2 bg-surface-2 border border-border rounded-lg text-sm text-primary placeholder-muted focus:outline-none focus:border-accent"
                  placeholder="13.404954"
                  required
                />
              </div>
              <button
                type="button"
                onClick={handleUseMyLocation}
                className="w-full px-3 py-2 bg-surface-2 border border-border rounded-lg text-sm text-secondary hover:text-primary hover:bg-surface-3 transition-colors flex items-center justify-center gap-2"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418"
                  />
                </svg>
                Use my location
              </button>
              {geoError && <p className="text-xs text-status-error">{geoError}</p>}
              <div>
                <label className="block text-xs font-medium text-secondary mb-1.5">
                  Label <span className="text-faint">(optional)</span>
                </label>
                <input
                  type="text"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  className="w-full px-3 py-2 bg-surface-2 border border-border rounded-lg text-sm text-primary placeholder-muted focus:outline-none focus:border-accent"
                  placeholder="Berlin"
                />
              </div>
              {error && <p className="text-sm text-status-error">{error}</p>}
              <div className="flex gap-3 justify-end">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-sm text-secondary hover:text-primary transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={sending || !lat || !lng}
                  className="px-4 py-2 bg-accent hover:bg-accent-hover disabled:opacity-50 text-inverse text-sm font-medium rounded-lg transition-colors"
                >
                  {sending ? "Sharing..." : "Share Location"}
                </button>
              </div>
            </form>
          </>
        )}

        {/* Live location mode */}
        {mode === "live" && (
          <div className="space-y-4">
            <p className="text-sm text-secondary">
              Share your live location with this room. Others will see your position update in real
              time.
            </p>
            {liveState ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 p-3 bg-status-success/10 border border-status-success/20 rounded-lg">
                  <div className="w-2 h-2 rounded-full bg-status-success animate-pulse" />
                  <span className="text-sm text-status-success font-medium">
                    Sharing live location
                  </span>
                </div>
                <button
                  onClick={handleStopLive}
                  className="w-full px-4 py-2 bg-status-error hover:bg-red-600 text-inverse text-sm font-medium rounded-lg transition-colors"
                >
                  Stop Sharing
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-xs font-medium text-secondary">Choose duration:</p>
                {LIVE_LOCATION_DURATIONS.map((duration) => (
                  <button
                    key={duration.ms}
                    onClick={() => handleStartLive(duration.ms)}
                    disabled={liveStarting}
                    className="w-full px-4 py-2.5 bg-surface-2 border border-border rounded-lg text-sm text-secondary hover:text-primary hover:bg-surface-3 disabled:opacity-50 transition-colors flex items-center justify-between"
                  >
                    <span>{duration.label}</span>
                    <svg
                      className="w-4 h-4 text-accent"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={1.5}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z"
                      />
                    </svg>
                  </button>
                ))}
              </div>
            )}
            {error && <p className="text-sm text-status-error">{error}</p>}
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm text-secondary hover:text-primary transition-colors"
              >
                {liveState ? "Close" : "Cancel"}
              </button>
            </div>
          </div>
        )}

        {/* Pin drop mode */}
        {mode === "pinDrop" && (
          <div className="space-y-4">
            <p className="text-sm text-secondary">
              Browse the map to find a location, then enter the coordinates below.
            </p>
            {/* OpenStreetMap iframe for visual reference */}
            <div className="rounded-lg overflow-hidden border border-border">
              <iframe
                title="OpenStreetMap"
                src={`https://www.openstreetmap.org/export/embed.html?bbox=${
                  lng ? Number(lng) - 0.01 : 13.39
                },${lat ? Number(lat) - 0.01 : 52.51},${
                  lng ? Number(lng) + 0.01 : 13.42
                },${lat ? Number(lat) + 0.01 : 52.53}&layer=mapnik${
                  lat && lng ? `&marker=${lat},${lng}` : ""
                }`}
                className="w-full h-48"
                onClick={handlePinDropMessage}
              />
            </div>
            <form onSubmit={handleShare} className="space-y-3">
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-xs font-medium text-secondary mb-1">Latitude</label>
                  <input
                    type="number"
                    step="any"
                    value={lat}
                    onChange={(e) => setLat(e.target.value)}
                    className="w-full px-3 py-2 bg-surface-2 border border-border rounded-lg text-sm text-primary placeholder-muted focus:outline-none focus:border-accent"
                    placeholder="52.520008"
                    required
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-medium text-secondary mb-1">Longitude</label>
                  <input
                    type="number"
                    step="any"
                    value={lng}
                    onChange={(e) => setLng(e.target.value)}
                    className="w-full px-3 py-2 bg-surface-2 border border-border rounded-lg text-sm text-primary placeholder-muted focus:outline-none focus:border-accent"
                    placeholder="13.404954"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-secondary mb-1">
                  Label <span className="text-faint">(optional)</span>
                </label>
                <input
                  type="text"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  className="w-full px-3 py-2 bg-surface-2 border border-border rounded-lg text-sm text-primary placeholder-muted focus:outline-none focus:border-accent"
                  placeholder="Cafe near park"
                />
              </div>
              {error && <p className="text-sm text-status-error">{error}</p>}
              <div className="flex gap-3 justify-end">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-sm text-secondary hover:text-primary transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={sending || !lat || !lng}
                  className="px-4 py-2 bg-accent hover:bg-accent-hover disabled:opacity-50 text-inverse text-sm font-medium rounded-lg transition-colors"
                >
                  {sending ? "Sharing..." : "Drop Pin"}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
