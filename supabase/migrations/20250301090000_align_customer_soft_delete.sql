-- Ensure customers table supports soft deletes and metadata sync
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'customers'
      AND column_name = 'deleted_at'
  ) THEN
    ALTER TABLE public.customers
      ADD COLUMN deleted_at timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'customers'
      AND column_name = 'version'
  ) THEN
    ALTER TABLE public.customers
      ADD COLUMN version integer DEFAULT 1;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'customers'
      AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE public.customers
      ADD COLUMN updated_at timestamptz DEFAULT timezone('utc', now());
  END IF;
END
$$;

ALTER TABLE public.customers
  ALTER COLUMN version SET DEFAULT 1,
  ALTER COLUMN updated_at SET DEFAULT timezone('utc', now());

-- Reuse shared trigger to keep version/updated_at monotonic
DROP TRIGGER IF EXISTS trg_customers_sync_metadata ON public.customers;
CREATE TRIGGER trg_customers_sync_metadata
BEFORE INSERT OR UPDATE ON public.customers
FOR EACH ROW EXECUTE FUNCTION public.sync_row_metadata();

-- Harden access controls for customer records
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'customers'
      AND policyname = 'Users manage their customers'
  ) THEN
    CREATE POLICY "Users manage their customers" ON public.customers
      FOR ALL
      USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid());
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_customers_user_id
  ON public.customers(user_id)
  WHERE deleted_at IS NULL;
