import React, { useCallback, useEffect, useMemo, useRef } from "react";
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
import { Card } from "../../../components/ui";
import { useTheme, type Theme } from "../../../lib/theme";

function createStyles(theme: Theme) {
  return StyleSheet.create({
    loadingContainer: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.background,
    },
    screen: {
      flex: 1,
      backgroundColor: theme.background,
    },
    content: {
      padding: 24,
      paddingBottom: 160,
    },
    card: {
      gap: 16,
    },
    title: {
      fontSize: 24,
      fontWeight: "700",
      color: theme.primaryText,
    },
  });
}

export default function EstimateItemEditorScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { config, closeEditor } = useItemEditor();
  const hasNavigatedAway = useRef(false);
  const hasLoadedConfigRef = useRef(false);
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

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
        <ActivityIndicator size="large" color={theme.accent} />
      </View>
    );
  }

  const templates =
    typeof config.templates === "function"
      ? config.templates()
      : config.templates;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Card style={styles.card}>
        <Text style={styles.title}>{config.title}</Text>
        <EstimateItemForm
          initialValue={config.initialValue}
          initialTemplateId={config.initialTemplateId ?? null}
          templates={templates}
          onSubmit={handleSubmit}
          onCancel={handleCancel}
          submitLabel={config.submitLabel}
        />
      </Card>
    </ScrollView>
  );
}
