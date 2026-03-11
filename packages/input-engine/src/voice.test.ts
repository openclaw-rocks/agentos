import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  buildVoiceMessageMetadata,
  validateVoiceConfig,
  isSpeechRecognitionSupported,
  isSpeechSynthesisSupported,
  speak,
} from "./voice.js";
import type { TranscriptionResult, VoiceConfig } from "./voice.js";

describe("buildVoiceMessageMetadata", () => {
  const transcription: TranscriptionResult = {
    text: "Hello world",
    confidence: 0.95,
    language: "en-US",
    durationMs: 2500,
    isFinal: true,
  };

  describe("given a transcription result", () => {
    describe("when building voice message metadata", () => {
      it("then it should include voice_input set to true", () => {
        const metadata = buildVoiceMessageMetadata(transcription);
        expect(metadata.voice_input).toBe(true);
      });

      it("then it should include the transcription confidence", () => {
        const metadata = buildVoiceMessageMetadata(transcription);
        expect(metadata.transcription_confidence).toBe(0.95);
      });

      it("then it should include the language", () => {
        const metadata = buildVoiceMessageMetadata(transcription);
        expect(metadata.language).toBe("en-US");
      });

      it("then it should include the duration in milliseconds", () => {
        const metadata = buildVoiceMessageMetadata(transcription);
        expect(metadata.duration_ms).toBe(2500);
      });
    });
  });

  describe("given a low-confidence transcription", () => {
    describe("when building voice message metadata", () => {
      it("then it should reflect the low confidence value", () => {
        const lowConfidence: TranscriptionResult = {
          ...transcription,
          confidence: 0.3,
        };
        const metadata = buildVoiceMessageMetadata(lowConfidence);
        expect(metadata.transcription_confidence).toBe(0.3);
      });
    });
  });
});

describe("validateVoiceConfig", () => {
  describe("given a valid config with toggle mode", () => {
    describe("when validating", () => {
      it("then it should return valid: true with no errors", () => {
        const config: VoiceConfig = { mode: "toggle", language: "en-US" };
        const result = validateVoiceConfig(config);
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });
    });
  });

  describe("given a valid config with push-to-talk mode", () => {
    describe("when validating", () => {
      it("then it should return valid: true", () => {
        const config: VoiceConfig = { mode: "push-to-talk" };
        const result = validateVoiceConfig(config);
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });
    });
  });

  describe("given a config with an invalid mode", () => {
    describe("when validating", () => {
      it("then it should return valid: false with mode error", () => {
        const config = { mode: "invalid-mode" } as unknown as VoiceConfig;
        const result = validateVoiceConfig(config);
        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
        expect(result.errors[0]).toContain("Invalid mode");
      });
    });
  });

  describe("given a config with maxDurationMs <= 0", () => {
    describe("when validating", () => {
      it("then it should return valid: false with duration error", () => {
        const config: VoiceConfig = { maxDurationMs: 0 };
        const result = validateVoiceConfig(config);
        expect(result.valid).toBe(false);
        expect(result.errors[0]).toContain("greater than 0");
      });
    });
  });

  describe("given a config with negative maxDurationMs", () => {
    describe("when validating", () => {
      it("then it should return valid: false", () => {
        const config: VoiceConfig = { maxDurationMs: -1000 };
        const result = validateVoiceConfig(config);
        expect(result.valid).toBe(false);
        expect(result.errors[0]).toContain("greater than 0");
      });
    });
  });

  describe("given a config with maxDurationMs exceeding the limit", () => {
    describe("when validating", () => {
      it("then it should return valid: false with exceeds error", () => {
        const config: VoiceConfig = { maxDurationMs: 600_000 };
        const result = validateVoiceConfig(config);
        expect(result.valid).toBe(false);
        expect(result.errors[0]).toContain("exceeds maximum");
      });
    });
  });

  describe("given a config with valid maxDurationMs within limit", () => {
    describe("when validating", () => {
      it("then it should return valid: true", () => {
        const config: VoiceConfig = { maxDurationMs: 60_000 };
        const result = validateVoiceConfig(config);
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });
    });
  });

  describe("given an empty config (all defaults)", () => {
    describe("when validating", () => {
      it("then it should return valid: true", () => {
        const config: VoiceConfig = {};
        const result = validateVoiceConfig(config);
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });
    });
  });
});

describe("isSpeechRecognitionSupported", () => {
  describe("given a Node.js environment without window.SpeechRecognition", () => {
    describe("when checking speech recognition support", () => {
      it("then it should return false", () => {
        const result = isSpeechRecognitionSupported();
        expect(result).toBe(false);
      });
    });
  });
});

describe("isSpeechSynthesisSupported", () => {
  describe("given a Node.js environment without window.speechSynthesis", () => {
    describe("when checking speech synthesis support", () => {
      it("then it should return false", () => {
        const result = isSpeechSynthesisSupported();
        expect(result).toBe(false);
      });
    });
  });
});

describe("speak", () => {
  describe("given speech synthesis is not available", () => {
    describe("when attempting to speak text", () => {
      it("then it should return false", () => {
        const result = speak("Hello world");
        expect(result).toBe(false);
      });
    });
  });

  describe("given speech synthesis is available", () => {
    const mockSpeak = vi.fn();

    beforeEach(() => {
      vi.stubGlobal("window", {
        speechSynthesis: { speak: mockSpeak },
        SpeechSynthesisUtterance: class {
          text: string;
          lang = "";
          rate = 1;
          pitch = 1;
          constructor(text: string) {
            this.text = text;
          }
        },
      });
      vi.stubGlobal(
        "SpeechSynthesisUtterance",
        (window as unknown as Record<string, unknown>)["SpeechSynthesisUtterance"],
      );
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    describe("when speaking text", () => {
      it("then it should return true", () => {
        const result = speak("Hello");
        expect(result).toBe(true);
      });

      it("then it should call speechSynthesis.speak", () => {
        speak("Hello");
        expect(mockSpeak).toHaveBeenCalled();
      });
    });
  });
});
