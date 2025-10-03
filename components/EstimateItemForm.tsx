import React, { useEffect, useMemo, useState } from "react";
import { Alert, StyleSheet, Switch, Text, View } from "react-native";
import { Picker } from "@react-native-picker/picker";
import { Feather } from "@expo/vector-icons";
import { Theme } from "../theme";
import { useThemeContext } from "../theme/ThemeProvider";
import { Button, Input } from "./ui";
import { applyMarkup, roundCurrency, type MarkupMode } from "../lib/estimateMath";

export type EstimateItemFormValues = {
  description: string;
  quantity: number;
  unit_price: number;
  apply_markup: boolean;
  base_total: number;
  total: number;
};

export type EstimateItemTemplate = {
  id: string;
  description: string;
  unit_price: number;
  default_quantity?: number | null;
  default_markup_applicable?: boolean | null;
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
    apply_markup?: boolean;
  };
  initialTemplateId?: string | null;
  templates?: EstimateItemTemplate[];
  materialMarkupValue: number;
  materialMarkupMode: MarkupMode;
  onSubmit: (payload: EstimateItemFormSubmit) => Promise<void> | void;
  onCancel: () => void;
  submitLabel?: string;
  showLibraryToggle?: boolean;
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
  materialMarkupValue,
  materialMarkupMode,
  onSubmit,
  onCancel,
  submitLabel = "Save Item",
  showLibraryToggle = true,
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
  const [markupApplied, setMarkupApplied] = useState<boolean>(initialValue?.apply_markup ?? true);
  const [saveToLibrary, setSaveToLibrary] = useState<boolean>(showLibraryToggle);
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
    setMarkupApplied(initialValue.apply_markup ?? true);
  }, [initialValue]);

  useEffect(() => {
    setSelectedTemplateId(initialTemplateId ?? null);
    setSaveToLibrary(showLibraryToggle);
  }, [initialTemplateId, showLibraryToggle]);

  const templateMap = useMemo(() => {
    return templates.reduce<Record<string, EstimateItemTemplate>>((acc, template) => {
      acc[template.id] = template;
      return acc;
    }, {});
  }, [templates]);

  const markupRule = useMemo(
    () => ({ mode: materialMarkupMode, value: materialMarkupValue }),
    [materialMarkupMode, materialMarkupValue],
  );

  const { baseTotal, finalTotal, markupAmount } = useMemo(() => {
    const quantity = parseQuantity(quantityText);
    const unitPrice = parseCurrency(unitPriceText);
    const raw = roundCurrency(quantity * unitPrice);
    const result = applyMarkup(raw, markupRule, { apply: markupApplied });
    return { baseTotal: raw, finalTotal: result.total, markupAmount: result.markupAmount };
  }, [markupApplied, markupRule, quantityText, unitPriceText]);

  const applyTemplate = (templateId: string | null) => {
    if (!templateId) {
      return;
    }
    const template = templateMap[templateId];
    if (!template) {
      return;
    }

    if (template.description) {
      setDescription(template.description);
    }

    if (template.default_quantity !== undefined && template.default_quantity !== null) {
      setQuantityText(String(template.default_quantity));
    }

    if (typeof template.unit_price === "number") {
      setUnitPriceText(String(template.unit_price));
    }

    if (template.default_markup_applicable !== undefined && template.default_markup_applicable !== null) {
      setMarkupApplied(Boolean(template.default_markup_applicable));
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
        apply_markup: markupApplied,
        base_total: baseTotal,
        total: finalTotal,
      },
      saveToLibrary: showLibraryToggle ? saveToLibrary : false,
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
              dropdownIconColor={theme.colors.accent}
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

      <View style={styles.toggleRow}>
        <View style={styles.toggleInfo}>
          <Text style={styles.switchLabel}>Apply markup</Text>
          <Text style={styles.switchHint}>Uses your material markup setting.</Text>
        </View>
        <Switch
          value={markupApplied}
          onValueChange={setMarkupApplied}
          trackColor={{ false: theme.colors.border, true: theme.colors.accentSoft }}
          thumbColor={markupApplied ? theme.colors.accent : undefined}
        />
      </View>

      <View style={styles.summaryRow}>
        <View style={styles.summaryColumn}>
          <Text style={styles.summaryLabel}>Base total</Text>
          <Text style={styles.summaryHint}>Quantity × unit price</Text>
        </View>
        <Text style={styles.summaryValue}>{formatCurrency(baseTotal)}</Text>
      </View>
      {markupApplied && markupAmount > 0 ? (
        <View style={styles.summaryRow}>
          <View style={styles.summaryColumn}>
            <Text style={styles.summaryLabel}>Markup applied</Text>
            <Text style={styles.summaryHint}>
              {materialMarkupMode === "percentage"
                ? `${materialMarkupValue}% material markup`
                : `${formatCurrency(materialMarkupValue)} flat markup`}
            </Text>
          </View>
          <Text style={styles.summaryValue}>{formatCurrency(markupAmount)}</Text>
        </View>
      ) : null}
      <View style={[styles.summaryRow, styles.summaryTotalRow]}>
        <Text style={styles.summaryLabel}>Line total</Text>
        <Text style={styles.summaryTotalValue}>{formatCurrency(finalTotal)}</Text>
      </View>

      {showLibraryToggle ? (
        <View style={styles.libraryRow}>
          <View style={styles.libraryInfo}>
            <Text style={styles.switchLabel}>Save to library</Text>
            <Text style={styles.switchHint}>
              Adds this item to your library so you can quickly reuse or update it later.
            </Text>
          </View>
          <Button
            label={saveToLibrary ? "Will update library" : "Save to library"}
            variant={saveToLibrary ? "secondary" : "primary"}
            onPress={() => setSaveToLibrary((value) => !value)}
            alignment="inline"
            disabled={submitting}
            style={styles.libraryButton}
            leadingIcon={
              <Feather
                name={saveToLibrary ? "check" : "bookmark"}
                size={18}
                color={saveToLibrary ? theme.colors.accent : theme.colors.surface}
              />
            }
          />
        </View>
      ) : null}

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
      color: colors.mutedText,
    },
    pickerShell: {
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceAlt,
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
    toggleRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: 8,
    },
    toggleInfo: {
      flex: 1,
      marginRight: 12,
      gap: 4,
    },
    summaryRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderRadius: 16,
      backgroundColor: colors.surfaceAlt,
    },
    summaryColumn: {
      flex: 1,
      marginRight: 12,
      gap: 2,
    },
    summaryLabel: {
      fontSize: 15,
      fontWeight: "600",
      color: colors.mutedText,
    },
    summaryHint: {
      fontSize: 12,
      color: colors.mutedText,
    },
    summaryValue: {
      fontSize: 18,
      fontWeight: "700",
      color: colors.primaryText,
    },
    summaryTotalRow: {
      borderWidth: 1,
      borderColor: colors.accent,
      backgroundColor: colors.accentSoft,
    },
    summaryTotalValue: {
      fontSize: 20,
      fontWeight: "700",
      color: colors.accent,
    },
    libraryRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 16,
      flexWrap: "wrap",
    },
    libraryInfo: {
      flex: 1,
      minWidth: 200,
      gap: 4,
    },
    switchLabel: {
      fontSize: 16,
      fontWeight: "600",
      color: colors.primaryText,
    },
    switchHint: {
      fontSize: 13,
      color: colors.mutedText,
      lineHeight: 18,
    },
    libraryButton: {
      flexGrow: 0,
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
