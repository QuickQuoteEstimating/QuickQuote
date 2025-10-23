// components/CustomerForm.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Alert, StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import "react-native-get-random-values";
import { v4 as uuidv4 } from "uuid";
import { openDB, queueChange } from "../lib/sqlite";
import { runSync } from "../lib/sync";
import { useAuth } from "../context/AuthContext";
import { Button, Card, Input } from "./ui";
import { router } from "expo-router";
import type { CustomerRecord } from "../types/customers";
import { isOnline } from "../lib/network";
import { TextInput } from "react-native";


type Props = {
  onSaved?: (customer: CustomerRecord) => void;
  onCancel?: () => void;
  style?: StyleProp<ViewStyle>;
  wrapInCard?: boolean;
};
const nameInputRef = useRef<TextInput>(null);

export default function CustomerForm({ onSaved, onCancel, style, wrapInCard = true }: Props) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");

  // 🏠 Address parts
  const [street, setStreet] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zip, setZip] = useState("");

  const [notes, setNotes] = useState("");
  const { user, session } = useAuth();
  const [saving, setSaving] = useState(false);
  const [justSavedCustomer, setJustSavedCustomer] = useState<CustomerRecord | null>(null);
  const styles = useMemo(() => createStyles(), []);

  async function saveCustomer() {
    if (!name.trim()) {
      Alert.alert("Validation", "Customer name is required.");
      return;
    }

    const user_id = user?.id ?? session?.user?.id ?? null;
    if (!user_id) {
      Alert.alert("Sign in required", "You must be signed in before you can create customers.");
      return;
    }

nameInputRef.current?.focus(); // ✅ correct + safe

    const now = new Date().toISOString();
    const newCustomer: CustomerRecord = {
      id: uuidv4(),
      user_id,
      name: name.trim(),
      phone: phone?.trim() || null,
      email: email?.trim() || null,
      street: street?.trim() || null,
      city: city?.trim() || null,
      state: state?.trim() || null,
      zip: zip?.trim() || null,
      notes: notes?.trim() || null,
      version: 1,
      updated_at: now,
      deleted_at: null,
    };

    try {
      setSaving(true);
      const db = await openDB();

      // Check network
      const online = await isOnline();
      console.log("📡 Online:", online);

      console.log("📝 Saving customer", newCustomer);

      // Always write locally
      await db.runAsync(
        `INSERT OR REPLACE INTO customers
         (id, user_id, name, phone, email, street, city, state, zip, notes, version, updated_at, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          newCustomer.id,
          newCustomer.user_id,
          newCustomer.name,
          newCustomer.phone ?? null,
          newCustomer.email ?? null,
          newCustomer.street ?? null,
          newCustomer.city ?? null,
          newCustomer.state ?? null,
          newCustomer.zip ?? null,
          newCustomer.notes ?? null,
          newCustomer.version ?? 1,
          newCustomer.updated_at ?? now,
          newCustomer.deleted_at ?? null,
        ]
      );

      // Always queue the change
      await queueChange("customers", "insert", newCustomer);

      // Sync if online
      if (online) {
        await runSync();
      }

      Alert.alert(
        "Success",
        online
          ? "Customer saved and synced."
          : "Customer saved locally. Will sync when online."
      );

      setJustSavedCustomer(newCustomer);
      onSaved?.(newCustomer);
      router.back();
    } catch (error) {
      console.error("Failed to save customer", error);
      Alert.alert("Error", "Unable to save customer. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  // === UI ===
  const content = (
    <>
<Input
  ref={nameInputRef}
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

      {/* 🏠 Address Fields */}
      <View style={styles.addressGroup}>
        <Input label="Street" placeholder="123 Main Street" value={street} onChangeText={setStreet} />
        <Input label="City" placeholder="Springfield" value={city} onChangeText={setCity} />
        <Input label="State" placeholder="RI" value={state} onChangeText={setState} />
        <Input
          label="ZIP Code"
          placeholder="02893"
          value={zip}
          onChangeText={setZip}
          keyboardType="numeric"
        />
      </View>

      <Input
        label="Account notes"
        placeholder="Project preferences, gate codes, etc."
        value={notes}
        onChangeText={setNotes}
        multiline
      />

      <View style={styles.actions}>
        <Button label="Save Customer" onPress={saveCustomer} loading={saving} disabled={saving} alignment="full" />
        {onCancel && (
          <Button label="Cancel" variant="secondary" onPress={onCancel} disabled={saving} alignment="full" />
        )}
      </View>

      {justSavedCustomer && (
        <View style={styles.estimateButtonWrapper}>
          <Button
            label={`Create Estimate for ${justSavedCustomer.name}`}
            variant="ghost"
            alignment="full"
            onPress={() => {
  if (!justSavedCustomer) return;

  const { id, name, email, phone, street, city, state, zip } = justSavedCustomer;
  setJustSavedCustomer(null);

  router.push({
    pathname: "/(tabs)/estimates/new",
    params: {
      customerId: id,
      name,
      email,
      phone,
      street,
      city,
      state,
      zip,
    },
  });
}}

          />
        </View>
      )}
    </>
  );

  return wrapInCard ? (
    <Card style={[styles.card, style]}>{content}</Card>
  ) : (
    <View style={[styles.card, style]}>{content}</View>
  );
}

function createStyles() {
  return StyleSheet.create({
    card: { gap: 16 },
    addressGroup: { gap: 12 },
    actions: { gap: 12, marginTop: 8 },
    estimateButtonWrapper: { marginTop: 16 },
  });
}
