import React, { useState } from "react";
import { View, TextInput, StyleSheet, Text, Platform } from "react-native";
import KeyboardWrapper from "../../components/KeyboardWrapper";

export default function KeyboardTest() {
  const [a, setA] = useState(""); const [b, setB] = useState("");
  return (
    <KeyboardWrapper>
      <View style={styles.box}>
        <Text style={styles.title}>Keyboard Test</Text>
        <TextInput
          style={styles.input}
          placeholder="First"
          value={a}
          onChangeText={setA}
          returnKeyType="next"
        />
        <TextInput
          style={styles.input}
          placeholder="Second"
          value={b}
          onChangeText={setB}
          returnKeyType="done"
        />
      </View>
    </KeyboardWrapper>
  );
}

const styles = StyleSheet.create({
  box: { gap: 12, padding: 16 },
  title: { fontSize: 18, fontWeight: "600", marginBottom: 4 },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#999",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === "ios" ? 10 : 8,
  },
});
