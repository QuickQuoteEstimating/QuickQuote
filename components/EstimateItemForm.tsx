import React, { useEffect, useMemo, useState } from "react";
import { Alert, Button, Switch, Text, TextInput, View } from "react-native";
import { Picker } from "@react-native-picker/picker";

export type EstimateItemFormValues = {
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
};

export type EstimateItemTemplate = {
  id: string;
  description: string;
  unit_price: number;
  default_quantity?: number | null;
};

export type EstimateItemFormSubmit = {
  values: EstimateItemFormValues;
  saveToLibrary: boolean;
  templateId: string | null;
};

type EstimateItemFormProps = {
  initialValue?: {
    description: string;
    quantity: number;
    unit_price: number;
  };
  initialTemplateId?: string | null;
  templates?: EstimateItemTemplate[];
  onSubmit: (payload: EstimateItemFormSubmit) => Promise<void> | void;
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
  initialTemplateId = null,
  templates = [],
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
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(
    initialTemplateId ?? null
  );
  const [saveToLibrary, setSaveToLibrary] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!initialValue) {
      return;
    }
    setDescription(initialValue.description);
    setQuantityText(String(initialValue.quantity));
    setUnitPriceText(String(initialValue.unit_price));
  }, [initialValue]);

  useEffect(() => {
    setSelectedTemplateId(initialTemplateId ?? null);
    setSaveToLibrary(true);
  }, [initialTemplateId]);

  const templateMap = useMemo(() => {
    return templates.reduce<Record<string, EstimateItemTemplate>>((acc, template) => {
      acc[template.id] = template;
      return acc;
    }, {});
  }, [templates]);

  const total = useMemo(() => {
    const quantity = parseQuantity(quantityText);
    const unitPrice = parseCurrency(unitPriceText);
    return Math.round(quantity * unitPrice * 100) / 100;
  }, [quantityText, unitPriceText]);

  const applyTemplate = (templateId: string | null) => {
    if (!templateId) {
      return;
    }
    const template = templateMap[templateId];
    if (!template) {
      return;
    }

    setDescription(template.description);
    setUnitPriceText(template.unit_price.toString());
    if (template.default_quantity && template.default_quantity > 0) {
      setQuantityText(String(template.default_quantity));
    }
  };

  const handleSubmit = async () => {
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

    const payload: EstimateItemFormSubmit = {
      values: {
        description: trimmedDescription,
        quantity,
        unit_price: unitPrice,
        total,
      },
      saveToLibrary,
      templateId: selectedTemplateId,
    };

    try {
      setSubmitting(true);
      await onSubmit(payload);
    } catch (error) {
      console.error("Failed to save estimate item", error);
      Alert.alert("Error", "Unable to save this item. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={{ gap: 12 }}>
      {templates.length > 0 ? (
        <View style={{ gap: 6 }}>
          <Text style={{ fontWeight: "600" }}>Saved items</Text>
          <View style={{ borderWidth: 1, borderRadius: 8 }}>
            <Picker
              selectedValue={selectedTemplateId ?? ""}
              onValueChange={(value) => {
                const nextValue = value ? String(value) : "";
                const normalized = nextValue ? nextValue : null;
                setSelectedTemplateId(normalized);
                setSaveToLibrary(Boolean(normalized));
                applyTemplate(normalized);
              }}
            >
              <Picker.Item label="Select a saved item" value="" />
              {templates.map((template) => (
                <Picker.Item
                  key={template.id}
                  label={template.description}
                  value={template.id}
                />
              ))}
            </Picker>
          </View>
        </View>
      ) : null}

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

      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingVertical: 4,
        }}
      >
        <View style={{ flex: 1, paddingRight: 12 }}>
          <Text style={{ fontWeight: "600" }}>Save for future use</Text>
          <Text style={{ color: "#555", marginTop: 2, fontSize: 12 }}>
            Adds this item to your library so you can quickly reuse or update it later.
          </Text>
        </View>
        <Switch value={saveToLibrary} onValueChange={setSaveToLibrary} />
      </View>

      <View style={{ flexDirection: "row", gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Button title="Cancel" onPress={onCancel} disabled={submitting} />
        </View>
        <View style={{ flex: 1 }}>
          <Button title={submitLabel} onPress={handleSubmit} disabled={submitting} />
        </View>
      </View>
    </View>
  );
}
