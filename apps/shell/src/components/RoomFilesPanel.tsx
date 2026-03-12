import type { Room } from "matrix-js-sdk";
import React, { useMemo, useState, useCallback } from "react";
import { formatFileSize } from "~/lib/file-upload";
import { mxcToHttpUrl } from "~/lib/media";

interface RoomFilesPanelProps {
  room: Room;
  homeserverUrl: string;
}

type FileCategory = "images" | "videos" | "audio" | "files";

interface FileEntry {
  eventId: string;
  sender: string;
  senderName: string;
  timestamp: number;
  msgtype: string;
  body: string;
  url: string;
  info: {
    size?: number;
    mimetype?: string;
    w?: number;
    h?: number;
  };
}

const CATEGORY_CONFIG: Record<
  FileCategory,
  { label: string; msgtypes: string[]; icon: React.JSX.Element }
> = {
  images: {
    label: "Images",
    msgtypes: ["m.image"],
    icon: (
      <svg
        className="w-4 h-4"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M2.25 18V6a2.25 2.25 0 012.25-2.25h15A2.25 2.25 0 0121.75 6v12A2.25 2.25 0 0119.5 20.25H4.5A2.25 2.25 0 012.25 18z"
        />
      </svg>
    ),
  },
  videos: {
    label: "Videos",
    msgtypes: ["m.video"],
    icon: (
      <svg
        className="w-4 h-4"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25z"
        />
      </svg>
    ),
  },
  audio: {
    label: "Audio",
    msgtypes: ["m.audio"],
    icon: (
      <svg
        className="w-4 h-4"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M9 9l10.5-3m0 6.553v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 11-.99-3.467l2.31-.66a2.25 2.25 0 001.632-2.163zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 01-.99-3.467l2.31-.66A2.25 2.25 0 009 15.553z"
        />
      </svg>
    ),
  },
  files: {
    label: "Files",
    msgtypes: ["m.file"],
    icon: (
      <svg
        className="w-4 h-4"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
        />
      </svg>
    ),
  },
};

const CATEGORY_ORDER: FileCategory[] = ["images", "videos", "files", "audio"];

function extractFileEvents(room: Room): FileEntry[] {
  const events = room.getLiveTimeline().getEvents();
  const fileEvents: FileEntry[] = [];

  for (const event of events) {
    const content = event.getContent() as Record<string, unknown>;
    const msgtype = content?.msgtype as string | undefined;

    if (!msgtype || !["m.image", "m.video", "m.audio", "m.file"].includes(msgtype)) {
      continue;
    }

    const url = content.url as string | undefined;
    if (!url) continue;

    const sender = event.getSender() ?? "";
    const member = room.getMember(sender);
    const info = (content.info ?? {}) as FileEntry["info"];

    fileEvents.push({
      eventId: event.getId() ?? "",
      sender,
      senderName: member?.name ?? sender,
      timestamp: event.getTs(),
      msgtype,
      body: (content.body as string) ?? "Untitled",
      url,
      info,
    });
  }

  // Reverse chronological order
  fileEvents.sort((a, b) => b.timestamp - a.timestamp);
  return fileEvents;
}

function categorizeFiles(files: FileEntry[]): Record<FileCategory, FileEntry[]> {
  const result: Record<FileCategory, FileEntry[]> = {
    images: [],
    videos: [],
    audio: [],
    files: [],
  };

  for (const file of files) {
    switch (file.msgtype) {
      case "m.image":
        result.images.push(file);
        break;
      case "m.video":
        result.videos.push(file);
        break;
      case "m.audio":
        result.audio.push(file);
        break;
      case "m.file":
        result.files.push(file);
        break;
    }
  }

  return result;
}

function FileItem({
  file,
  homeserverUrl,
  isImage,
}: {
  file: FileEntry;
  homeserverUrl: string;
  isImage: boolean;
}): React.JSX.Element {
  const httpUrl = mxcToHttpUrl(file.url, homeserverUrl);
  const thumbnailUrl = isImage ? mxcToHttpUrl(file.url, homeserverUrl, 80, 80) : null;

  const dateStr = new Date(file.timestamp).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-surface-2 transition-colors group">
      {/* Thumbnail or icon */}
      <div className="w-10 h-10 rounded-lg bg-surface-3 flex items-center justify-center flex-shrink-0 overflow-hidden">
        {thumbnailUrl ? (
          <img
            src={thumbnailUrl}
            alt={file.body}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <svg
            className="w-5 h-5 text-muted"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
            />
          </svg>
        )}
      </div>

      {/* File info */}
      <div className="min-w-0 flex-1">
        <p className="text-xs text-primary truncate" title={file.body}>
          {file.body}
        </p>
        <p className="text-[10px] text-muted">
          {file.senderName} &middot; {dateStr}
          {file.info.size != null && ` \u00B7 ${formatFileSize(file.info.size)}`}
        </p>
      </div>

      {/* Download button */}
      {httpUrl && (
        <a
          href={httpUrl}
          target="_blank"
          rel="noopener noreferrer"
          download={file.body}
          className="p-1.5 text-muted hover:text-secondary hover:bg-surface-3 rounded transition-colors opacity-0 group-hover:opacity-100 flex-shrink-0"
          title="Download"
        >
          <svg
            className="w-3.5 h-3.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"
            />
          </svg>
        </a>
      )}
    </div>
  );
}

export function RoomFilesPanel({ room, homeserverUrl }: RoomFilesPanelProps): React.JSX.Element {
  const [expandedCategory, setExpandedCategory] = useState<FileCategory | null>("images");

  const allFiles = useMemo(() => extractFileEvents(room), [room]);
  const categorized = useMemo(() => categorizeFiles(allFiles), [allFiles]);

  const toggleCategory = useCallback((category: FileCategory) => {
    setExpandedCategory((prev) => (prev === category ? null : category));
  }, []);

  if (allFiles.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <svg
          className="w-10 h-10 text-faint mb-3"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z"
          />
        </svg>
        <p className="text-sm text-muted">No files shared in this room yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {CATEGORY_ORDER.map((category) => {
        const config = CATEGORY_CONFIG[category];
        const files = categorized[category];
        const isExpanded = expandedCategory === category;

        if (files.length === 0) return null;

        return (
          <div key={category}>
            <button
              onClick={() => toggleCategory(category)}
              className="w-full flex items-center gap-2 px-2 py-1.5 text-xs font-medium text-secondary hover:text-secondary transition-colors"
            >
              {config.icon}
              <span>{config.label}</span>
              <span className="text-faint ml-auto">{files.length}</span>
              <svg
                className={`w-3 h-3 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {isExpanded && (
              <div className="mt-1 space-y-0.5">
                {files.map((file) => (
                  <FileItem
                    key={file.eventId}
                    file={file}
                    homeserverUrl={homeserverUrl}
                    isImage={category === "images"}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
