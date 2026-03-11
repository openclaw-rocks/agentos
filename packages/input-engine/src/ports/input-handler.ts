/** Supported input modalities */
export type InputType = "text" | "voice" | "image" | "file";

/** A normalized input event from any modality */
export interface InputEvent {
  type: InputType;
  spaceId: string;
  roomId: string;
  sender: string;
  /** Text content (original or transcribed) */
  text?: string;
  /** Media URL for image/file/voice inputs */
  mediaUrl?: string;
  /** MIME type for media inputs */
  mimeType?: string;
  /** Additional metadata from the input source */
  metadata?: Record<string, unknown>;
}
