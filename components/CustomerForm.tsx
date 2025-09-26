// components/CustomerForm.tsx
import React, { useState } from "react";
import { View, TextInput, Button, Alert } from "react-native";
import "react-native-get-random-values";
import { v4 as uuidv4 } from "uuid";
import { openDB, queueChange } from "../lib/sqlite";
import { runSync } from "../lib/sync";
import { useAuth } from "../context/AuthContext";

type Props = {
  onSaved?: (customer: { id: string; name: string }) => void;
  onCancel?: () => void;
};

export default function CustomerForm({ onSaved, onCancel }: Props) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const { user } = useAuth();

  async function saveCustomer() {
    if (!name.trim()) {
      Alert.alert("Validation", "Customer name is required.");
      return;
    }

    const userId = user?.id;
    if (!userId) {
      Alert.alert(
        "Authentication required",
        "Please sign in before adding customers."
      );
      return;
    }

    const newCustomer = {
      id: uuidv4(),
      user_id: userId,
      name: name.trim(),
      phone: phone?.trim() || null,
      email: email?.trim() || null,
      address: null,
      version: 1,
      updated_at: new Date().toISOString(),
      deleted_at: null,
    };

    // Local mirror (so it appears immediately in pickers/lists)
    const db = await openDB();
    await db.runAsync(
      `INSERT OR REPLACE INTO customers
       (id, user_id, name, phone, email, address, version, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        newCustomer.id,
        newCustomer.user_id,
        newCustomer.name,
        newCustomer.phone ?? null,
        newCustomer.email ?? null,
        newCustomer.address ?? null,
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
  }

  return (
    <View style={{ gap: 8 }}>
      <TextInput
        placeholder="Name"
        value={name}
        onChangeText={setName}
        style={{ borderWidth: 1, padding: 10, borderRadius: 8 }}
      />
      <TextInput
        placeholder="Phone"
        value={phone}
        onChangeText={setPhone}
        style={{ borderWidth: 1, padding: 10, borderRadius: 8 }}
      />
      <TextInput
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        style={{ borderWidth: 1, padding: 10, borderRadius: 8 }}
      />
      <Button title="Save Customer" onPress={saveCustomer} />
      {onCancel ? <Button title="Cancel" onPress={onCancel} /> : null}
    </View>
  );
}
