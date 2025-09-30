import React, { useCallback, useEffect, useRef } from "react";
import { useNavigation, useRouter } from "expo-router";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import EstimateItemForm from "../../../components/EstimateItemForm";
import { useItemEditor } from "../../../context/ItemEditorContext";
import { palette, cardShadow } from "../../../lib/theme";

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.surface,
  },
  screen: {
    flex: 1,
    backgroundColor: palette.background,
  },
  content: {
    padding: 20,
  },
  card: {
    backgroundColor: palette.surface,
    borderRadius: 18,
    padding: 20,
    gap: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
    ...cardShadow(10),
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: palette.primaryText,
  },
});

export default function EstimateItemEditorScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { config, closeEditor } = useItemEditor();
  const hasNavigatedAway = useRef(false);
  const hasLoadedConfigRef = useRef(false);

  useEffect(() => {
    if (config?.title) {
      navigation.setOptions({ title: config.title });
    }
  }, [config?.title, navigation]);

  useEffect(() => {
    return () => {
      hasNavigatedAway.current = true;
      closeEditor();
    };
  }, [closeEditor]);

  useEffect(() => {
    if (config) {
      hasLoadedConfigRef.current = true;
      return;
    }

    if (!hasLoadedConfigRef.current || hasNavigatedAway.current) {
      return;
    }

    hasNavigatedAway.current = true;
    router.back();
  }, [config, router]);

  const handleSubmit = useCallback(
    async (payload: Parameters<NonNullable<typeof config>["onSubmit"]>[0]) => {
      if (!config) {
        return;
      }
      await config.onSubmit(payload);
      closeEditor();
      if (!hasNavigatedAway.current) {
        hasNavigatedAway.current = true;
        router.back();
      }
    },
    [closeEditor, config, router],
  );

  const handleCancel = useCallback(() => {
    if (!config) {
      return;
    }
    config.onCancel?.();
    closeEditor();
    if (!hasNavigatedAway.current) {
      hasNavigatedAway.current = true;
      router.back();
    }
  }, [closeEditor, config, router]);

  if (!config) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={palette.accent} />
      </View>
    );
  }

  const templates =
    typeof config.templates === "function"
      ? config.templates()
      : config.templates;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <Text style={styles.title}>{config.title}</Text>
        <EstimateItemForm
          initialValue={config.initialValue}
          initialTemplateId={config.initialTemplateId ?? null}
          templates={templates}
          onSubmit={handleSubmit}
          onCancel={handleCancel}
          submitLabel={config.submitLabel}
        />
      </View>
    </ScrollView>
  );
}
