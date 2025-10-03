import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { useNavigation, useRouter } from "expo-router";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import EstimateItemForm from "../../../components/EstimateItemForm";
import { useItemEditor } from "../../../context/ItemEditorContext";
import { Card } from "../../../components/ui";
import { Theme } from "../../../theme";
import { useThemeContext } from "../../../theme/ThemeProvider";

function createStyles(theme: Theme) {
  const { colors } = theme;
  return StyleSheet.create({
    loadingContainer: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.background,
    },
    screen: {
      flex: 1,
      backgroundColor: colors.background,
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
      color: colors.primaryText,
    },
  });
}

export default function EstimateItemEditorScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { config, closeEditor } = useItemEditor();
  const hasNavigatedAway = useRef(false);
  const hasLoadedConfigRef = useRef(false);
  const { theme } = useThemeContext();
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
        <ActivityIndicator size="large" color={theme.colors.accent} />
      </View>
    );
  }

  const templates = typeof config.templates === "function" ? config.templates() : config.templates;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Card style={styles.card}>
        <Text style={styles.title}>{config.title}</Text>
        <EstimateItemForm
          initialValue={config.initialValue}
          initialTemplateId={config.initialTemplateId ?? null}
          templates={templates}
          materialMarkupValue={config.materialMarkupValue}
          materialMarkupMode={config.materialMarkupMode}
          onSubmit={handleSubmit}
          onCancel={handleCancel}
          submitLabel={config.submitLabel}
          showLibraryToggle={config.showLibraryToggle ?? true}
        />
      </Card>
    </ScrollView>
  );
}
