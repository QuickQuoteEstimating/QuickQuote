// components/CustomerForm.tsx
import React, { useState } from "react";
import { View, TextInput, Button, Alert, StyleSheet } from "react-native";
import "react-native-get-random-values";
import { v4 as uuidv4 } from "uuid";
import { openDB, queueChange } from "../lib/sqlite";
import { runSync } from "../lib/sync";
import { useAuth } from "../context/AuthContext";
import { palette, cardShadow } from "../lib/theme";

type Props = {
  onSaved?: (customer: { id: string; name: string }) => void;
  onCancel?: () => void;
};

export default function CustomerForm({ onSaved, onCancel }: Props) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const { user, session } = useAuth();

  async function saveCustomer() {
    if (!name.trim()) {
      Alert.alert("Validation", "Customer name is required.");
      return;
    }

    const user_id = user?.id ?? session?.user?.id ?? null;
    if (!user_id) {
      Alert.alert(
        "Sign in required",
        "You must be signed in before you can create customers."
      );
      return;
    }

    const newCustomer = {
      id: uuidv4(),
      user_id,
      name: name.trim(),
      phone: phone?.trim() || null,
      email: email?.trim() || null,
      address: address?.trim() || null,
      notes: notes?.trim() || null,
      version: 1,
      updated_at: new Date().toISOString(),
      deleted_at: null,
    };

    // Local mirror (so it appears immediately in pickers/lists)
    const db = await openDB();
    await db.runAsync(
      `INSERT OR REPLACE INTO customers
       (id, user_id, name, phone, email, address, notes, version, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        newCustomer.id,
        newCustomer.user_id,
        newCustomer.name,
        newCustomer.phone ?? null,
        newCustomer.email ?? null,
        newCustomer.address ?? null,
        newCustomer.notes ?? null,
        newCustomer.version ?? 1,
        newCustomer.updated_at ?? new Date().toISOString(),
        newCustomer.deleted_at ?? null,
      ]
    );

    // Queue for server sync
    await queueChange("customers", "insert", newCustomer);
    await runSync();

    Alert.alert("Success", "Customer saved (will sync when online).");
    if (onSaved) onSaved({ id: newCustomer.id, name: newCustomer.name });

    // reset form
    setName("");
    setPhone("");
    setEmail("");
    setAddress("");
    setNotes("");
  }

  return (
    <View style={styles.container}>
      <TextInput
        placeholder="Name"
        placeholderTextColor={palette.mutedText}
        value={name}
        onChangeText={setName}
        style={styles.input}
      />
      <TextInput
        placeholder="Phone"
        placeholderTextColor={palette.mutedText}
        value={phone}
        onChangeText={setPhone}
        style={styles.input}
      />
      <TextInput
        placeholder="Email"
        placeholderTextColor={palette.mutedText}
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        style={styles.input}
      />
      <TextInput
        placeholder="Address"
        placeholderTextColor={palette.mutedText}
        value={address}
        onChangeText={setAddress}
        style={styles.input}
      />
      <TextInput
        placeholder="Account notes"
        placeholderTextColor={palette.mutedText}
        value={notes}
        onChangeText={setNotes}
        multiline
        numberOfLines={3}
        style={styles.textArea}
      />
      <Button title="Save Customer" onPress={saveCustomer} color={palette.accent} />
      {onCancel ? (
        <Button title="Cancel" onPress={onCancel} color={palette.secondaryText} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 10,
  },
  input: {
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: palette.surface,
    color: palette.primaryText,
    ...cardShadow(4),
  },
  textArea: {
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: palette.surface,
    color: palette.primaryText,
    minHeight: 90,
    textAlignVertical: "top",
    ...cardShadow(4),
  },
});
