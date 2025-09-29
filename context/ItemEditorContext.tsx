import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";
import type {
  EstimateItemFormSubmit,
  EstimateItemTemplate,
} from "../components/EstimateItemForm";

export type ItemEditorConfig = {
  title: string;
  submitLabel?: string;
  initialValue?: {
    description: string;
    quantity: number;
    unit_price: number;
  };
  initialTemplateId?: string | null;
  templates?: EstimateItemTemplate[];
  onSubmit: (payload: EstimateItemFormSubmit) => Promise<void> | void;
  onCancel?: () => void;
};

export type ItemEditorContextValue = {
  config: ItemEditorConfig | null;
  openEditor: (config: ItemEditorConfig) => void;
  closeEditor: () => void;
};

const ItemEditorContext = createContext<ItemEditorContextValue | undefined>(
  undefined,
);

export function ItemEditorProvider({ children }: PropsWithChildren) {
  const [config, setConfig] = useState<ItemEditorConfig | null>(null);

  const openEditor = useCallback((nextConfig: ItemEditorConfig) => {
    setConfig(nextConfig);
  }, []);

  const closeEditor = useCallback(() => {
    setConfig(null);
  }, []);

  const value = useMemo<ItemEditorContextValue>(
    () => ({ config, openEditor, closeEditor }),
    [closeEditor, config, openEditor],
  );

  return (
    <ItemEditorContext.Provider value={value}>
      {children}
    </ItemEditorContext.Provider>
  );
}

export function useItemEditor(): ItemEditorContextValue {
  const context = useContext(ItemEditorContext);
  if (!context) {
    throw new Error("useItemEditor must be used within an ItemEditorProvider");
  }
  return context;
}
