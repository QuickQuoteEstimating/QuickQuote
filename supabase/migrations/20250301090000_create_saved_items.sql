-- Create saved_items table for reusable estimate line items
CREATE TABLE IF NOT EXISTS public.saved_items (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  default_quantity integer DEFAULT 1,
  default_unit_price numeric NOT NULL DEFAULT 0,
  version integer DEFAULT 1,
  updated_at timestamptz DEFAULT timezone('utc', now()),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS saved_items_user_idx
  ON public.saved_items(user_id)
  WHERE deleted_at IS NULL;

-- Migrate legacy item_catalog rows if they exist
INSERT INTO public.saved_items (id, user_id, name, default_quantity, default_unit_price, version, updated_at, deleted_at)
SELECT id, user_id, description AS name, default_quantity, unit_price AS default_unit_price, version, updated_at, deleted_at
FROM public.item_catalog
ON CONFLICT (id) DO NOTHING;
