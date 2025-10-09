import { Stack } from "expo-router";
import { ItemEditorProvider } from "../../../context/ItemEditorContext";

export default function EstimatesLayout() {
  return (
    <ItemEditorProvider>
      <Stack
        screenOptions={{
          headerShown: false,
          animation: "none",
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="[id]" />
      </Stack>
    </ItemEditorProvider>
  );
}
