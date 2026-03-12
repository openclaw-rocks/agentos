import { describe, it, expect } from "vitest";
import { detectMsgtype, mxcToHttpUrl, formatFileSize, buildMediaContent } from "./file-upload";
import type { UploadResult } from "./file-upload";

describe("FileUpload", () => {
  describe("given an image file", () => {
    it("should detect the msgtype as m.image", () => {
      expect(detectMsgtype("image/png")).toBe("m.image");
      expect(detectMsgtype("image/jpeg")).toBe("m.image");
      expect(detectMsgtype("image/gif")).toBe("m.image");
      expect(detectMsgtype("image/webp")).toBe("m.image");
    });

    it("should include width and height in info when building media content", () => {
      const result: UploadResult = {
        mxcUrl: "mxc://example.com/abc123",
        info: { mimetype: "image/png", size: 1024, w: 800, h: 600 },
        msgtype: "m.image",
        filename: "photo.png",
      };
      const content = buildMediaContent(result);
      expect(content.msgtype).toBe("m.image");
      expect(content.url).toBe("mxc://example.com/abc123");
      expect(content.body).toBe("photo.png");
      const info = content.info as Record<string, unknown>;
      expect(info.w).toBe(800);
      expect(info.h).toBe(600);
      expect(info.size).toBe(1024);
      expect(info.mimetype).toBe("image/png");
    });
  });

  describe("given a video file", () => {
    it("should detect the msgtype as m.video", () => {
      expect(detectMsgtype("video/mp4")).toBe("m.video");
      expect(detectMsgtype("video/webm")).toBe("m.video");
      expect(detectMsgtype("video/quicktime")).toBe("m.video");
    });
  });

  describe("given an audio file", () => {
    it("should detect the msgtype as m.audio", () => {
      expect(detectMsgtype("audio/mpeg")).toBe("m.audio");
      expect(detectMsgtype("audio/ogg")).toBe("m.audio");
      expect(detectMsgtype("audio/wav")).toBe("m.audio");
    });
  });

  describe("given a generic file", () => {
    it("should detect the msgtype as m.file", () => {
      expect(detectMsgtype("application/pdf")).toBe("m.file");
      expect(detectMsgtype("application/zip")).toBe("m.file");
      expect(detectMsgtype("text/plain")).toBe("m.file");
      expect(detectMsgtype("application/octet-stream")).toBe("m.file");
    });

    it("should include filename and size in content", () => {
      const result: UploadResult = {
        mxcUrl: "mxc://example.com/def456",
        info: { mimetype: "application/pdf", size: 204800 },
        msgtype: "m.file",
        filename: "document.pdf",
      };
      const content = buildMediaContent(result);
      expect(content.msgtype).toBe("m.file");
      expect(content.body).toBe("document.pdf");
      expect(content.url).toBe("mxc://example.com/def456");
      const info = content.info as Record<string, unknown>;
      expect(info.filename).toBe("document.pdf");
      expect(info.size).toBe(204800);
      expect(info.mimetype).toBe("application/pdf");
    });
  });

  describe("mxc URL conversion", () => {
    it("should convert mxc:// to https:// URL", () => {
      const result = mxcToHttpUrl(
        "mxc://matrix.openclaw.rocks/AbCdEfGhIjKl",
        "https://matrix.openclaw.rocks",
      );
      expect(result).toBe(
        "https://matrix.openclaw.rocks/_matrix/media/v3/download/matrix.openclaw.rocks/AbCdEfGhIjKl",
      );
    });

    it("should strip trailing slash from homeserver URL", () => {
      const result = mxcToHttpUrl("mxc://example.com/media123", "https://example.com/");
      expect(result).toBe("https://example.com/_matrix/media/v3/download/example.com/media123");
    });

    it("should return null for non-mxc URLs", () => {
      expect(mxcToHttpUrl("https://example.com/image.png", "https://example.com")).toBeNull();
    });

    it("should return null for malformed mxc URLs", () => {
      expect(mxcToHttpUrl("mxc://noslash", "https://example.com")).toBeNull();
    });
  });

  describe("formatFileSize", () => {
    it("should format bytes", () => {
      expect(formatFileSize(500)).toBe("500 B");
    });

    it("should format kilobytes", () => {
      expect(formatFileSize(1536)).toBe("1.5 KB");
    });

    it("should format megabytes", () => {
      expect(formatFileSize(2621440)).toBe("2.5 MB");
    });

    it("should format gigabytes", () => {
      expect(formatFileSize(1610612736)).toBe("1.5 GB");
    });
  });
});
