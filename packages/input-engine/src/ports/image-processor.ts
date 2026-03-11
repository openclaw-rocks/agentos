/** Result of image analysis */
export interface ImageAnalysis {
  description: string;
  labels: string[];
  text?: string;
  metadata?: Record<string, unknown>;
}

/** Port for image processing and analysis */
export interface ImageProcessor {
  analyze(imageUrl: string): Promise<ImageAnalysis>;
  isAvailable(): boolean;
}
