const AUDIO_INPUT_KEY = "agentOs.audioInput";
const AUDIO_OUTPUT_KEY = "agentOs.audioOutput";
const VIDEO_INPUT_KEY = "agentOs.videoInput";

export interface MediaDeviceInfo {
  deviceId: string;
  label: string;
  kind: "audioinput" | "audiooutput" | "videoinput";
}

export async function getAvailableDevices(): Promise<MediaDeviceInfo[]> {
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices
    .filter(
      (d): d is MediaDeviceInfo & globalThis.MediaDeviceInfo =>
        d.kind === "audioinput" || d.kind === "audiooutput" || d.kind === "videoinput",
    )
    .map((d, index) => ({
      deviceId: d.deviceId,
      label: d.label || `${d.kind} ${index + 1}`,
      kind: d.kind as MediaDeviceInfo["kind"],
    }));
}

export function getSelectedAudioInput(): string | null {
  return localStorage.getItem(AUDIO_INPUT_KEY);
}

export function getSelectedAudioOutput(): string | null {
  return localStorage.getItem(AUDIO_OUTPUT_KEY);
}

export function getSelectedVideoInput(): string | null {
  return localStorage.getItem(VIDEO_INPUT_KEY);
}

export function setSelectedAudioInput(deviceId: string): void {
  localStorage.setItem(AUDIO_INPUT_KEY, deviceId);
}

export function setSelectedAudioOutput(deviceId: string): void {
  localStorage.setItem(AUDIO_OUTPUT_KEY, deviceId);
}

export function setSelectedVideoInput(deviceId: string): void {
  localStorage.setItem(VIDEO_INPUT_KEY, deviceId);
}
