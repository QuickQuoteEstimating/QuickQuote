import { useCallback, useMemo } from "react";
import { Alert, Image, Pressable, StyleSheet, Text, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import BrandLogo from "./BrandLogo";
import { Theme } from "../theme";
import { useThemeContext } from "../theme/ThemeProvider";

type LogoPickerProps = {
  label?: string;
  value: string | null;
  onChange: (uri: string | null) => void;
};

function createStyles(theme: Theme) {
  return StyleSheet.create({
    container: {
      gap: 8,
    },
    label: {
      fontSize: 16,
      fontWeight: "600",
      color: theme.colors.secondaryText,
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
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.border,
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
      alignItems: "center",
    },
    buttonText: {
      textAlign: "center",
      fontWeight: "600",
    },
    primaryButton: {
      backgroundColor: theme.colors.accent,
      borderColor: theme.colors.accent,
    },
    primaryButtonText: {
      color: theme.colors.surface,
    },
    secondaryButton: {
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.border,
    },
    secondaryButtonText: {
      color: theme.colors.primaryText,
    },
  });
}

export function LogoPicker({ label = "Company logo", value, onChange }: LogoPickerProps) {
  const { theme } = useThemeContext();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const handlePick = useCallback(async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      Alert.alert(
        "Permission needed",
        "We need access to your photo library so you can choose a company logo.",
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

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.previewRow}>
        <View style={styles.previewContainer}>
          {value ? (
            <Image source={{ uri: value }} resizeMode="contain" style={styles.previewImage} />
          ) : (
            <BrandLogo size={64} style={styles.placeholderLogo} />
          )}
        </View>
        <View style={styles.actions}>
          <Pressable style={[styles.button, styles.primaryButton]} onPress={handlePick}>
            <Text style={[styles.buttonText, styles.primaryButtonText]}>
              {value ? "Replace logo" : "Upload logo"}
            </Text>
          </Pressable>
          {value ? (
            <Pressable style={[styles.button, styles.secondaryButton]} onPress={handleRemove}>
              <Text style={[styles.buttonText, styles.secondaryButtonText]}>Remove logo</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
}

export default LogoPicker;
