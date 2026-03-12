/**
 * Utilities for parsing and building geo: URIs (RFC 5870).
 */

export interface GeoCoordinates {
  lat: number;
  lng: number;
  alt?: number;
}

/**
 * Parse a geo: URI string into coordinates.
 * Handles formats like:
 *   geo:52.52,13.405
 *   geo:52.52,13.405,100
 *   geo:52.52,13.405;u=10
 *
 * Returns null if the URI is invalid or unparseable.
 */
export function parseGeoUri(uri: string): GeoCoordinates | null {
  if (!uri.startsWith("geo:")) return null;

  const body = uri.slice(4);
  // Strip parameters (everything after the first semicolon)
  const coordsPart = body.split(";")[0];
  const parts = coordsPart.split(",");

  if (parts.length < 2) return null;

  const lat = Number(parts[0]);
  const lng = Number(parts[1]);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90) return null;
  if (lng < -180 || lng > 180) return null;

  const result: GeoCoordinates = { lat, lng };

  if (parts.length >= 3) {
    const alt = Number(parts[2]);
    if (Number.isFinite(alt)) {
      result.alt = alt;
    }
  }

  return result;
}

/**
 * Build a geo: URI string from lat/lng coordinates.
 */
export function buildGeoUri(lat: number, lng: number): string {
  return `geo:${lat},${lng}`;
}

/**
 * Build an OpenStreetMap URL for given coordinates.
 */
export function buildOsmUrl(lat: number, lng: number, zoom = 15): string {
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}&zoom=${zoom}`;
}

/**
 * Build a static map image URL from OpenStreetMap's static map service.
 */
export function buildStaticMapUrl(
  lat: number,
  lng: number,
  zoom = 15,
  width = 300,
  height = 200,
): string {
  return `https://staticmap.openstreetmap.de/staticmap.php?center=${lat},${lng}&zoom=${zoom}&size=${width}x${height}&markers=${lat},${lng}`;
}

/**
 * Build an OpenStreetMap embed URL for an iframe.
 */
export function buildOsmEmbedUrl(lat: number, lng: number, _zoom = 15): string {
  const offset = 0.01;
  const bbox = `${lng - offset},${lat - offset},${lng + offset},${lat + offset}`;
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat},${lng}`;
}
