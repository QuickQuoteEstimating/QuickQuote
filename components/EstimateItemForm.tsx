import React, { useEffect, useMemo, useState } from "react";
import { Alert, StyleSheet, Switch, Text, View } from "react-native";
import { Picker } from "@react-native-picker/picker";
import { Theme } from "../theme";
import { useThemeContext } from "../theme/ThemeProvider";
import { Button, Input } from "./ui";

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
    initialValue ? String(initialValue.quantity) : "1",
  );
  const [unitPriceText, setUnitPriceText] = useState(
    initialValue ? String(initialValue.unit_price) : "0",
  );
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(
    initialTemplateId ?? null,
  );
  const [saveToLibrary, setSaveToLibrary] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState(false);
  const { theme } = useThemeContext();
  const styles = useMemo(() => createStyles(theme), [theme]);

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
          <View style={styles.pickerShell}>
            <Picker
              selectedValue={selectedTemplateId ?? ""}
              onValueChange={(value) => {
                const nextValue = value ? String(value) : "";
                const normalized = nextValue ? nextValue : null;
                setSelectedTemplateId(normalized);
                setSaveToLibrary(Boolean(normalized));
                applyTemplate(normalized);
              }}
              style={styles.picker}
              dropdownIconColor={theme.colors.primary}
            >
              <Picker.Item label="Select a saved item" value="" />
              {templates.map((template) => (
                <Picker.Item key={template.id} label={template.description} value={template.id} />
              ))}
            </Picker>
          </View>
        </View>
      ) : null}

      <Input
        label="Description"
        placeholder="Item description"
        value={description}
        onChangeText={setDescription}
        multiline
      />

      <View style={styles.row}>
        <View style={styles.rowField}>
          <Input
            label="Quantity"
            placeholder="0"
            value={quantityText}
            onChangeText={setQuantityText}
            keyboardType="numeric"
          />
        </View>
        <View style={styles.rowField}>
          <Input
            label="Unit Price"
            placeholder="0.00"
            value={unitPriceText}
            onChangeText={setUnitPriceText}
            keyboardType="decimal-pad"
          />
        </View>
      </View>

      <View style={styles.summaryRow}>
        <Text style={styles.summaryLabel}>Line Total</Text>
        <Text style={styles.summaryValue}>{formatCurrency(total)}</Text>
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
          trackColor={{ true: theme.colors.primarySoft, false: theme.colors.border }}
          thumbColor={saveToLibrary ? theme.colors.surface : undefined}
        />
      </View>

      <View style={styles.actionRow}>
        <View style={styles.actionFlex}>
          <Button label="Cancel" variant="secondary" onPress={onCancel} disabled={submitting} />
        </View>
        <View style={styles.actionFlex}>
          <Button
            label={submitLabel}
            onPress={handleSubmit}
            loading={submitting}
            disabled={submitting}
          />
        </View>
      </View>
    </View>
  );
}

function createStyles(theme: Theme) {
  const { colors } = theme;
  return StyleSheet.create({
    container: {
      gap: 20,
    },
    fieldGroup: {
      gap: 8,
    },
    label: {
      fontSize: 14,
      fontWeight: "600",
      color: colors.textMuted,
    },
    pickerShell: {
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceMuted,
      overflow: "hidden",
    },
    picker: {
      height: 52,
      color: colors.primaryText,
    },
    row: {
      flexDirection: "row",
      gap: 16,
    },
    rowField: {
      flex: 1,
    },
    summaryRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderRadius: 16,
      backgroundColor: colors.surfaceMuted,
    },
    summaryLabel: {
      fontSize: 15,
      fontWeight: "600",
      color: colors.textMuted,
    },
    summaryValue: {
      fontSize: 18,
      fontWeight: "700",
      color: colors.primaryText,
    },
    switchRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 16,
    },
    switchText: {
      flex: 1,
      gap: 4,
    },
    switchLabel: {
      fontSize: 16,
      fontWeight: "600",
      color: colors.primaryText,
    },
    switchHint: {
      fontSize: 13,
      color: colors.textMuted,
      lineHeight: 18,
    },
    actionRow: {
      flexDirection: "row",
      gap: 12,
    },
    actionFlex: {
      flex: 1,
    },
  });
}
