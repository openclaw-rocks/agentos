import { describe, it, expect } from "vitest";
import {
  categorizeFile,
  analyzeFile,
  validateFile,
  buildFileEventContent,
  formatFileSize,
  isAgentProcessable,
} from "./file.js";
import type { UploadedFile } from "./file.js";

function makeFile(name: string, size: number, type: string): File {
  const buffer = new ArrayBuffer(size);
  return new File([buffer], name, { type });
}

describe("categorizeFile", () => {
  describe("given an image MIME type", () => {
    describe("when categorizing", () => {
      it("then it should return 'image' for image/jpeg", () => {
        expect(categorizeFile("image/jpeg")).toBe("image");
      });

      it("then it should return 'image' for image/png", () => {
        expect(categorizeFile("image/png")).toBe("image");
      });

      it("then it should return 'image' for image/webp", () => {
        expect(categorizeFile("image/webp")).toBe("image");
      });
    });
  });

  describe("given a PDF MIME type", () => {
    describe("when categorizing", () => {
      it("then it should return 'pdf'", () => {
        expect(categorizeFile("application/pdf")).toBe("pdf");
      });
    });
  });

  describe("given a spreadsheet MIME type", () => {
    describe("when categorizing", () => {
      it("then it should return 'spreadsheet' for text/csv", () => {
        expect(categorizeFile("text/csv")).toBe("spreadsheet");
      });

      it("then it should return 'spreadsheet' for xlsx", () => {
        expect(
          categorizeFile("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
        ).toBe("spreadsheet");
      });
    });
  });

  describe("given a code MIME type", () => {
    describe("when categorizing", () => {
      it("then it should return 'code' for text/javascript", () => {
        expect(categorizeFile("text/javascript")).toBe("code");
      });

      it("then it should return 'code' for application/json", () => {
        expect(categorizeFile("application/json")).toBe("code");
      });

      it("then it should return 'code' for text/x-python", () => {
        expect(categorizeFile("text/x-python")).toBe("code");
      });
    });
  });

  describe("given a text MIME type", () => {
    describe("when categorizing", () => {
      it("then it should return 'text' for text/plain", () => {
        expect(categorizeFile("text/plain")).toBe("text");
      });
    });
  });

  describe("given an audio MIME type", () => {
    describe("when categorizing", () => {
      it("then it should return 'audio' for audio/mpeg", () => {
        expect(categorizeFile("audio/mpeg")).toBe("audio");
      });
    });
  });

  describe("given a video MIME type", () => {
    describe("when categorizing", () => {
      it("then it should return 'video' for video/mp4", () => {
        expect(categorizeFile("video/mp4")).toBe("video");
      });
    });
  });

  describe("given an archive MIME type", () => {
    describe("when categorizing", () => {
      it("then it should return 'archive' for application/zip", () => {
        expect(categorizeFile("application/zip")).toBe("archive");
      });
    });
  });

  describe("given an unknown MIME type", () => {
    describe("when categorizing", () => {
      it("then it should return 'unknown'", () => {
        expect(categorizeFile("application/octet-stream")).toBe("unknown");
      });
    });
  });
});

describe("analyzeFile", () => {
  describe("given a JPEG image file", () => {
    describe("when analyzing", () => {
      it("then it should return the correct name", () => {
        const file = makeFile("photo.jpg", 2048, "image/jpeg");
        const analysis = analyzeFile(file);
        expect(analysis.name).toBe("photo.jpg");
      });

      it("then it should return the correct mimeType", () => {
        const file = makeFile("photo.jpg", 2048, "image/jpeg");
        const analysis = analyzeFile(file);
        expect(analysis.mimeType).toBe("image/jpeg");
      });

      it("then it should return category 'image'", () => {
        const file = makeFile("photo.jpg", 2048, "image/jpeg");
        const analysis = analyzeFile(file);
        expect(analysis.category).toBe("image");
      });

      it("then it should return the correct sizeBytes", () => {
        const file = makeFile("photo.jpg", 2048, "image/jpeg");
        const analysis = analyzeFile(file);
        expect(analysis.sizeBytes).toBe(2048);
      });

      it("then it should return the correct extension", () => {
        const file = makeFile("photo.jpg", 2048, "image/jpeg");
        const analysis = analyzeFile(file);
        expect(analysis.extension).toBe(".jpg");
      });
    });
  });

  describe("given a file with no extension", () => {
    describe("when analyzing", () => {
      it("then it should return an empty extension", () => {
        const file = makeFile("Makefile", 512, "text/plain");
        const analysis = analyzeFile(file);
        expect(analysis.extension).toBe("");
      });
    });
  });
});

describe("validateFile", () => {
  describe("given a valid file within default size limits", () => {
    describe("when validated with default config", () => {
      it("then it should return valid: true", () => {
        const file = makeFile("doc.pdf", 5 * 1024 * 1024, "application/pdf");
        const result = validateFile(file);
        expect(result.valid).toBe(true);
        expect(result.error).toBeUndefined();
      });
    });
  });

  describe("given a file that exceeds the default size limit", () => {
    describe("when validated with default config (50MB limit)", () => {
      it("then it should return valid: false with size error", () => {
        const file = makeFile("huge.zip", 51 * 1024 * 1024, "application/zip");
        const result = validateFile(file);
        expect(result.valid).toBe(false);
        expect(result.error).toContain("exceeds maximum");
        expect(result.error).toContain("50MB");
      });
    });
  });

  describe("given a file with a restricted MIME type", () => {
    describe("when validated with allowedMimeTypes config", () => {
      it("then it should return valid: false", () => {
        const file = makeFile("archive.zip", 1024, "application/zip");
        const result = validateFile(file, {
          allowedMimeTypes: ["application/pdf", "text/plain"],
        });
        expect(result.valid).toBe(false);
        expect(result.error).toContain("not allowed");
      });
    });
  });

  describe("given a file matching the allowed MIME type", () => {
    describe("when validated with allowedMimeTypes config", () => {
      it("then it should return valid: true", () => {
        const file = makeFile("readme.txt", 1024, "text/plain");
        const result = validateFile(file, {
          allowedMimeTypes: ["text/plain"],
        });
        expect(result.valid).toBe(true);
      });
    });
  });
});

describe("buildFileEventContent", () => {
  describe("given an uploaded image file", () => {
    describe("when building event content", () => {
      it("then it should use msgtype m.image", () => {
        const uploaded: UploadedFile = {
          mxcUrl: "mxc://example.com/img123",
          name: "photo.png",
          mimeType: "image/png",
          sizeBytes: 4096,
          category: "image",
        };
        const content = buildFileEventContent(uploaded);
        expect(content["msgtype"]).toBe("m.image");
      });
    });
  });

  describe("given an uploaded PDF file", () => {
    describe("when building event content", () => {
      it("then it should use msgtype m.file", () => {
        const uploaded: UploadedFile = {
          mxcUrl: "mxc://example.com/doc456",
          name: "report.pdf",
          mimeType: "application/pdf",
          sizeBytes: 102400,
          category: "pdf",
        };
        const content = buildFileEventContent(uploaded);
        expect(content["msgtype"]).toBe("m.file");
      });

      it("then it should include the file name as body", () => {
        const uploaded: UploadedFile = {
          mxcUrl: "mxc://example.com/doc456",
          name: "report.pdf",
          mimeType: "application/pdf",
          sizeBytes: 102400,
          category: "pdf",
        };
        const content = buildFileEventContent(uploaded);
        expect(content["body"]).toBe("report.pdf");
      });

      it("then it should include the mxc URL", () => {
        const uploaded: UploadedFile = {
          mxcUrl: "mxc://example.com/doc456",
          name: "report.pdf",
          mimeType: "application/pdf",
          sizeBytes: 102400,
          category: "pdf",
        };
        const content = buildFileEventContent(uploaded);
        expect(content["url"]).toBe("mxc://example.com/doc456");
      });

      it("then it should include mime type and size in info", () => {
        const uploaded: UploadedFile = {
          mxcUrl: "mxc://example.com/doc456",
          name: "report.pdf",
          mimeType: "application/pdf",
          sizeBytes: 102400,
          category: "pdf",
        };
        const content = buildFileEventContent(uploaded);
        const info = content["info"] as Record<string, unknown>;
        expect(info["mimetype"]).toBe("application/pdf");
        expect(info["size"]).toBe(102400);
      });
    });
  });
});

describe("formatFileSize", () => {
  describe("given a size in bytes", () => {
    describe("when formatting", () => {
      it("then it should display bytes for values under 1024", () => {
        expect(formatFileSize(512)).toBe("512 B");
      });

      it("then it should display KB for values under 1MB", () => {
        expect(formatFileSize(1536)).toBe("1.5 KB");
      });

      it("then it should display MB for values under 1GB", () => {
        expect(formatFileSize(5 * 1024 * 1024)).toBe("5.0 MB");
      });

      it("then it should display GB for values 1GB or above", () => {
        expect(formatFileSize(2 * 1024 * 1024 * 1024)).toBe("2.0 GB");
      });
    });
  });
});

describe("isAgentProcessable", () => {
  describe("given a processable MIME type", () => {
    describe("when checking text/plain", () => {
      it("then it should return true", () => {
        expect(isAgentProcessable("text/plain")).toBe(true);
      });
    });

    describe("when checking image/png", () => {
      it("then it should return true", () => {
        expect(isAgentProcessable("image/png")).toBe(true);
      });
    });

    describe("when checking application/pdf", () => {
      it("then it should return true", () => {
        expect(isAgentProcessable("application/pdf")).toBe(true);
      });
    });

    describe("when checking text/csv", () => {
      it("then it should return true", () => {
        expect(isAgentProcessable("text/csv")).toBe(true);
      });
    });
  });

  describe("given a non-processable MIME type", () => {
    describe("when checking application/octet-stream", () => {
      it("then it should return false", () => {
        expect(isAgentProcessable("application/octet-stream")).toBe(false);
      });
    });

    describe("when checking application/zip", () => {
      it("then it should return false", () => {
        expect(isAgentProcessable("application/zip")).toBe(false);
      });
    });
  });
});
