import { useCallback } from "react";
import {
  Alert,
  Image,
  Pressable,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import BrandLogo from "./BrandLogo";

type LogoPickerProps = {
  label?: string;
  value: string | null;
  onChange: (uri: string | null) => void;
};

export function LogoPicker({ label = "Company logo", value, onChange }: LogoPickerProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";

  const handlePick = useCallback(async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      Alert.alert(
        "Permission needed",
        "We need access to your photo library so you can choose a company logo."
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      allowsEditing: true,
    });

    if (result.canceled || !result.assets?.length) {
      return;
    }

    const [asset] = result.assets;
    if (asset?.uri) {
      onChange(asset.uri);
    }
  }, [onChange]);

  const handleRemove = useCallback(() => {
    onChange(null);
  }, [onChange]);

  const palette = {
    text: isDark ? "#e2e8f0" : "#1f2937",
    muted: isDark ? "#94a3b8" : "#475569",
    surface: isDark ? "#1e293b" : "#f8fafc",
    border: isDark ? "#334155" : "#cbd5f5",
    accent: "#2563eb",
  };

  return (
    <View style={styles.container}>
      <Text style={[styles.label, { color: palette.text }]}>{label}</Text>
      <View style={styles.previewRow}>
        <View
          style={[
            styles.previewContainer,
            { backgroundColor: palette.surface, borderColor: palette.border },
          ]}
        >
          {value ? (
            <Image
              source={{ uri: value }}
              resizeMode="contain"
              style={styles.previewImage}
            />
          ) : (
            <BrandLogo size={64} style={styles.placeholderLogo} />
          )}
        </View>
        <View style={styles.actions}>
          <Pressable
            style={[
              styles.button,
              styles.primaryButton,
              { backgroundColor: palette.accent, borderColor: palette.accent },
            ]}
            onPress={handlePick}
          >
            <Text style={[styles.buttonText, styles.primaryButtonText]}>
              {value ? "Replace logo" : "Upload logo"}
            </Text>
          </Pressable>
          {value ? (
            <Pressable
              style={[
                styles.button,
                { backgroundColor: palette.surface, borderColor: palette.border },
              ]}
              onPress={handleRemove}
            >
              <Text style={[styles.buttonText, { color: palette.text }]}>Remove logo</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 8,
  },
  label: {
    fontSize: 16,
    fontWeight: "600",
  },
  previewRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  previewContainer: {
    width: 88,
    height: 88,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  previewImage: {
    width: "100%",
    height: "100%",
  },
  placeholderLogo: {
    opacity: 0.7,
  },
  actions: {
    flex: 1,
    gap: 8,
  },
  button: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  buttonText: {
    textAlign: "center",
    fontWeight: "600",
  },
  primaryButton: {
    backgroundColor: "#2563eb",
    borderColor: "#2563eb",
  },
  primaryButtonText: {
    color: "#fff",
  },
});

export default LogoPicker;
