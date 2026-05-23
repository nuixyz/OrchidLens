import type { TfliteModel } from "react-native-fast-tflite";
import type { Resizer } from "react-native-vision-camera-resizer";
import type { Frame } from "react-native-vision-camera";

import labels from "../assets/model/labels.json";

export const ORCHID_LABELS = labels as string[];
export const MODEL_INPUT_SIZE = 224;
export const CONFIDENCE_THRESHOLD = 0.4;

export interface ScanPrediction {
  label: string;
  displayName: string;
  confidence: number;
  isConfident: boolean;
}

export interface RawScanResult {
  classIndex: number;
  confidence: number;
}

export function formatOrchidLabel(label: string): string {
  if (label.startsWith("class")) {
    return `Species ${label.slice(5)}`;
  }
  return label;
}

export function buildScanPrediction(result: RawScanResult): ScanPrediction {
  const label =
    ORCHID_LABELS[result.classIndex] ??
    `class${String(result.classIndex).padStart(4, "0")}`;

  return {
    label,
    displayName: formatOrchidLabel(label),
    confidence: result.confidence,
    isConfident: result.confidence >= CONFIDENCE_THRESHOLD,
  };
}

/** MobileNetV2 `preprocess_input` for float pixels in [0, 1]. */
function applyMobileNetPreprocess(pixels: Float32Array): Float32Array {
  "worklet";

  const normalized = new Float32Array(pixels.length);
  for (let index = 0; index < pixels.length; index += 1) {
    normalized[index] = pixels[index]! * 2 - 1;
  }
  return normalized;
}

function getTopPrediction(probabilities: Float32Array): RawScanResult {
  "worklet";

  let maxIndex = 0;
  let maxConfidence = probabilities[0] ?? 0;

  for (let index = 1; index < probabilities.length; index += 1) {
    const value = probabilities[index] ?? 0;
    if (value > maxConfidence) {
      maxConfidence = value;
      maxIndex = index;
    }
  }

  return { classIndex: maxIndex, confidence: maxConfidence };
}

export function classifyFrameWorklet(
  frame: Frame,
  model: TfliteModel,
  resizer: Resizer,
): RawScanResult {
  "worklet";

  const resized = resizer.resize(frame);

  try {
    const pixelBuffer = resized.getPixelBuffer();
    const pixels = new Float32Array(pixelBuffer);
    const modelInput = applyMobileNetPreprocess(pixels);
    const inputBuffer = modelInput.buffer.slice(
      modelInput.byteOffset,
      modelInput.byteOffset + modelInput.byteLength,
    ) as ArrayBuffer;
    const outputs = model.runSync([inputBuffer]);
    const probabilities = new Float32Array(outputs[0]!);

    return getTopPrediction(probabilities);
  } finally {
    resized.dispose();
  }
}
