import React, { useState, useEffect } from "react";
import { fetchLinkPreview, type LinkPreviewData } from "~/lib/link-preview";

interface LinkPreviewProps {
  url: string;
  homeserverUrl: string;
  accessToken: string;
}

function LoadingSkeleton(): React.ReactElement {
  return (
    <div className="flex gap-3 p-3 bg-surface-2 border border-border rounded-lg mt-1.5 animate-pulse max-w-md">
      <div className="flex-1 min-w-0 space-y-2">
        <div className="h-3 bg-surface-3 rounded w-1/4" />
        <div className="h-4 bg-surface-3 rounded w-3/4" />
        <div className="h-3 bg-surface-3 rounded w-full" />
      </div>
      <div className="w-20 h-20 bg-surface-3 rounded flex-shrink-0" />
    </div>
  );
}

export function LinkPreview({
  url,
  homeserverUrl,
  accessToken,
}: LinkPreviewProps): React.ReactElement | null {
  const [preview, setPreview] = useState<LinkPreviewData | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;

    fetchLinkPreview(url, homeserverUrl, accessToken).then((result) => {
      if (!cancelled) {
        setPreview(result);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [url, homeserverUrl, accessToken]);

  // Still loading
  if (preview === undefined) {
    return <LoadingSkeleton />;
  }

  // No preview available
  if (preview === null) {
    return null;
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex gap-3 p-3 bg-surface-2 border border-border rounded-lg mt-1.5 max-w-md hover:bg-surface-3 transition-colors no-underline group/preview"
    >
      <div className="flex-1 min-w-0">
        {preview.siteName && (
          <p className="text-[11px] text-muted font-medium truncate mb-0.5">{preview.siteName}</p>
        )}
        {preview.title && (
          <p className="text-sm text-primary font-medium truncate group-hover/preview:text-accent transition-colors">
            {preview.title}
          </p>
        )}
        {preview.description && (
          <p className="text-xs text-secondary mt-0.5 line-clamp-2">{preview.description}</p>
        )}
      </div>
      {preview.imageUrl && (
        <img
          src={preview.imageUrl}
          alt=""
          className="w-20 h-20 rounded object-cover flex-shrink-0"
          onError={(e) => {
            // Hide broken images
            (e.target as HTMLImageElement).style.display = "none";
          }}
        />
      )}
    </a>
  );
}
