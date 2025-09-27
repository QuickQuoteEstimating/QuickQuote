-- Align estimates, estimate_items, and photos tables with mobile payloads
-- so queued offline changes can replicate without column mismatches.

-- Ensure the tables exist with the required columns.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'estimates'
  ) THEN
    CREATE TABLE public.estimates (
      id uuid PRIMARY KEY,
      user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
      customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
      date timestamptz DEFAULT timezone('utc', now()),
      total numeric DEFAULT 0,
      notes text,
      status text DEFAULT 'draft',
      version integer DEFAULT 1,
      updated_at timestamptz DEFAULT timezone('utc', now()),
      deleted_at timestamptz
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'estimates' AND column_name = 'status'
  ) THEN
    ALTER TABLE public.estimates
      ADD COLUMN status text DEFAULT 'draft';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'estimates' AND column_name = 'version'
  ) THEN
    ALTER TABLE public.estimates
      ADD COLUMN version integer DEFAULT 1;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'estimates' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE public.estimates
      ADD COLUMN updated_at timestamptz DEFAULT timezone('utc', now());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'estimates' AND column_name = 'deleted_at'
  ) THEN
    ALTER TABLE public.estimates
      ADD COLUMN deleted_at timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'estimates' AND column_name = 'total'
  ) THEN
    ALTER TABLE public.estimates
      ADD COLUMN total numeric DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'photos' AND column_name = 'local_uri'
  ) THEN
    ALTER TABLE public.photos
      ADD COLUMN local_uri text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'estimate_items' AND column_name = 'version'
  ) THEN
    ALTER TABLE public.estimate_items
      ADD COLUMN version integer DEFAULT 1;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'estimate_items' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE public.estimate_items
      ADD COLUMN updated_at timestamptz DEFAULT timezone('utc', now());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'estimate_items' AND column_name = 'deleted_at'
  ) THEN
    ALTER TABLE public.estimate_items
      ADD COLUMN deleted_at timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'photos' AND column_name = 'version'
  ) THEN
    ALTER TABLE public.photos
      ADD COLUMN version integer DEFAULT 1;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'photos' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE public.photos
      ADD COLUMN updated_at timestamptz DEFAULT timezone('utc', now());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'photos' AND column_name = 'deleted_at'
  ) THEN
    ALTER TABLE public.photos
      ADD COLUMN deleted_at timestamptz;
  END IF;
END
$$;

-- Keep defaults aligned with mobile payloads (allow client-provided timestamps/version)
ALTER TABLE public.estimates
  ALTER COLUMN version SET DEFAULT 1,
  ALTER COLUMN updated_at SET DEFAULT timezone('utc', now());

ALTER TABLE public.estimate_items
  ALTER COLUMN version SET DEFAULT 1,
  ALTER COLUMN updated_at SET DEFAULT timezone('utc', now());

ALTER TABLE public.photos
  ALTER COLUMN version SET DEFAULT 1,
  ALTER COLUMN updated_at SET DEFAULT timezone('utc', now());

-- Helper to keep version/updated_at in sync without overriding client supplied values
CREATE OR REPLACE FUNCTION public.sync_row_metadata()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.version IS NULL OR NEW.version < 1 THEN
      NEW.version := 1;
    END IF;
    IF NEW.updated_at IS NULL THEN
      NEW.updated_at := timezone('utc', now());
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.version IS NULL OR NEW.version <= OLD.version THEN
      NEW.version := OLD.version + 1;
    END IF;
    IF NEW.updated_at IS NULL OR NEW.updated_at <= OLD.updated_at THEN
      NEW.updated_at := timezone('utc', now());
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Refresh triggers to use the helper
DROP TRIGGER IF EXISTS trg_estimates_sync_metadata ON public.estimates;
CREATE TRIGGER trg_estimates_sync_metadata
BEFORE INSERT OR UPDATE ON public.estimates
FOR EACH ROW EXECUTE FUNCTION public.sync_row_metadata();

DROP TRIGGER IF EXISTS trg_estimate_items_sync_metadata ON public.estimate_items;
CREATE TRIGGER trg_estimate_items_sync_metadata
BEFORE INSERT OR UPDATE ON public.estimate_items
FOR EACH ROW EXECUTE FUNCTION public.sync_row_metadata();

DROP TRIGGER IF EXISTS trg_photos_sync_metadata ON public.photos;
CREATE TRIGGER trg_photos_sync_metadata
BEFORE INSERT OR UPDATE ON public.photos
FOR EACH ROW EXECUTE FUNCTION public.sync_row_metadata();

-- Ensure row level security policies line up with ownership rules.
ALTER TABLE public.estimates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.estimate_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.photos ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'estimates' AND policyname = 'Users manage their estimates'
  ) THEN
    CREATE POLICY "Users manage their estimates" ON public.estimates
      FOR ALL
      USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'estimate_items' AND policyname = 'Users manage their estimate items'
  ) THEN
    CREATE POLICY "Users manage their estimate items" ON public.estimate_items
      FOR ALL
      USING (
        EXISTS (
          SELECT 1 FROM public.estimates e
          WHERE e.id = estimate_id AND e.user_id = auth.uid()
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.estimates e
          WHERE e.id = estimate_id AND e.user_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'photos' AND policyname = 'Users manage their photos'
  ) THEN
    CREATE POLICY "Users manage their photos" ON public.photos
      FOR ALL
      USING (
        EXISTS (
          SELECT 1 FROM public.estimates e
          WHERE e.id = estimate_id AND e.user_id = auth.uid()
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.estimates e
          WHERE e.id = estimate_id AND e.user_id = auth.uid()
        )
      );
  END IF;
END
$$;

-- Index helpers for replication lookups
CREATE INDEX IF NOT EXISTS idx_estimates_user_id ON public.estimates(user_id);
CREATE INDEX IF NOT EXISTS idx_estimates_customer_id ON public.estimates(customer_id);
CREATE INDEX IF NOT EXISTS idx_estimate_items_estimate_id ON public.estimate_items(estimate_id);
CREATE INDEX IF NOT EXISTS idx_photos_estimate_id ON public.photos(estimate_id);
