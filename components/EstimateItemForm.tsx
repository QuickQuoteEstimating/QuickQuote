import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  Switch,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Picker } from "@react-native-picker/picker";
import { palette } from "../lib/theme";

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

const styles = StyleSheet.create({
  container: {
    gap: 16,
  },
  fieldGroup: {
    gap: 6,
  },
  label: {
    fontWeight: "600",
    color: palette.primaryText,
  },
  pickerContainer: {
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: palette.surfaceSubtle,
  },
  textInput: {
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 12,
    padding: 12,
    fontSize: 16,
    color: palette.primaryText,
    backgroundColor: palette.surfaceSubtle,
  },
  totalValue: {
    fontSize: 16,
    fontWeight: "600",
    color: palette.primaryText,
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  switchText: {
    flex: 1,
    gap: 4,
  },
  switchLabel: {
    fontWeight: "600",
    color: palette.primaryText,
  },
  switchHint: {
    color: palette.mutedText,
    fontSize: 12,
    lineHeight: 16,
  },
  actionRow: {
    flexDirection: "row",
    gap: 12,
  },
  actionFlex: {
    flex: 1,
  },
});

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
    <View style={styles.container}>
      {templates.length > 0 ? (
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Saved items</Text>
          <View style={styles.pickerContainer}>
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

      <View style={styles.fieldGroup}>
        <Text style={styles.label}>Description</Text>
        <TextInput
          placeholder="Item description"
          value={description}
          onChangeText={setDescription}
          placeholderTextColor={palette.mutedText}
          style={styles.textInput}
        />
      </View>

      <View style={styles.fieldGroup}>
        <Text style={styles.label}>Quantity</Text>
        <TextInput
          placeholder="0"
          value={quantityText}
          onChangeText={setQuantityText}
          keyboardType="numeric"
          placeholderTextColor={palette.mutedText}
          style={styles.textInput}
        />
      </View>

      <View style={styles.fieldGroup}>
        <Text style={styles.label}>Unit Price</Text>
        <TextInput
          placeholder="0.00"
          value={unitPriceText}
          onChangeText={setUnitPriceText}
          keyboardType="decimal-pad"
          placeholderTextColor={palette.mutedText}
          style={styles.textInput}
        />
      </View>

      <View style={styles.fieldGroup}>
        <Text style={styles.label}>Line Total</Text>
        <Text style={styles.totalValue}>{formatCurrency(total)}</Text>
      </View>

      <View style={styles.switchRow}>
        <View style={styles.switchText}>
          <Text style={styles.switchLabel}>Save for future use</Text>
          <Text style={styles.switchHint}>
            Adds this item to your library so you can quickly reuse or update it later.
          </Text>
        </View>
        <Switch
          value={saveToLibrary}
          onValueChange={setSaveToLibrary}
          trackColor={{ true: palette.accentMuted, false: palette.border }}
          thumbColor={saveToLibrary ? palette.surface : undefined}
        />
      </View>

      <View style={styles.actionRow}>
        <View style={styles.actionFlex}>
          <Button
            title="Cancel"
            onPress={onCancel}
            disabled={submitting}
            color={palette.secondaryText}
          />
        </View>
        <View style={styles.actionFlex}>
          <Button
            title={submitLabel}
            onPress={handleSubmit}
            disabled={submitting}
            color={palette.accent}
          />
        </View>
      </View>
    </View>
  );
}
