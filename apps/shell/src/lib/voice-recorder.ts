/**
 * Voice recording logic using the MediaRecorder API.
 *
 * Prefers `audio/ogg; codecs=opus`, falls back to `audio/webm; codecs=opus`,
 * then lets the browser pick any supported type.
 */

function selectMimeType(): string {
  const candidates = [
    "audio/ogg; codecs=opus",
    "audio/ogg",
    "audio/webm; codecs=opus",
    "audio/webm",
  ];

  for (const mime of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(mime)) {
      return mime;
    }
  }

  // Let the browser decide
  return "";
}

export interface VoiceRecordingResult {
  blob: Blob;
  duration: number;
}

export class VoiceRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private chunks: Blob[] = [];
  private startTime = 0;

  /**
   * Request microphone access and begin recording.
   * Throws if the user denies permission or no mic is available.
   */
  async start(): Promise<void> {
    if (this.mediaRecorder && this.mediaRecorder.state === "recording") {
      return;
    }

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.stream = stream;
    this.chunks = [];

    const mimeType = selectMimeType();
    const options: MediaRecorderOptions = mimeType ? { mimeType } : {};
    const recorder = new MediaRecorder(stream, options);

    recorder.ondataavailable = (event: BlobEvent) => {
      if (event.data.size > 0) {
        this.chunks.push(event.data);
      }
    };

    this.mediaRecorder = recorder;
    recorder.start();
    this.startTime = Date.now();
  }

  /**
   * Stop recording and return the recorded audio blob together with its
   * duration in milliseconds.
   */
  stop(): Promise<VoiceRecordingResult> {
    return new Promise<VoiceRecordingResult>((resolve, reject) => {
      const recorder = this.mediaRecorder;
      if (!recorder || recorder.state === "inactive") {
        reject(new Error("Not recording"));
        return;
      }

      const duration = Date.now() - this.startTime;

      recorder.onstop = () => {
        const mimeType = recorder.mimeType || "audio/ogg";
        const blob = new Blob(this.chunks, { type: mimeType });
        this.cleanup();
        resolve({ blob, duration });
      };

      recorder.stop();
    });
  }

  /**
   * Discard the current recording without producing a result.
   */
  cancel(): void {
    if (this.mediaRecorder && this.mediaRecorder.state !== "inactive") {
      this.mediaRecorder.onstop = null;
      this.mediaRecorder.stop();
    }
    this.cleanup();
  }

  /**
   * Whether the recorder is currently capturing audio.
   */
  isRecording(): boolean {
    return this.mediaRecorder?.state === "recording";
  }

  /**
   * Milliseconds elapsed since recording started, or 0 if not recording.
   */
  getDuration(): number {
    if (!this.isRecording()) return 0;
    return Date.now() - this.startTime;
  }

  // ------------------------------------------------------------------
  // Internal helpers
  // ------------------------------------------------------------------

  private cleanup(): void {
    if (this.stream) {
      for (const track of this.stream.getTracks()) {
        track.stop();
      }
      this.stream = null;
    }
    this.mediaRecorder = null;
    this.chunks = [];
    this.startTime = 0;
  }
}
