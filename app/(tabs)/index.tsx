import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useTensorflowModel } from "react-native-fast-tflite";
import { NitroModules } from "react-native-nitro-modules";
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  useFrameOutput,
  type Frame,
  type FrameDroppedReason,
} from "react-native-vision-camera";
import { useResizer } from "react-native-vision-camera-resizer";
import { createSynchronizable, scheduleOnRN } from "react-native-worklets";

import {
  buildScanPrediction,
  classifyFrameWorklet,
  CONFIDENCE_THRESHOLD,
  MODEL_INPUT_SIZE,
  type RawScanResult,
  type ScanPrediction,
} from "@/services/orchidClassifier";

const UI_UPDATE_INTERVAL_MS = 300;

export default function CameraScreen() {
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice("back");

  const [isScanning, setIsScanning] = useState(false);
  const [prediction, setPrediction] = useState<ScanPrediction | null>(null);
  const [framesProcessed, setFramesProcessed] = useState(0);
  const [statusMessage, setStatusMessage] = useState(
    "Point your camera at an orchid, then start scanning.",
  );

  // Reanimated shared values are not visible on Vision Camera's worklet runtime.
  const isScanningSync = useMemo(() => createSynchronizable(false), []);
  const lastUiUpdateMs = useMemo(() => createSynchronizable(0), []);

  const toggleLockRef = useRef(false);

  const modelState = useTensorflowModel(
    require("../../assets/model/orchid_model.tflite"),
    [],
  );

  const resizerState = useResizer({
    width: MODEL_INPUT_SIZE,
    height: MODEL_INPUT_SIZE,
    channelOrder: "rgb",
    dataType: "float32",
    scaleMode: "cover",
    pixelLayout: "interleaved",
  });

  const model = modelState.state === "loaded" ? modelState.model : undefined;
  const resizer =
    resizerState.state === "ready" ? resizerState.resizer : undefined;

  const boxedModel = useMemo(
    () => (model != null ? NitroModules.box(model) : undefined),
    [model],
  );
  const boxedResizer = useMemo(
    () => (resizer != null ? NitroModules.box(resizer) : undefined),
    [resizer],
  );

  const isModelReady = boxedModel != null && boxedResizer != null;
  const isModelLoading =
    modelState.state === "loading" || resizerState.state === "loading";

  const onPrediction = useCallback((raw: RawScanResult) => {
    const result = buildScanPrediction(raw);
    setPrediction(result);
    if (result.isConfident) {
      setStatusMessage("Match found");
      return;
    }
    setStatusMessage(
      `Low confidence — hold steady (need ${Math.round(CONFIDENCE_THRESHOLD * 100)}%+)`,
    );
  }, []);

  const onFrameProcessed = useCallback(() => {
    setFramesProcessed((count) => count + 1);
  }, []);

  const onScanError = useCallback((message: string) => {
    console.error("[Orchid Classifier] Scan pipeline error:", message);
    setStatusMessage(
      "Scan error — try stopping and starting again. Check Metro logs.",
    );
  }, []);

  const setScanning = useCallback(
    (next: boolean) => {
      isScanningSync.setBlocking(next);
      setIsScanning(next);

      if (next) {
        setPrediction(null);
        setFramesProcessed(0);
        lastUiUpdateMs.setBlocking(0);
        setStatusMessage(
          "Scanning… hold the flower in the center of the frame.",
        );
      } else {
        lastUiUpdateMs.setBlocking(0);
        setFramesProcessed(0);
        setStatusMessage("Scan paused. Tap Start Scanning to continue.");
      }
    },
    [isScanningSync, lastUiUpdateMs],
  );

  const processFrame = useCallback(
    (frame: Frame) => {
      "worklet";

      if (!isScanningSync.getBlocking()) {
        frame.dispose();
        return;
      }

      if (boxedModel == null || boxedResizer == null) {
        frame.dispose();
        return;
      }

      try {
        const tfliteModel = boxedModel.unbox();
        const frameResizer = boxedResizer.unbox();
        const rawResult = classifyFrameWorklet(
          frame,
          tfliteModel,
          frameResizer,
        );

        scheduleOnRN(onFrameProcessed);

        const now = Date.now();
        if (now - lastUiUpdateMs.getBlocking() < UI_UPDATE_INTERVAL_MS) {
          return;
        }
        lastUiUpdateMs.setBlocking(now);
        scheduleOnRN(onPrediction, rawResult);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown scan error";
        scheduleOnRN(onScanError, message);
      } finally {
        frame.dispose();
      }
    },
    [
      boxedModel,
      boxedResizer,
      isScanningSync,
      lastUiUpdateMs,
      onFrameProcessed,
      onPrediction,
      onScanError,
    ],
  );

  const onFrameDropped = useCallback((reason: FrameDroppedReason) => {
    console.warn(`[Orchid Classifier] Frame dropped: ${reason}`);
  }, []);

  const frameOutput = useFrameOutput({
    pixelFormat: "yuv",
    enablePreviewSizedOutputBuffers: true,
    dropFramesWhileBusy: true,
    onFrameDropped,
    onFrame: processFrame,
  });

  useEffect(() => {
    if (!hasPermission) {
      void requestPermission();
    }
  }, [hasPermission, requestPermission]);

  useEffect(() => {
    if (modelState.state === "error") {
      setStatusMessage("Failed to load orchid model.");
    }
  }, [modelState.state]);

  useEffect(() => {
    if (resizerState.state === "error") {
      setStatusMessage("Camera resizer failed to initialize.");
    }
  }, [resizerState.state]);

  const handleToggleScan = useCallback(() => {
    if (!isModelReady || toggleLockRef.current) {
      return;
    }

    toggleLockRef.current = true;
    setTimeout(() => {
      toggleLockRef.current = false;
    }, 400);

    setScanning(!isScanning);
  }, [isModelReady, isScanning, setScanning]);

  if (!hasPermission) {
    return (
      <View style={styles.centered}>
        <Text style={styles.centeredTitle}>Camera access needed</Text>
        <Text style={styles.centeredSubtitle}>
          Allow camera permission to identify orchids.
        </Text>
      </View>
    );
  }

  if (!device) {
    return (
      <View style={styles.centered}>
        <Text style={styles.centeredTitle}>No camera found</Text>
        <Text style={styles.centeredSubtitle}>
          This device does not expose a rear camera.
        </Text>
      </View>
    );
  }

  const confidencePercent = prediction
    ? Math.round(prediction.confidence * 100)
    : null;

  const scanningHint =
    isScanning && !prediction
      ? framesProcessed > 0
        ? `Processed ${framesProcessed} frames — keep the flower steady.`
        : "Waiting for camera frames…"
      : statusMessage;

  return (
    <View style={styles.container}>
      <Camera
        style={StyleSheet.absoluteFill}
        device={device}
        isActive
        outputs={[frameOutput]}
      />

      {isModelLoading && (
        <View style={styles.loadingBanner}>
          <ActivityIndicator color="#fff" />
          <Text style={styles.loadingText}>Loading orchid model…</Text>
        </View>
      )}

      <View style={styles.bottomPanel}>
        <View
          style={[
            styles.resultBox,
            prediction?.isConfident
              ? styles.resultBoxConfident
              : styles.resultBoxIdle,
          ]}
        >
          <Text style={styles.resultLabel}>Identification</Text>
          {isScanning && prediction ? (
            <>
              <Text style={styles.resultSpecies}>{prediction.displayName}</Text>
              <Text
                style={[
                  styles.resultConfidence,
                  prediction.isConfident
                    ? styles.confidenceHigh
                    : styles.confidenceLow,
                ]}
              >
                {confidencePercent}% confidence
              </Text>
              <Text style={styles.resultHint}>{statusMessage}</Text>
            </>
          ) : (
            <>
              <Text style={styles.resultPlaceholder}>
                {isScanning
                  ? "Analyzing flower…"
                  : "Results will appear here while scanning."}
              </Text>
              <Text style={styles.resultHint}>{scanningHint}</Text>
            </>
          )}
        </View>

        <Pressable
          style={({ pressed }) => [
            styles.scanButton,
            (!isModelReady || isModelLoading) && styles.scanButtonDisabled,
            isScanning && styles.scanButtonStop,
            pressed && styles.scanButtonPressed,
          ]}
          disabled={!isModelReady || isModelLoading}
          onPress={handleToggleScan}
        >
          <Text style={styles.scanButtonText}>
            {isScanning ? "Stop Scanning" : "Start Scanning"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 28,
    backgroundColor: "#0f172a",
  },
  centeredTitle: {
    color: "#f8fafc",
    fontSize: 22,
    fontWeight: "700",
    textAlign: "center",
  },
  centeredSubtitle: {
    color: "#94a3b8",
    fontSize: 15,
    marginTop: 8,
    textAlign: "center",
    lineHeight: 22,
  },
  loadingBanner: {
    position: "absolute",
    top: 60,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "rgba(15, 23, 42, 0.85)",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
  },
  loadingText: {
    color: "#e2e8f0",
    fontSize: 14,
    fontWeight: "600",
  },
  bottomPanel: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 20,
    paddingBottom: 36,
    paddingTop: 12,
    gap: 14,
    backgroundColor: "rgba(2, 6, 23, 0.55)",
  },
  resultBox: {
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderWidth: 1,
  },
  resultBoxIdle: {
    backgroundColor: "rgba(15, 23, 42, 0.92)",
    borderColor: "rgba(148, 163, 184, 0.35)",
  },
  resultBoxConfident: {
    backgroundColor: "rgba(6, 78, 59, 0.92)",
    borderColor: "rgba(52, 211, 153, 0.65)",
  },
  resultLabel: {
    color: "#94a3b8",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  resultSpecies: {
    color: "#f8fafc",
    fontSize: 24,
    fontWeight: "700",
    marginTop: 6,
  },
  resultConfidence: {
    fontSize: 18,
    fontWeight: "600",
    marginTop: 4,
  },
  confidenceHigh: {
    color: "#6ee7b7",
  },
  confidenceLow: {
    color: "#fbbf24",
  },
  resultPlaceholder: {
    color: "#cbd5e1",
    fontSize: 17,
    fontWeight: "600",
    marginTop: 6,
  },
  resultHint: {
    color: "#94a3b8",
    fontSize: 13,
    marginTop: 8,
    lineHeight: 18,
  },
  scanButton: {
    backgroundColor: "#16a34a",
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
  },
  scanButtonStop: {
    backgroundColor: "#dc2626",
  },
  scanButtonDisabled: {
    opacity: 0.45,
  },
  scanButtonPressed: {
    opacity: 0.85,
  },
  scanButtonText: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "700",
  },
});
