import React, { useCallback, useEffect, useRef } from "react";
import { useNavigation, useRouter } from "expo-router";
import { ScrollView, Text, View } from "react-native";
import EstimateItemForm from "../../../components/EstimateItemForm";
import { useItemEditor } from "../../../context/ItemEditorContext";

export default function EstimateItemEditorScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { config, closeEditor } = useItemEditor();
  const hasNavigatedAway = useRef(false);

  useEffect(() => {
    if (config?.title) {
      navigation.setOptions({ title: config.title });
    }
  }, [config?.title, navigation]);

  useEffect(() => {
    if (!config && !hasNavigatedAway.current) {
      hasNavigatedAway.current = true;
      router.back();
    }
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
    return <View style={{ flex: 1, backgroundColor: "#fff" }} />;
  }

  return (
    <ScrollView
      contentContainerStyle={{ padding: 16, gap: 16 }}
      style={{ flex: 1, backgroundColor: "#fff" }}
    >
      <Text style={{ fontSize: 20, fontWeight: "600" }}>{config.title}</Text>
      <EstimateItemForm
        initialValue={config.initialValue}
        initialTemplateId={config.initialTemplateId ?? null}
        templates={config.templates}
        onSubmit={handleSubmit}
        onCancel={handleCancel}
        submitLabel={config.submitLabel}
      />
    </ScrollView>
  );
}
