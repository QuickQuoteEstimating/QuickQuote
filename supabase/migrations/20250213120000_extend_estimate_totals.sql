-- Add material/labor/tax tracking and item catalog support
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'estimates' AND column_name = 'material_total'
  ) THEN
    ALTER TABLE public.estimates
      ADD COLUMN material_total numeric DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'estimates' AND column_name = 'labor_hours'
  ) THEN
    ALTER TABLE public.estimates
      ADD COLUMN labor_hours numeric DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'estimates' AND column_name = 'labor_rate'
  ) THEN
    ALTER TABLE public.estimates
      ADD COLUMN labor_rate numeric DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'estimates' AND column_name = 'labor_total'
  ) THEN
    ALTER TABLE public.estimates
      ADD COLUMN labor_total numeric DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'estimates' AND column_name = 'subtotal'
  ) THEN
    ALTER TABLE public.estimates
      ADD COLUMN subtotal numeric DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'estimates' AND column_name = 'tax_rate'
  ) THEN
    ALTER TABLE public.estimates
      ADD COLUMN tax_rate numeric DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'estimates' AND column_name = 'tax_total'
  ) THEN
    ALTER TABLE public.estimates
      ADD COLUMN tax_total numeric DEFAULT 0;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'estimate_items' AND column_name = 'catalog_item_id'
  ) THEN
    ALTER TABLE public.estimate_items
      ADD COLUMN catalog_item_id uuid;
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.item_catalog (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  description text NOT NULL,
  default_quantity integer DEFAULT 1,
  unit_price numeric NOT NULL DEFAULT 0,
  notes text,
  version integer DEFAULT 1,
  updated_at timestamptz DEFAULT timezone('utc', now()),
  deleted_at timestamptz
);

ALTER TABLE public.item_catalog
  ALTER COLUMN version SET DEFAULT 1,
  ALTER COLUMN updated_at SET DEFAULT timezone('utc', now());

CREATE INDEX IF NOT EXISTS item_catalog_user_idx
  ON public.item_catalog(user_id)
  WHERE deleted_at IS NULL;
