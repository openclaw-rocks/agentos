import React, { useState, useEffect, useCallback, useRef } from "react";
import { formatFileSize } from "~/lib/file-upload";

interface MediaInfo {
  w?: number;
  h?: number;
  size?: number;
  mimetype?: string;
  duration?: number;
}

interface ImageLightboxProps {
  mediaUrl: string;
  fileName?: string;
  mediaType?: "image" | "video";
  info?: MediaInfo;
  onClose: () => void;
}

/**
 * Full-screen media viewer overlay.
 * Supports images (with zoom toggle) and videos (with native controls).
 * Close via backdrop click, close button, or Escape key.
 */
export function ImageLightbox({
  mediaUrl,
  fileName,
  mediaType = "image",
  info,
  onClose,
}: ImageLightboxProps): React.JSX.Element {
  const [zoomed, setZoomed] = useState(false);
  const [naturalDimensions, setNaturalDimensions] = useState<{
    w: number;
    h: number;
  } | null>(null);
  const backdropRef = useRef<HTMLDivElement>(null);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Lock body scroll while lightbox is open
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === backdropRef.current) {
        onClose();
      }
    },
    [onClose],
  );

  const handleImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    setNaturalDimensions({ w: img.naturalWidth, h: img.naturalHeight });
  }, []);

  const toggleZoom = useCallback(() => {
    setZoomed((prev) => !prev);
  }, []);

  const handleDownload = useCallback((): void => {
    const link = document.createElement("a");
    link.href = mediaUrl;
    link.download = fileName ?? "download";
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [mediaUrl, fileName]);

  // Resolve display dimensions: prefer natural dimensions from loaded image,
  // fall back to info from Matrix event
  const displayDimensions =
    naturalDimensions ?? (info?.w && info?.h ? { w: info.w, h: info.h } : null);

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center"
      onClick={handleBackdropClick}
    >
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 text-primary/80 hover:text-primary transition-colors z-10 p-2"
        title="Close"
      >
        <svg
          className="w-6 h-6"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      {/* Download button */}
      <button
        onClick={handleDownload}
        className="absolute bottom-4 right-4 text-primary/80 hover:text-primary transition-colors z-10 p-2 flex items-center gap-2"
        title="Download"
      >
        <svg
          className="w-5 h-5"
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
        <span className="text-sm">Download</span>
      </button>

      {/* Media info (bottom-left) */}
      <div className="absolute bottom-4 left-4 z-10 text-primary/70 text-xs space-y-0.5">
        {fileName && (
          <p className="text-primary/90 text-sm font-medium truncate max-w-xs">{fileName}</p>
        )}
        {displayDimensions && (
          <p>
            {displayDimensions.w} x {displayDimensions.h}
          </p>
        )}
        {info?.size != null && <p>{formatFileSize(info.size)}</p>}
        {info?.mimetype && <p>{info.mimetype}</p>}
      </div>

      {/* Media content */}
      {mediaType === "video" ? (
        <video
          src={mediaUrl}
          controls
          autoPlay
          className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg"
        />
      ) : (
        <img
          src={mediaUrl}
          alt={fileName ?? "Image"}
          onLoad={handleImageLoad}
          onClick={toggleZoom}
          className={`rounded-lg transition-transform duration-200 ${
            zoomed
              ? "max-w-none max-h-none cursor-zoom-out"
              : "max-w-[90vw] max-h-[90vh] object-contain cursor-zoom-in"
          }`}
          style={zoomed ? { transform: "scale(1)", width: "auto", height: "auto" } : undefined}
        />
      )}

      {/* Zoom hint for images */}
      {mediaType === "image" && (
        <div className="absolute top-4 left-4 z-10 text-primary/50 text-xs">
          {zoomed ? "Click image to fit" : "Click image to zoom"}
        </div>
      )}
    </div>
  );
}
