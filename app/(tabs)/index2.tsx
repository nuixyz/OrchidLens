import { CameraView, useCameraPermissions } from "expo-camera";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

export default function App() {
  const [permission, requestPermission] = useCameraPermissions();
  const [prediction, setPrediction] = useState<string>("Initializing model...");

  useEffect(() => {
    if (!permission || permission.status !== "granted") {
      requestPermission();
    }
  }, [permission]);

  if (!permission) {
    return (
      <View>
        <Text>Requesting Camera Access...</Text>
      </View>
    );
  }
  if (permission.status !== "granted") {
    return (
      <View>
        <Text>Camera access denied.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView style={StyleSheet.absoluteFill} facing="back" />

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
  hudLabel: { color: "#aaa", fontSize: 12, fontWeight: "600" },
  hudResult: { color: "#fff", fontSize: 20, fontWeight: "bold", marginTop: 4 },
});
