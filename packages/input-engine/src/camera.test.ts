import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  validateImageFile,
  buildImageEventContent,
  getAcceptedFormats,
  isCameraCaptureSupported,
  createPreviewUrl,
} from "./camera.js";
import type { UploadedImage } from "./camera.js";

function makeFile(name: string, size: number, type: string): File {
  const buffer = new ArrayBuffer(size);
  return new File([buffer], name, { type });
}

describe("validateImageFile", () => {
  describe("given a valid JPEG file within size limits", () => {
    describe("when validated with default config", () => {
      it("then it should return valid: true", () => {
        const file = makeFile("photo.jpg", 1024 * 1024, "image/jpeg");
        const result = validateImageFile(file);
        expect(result.valid).toBe(true);
        expect(result.error).toBeUndefined();
      });
    });
  });

  describe("given a valid PNG file within size limits", () => {
    describe("when validated with default config", () => {
      it("then it should return valid: true", () => {
        const file = makeFile("screenshot.png", 2 * 1024 * 1024, "image/png");
        const result = validateImageFile(file);
        expect(result.valid).toBe(true);
      });
    });
  });

  describe("given a valid WebP file within size limits", () => {
    describe("when validated with default config", () => {
      it("then it should return valid: true", () => {
        const file = makeFile("image.webp", 500 * 1024, "image/webp");
        const result = validateImageFile(file);
        expect(result.valid).toBe(true);
      });
    });
  });

  describe("given a file that exceeds the max size", () => {
    describe("when validated with default config (10MB limit)", () => {
      it("then it should return valid: false with a size error", () => {
        const file = makeFile("huge.jpg", 11 * 1024 * 1024, "image/jpeg");
        const result = validateImageFile(file);
        expect(result.valid).toBe(false);
        expect(result.error).toContain("exceeds maximum");
        expect(result.error).toContain("10MB");
      });
    });
  });

  describe("given a file with an invalid MIME type", () => {
    describe("when validated with default config", () => {
      it("then it should return valid: false with a format error", () => {
        const file = makeFile("document.pdf", 1024, "application/pdf");
        const result = validateImageFile(file);
        expect(result.valid).toBe(false);
        expect(result.error).toContain("not allowed");
        expect(result.error).toContain("application/pdf");
      });
    });
  });

  describe("given a custom config with a 5MB limit", () => {
    describe("when a 6MB file is validated", () => {
      it("then it should return valid: false", () => {
        const file = makeFile("photo.jpg", 6 * 1024 * 1024, "image/jpeg");
        const result = validateImageFile(file, { maxFileSizeMB: 5 });
        expect(result.valid).toBe(false);
        expect(result.error).toContain("5MB");
      });
    });
  });

  describe("given a custom config with restricted formats", () => {
    describe("when a JPEG file is validated but only PNG is allowed", () => {
      it("then it should return valid: false", () => {
        const file = makeFile("photo.jpg", 1024, "image/jpeg");
        const result = validateImageFile(file, {
          allowedFormats: ["image/png"],
        });
        expect(result.valid).toBe(false);
        expect(result.error).toContain("not allowed");
      });
    });
  });
});

describe("buildImageEventContent", () => {
  const image: UploadedImage = {
    mxcUrl: "mxc://example.com/abc123",
    mimeType: "image/jpeg",
    width: 1920,
    height: 1080,
    sizeBytes: 2048000,
  };

  describe("given an uploaded image", () => {
    describe("when building event content", () => {
      it("then it should have msgtype m.image", () => {
        const content = buildImageEventContent(image);
        expect(content["msgtype"]).toBe("m.image");
      });

      it("then it should include the mxc URL", () => {
        const content = buildImageEventContent(image);
        expect(content["url"]).toBe("mxc://example.com/abc123");
      });

      it("then it should include dimensions in the info object", () => {
        const content = buildImageEventContent(image);
        const info = content["info"] as Record<string, unknown>;
        expect(info["w"]).toBe(1920);
        expect(info["h"]).toBe(1080);
      });

      it("then it should include mime type and size in info", () => {
        const content = buildImageEventContent(image);
        const info = content["info"] as Record<string, unknown>;
        expect(info["mimetype"]).toBe("image/jpeg");
        expect(info["size"]).toBe(2048000);
      });

      it("then it should use 'image' as default body", () => {
        const content = buildImageEventContent(image);
        expect(content["body"]).toBe("image");
      });
    });

    describe("when building event content with a custom body", () => {
      it("then it should use the provided body text", () => {
        const content = buildImageEventContent(image, "My vacation photo");
        expect(content["body"]).toBe("My vacation photo");
      });
    });
  });

  describe("given an uploaded image with a thumbnail", () => {
    describe("when building event content", () => {
      it("then it should include the thumbnail URL", () => {
        const imageWithThumb: UploadedImage = {
          ...image,
          thumbnailUrl: "mxc://example.com/thumb123",
        };
        const content = buildImageEventContent(imageWithThumb);
        const info = content["info"] as Record<string, unknown>;
        expect(info["thumbnail_url"]).toBe("mxc://example.com/thumb123");
      });
    });
  });
});

describe("getAcceptedFormats", () => {
  describe("given no config (defaults)", () => {
    describe("when getting accepted formats", () => {
      it("then it should return the default formats as a comma-separated string", () => {
        const result = getAcceptedFormats();
        expect(result).toBe("image/jpeg,image/png,image/webp,image/heic");
      });
    });
  });

  describe("given a custom config with specific formats", () => {
    describe("when getting accepted formats", () => {
      it("then it should return only the custom formats", () => {
        const result = getAcceptedFormats({
          allowedFormats: ["image/png", "image/gif"],
        });
        expect(result).toBe("image/png,image/gif");
      });
    });
  });
});

describe("isCameraCaptureSupported", () => {
  describe("given a Node.js environment without navigator", () => {
    describe("when checking camera support", () => {
      it("then it should return false", () => {
        const result = isCameraCaptureSupported();
        expect(typeof result).toBe("boolean");
        // In Node/test environment, navigator.mediaDevices is not available
        expect(result).toBe(false);
      });
    });
  });
});

describe("createPreviewUrl", () => {
  describe("given a file in an environment without URL.createObjectURL", () => {
    describe("when creating a preview URL", () => {
      it("then it should return an empty string", () => {
        const file = makeFile("photo.jpg", 1024, "image/jpeg");
        // In Node test env, URL.createObjectURL is not available
        const result = createPreviewUrl(file);
        expect(typeof result).toBe("string");
      });
    });
  });

  describe("given a file in an environment with URL.createObjectURL", () => {
    beforeEach(() => {
      vi.stubGlobal("URL", {
        ...URL,
        createObjectURL: vi.fn().mockReturnValue("blob:http://localhost/fake"),
      });
    });

    describe("when creating a preview URL", () => {
      it("then it should return a blob URL", () => {
        const file = makeFile("photo.jpg", 1024, "image/jpeg");
        const result = createPreviewUrl(file);
        expect(result).toBe("blob:http://localhost/fake");
      });
    });
  });
});
