export type CustomerRecord = {
  id: string;
  user_id: string;
  name: string;
  phone: string | null;
  email: string | null;
  street?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  notes: string | null;
  version: number;
  updated_at: string;
  deleted_at: string | null;
};
