import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  getAvailableDevices,
  getSelectedAudioInput,
  getSelectedAudioOutput,
  getSelectedVideoInput,
  setSelectedAudioInput,
  setSelectedAudioOutput,
  setSelectedVideoInput,
  type MediaDeviceInfo,
} from "~/lib/media-devices";

export function VoiceVideoSettings(): React.ReactElement {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [audioInput, setAudioInput] = useState<string>(getSelectedAudioInput() ?? "");
  const [audioOutput, setAudioOutput] = useState<string>(getSelectedAudioOutput() ?? "");
  const [videoInput, setVideoInput] = useState<string>(getSelectedVideoInput() ?? "");
  const [micTesting, setMicTesting] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const [cameraPreview, setCameraPreview] = useState(false);

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number>(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);

  const loadDevices = useCallback(async () => {
    try {
      const available = await getAvailableDevices();
      setDevices(available);

      // Set defaults if no selection stored
      if (!getSelectedAudioInput()) {
        const firstMic = available.find((d) => d.kind === "audioinput");
        if (firstMic) {
          setAudioInput(firstMic.deviceId);
          setSelectedAudioInput(firstMic.deviceId);
        }
      }
      if (!getSelectedAudioOutput()) {
        const firstSpeaker = available.find((d) => d.kind === "audiooutput");
        if (firstSpeaker) {
          setAudioOutput(firstSpeaker.deviceId);
          setSelectedAudioOutput(firstSpeaker.deviceId);
        }
      }
      if (!getSelectedVideoInput()) {
        const firstCam = available.find((d) => d.kind === "videoinput");
        if (firstCam) {
          setVideoInput(firstCam.deviceId);
          setSelectedVideoInput(firstCam.deviceId);
        }
      }
    } catch {
      // Device enumeration may fail if permissions haven't been granted
    }
  }, []);

  useEffect(() => {
    loadDevices();
    return () => {
      stopMicTest();
      stopCameraPreview();
    };
  }, [loadDevices]);

  const handleAudioInputChange = (deviceId: string): void => {
    setAudioInput(deviceId);
    setSelectedAudioInput(deviceId);
    // Restart mic test if active
    if (micTesting) {
      stopMicTest();
      startMicTest(deviceId);
    }
  };

  const handleAudioOutputChange = (deviceId: string): void => {
    setAudioOutput(deviceId);
    setSelectedAudioOutput(deviceId);
  };

  const handleVideoInputChange = (deviceId: string): void => {
    setVideoInput(deviceId);
    setSelectedVideoInput(deviceId);
    // Restart camera preview if active
    if (cameraPreview) {
      stopCameraPreview();
      startCameraPreview(deviceId);
    }
  };

  const startMicTest = async (deviceId?: string): Promise<void> => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { deviceId: { exact: deviceId ?? audioInput } },
      });
      micStreamRef.current = stream;

      const audioCtx = new AudioContext();
      audioContextRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      setMicTesting(true);
      updateMicLevel();
    } catch {
      // Mic access denied or unavailable
    }
  };

  const updateMicLevel = (): void => {
    const analyser = analyserRef.current;
    if (!analyser) return;

    const data = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(data);
    const avg = data.reduce((sum, val) => sum + val, 0) / data.length;
    setMicLevel(Math.min(avg / 128, 1));
    animFrameRef.current = requestAnimationFrame(updateMicLevel);
  };

  const stopMicTest = (): void => {
    cancelAnimationFrame(animFrameRef.current);
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    micStreamRef.current = null;
    audioContextRef.current?.close();
    audioContextRef.current = null;
    analyserRef.current = null;
    setMicTesting(false);
    setMicLevel(0);
  };

  const startCameraPreview = async (deviceId?: string): Promise<void> => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: deviceId ?? videoInput } },
      });
      cameraStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setCameraPreview(true);
    } catch {
      // Camera access denied or unavailable
    }
  };

  const stopCameraPreview = (): void => {
    cameraStreamRef.current?.getTracks().forEach((t) => t.stop());
    cameraStreamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraPreview(false);
  };

  const audioInputDevices = devices.filter((d) => d.kind === "audioinput");
  const audioOutputDevices = devices.filter((d) => d.kind === "audiooutput");
  const videoInputDevices = devices.filter((d) => d.kind === "videoinput");

  return (
    <div>
      <h3 className="text-lg font-bold text-primary mb-4">Voice & Video</h3>

      {/* Audio Input (Microphone) */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-secondary mb-1.5">Microphone</label>
        <select
          value={audioInput}
          onChange={(e) => handleAudioInputChange(e.target.value)}
          className="w-full px-3 py-2 bg-surface-2 border border-border rounded-lg text-sm text-primary focus:outline-none focus:border-accent"
        >
          {audioInputDevices.length === 0 && <option value="">No microphones found</option>}
          {audioInputDevices.map((d) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label}
            </option>
          ))}
        </select>
        <div className="mt-2 flex items-center gap-3">
          <button
            onClick={micTesting ? stopMicTest : () => startMicTest()}
            className="px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors bg-surface-2 border-border text-secondary hover:bg-surface-3"
          >
            {micTesting ? "Stop Test" : "Test Microphone"}
          </button>
          {micTesting && (
            <div className="flex-1 h-3 bg-surface-3 rounded-full overflow-hidden">
              <div
                className="h-full bg-accent transition-all duration-75 rounded-full"
                style={{ width: `${Math.round(micLevel * 100)}%` }}
              />
            </div>
          )}
        </div>
      </div>

      {/* Audio Output (Speaker) */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-secondary mb-1.5">Speaker</label>
        <select
          value={audioOutput}
          onChange={(e) => handleAudioOutputChange(e.target.value)}
          className="w-full px-3 py-2 bg-surface-2 border border-border rounded-lg text-sm text-primary focus:outline-none focus:border-accent"
        >
          {audioOutputDevices.length === 0 && <option value="">No speakers found</option>}
          {audioOutputDevices.map((d) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label}
            </option>
          ))}
        </select>
      </div>

      {/* Video Input (Camera) */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-secondary mb-1.5">Camera</label>
        <select
          value={videoInput}
          onChange={(e) => handleVideoInputChange(e.target.value)}
          className="w-full px-3 py-2 bg-surface-2 border border-border rounded-lg text-sm text-primary focus:outline-none focus:border-accent"
        >
          {videoInputDevices.length === 0 && <option value="">No cameras found</option>}
          {videoInputDevices.map((d) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label}
            </option>
          ))}
        </select>
        <div className="mt-2">
          <button
            onClick={cameraPreview ? stopCameraPreview : () => startCameraPreview()}
            className="px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors bg-surface-2 border-border text-secondary hover:bg-surface-3"
          >
            {cameraPreview ? "Stop Preview" : "Preview Camera"}
          </button>
          {cameraPreview && (
            <div className="mt-2 rounded-lg overflow-hidden border border-border bg-black w-64 h-48">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
