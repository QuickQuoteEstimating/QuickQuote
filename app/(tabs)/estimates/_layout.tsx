import { Stack } from "expo-router";
import { ItemEditorProvider } from "../../../context/ItemEditorContext";

export default function EstimatesLayout() {
  return (
    <ItemEditorProvider>
      <Stack>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="new" options={{ title: "New Estimate", presentation: "modal" }} />
        <Stack.Screen name="[id]" options={{ title: "Edit Estimate", presentation: "modal" }} />
        <Stack.Screen name="item-editor" options={{ title: "Item" }} />
      </Stack>
    </ItemEditorProvider>
  );
}
