export interface FileConfig {
  maxFileSizeMB?: number;
  allowedMimeTypes?: string[];
}

export type FileCategory =
  | "image"
  | "pdf"
  | "spreadsheet"
  | "code"
  | "text"
  | "audio"
  | "video"
  | "archive"
  | "unknown";

export interface FileAnalysis {
  name: string;
  mimeType: string;
  category: FileCategory;
  sizeBytes: number;
  extension: string;
}

export interface UploadedFile {
  mxcUrl: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  category: FileCategory;
}

const DEFAULT_MAX_FILE_SIZE_MB = 50;

const IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/svg+xml",
  "image/heic",
  "image/bmp",
  "image/tiff",
];

const PDF_TYPES = ["application/pdf"];

const SPREADSHEET_TYPES = [
  "text/csv",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.oasis.opendocument.spreadsheet",
];

const CODE_TYPES = [
  "text/javascript",
  "application/javascript",
  "text/typescript",
  "application/typescript",
  "text/x-python",
  "application/x-python",
  "text/x-java",
  "text/x-c",
  "text/x-c++",
  "text/x-rust",
  "text/x-go",
  "text/html",
  "text/css",
  "application/json",
  "application/xml",
  "text/xml",
  "text/x-yaml",
  "application/x-yaml",
  "text/x-markdown",
  "text/x-shellscript",
];

const CODE_EXTENSIONS = [
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".py",
  ".java",
  ".c",
  ".cpp",
  ".h",
  ".hpp",
  ".rs",
  ".go",
  ".rb",
  ".php",
  ".swift",
  ".kt",
  ".scala",
  ".sh",
  ".bash",
  ".zsh",
  ".yaml",
  ".yml",
  ".json",
  ".xml",
  ".html",
  ".css",
  ".scss",
  ".less",
  ".sql",
  ".md",
  ".toml",
  ".ini",
  ".cfg",
];

const TEXT_TYPES = ["text/plain", "text/rtf", "text/richtext"];

const AUDIO_TYPES = [
  "audio/mpeg",
  "audio/ogg",
  "audio/wav",
  "audio/webm",
  "audio/aac",
  "audio/flac",
  "audio/mp4",
];

const VIDEO_TYPES = [
  "video/mp4",
  "video/webm",
  "video/ogg",
  "video/quicktime",
  "video/x-msvideo",
  "video/x-matroska",
];

const ARCHIVE_TYPES = [
  "application/zip",
  "application/x-tar",
  "application/gzip",
  "application/x-gzip",
  "application/x-bzip2",
  "application/x-7z-compressed",
  "application/x-rar-compressed",
  "application/vnd.rar",
];

const AGENT_PROCESSABLE_TYPES = [
  ...TEXT_TYPES,
  ...IMAGE_TYPES,
  ...PDF_TYPES,
  ...SPREADSHEET_TYPES,
  ...CODE_TYPES,
  "text/csv",
];

/** Categorize a file by MIME type */
export function categorizeFile(mimeType: string): FileCategory {
  if (IMAGE_TYPES.includes(mimeType)) return "image";
  if (PDF_TYPES.includes(mimeType)) return "pdf";
  if (SPREADSHEET_TYPES.includes(mimeType)) return "spreadsheet";
  if (CODE_TYPES.includes(mimeType)) return "code";
  if (TEXT_TYPES.includes(mimeType)) return "text";
  if (AUDIO_TYPES.includes(mimeType)) return "audio";
  if (VIDEO_TYPES.includes(mimeType)) return "video";
  if (ARCHIVE_TYPES.includes(mimeType)) return "archive";
  return "unknown";
}

/** Extract file extension from a filename */
function getExtension(name: string): string {
  const dotIndex = name.lastIndexOf(".");
  if (dotIndex === -1 || dotIndex === name.length - 1) return "";
  return name.slice(dotIndex).toLowerCase();
}

/** Analyze a file and return metadata */
export function analyzeFile(file: File): FileAnalysis {
  const extension = getExtension(file.name);
  let category = categorizeFile(file.type);

  // Fallback: if MIME type is unknown, try to categorize by extension
  if (category === "unknown" && extension) {
    if (CODE_EXTENSIONS.includes(extension)) {
      category = "code";
    }
  }

  return {
    name: file.name,
    mimeType: file.type,
    category,
    sizeBytes: file.size,
    extension,
  };
}

/** Validate a file for upload */
export function validateFile(file: File, config?: FileConfig): { valid: boolean; error?: string } {
  const maxSizeMB = config?.maxFileSizeMB ?? DEFAULT_MAX_FILE_SIZE_MB;
  const maxSizeBytes = maxSizeMB * 1024 * 1024;

  if (file.size > maxSizeBytes) {
    return {
      valid: false,
      error: `File size ${(file.size / (1024 * 1024)).toFixed(1)}MB exceeds maximum ${maxSizeMB}MB`,
    };
  }

  if (config?.allowedMimeTypes && config.allowedMimeTypes.length > 0) {
    if (!config.allowedMimeTypes.includes(file.type)) {
      return {
        valid: false,
        error: `File type "${file.type}" is not allowed. Accepted: ${config.allowedMimeTypes.join(", ")}`,
      };
    }
  }

  return { valid: true };
}

/** Build Matrix event content for a file upload (m.file or m.image based on category) */
export function buildFileEventContent(uploaded: UploadedFile): Record<string, unknown> {
  const isImage = uploaded.category === "image";

  return {
    msgtype: isImage ? "m.image" : "m.file",
    body: uploaded.name,
    url: uploaded.mxcUrl,
    info: {
      mimetype: uploaded.mimeType,
      size: uploaded.sizeBytes,
    },
  };
}

/** Get human-readable file size string */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/** Check if a MIME type is processable by agents */
export function isAgentProcessable(mimeType: string): boolean {
  return AGENT_PROCESSABLE_TYPES.includes(mimeType);
}
