import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  buildCameraConstraints,
  captureFrameFromVideo,
  getAvailableCameras,
  stopMediaStream,
  type FacingMode,
} from "~/lib/camera-capture";

export interface CameraCaptureProps {
  /** Called when the user confirms the captured photo. */
  onCapture: (blob: Blob) => void;
  /** Called when the user closes / cancels the camera modal. */
  onClose: () => void;
}

type CameraState = "preview" | "captured" | "error";

/**
 * Full-screen camera modal.
 *
 * Opens the device camera via `getUserMedia`, renders a live preview, and
 * lets the user take a snapshot, retake it, or send it.
 */
export function CameraCapture({ onCapture, onClose }: CameraCaptureProps): React.ReactElement {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [state, setState] = useState<CameraState>("preview");
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<FacingMode>("user");
  const [hasMultipleCameras, setHasMultipleCameras] = useState(false);

  // Stop active tracks and release the camera.
  const stopStream = useCallback(() => {
    stopMediaStream(streamRef.current);
    streamRef.current = null;
  }, []);

  // Open the camera with the current `facingMode`.
  const openCamera = useCallback(
    async (facing: FacingMode) => {
      stopStream();
      setState("preview");
      setCapturedBlob(null);
      setPreviewDataUrl(null);
      setErrorMessage(null);

      try {
        const constraints = buildCameraConstraints(facing);
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        streamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (err: unknown) {
        const message =
          err instanceof DOMException && err.name === "NotAllowedError"
            ? "Camera permission denied. Please allow camera access in your browser settings."
            : err instanceof DOMException && err.name === "NotFoundError"
              ? "No camera found on this device."
              : err instanceof DOMException && err.name === "NotReadableError"
                ? "Camera is already in use by another application."
                : err instanceof DOMException && err.name === "OverconstrainedError"
                  ? "The requested camera is not available. Try switching cameras."
                  : err instanceof Error
                    ? err.message
                    : "Could not access the camera";
        setErrorMessage(message);
        setState("error");
      }
    },
    [stopStream],
  );

  // On mount: start the camera and detect multiple cameras.
  useEffect(() => {
    openCamera(facingMode);

    getAvailableCameras()
      .then((cams) => {
        setHasMultipleCameras(cams.length > 1);
      })
      .catch(() => {
        // best-effort
      });

    return () => {
      stopStream();
    };
  }, []);

  // Take a snapshot from the live video feed.
  const handleCapture = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;

    try {
      const blob = await captureFrameFromVideo(video);
      if (!blob) {
        setErrorMessage("Failed to capture photo. Please try again.");
        setState("error");
        return;
      }
      setCapturedBlob(blob);

      // Generate a data URL for the still preview.
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreviewDataUrl(reader.result as string);
      };
      reader.readAsDataURL(blob);

      // Pause the video so the user sees the frozen frame.
      video.pause();
      setState("captured");
    } catch {
      setErrorMessage("Failed to capture photo");
      setState("error");
    }
  }, []);

  // Retake: resume the live preview.
  const handleRetake = useCallback(() => {
    setCapturedBlob(null);
    setPreviewDataUrl(null);
    setState("preview");

    if (videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {
        // best-effort
      });
    }
  }, []);

  // Send: pass the blob up and close.
  const handleSend = useCallback(() => {
    if (capturedBlob) {
      onCapture(capturedBlob);
    }
    onClose();
  }, [capturedBlob, onCapture, onClose]);

  // Switch camera: toggle between front and back.
  const handleSwitchCamera = useCallback(() => {
    const next: FacingMode = facingMode === "user" ? "environment" : "user";
    setFacingMode(next);
    openCamera(next);
  }, [facingMode, openCamera]);

  // Close handler: stop stream and call parent.
  const handleClose = useCallback(() => {
    stopStream();
    onClose();
  }, [stopStream, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/90">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3">
        <button
          type="button"
          onClick={handleClose}
          className="p-2 text-primary hover:bg-white/10 rounded-full transition-colors"
          aria-label="Close camera"
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

        {hasMultipleCameras && state === "preview" && (
          <button
            type="button"
            onClick={handleSwitchCamera}
            className="p-2 text-primary hover:bg-white/10 rounded-full transition-colors"
            aria-label="Switch camera"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182M2.985 19.644l3.181-3.182"
              />
            </svg>
          </button>
        )}
      </div>

      {/* Video / captured image / error */}
      <div className="flex-1 flex items-center justify-center overflow-hidden">
        {state === "error" && (
          <div className="text-center px-6">
            <svg
              className="w-12 h-12 mx-auto mb-4 text-red-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
              />
            </svg>
            <p className="text-primary text-sm">{errorMessage}</p>
          </div>
        )}

        {(state === "preview" || state === "captured") && (
          <>
            {/* Live video (hidden when captured and we have a data URL) */}
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={`max-w-full max-h-full object-contain ${state === "captured" && previewDataUrl ? "hidden" : ""}`}
            />
            {/* Static captured image */}
            {state === "captured" && previewDataUrl && (
              <img
                src={previewDataUrl}
                alt="Captured photo"
                className="max-w-full max-h-full object-contain"
              />
            )}
          </>
        )}
      </div>

      {/* Bottom controls */}
      <div className="flex items-center justify-center gap-6 px-4 py-6">
        {state === "preview" && (
          <button
            type="button"
            onClick={handleCapture}
            className="w-16 h-16 rounded-full border-4 border-white bg-white/20 hover:bg-white/40 transition-colors flex items-center justify-center"
            aria-label="Capture photo"
          >
            <span className="block w-12 h-12 rounded-full bg-white" />
          </button>
        )}

        {state === "captured" && (
          <>
            <button
              type="button"
              onClick={handleRetake}
              className="px-5 py-2.5 bg-surface-2 hover:bg-surface-3 text-primary text-sm font-medium rounded-lg transition-colors"
              aria-label="Retake photo"
            >
              Retake
            </button>
            <button
              type="button"
              onClick={handleSend}
              className="px-5 py-2.5 bg-accent hover:bg-accent-hover text-inverse text-sm font-medium rounded-lg transition-colors"
              aria-label="Send photo"
            >
              Send
            </button>
          </>
        )}

        {state === "error" && (
          <button
            type="button"
            onClick={handleClose}
            className="px-5 py-2.5 bg-surface-2 hover:bg-surface-3 text-primary text-sm font-medium rounded-lg transition-colors"
            aria-label="Close"
          >
            Close
          </button>
        )}
      </div>
    </div>
  );
}
