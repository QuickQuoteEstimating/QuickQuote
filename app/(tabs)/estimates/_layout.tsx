import { Stack } from "expo-router";

export default function EstimatesLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen
        name="new"
        options={{ title: "New Estimate", presentation: "modal" }}
      />
      <Stack.Screen
        name="[id]"
        options={{ title: "Edit Estimate", presentation: "modal" }}
      />
    </Stack>
  );
}
