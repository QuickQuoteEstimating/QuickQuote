import React, { useState } from "react";
import { View, Text, Button, Alert } from "react-native";
import CustomerPicker from "../../components/CustomerPicker";
import { queueChange } from "../../lib/sqlite";
import "react-native-get-random-values";
import { v4 as uuidv4 } from "uuid";
import { supabase } from "../../lib/supabase";

export default function Estimates() {
  const [selectedCustomer, setSelectedCustomer] = useState<string | null>(null);

  async function createEstimate() {
    if (!selectedCustomer) {
      Alert.alert("Validation", "Please select a customer first.");
      return;
    }

    const { data } = await supabase.auth.getUser();
    const user_id = data.user?.id ?? null;

    const newEstimate = {
      id: uuidv4(),
      user_id,
      customer_id: selectedCustomer,
      title: "New Estimate",
      notes: null,
      total: 0,
      version: 1,
      updated_at: new Date().toISOString(),
      deleted_at: null,
    };

    // Queue for sync (optional: also insert into local estimates mirror if you want to list locally)
    await queueChange("estimates", "insert", newEstimate);

    Alert.alert("Success", "Estimate created (will sync when online).");
  }

  return (
    <View style={{ flex: 1, padding: 20, gap: 16 }}>
      <Text style={{ fontSize: 20, fontWeight: "bold" }}>Create New Estimate</Text>

      <CustomerPicker
        selectedCustomer={selectedCustomer}
        onSelect={setSelectedCustomer}
      />

      <Button title="Create Estimate" onPress={createEstimate} />
    </View>
  );
}
