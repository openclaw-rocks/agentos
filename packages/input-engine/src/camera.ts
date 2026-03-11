export interface CameraConfig {
  maxFileSizeMB?: number;
  allowedFormats?: string[];
  preferredCamera?: "front" | "back";
}

export interface CaptureResult {
  file: File;
  previewUrl: string;
  width: number;
  height: number;
  mimeType: string;
  sizeBytes: number;
}

export interface UploadedImage {
  mxcUrl: string;
  mimeType: string;
  width: number;
  height: number;
  sizeBytes: number;
  thumbnailUrl?: string;
}

const DEFAULT_MAX_FILE_SIZE_MB = 10;
const DEFAULT_ALLOWED_FORMATS = ["image/jpeg", "image/png", "image/webp", "image/heic"];

/** Validate a file for camera upload */
export function validateImageFile(
  file: File,
  config?: CameraConfig,
): { valid: boolean; error?: string } {
  const maxSizeMB = config?.maxFileSizeMB ?? DEFAULT_MAX_FILE_SIZE_MB;
  const allowedFormats = config?.allowedFormats ?? DEFAULT_ALLOWED_FORMATS;

  const maxSizeBytes = maxSizeMB * 1024 * 1024;
  if (file.size > maxSizeBytes) {
    return {
      valid: false,
      error: `File size ${(file.size / (1024 * 1024)).toFixed(1)}MB exceeds maximum ${maxSizeMB}MB`,
    };
  }

  if (!allowedFormats.includes(file.type)) {
    return {
      valid: false,
      error: `File type "${file.type}" is not allowed. Accepted: ${allowedFormats.join(", ")}`,
    };
  }

  return { valid: true };
}

/** Create a preview URL from a file */
export function createPreviewUrl(file: File): string {
  if (typeof URL !== "undefined" && typeof URL.createObjectURL === "function") {
    return URL.createObjectURL(file);
  }
  return "";
}

/** Build the Matrix m.image event content for uploading */
export function buildImageEventContent(
  image: UploadedImage,
  body?: string,
): Record<string, unknown> {
  const content: Record<string, unknown> = {
    msgtype: "m.image",
    body: body ?? "image",
    url: image.mxcUrl,
    info: {
      mimetype: image.mimeType,
      w: image.width,
      h: image.height,
      size: image.sizeBytes,
    },
  };

  if (image.thumbnailUrl) {
    (content["info"] as Record<string, unknown>)["thumbnail_url"] = image.thumbnailUrl;
  }

  return content;
}

/** Detect if the platform supports camera capture */
export function isCameraCaptureSupported(): boolean {
  if (typeof navigator === "undefined") {
    return false;
  }
  return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
}

/** Get accepted file input string for <input accept="..."> */
export function getAcceptedFormats(config?: CameraConfig): string {
  const formats = config?.allowedFormats ?? DEFAULT_ALLOWED_FORMATS;
  return formats.join(",");
}
