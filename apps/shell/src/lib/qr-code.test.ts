import { describe, it, expect } from "vitest";
import { generateQRCodeSVG, makeMatrixRoomQRData, makeMatrixUserQRData } from "./qr-code";

describe("QR Code", () => {
  describe("generateQRCodeSVG", () => {
    describe("given a short string", () => {
      it("should generate valid SVG markup", () => {
        const svg = generateQRCodeSVG("hello", 200);
        expect(svg).toContain("<svg");
        expect(svg).toContain("</svg>");
        expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
      });

      it("should include a white background rect", () => {
        const svg = generateQRCodeSVG("hello", 200);
        expect(svg).toContain('fill="white"');
      });

      it("should include black module paths", () => {
        const svg = generateQRCodeSVG("hello", 200);
        expect(svg).toContain('fill="black"');
        expect(svg).toContain("<path");
      });

      it("should respect the size parameter", () => {
        const svg = generateQRCodeSVG("hello", 300);
        expect(svg).toContain('width="300"');
        expect(svg).toContain('height="300"');
      });
    });

    describe("given a matrix.to URL", () => {
      it("should encode a room URL correctly", () => {
        const url = "https://matrix.to/#/!abc123:matrix.org";
        const svg = generateQRCodeSVG(url, 200);
        expect(svg).toContain("<svg");
        expect(svg).toContain("</svg>");
        expect(svg).toContain("<path");
      });

      it("should encode a user URL correctly", () => {
        const url = "https://matrix.to/#/@user:matrix.org";
        const svg = generateQRCodeSVG(url, 200);
        expect(svg).toContain("<svg");
        expect(svg).toContain("</svg>");
        expect(svg).toContain("<path");
      });
    });

    describe("given default size", () => {
      it("should use 200 as default size", () => {
        const svg = generateQRCodeSVG("test");
        expect(svg).toContain('width="200"');
        expect(svg).toContain('height="200"');
      });
    });

    describe("given an empty string", () => {
      it("should still generate valid SVG", () => {
        const svg = generateQRCodeSVG("", 100);
        expect(svg).toContain("<svg");
        expect(svg).toContain("</svg>");
      });
    });

    describe("given a longer string", () => {
      it("should handle strings up to version 6 capacity", () => {
        const longStr = "A".repeat(100);
        const svg = generateQRCodeSVG(longStr, 200);
        expect(svg).toContain("<svg");
        expect(svg).toContain("</svg>");
      });
    });

    describe("given data too long for supported versions", () => {
      it("should throw an error", () => {
        const tooLong = "A".repeat(200);
        expect(() => generateQRCodeSVG(tooLong, 200)).toThrow(/too long/i);
      });
    });
  });

  describe("makeMatrixRoomQRData", () => {
    describe("given a room ID", () => {
      it("should create a matrix.to URL", () => {
        const data = makeMatrixRoomQRData("!abc123:matrix.org");
        expect(data).toBe("https://matrix.to/#/!abc123%3Amatrix.org");
      });
    });

    describe("given a room alias", () => {
      it("should create a matrix.to URL", () => {
        const data = makeMatrixRoomQRData("#general:matrix.org");
        expect(data).toBe("https://matrix.to/#/%23general%3Amatrix.org");
      });
    });
  });

  describe("makeMatrixUserQRData", () => {
    describe("given a user ID", () => {
      it("should create a matrix.to URL", () => {
        const data = makeMatrixUserQRData("@alice:matrix.org");
        expect(data).toBe("https://matrix.to/#/%40alice%3Amatrix.org");
      });
    });
  });
});
