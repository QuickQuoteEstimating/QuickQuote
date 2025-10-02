import { Alert, Platform } from "react-native";

export function confirmDelete(
  title: string,
  message: string,
  onConfirm: () => void | Promise<void>,
): void {
  if (Platform.OS === "web") {
    const promptMessage = message ? `${title}\n\n${message}` : title;
    if (typeof window !== "undefined" && window.confirm(promptMessage)) {
      void onConfirm();
    }
    return;
  }

  Alert.alert(title, message, [
    { text: "Cancel", style: "cancel" },
    {
      text: "Delete",
      style: "destructive",
      onPress: () => {
        void onConfirm();
      },
    },
  ]);
}
