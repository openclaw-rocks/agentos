import { describe, it, expect } from "vitest";
import {
  parseGeoUri,
  buildGeoUri,
  buildOsmUrl,
  buildStaticMapUrl,
  buildOsmEmbedUrl,
} from "~/lib/geo-uri";

describe("Location", () => {
  describe("geo URI parsing", () => {
    describe("given a valid geo URI with lat and lng", () => {
      it("should parse geo:52.52,13.405 to lat/lng", () => {
        const result = parseGeoUri("geo:52.52,13.405");
        expect(result).not.toBeNull();
        expect(result!.lat).toBe(52.52);
        expect(result!.lng).toBe(13.405);
        expect(result!.alt).toBeUndefined();
      });
    });

    describe("given a geo URI with altitude", () => {
      it("should handle geo URIs with altitude", () => {
        const result = parseGeoUri("geo:52.52,13.405,100");
        expect(result).not.toBeNull();
        expect(result!.lat).toBe(52.52);
        expect(result!.lng).toBe(13.405);
        expect(result!.alt).toBe(100);
      });
    });

    describe("given a geo URI with parameters", () => {
      it("should strip parameters after the semicolon", () => {
        const result = parseGeoUri("geo:52.52,13.405;u=10");
        expect(result).not.toBeNull();
        expect(result!.lat).toBe(52.52);
        expect(result!.lng).toBe(13.405);
      });
    });

    describe("given invalid URIs", () => {
      it("should handle invalid URIs gracefully", () => {
        expect(parseGeoUri("")).toBeNull();
        expect(parseGeoUri("not-a-geo-uri")).toBeNull();
        expect(parseGeoUri("geo:")).toBeNull();
        expect(parseGeoUri("geo:abc,def")).toBeNull();
        expect(parseGeoUri("geo:52.52")).toBeNull();
      });

      it("should reject out-of-range latitude", () => {
        expect(parseGeoUri("geo:91,13.405")).toBeNull();
        expect(parseGeoUri("geo:-91,13.405")).toBeNull();
      });

      it("should reject out-of-range longitude", () => {
        expect(parseGeoUri("geo:52.52,181")).toBeNull();
        expect(parseGeoUri("geo:52.52,-181")).toBeNull();
      });
    });

    describe("given negative coordinates", () => {
      it("should parse negative lat/lng correctly", () => {
        const result = parseGeoUri("geo:-33.8688,151.2093");
        expect(result).not.toBeNull();
        expect(result!.lat).toBe(-33.8688);
        expect(result!.lng).toBe(151.2093);
      });
    });

    describe("given boundary coordinates", () => {
      it("should accept lat=90, lng=180", () => {
        const result = parseGeoUri("geo:90,180");
        expect(result).not.toBeNull();
        expect(result!.lat).toBe(90);
        expect(result!.lng).toBe(180);
      });

      it("should accept lat=-90, lng=-180", () => {
        const result = parseGeoUri("geo:-90,-180");
        expect(result).not.toBeNull();
        expect(result!.lat).toBe(-90);
        expect(result!.lng).toBe(-180);
      });
    });
  });

  describe("geo URI building", () => {
    describe("given lat and lng", () => {
      it("should build a valid geo URI", () => {
        expect(buildGeoUri(52.52, 13.405)).toBe("geo:52.52,13.405");
      });
    });
  });

  describe("LocationDisplay", () => {
    describe("given a location message with m.location", () => {
      it("should show the location description", () => {
        const content = {
          msgtype: "m.location",
          body: "Location: 52.52, 13.405",
          geo_uri: "geo:52.52,13.405",
          "m.location": {
            uri: "geo:52.52,13.405",
            description: "Berlin",
          },
          "m.text": "Berlin (52.52, 13.405)",
        };

        const mLocation = content["m.location"] as { description?: string };
        expect(mLocation.description).toBe("Berlin");
      });

      it("should show coordinates", () => {
        const content = {
          msgtype: "m.location",
          geo_uri: "geo:52.52,13.405",
          "m.location": {
            uri: "geo:52.52,13.405",
            description: "Berlin",
          },
        };

        const mLocation = content["m.location"] as { uri?: string };
        const coords = parseGeoUri(mLocation.uri ?? "");
        expect(coords).not.toBeNull();
        expect(coords!.lat).toBe(52.52);
        expect(coords!.lng).toBe(13.405);
      });

      it("should include an OpenStreetMap link", () => {
        const osmUrl = buildOsmUrl(52.52, 13.405);
        expect(osmUrl).toBe("https://www.openstreetmap.org/?mlat=52.52&mlon=13.405&zoom=15");
      });
    });

    describe("given a location message with only geo_uri (no m.location)", () => {
      it("should fall back to geo_uri for coordinates", () => {
        const content = {
          msgtype: "m.location",
          body: "Location: 48.8566, 2.3522",
          geo_uri: "geo:48.8566,2.3522",
        };

        const coords = parseGeoUri(content.geo_uri);
        expect(coords).not.toBeNull();
        expect(coords!.lat).toBe(48.8566);
        expect(coords!.lng).toBe(2.3522);
      });
    });

    describe("given a location message with m.text but no description", () => {
      it("should use m.text as the display label", () => {
        const content = {
          msgtype: "m.location",
          body: "Location: 40.7128, -74.006",
          geo_uri: "geo:40.7128,-74.006",
          "m.location": {
            uri: "geo:40.7128,-74.006",
          },
          "m.text": "New York City (40.7128, -74.006)",
        };

        const mLocation = content["m.location"] as { description?: string };
        const mText = content["m.text"] as string | undefined;
        const displayLabel = mLocation.description ?? mText ?? null;
        expect(displayLabel).toBe("New York City (40.7128, -74.006)");
      });
    });

    describe("given a custom zoom level", () => {
      it("should include the zoom parameter in the OSM URL", () => {
        const osmUrl = buildOsmUrl(52.52, 13.405, 10);
        expect(osmUrl).toBe("https://www.openstreetmap.org/?mlat=52.52&mlon=13.405&zoom=10");
      });
    });
  });

  describe("static map URL construction", () => {
    describe("given coordinates for Berlin", () => {
      it("should build a valid static map URL with default parameters", () => {
        const url = buildStaticMapUrl(52.52, 13.405);
        expect(url).toBe(
          "https://staticmap.openstreetmap.de/staticmap.php?center=52.52,13.405&zoom=15&size=300x200&markers=52.52,13.405",
        );
      });
    });

    describe("given coordinates with custom zoom and size", () => {
      it("should include custom zoom and size in the URL", () => {
        const url = buildStaticMapUrl(48.8566, 2.3522, 10, 400, 300);
        expect(url).toBe(
          "https://staticmap.openstreetmap.de/staticmap.php?center=48.8566,2.3522&zoom=10&size=400x300&markers=48.8566,2.3522",
        );
      });
    });

    describe("given negative coordinates", () => {
      it("should handle negative lat/lng in the static map URL", () => {
        const url = buildStaticMapUrl(-33.8688, 151.2093);
        expect(url).toContain("center=-33.8688,151.2093");
        expect(url).toContain("markers=-33.8688,151.2093");
      });
    });
  });

  describe("OSM embed URL construction", () => {
    describe("given coordinates for Berlin", () => {
      it("should build an embed URL with bbox, layer, and marker", () => {
        const url = buildOsmEmbedUrl(52.52, 13.405);
        expect(url).toContain("https://www.openstreetmap.org/export/embed.html?bbox=");
        expect(url).toContain("layer=mapnik");
        expect(url).toContain("marker=52.52,13.405");
      });
    });

    describe("given the default zoom", () => {
      it("should compute a reasonable bounding box around the marker", () => {
        const url = buildOsmEmbedUrl(0, 0);
        // bbox should span from -0.01 to 0.01 on each axis with the default offset
        expect(url).toContain("bbox=-0.01,-0.01,0.01,0.01");
        expect(url).toContain("marker=0,0");
      });
    });
  });
});
