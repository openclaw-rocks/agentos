import React, { useState } from "react";
import { parseGeoUri, buildOsmUrl, buildStaticMapUrl, buildOsmEmbedUrl } from "~/lib/geo-uri";
import type { GeoCoordinates } from "~/lib/geo-uri";

interface LocationDisplayProps {
  content: Record<string, unknown>;
}

/**
 * Renders a shared location message with an embedded static map image,
 * location description, coordinates, and an "Open in Maps" link.
 * Falls back to coordinate text if the map image fails to load.
 */
export function LocationDisplay({ content }: LocationDisplayProps) {
  const coords = extractCoordinates(content);
  const [mapFailed, setMapFailed] = useState(false);

  if (!coords) {
    return <p className="text-sm text-muted">[Location: invalid data]</p>;
  }

  const description = extractDescription(content);
  const osmUrl = buildOsmUrl(coords.lat, coords.lng);
  const staticMapUrl = buildStaticMapUrl(coords.lat, coords.lng);
  const embedUrl = buildOsmEmbedUrl(coords.lat, coords.lng);

  return (
    <div className="mt-1 max-w-sm bg-surface-2 rounded-lg border border-border overflow-hidden">
      {/* Static map image with iframe fallback */}
      {!mapFailed ? (
        <a href={osmUrl} target="_blank" rel="noopener noreferrer" className="block">
          <img
            src={staticMapUrl}
            alt={`Map at ${coords.lat.toFixed(6)}, ${coords.lng.toFixed(6)}`}
            className="w-full h-[200px] object-cover cursor-pointer"
            onError={() => setMapFailed(true)}
          />
        </a>
      ) : (
        <iframe
          src={embedUrl}
          title={`Map at ${coords.lat.toFixed(6)}, ${coords.lng.toFixed(6)}`}
          className="w-full h-[200px] border-0"
          loading="lazy"
        />
      )}

      <div className="flex items-start gap-3 p-3">
        {/* Map pin icon */}
        <div className="w-9 h-9 rounded-lg bg-accent/15 flex items-center justify-center flex-shrink-0">
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
        </div>

        <div className="min-w-0 flex-1">
          {description && (
            <p className="text-sm font-medium text-primary truncate">{description}</p>
          )}
          <p className="text-xs text-secondary">
            {coords.lat.toFixed(6)}, {coords.lng.toFixed(6)}
          </p>
          <a
            href={osmUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 mt-1.5 text-xs text-accent hover:text-accent-hover transition-colors"
          >
            Open in Maps
            <svg
              className="w-3 h-3"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
              />
            </svg>
          </a>
        </div>
      </div>
    </div>
  );
}

/**
 * Extract coordinates from a location message content.
 * Tries m.location.uri first, then falls back to geo_uri.
 */
function extractCoordinates(content: Record<string, unknown>): GeoCoordinates | null {
  const mLocation = content["m.location"] as { uri?: string } | undefined;
  if (mLocation?.uri) {
    const coords = parseGeoUri(mLocation.uri);
    if (coords) return coords;
  }

  const geoUri = content.geo_uri as string | undefined;
  if (geoUri) {
    return parseGeoUri(geoUri);
  }

  return null;
}

/**
 * Extract a human-readable description from the location message.
 */
function extractDescription(content: Record<string, unknown>): string | null {
  const mLocation = content["m.location"] as { description?: string } | undefined;
  if (mLocation?.description) return mLocation.description;

  const mText = content["m.text"] as string | undefined;
  if (mText) return mText;

  return null;
}
