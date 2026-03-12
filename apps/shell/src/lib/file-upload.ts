import type { MatrixClient } from "matrix-js-sdk";

export interface FileInfo {
  mimetype: string;
  size: number;
  w?: number;
  h?: number;
}

export interface UploadResult {
  mxcUrl: string;
  info: FileInfo;
  msgtype: string;
  filename: string;
}

/**
 * Determine the Matrix msgtype for a given MIME type.
 */
export function detectMsgtype(mimetype: string): string {
  if (mimetype.startsWith("image/")) return "m.image";
  if (mimetype.startsWith("video/")) return "m.video";
  if (mimetype.startsWith("audio/")) return "m.audio";
  return "m.file";
}

/**
 * Get image dimensions by loading the file into an Image element.
 * Only works for image/* MIME types in a browser context.
 */
function getImageDimensions(file: File): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ w: img.naturalWidth, h: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load image for dimension detection"));
    };
    img.src = url;
  });
}

/**
 * Convert an mxc:// URL to an HTTPS URL using the homeserver base URL.
 */
export function mxcToHttpUrl(mxcUrl: string, homeserverUrl: string): string | null {
  if (!mxcUrl.startsWith("mxc://")) return null;
  const stripped = mxcUrl.slice("mxc://".length);
  const slashIdx = stripped.indexOf("/");
  if (slashIdx === -1) return null;
  const serverName = stripped.slice(0, slashIdx);
  const mediaId = stripped.slice(slashIdx + 1);
  const base = homeserverUrl.replace(/\/$/, "");
  return `${base}/_matrix/media/v3/download/${serverName}/${mediaId}`;
}

/**
 * Format a file size in bytes into a human-readable string.
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export interface UploadProgress {
  loaded: number;
  total: number;
}

/**
 * Upload a file to the Matrix content repository and return the mxc URL
 * along with file metadata.
 */
export async function uploadFile(
  client: MatrixClient,
  file: File,
  onProgress?: (progress: UploadProgress) => void,
): Promise<UploadResult> {
  const mimetype = file.type || "application/octet-stream";
  const msgtype = detectMsgtype(mimetype);

  const info: FileInfo = {
    mimetype,
    size: file.size,
  };

  // For images, get dimensions before uploading
  if (msgtype === "m.image") {
    try {
      const dims = await getImageDimensions(file);
      info.w = dims.w;
      info.h = dims.h;
    } catch {
      // Dimensions are optional; continue without them
    }
  }

  const response = await client.uploadContent(file, {
    name: file.name,
    type: mimetype,
    progressHandler: onProgress
      ? (progress: { loaded: number; total: number }) => {
          onProgress({ loaded: progress.loaded, total: progress.total });
        }
      : undefined,
  });

  return {
    mxcUrl: response.content_uri,
    info,
    msgtype,
    filename: file.name,
  };
}

/**
 * Build the Matrix event content for a media message.
 */
export function buildMediaContent(result: UploadResult): Record<string, unknown> {
  const content: Record<string, unknown> = {
    msgtype: result.msgtype,
    body: result.filename,
    url: result.mxcUrl,
    info: { ...result.info },
  };

  if (result.msgtype === "m.file") {
    (content.info as Record<string, unknown>).filename = result.filename;
  }

  return content;
}
