-- Ensure saved_items has a created_at column for auditing saved templates
ALTER TABLE public.saved_items
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT timezone('utc', now());
