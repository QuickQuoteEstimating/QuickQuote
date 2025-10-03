export type EstimateItemRecord = {
  id: string;
  estimate_id: string;
  description: string;
  quantity: number;
  unit_price: number;
  base_total: number;
  total: number;
  apply_markup: number | null;
  catalog_item_id: string | null;
  version: number;
  updated_at: string;
  deleted_at: string | null;
};

