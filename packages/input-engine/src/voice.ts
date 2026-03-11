export interface VoiceConfig {
  mode?: "push-to-talk" | "toggle";
  language?: string;
  continuous?: boolean;
  maxDurationMs?: number;
}

export type VoiceState = "idle" | "listening" | "processing" | "error";

export interface TranscriptionResult {
  text: string;
  confidence: number;
  language: string;
  durationMs: number;
  isFinal: boolean;
}

export interface VoiceMessageMetadata {
  voice_input: true;
  transcription_confidence: number;
  language: string;
  duration_ms: number;
}

const MAX_ALLOWED_DURATION_MS = 300_000; // 5 minutes

/** Check if Web Speech API is available */
export function isSpeechRecognitionSupported(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return !!(
    (window as unknown as Record<string, unknown>)["SpeechRecognition"] ||
    (window as unknown as Record<string, unknown>)["webkitSpeechRecognition"]
  );
}

/** Check if speech synthesis (TTS) is available */
export function isSpeechSynthesisSupported(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return !!window.speechSynthesis;
}

/** Build message metadata for voice-transcribed messages */
export function buildVoiceMessageMetadata(
  transcription: TranscriptionResult,
): VoiceMessageMetadata {
  return {
    voice_input: true,
    transcription_confidence: transcription.confidence,
    language: transcription.language,
    duration_ms: transcription.durationMs,
  };
}

/** Speak text via Web Speech Synthesis API (returns false if unavailable) */
export function speak(
  text: string,
  options?: { lang?: string; rate?: number; pitch?: number },
): boolean {
  if (!isSpeechSynthesisSupported()) {
    return false;
  }

  const utterance = new SpeechSynthesisUtterance(text);
  if (options?.lang) {
    utterance.lang = options.lang;
  }
  if (options?.rate !== undefined) {
    utterance.rate = options.rate;
  }
  if (options?.pitch !== undefined) {
    utterance.pitch = options.pitch;
  }

  window.speechSynthesis.speak(utterance);
  return true;
}

/** Validate voice config */
export function validateVoiceConfig(config: VoiceConfig): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (config.mode !== undefined && config.mode !== "push-to-talk" && config.mode !== "toggle") {
    errors.push(`Invalid mode "${config.mode as string}". Must be "push-to-talk" or "toggle".`);
  }

  if (config.maxDurationMs !== undefined) {
    if (config.maxDurationMs <= 0) {
      errors.push("maxDurationMs must be greater than 0.");
    } else if (config.maxDurationMs > MAX_ALLOWED_DURATION_MS) {
      errors.push(
        `maxDurationMs ${config.maxDurationMs} exceeds maximum allowed ${MAX_ALLOWED_DURATION_MS}ms.`,
      );
    }
  }

  return { valid: errors.length === 0, errors };
}
