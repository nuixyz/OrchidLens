import { Buffer } from "buffer";
import { File } from "expo-file-system";
import { loadTensorflowModel } from "react-native-fast-tflite";
import type { Frame } from "react-native-vision-camera";

const MODEL_SETTINGS = {
  inputWidth: 224,
  inputHeight: 224,
  channels: 3,
};

export interface PredictionResult {
  success: boolean;
  prediction?: string;
  error?: string;
}

function convertBase64ToUint8Array(base64Str: string): Uint8Array {
  const buffer = Buffer.from(base64Str, "base64");
  return new Uint8Array(buffer);
}

export async function analyzeCapturedImage(
  imageUri: string,
): Promise<PredictionResult> {
  try {
    if (!imageUri) throw new Error("Invalid image source URI provided.");

    const model = await loadTensorflowModel(
      require("../assets/model/orchid_model.tflite"),
      [],
    );

    const file = new File(imageUri);
    const base64Data = await file.base64();

    const rawPixelBuffer = convertBase64ToUint8Array(base64Data);

    const inputBuffer = rawPixelBuffer.buffer.slice(
      rawPixelBuffer.byteOffset,
      rawPixelBuffer.byteOffset + rawPixelBuffer.byteLength,
    ) as ArrayBuffer;

    const outputs = await model.run([inputBuffer]);

    const primaryOutput = outputs[0];
    const outputArray = new Float32Array(primaryOutput);

    const predictedIndex = outputArray.reduce(
      (maxIdx, currentVal, currentIdx, arr) =>
        currentVal > arr[maxIdx] ? currentIdx : maxIdx,
      0,
    );

    return {
      success: true,
      prediction: `Class Index Match: ${predictedIndex}`,
    };
  } catch (error: any) {
    console.error("Fast-TFLite processing engine execution failure:", error);
    return {
      success: false,
      error:
        error?.message ||
        "Internal C++ inference native module runtime exception.",
    };
  }
}

export function processLiveFrame(frame: Frame): string | null {
  "worklet";
  // TODO: Implement live frame processing
  return "Live prediction not implemented yet";
}
