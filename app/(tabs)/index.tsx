import React, { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  useFrameProcessor,
} from "react-native-vision-camera";
import { useRunOnJS } from "react-native-worklets";
import { processLiveFrame } from "../../services/tfliteServices";

export default function App() {
  const { hasPermission, requestPermission } = useCameraPermission();
  const [prediction, setPrediction] = useState<string>("Initializing AI...");

  // Select the standard primary rear camera lens bundle
  const device = useCameraDevice("back");

  useEffect(() => {
    if (!hasPermission) {
      requestPermission();
    }
  }, [hasPermission]);

  // JS Thread Bridge function to safely receive classification strings back from the background worklet thread
  const updatePredictionUI = useRunOnJS((result: string) => {
    setPrediction(result);
  });

  // High-performance real-time frame processor running at native camera speeds
  const frameProcessor = useFrameProcessor(
    (frame) => {
      "worklet";
      // Forward the direct native pointer address of the frame block over to our engine
      const output = processLiveFrame(frame);
      if (output) {
        updatePredictionUI(output);
      }
    },
    [updatePredictionUI],
  );

  if (!hasPermission) {
    return (
      <View style={styles.centered}>
        <Text>Granting Camera Permissions...</Text>
      </View>
    );
  }

  if (!device) {
    return (
      <View style={styles.centered}>
        <Text>No rear camera device detected.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Camera
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={true}
        frameProcessor={frameProcessor}
        pixelFormat="rgb" // Force native camera engine output format directly into RGB matrix
      />

      {/* Persistent Live AI HUD Overlay display panel */}
      <View style={styles.hudOverlay}>
        <Text style={styles.hudLabel}>Live Classification:</Text>
        <Text style={styles.hudResult}>{prediction}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  hudOverlay: {
    position: "absolute",
    bottom: 50,
    left: 20,
    right: 20,
    backgroundColor: "rgba(20, 39, 78, 0.9)",
    padding: 18,
    borderRadius: 12,
    alignItems: "center",
  },
  hudLabel: { color: "#aaa", fontSize: 12, uppercase: true, fontWeight: "600" },
  hudResult: { color: "#fff", fontSize: 20, fontWeight: "bold", marginTop: 4 },
});
