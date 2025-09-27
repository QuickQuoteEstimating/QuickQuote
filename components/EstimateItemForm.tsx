import React, { useEffect, useMemo, useState } from "react";
import { Alert, Button, Text, TextInput, View } from "react-native";

export type EstimateItemFormValues = {
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
};

type EstimateItemFormProps = {
  initialValue?: {
    description: string;
    quantity: number;
    unit_price: number;
  };
  onSubmit: (values: EstimateItemFormValues) => void;
  onCancel: () => void;
  submitLabel?: string;
};

function parseQuantity(value: string): number {
  const parsed = parseFloat(value.replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return Math.max(0, Math.round(parsed));
}

function parseCurrency(value: string): number {
  const parsed = parseFloat(value.replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return Math.max(0, Math.round(parsed * 100) / 100);
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(value);
}

export default function EstimateItemForm({
  initialValue,
  onSubmit,
  onCancel,
  submitLabel = "Save Item",
}: EstimateItemFormProps) {
  const [description, setDescription] = useState(initialValue?.description ?? "");
  const [quantityText, setQuantityText] = useState(
    initialValue ? String(initialValue.quantity) : "1"
  );
  const [unitPriceText, setUnitPriceText] = useState(
    initialValue ? String(initialValue.unit_price) : "0"
  );

  useEffect(() => {
    if (!initialValue) {
      return;
    }
    setDescription(initialValue.description);
    setQuantityText(String(initialValue.quantity));
    setUnitPriceText(String(initialValue.unit_price));
  }, [initialValue]);

  const total = useMemo(() => {
    const quantity = parseQuantity(quantityText);
    const unitPrice = parseCurrency(unitPriceText);
    return Math.round(quantity * unitPrice * 100) / 100;
  }, [quantityText, unitPriceText]);

  const handleSubmit = () => {
    const trimmedDescription = description.trim();
    if (!trimmedDescription) {
      Alert.alert("Validation", "Please enter a description for the item.");
      return;
    }

    const quantity = parseQuantity(quantityText);
    if (quantity <= 0) {
      Alert.alert("Validation", "Quantity must be greater than zero.");
      return;
    }

    const unitPrice = parseCurrency(unitPriceText);

    onSubmit({
      description: trimmedDescription,
      quantity,
      unit_price: unitPrice,
      total,
    });
  };

  return (
    <View style={{ gap: 12 }}>
      <View style={{ gap: 6 }}>
        <Text style={{ fontWeight: "600" }}>Description</Text>
        <TextInput
          placeholder="Item description"
          value={description}
          onChangeText={setDescription}
          style={{ borderWidth: 1, borderRadius: 8, padding: 10 }}
        />
      </View>

      <View style={{ gap: 6 }}>
        <Text style={{ fontWeight: "600" }}>Quantity</Text>
        <TextInput
          placeholder="0"
          value={quantityText}
          onChangeText={setQuantityText}
          keyboardType="numeric"
          style={{ borderWidth: 1, borderRadius: 8, padding: 10 }}
        />
      </View>

      <View style={{ gap: 6 }}>
        <Text style={{ fontWeight: "600" }}>Unit Price</Text>
        <TextInput
          placeholder="0.00"
          value={unitPriceText}
          onChangeText={setUnitPriceText}
          keyboardType="decimal-pad"
          style={{ borderWidth: 1, borderRadius: 8, padding: 10 }}
        />
      </View>

      <View style={{ gap: 6 }}>
        <Text style={{ fontWeight: "600" }}>Line Total</Text>
        <Text>{formatCurrency(total)}</Text>
      </View>

      <View style={{ flexDirection: "row", gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Button title="Cancel" onPress={onCancel} />
        </View>
        <View style={{ flex: 1 }}>
          <Button title={submitLabel} onPress={handleSubmit} />
        </View>
      </View>
    </View>
  );
}
