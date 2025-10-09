import { ReactNode } from "react";

export type EstimateRecord = {
  id: string;
  customer_id: string | null;
  date: string | null;
  job_address: string | null;
  billing_address: string | null;
  job_details: string | null;
  subtotal: number | null;
  tax: number | null;
  total: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string | null;
  deleted_at: string | null;
};


export type EstimateItemRecord = {
  name?: string;
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

