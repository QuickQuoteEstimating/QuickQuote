-- Add optional notes column to customer records for account-specific information
alter table if exists public.customers
  add column if not exists notes text;
