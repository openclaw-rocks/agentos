/** Pure helpers for camera capture functionality. */

export type FacingMode = "user" | "environment";

/**
 * Check whether the browser/webview supports camera capture via getUserMedia.
 */
export function isCameraAvailable(): boolean {
  if (typeof navigator === "undefined") {
    return false;
  }
  return !!(navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === "function");
}

/**
 * Build MediaStreamConstraints for a given camera facing mode.
 */
export function buildCameraConstraints(facingMode: FacingMode): MediaStreamConstraints {
  return {
    video: {
      facingMode,
      width: { ideal: 1920 },
      height: { ideal: 1080 },
    },
    audio: false,
  };
}

/**
 * Capture the current frame from a video element and return it as a Blob.
 * Returns null if the capture fails (e.g. video not ready, zero dimensions).
 */
export async function captureFrameFromVideo(
  video: HTMLVideoElement,
  mimeType: string = "image/jpeg",
  quality: number = 0.92,
): Promise<Blob | null> {
  const { videoWidth, videoHeight } = video;
  if (videoWidth === 0 || videoHeight === 0) {
    return null;
  }

  const canvas = document.createElement("canvas");
  canvas.width = videoWidth;
  canvas.height = videoHeight;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return null;
  }

  ctx.drawImage(video, 0, 0, videoWidth, videoHeight);

  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob(
      (blob) => {
        resolve(blob);
      },
      mimeType,
      quality,
    );
  });
}

export interface CameraDeviceInfo {
  deviceId: string;
  label: string;
}

/**
 * List available video input devices (cameras).
 */
export async function getAvailableCameras(): Promise<CameraDeviceInfo[]> {
  if (!isCameraAvailable()) {
    return [];
  }

  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices
    .filter((d) => d.kind === "videoinput")
    .map((d, index) => ({
      deviceId: d.deviceId,
      label: d.label || `Camera ${index + 1}`,
    }));
}

/**
 * Stop all tracks on a MediaStream (cleanup helper).
 */
export function stopMediaStream(stream: MediaStream | null): void {
  if (!stream) return;
  for (const track of stream.getTracks()) {
    track.stop();
  }
}
