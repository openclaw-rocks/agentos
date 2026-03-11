/** Result of speech-to-text transcription */
export interface TranscriptionResult {
  text: string;
  confidence: number;
  language?: string;
  durationMs: number;
}

/** Port for speech-to-text processing */
export interface SpeechToText {
  transcribe(audioUrl: string): Promise<TranscriptionResult>;
  isAvailable(): boolean;
}
