import React from "react";
import { View, Text, StyleSheet } from "react-native";

export default function EstimatesScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>📄 Estimates Screen</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", alignItems: "center" },
  text: { fontSize: 20, fontWeight: "600" },
});

const estimatestyles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  text: { fontSize: 20 },
});
