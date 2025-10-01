// components/CustomerForm.tsx
import React, { useMemo, useState } from "react";
import { Alert, StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import "react-native-get-random-values";
import { v4 as uuidv4 } from "uuid";
import { openDB, queueChange } from "../lib/sqlite";
import { runSync } from "../lib/sync";
import { useAuth } from "../context/AuthContext";
import { Button, Card, Input } from "./ui";

type Props = {
  onSaved?: (customer: { id: string; name: string }) => void;
  onCancel?: () => void;
  style?: StyleProp<ViewStyle>;
};

export default function CustomerForm({ onSaved, onCancel, style }: Props) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const { user, session } = useAuth();
  const [saving, setSaving] = useState(false);
  const styles = useMemo(() => createStyles(), []);

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
    try {
      setSaving(true);
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
        ],
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
    } catch (error) {
      console.error("Failed to save customer", error);
      Alert.alert("Error", "Unable to save this customer. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card style={[styles.card, style]}>
      <Input
        label="Name"
        placeholder="John Doe"
        value={name}
        onChangeText={setName}
        autoCapitalize="words"
        returnKeyType="next"
      />
      <Input
        label="Phone"
        placeholder="(555) 123-4567"
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
        returnKeyType="next"
      />
      <Input
        label="Email"
        placeholder="you@example.com"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        textContentType="emailAddress"
        returnKeyType="next"
      />
      <Input
        label="Address"
        placeholder="123 Elm St"
        value={address}
        onChangeText={setAddress}
        returnKeyType="next"
      />
      <Input
        label="Account notes"
        placeholder="Project preferences, gate codes, etc."
        value={notes}
        onChangeText={setNotes}
        multiline
      />
      <View style={styles.actions}>
        <Button
          label="Save Customer"
          onPress={saveCustomer}
          loading={saving}
          disabled={saving}
        />
        {onCancel ? (
          <Button
            label="Cancel"
            variant="secondary"
            onPress={onCancel}
            disabled={saving}
          />
        ) : null}
      </View>
    </Card>
  );
}

function createStyles() {
  return StyleSheet.create({
    card: {
      gap: 16,
    },
    actions: {
      gap: 12,
    },
  });
}
