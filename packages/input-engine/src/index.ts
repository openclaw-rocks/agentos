export type { InputEvent, InputType } from "./ports/input-handler.js";
export type { SpeechToText } from "./ports/speech-to-text.js";
export type { ImageProcessor, ImageAnalysis } from "./ports/image-processor.js";

export {
  validateImageFile,
  createPreviewUrl,
  buildImageEventContent,
  isCameraCaptureSupported,
  getAcceptedFormats,
} from "./camera.js";
export type { CameraConfig, CaptureResult, UploadedImage } from "./camera.js";

export {
  isSpeechRecognitionSupported,
  isSpeechSynthesisSupported,
  buildVoiceMessageMetadata,
  speak,
  validateVoiceConfig,
} from "./voice.js";
export type {
  VoiceConfig,
  VoiceState,
  TranscriptionResult,
  VoiceMessageMetadata,
} from "./voice.js";

export {
  categorizeFile,
  analyzeFile,
  validateFile,
  buildFileEventContent,
  formatFileSize,
  isAgentProcessable,
} from "./file.js";
export type { FileConfig, FileCategory, FileAnalysis, UploadedFile } from "./file.js";
