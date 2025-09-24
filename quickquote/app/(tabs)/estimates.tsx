import { useState } from "react";
import { View, Button, Text } from "react-native";
import CustomerPicker from "../../components/CustomerPicker";

export default function Estimates() {
  const [selectedCustomer, setSelectedCustomer] = useState<string | null>(null);

  const createEstimate = () => {
    if (!selectedCustomer) {
      alert("Please select a customer first.");
      return;
    }
    alert(`✅ Estimate created for ${selectedCustomer}`);
  };

  return (
    <View style={{ flex: 1, padding: 20 }}>
      <Text style={{ fontSize: 18, marginBottom: 10 }}>Create New Estimate</Text>

      <CustomerPicker
        selectedCustomer={selectedCustomer}
        onSelect={setSelectedCustomer}
      />

      <Button title="Create Estimate" onPress={createEstimate} />
    </View>
  );
}
