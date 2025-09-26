import { Redirect } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import ConfigErrorNotice from "../components/ConfigErrorNotice";
import { useAuth } from "../context/AuthContext";

export default function Index() {
  const { session, isLoading, configError } = useAuth();

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (configError) {
    return <ConfigErrorNotice message={configError} />;
  }

  if (session) {
    return <Redirect href="/(tabs)/home" />;
  }

  return <Redirect href="/(auth)/login" />;
}
