import { CameraView, useCameraPermissions } from "expo-camera";
import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

export default function App() {
  const cameraRef = useRef<CameraView>(null);
  const [startCamera, setStartCamera] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();

  const __startCamera = async () => {
    const status = await requestPermission();

    if (status.granted) {
      setStartCamera(true);
    } else {
      Alert.alert(
        "Permission Denied",
        "Camera access is needed to take pictures.",
      );
    }
  };

  const __takePicture = async () => {
    if (!cameraRef.current || isProcessing) return;
    try {
      setIsProcessing(true);

      const photo = await cameraRef.current.takePictureAsync({
        skipProcessing: true,
      });
      console.log("Photo captured successfully:", photo);
      Alert.alert("Success", `Photo saved temporarily at: ${photo?.uri}`);
    } catch (error) {
      console.log("Failed to take picture: ", error);
      Alert.alert("Error! Failed to capture photo.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <View style={styles.container}>
      {startCamera && permission?.granted ? (
        <View style={styles.cameraContainer}>
          <CameraView style={styles.camera} ref={cameraRef} />
          <View style={styles.captureContainer}>
            <TouchableOpacity
              onPress={__takePicture}
              disabled={isProcessing}
              style={[
                styles.captureButton,
                isProcessing && styles.buttonDisabled,
              ]}
            >
              {isProcessing ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <View style={styles.captureInnerCircle} />
              )}
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <View style={styles.buttonContainer}>
          <TouchableOpacity onPress={__startCamera} style={styles.button}>
            <Text style={styles.buttonText}>Start Camera</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  cameraContainer: {
    flex: 1,
    width: "100%",
  },
  camera: {
    flex: 1,
    width: "100%",
  },
  captureContainer: {
    position: "absolute",
    bottom: 40,
    left: 0,
    right: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  captureButton: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: "rgba(255, 255, 255, 0.3)",
    borderWidth: 4,
    borderColor: "#fff",
    justifyContent: "center",
    alignItems: "center",
  },
  captureInnerCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#fff",
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonContainer: {
    flex: 1,
    backgroundColor: "#fff",
    justifyContent: "center",
    alignItems: "center",
  },
  button: {
    width: 130,
    borderRadius: 4,
    backgroundColor: "#14274e",
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    height: 40,
  },
  buttonText: {
    color: "#fff",
    fontWeight: "bold",
    textAlign: "center",
  },
});
