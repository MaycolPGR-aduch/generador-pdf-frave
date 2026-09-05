alter table public.company_settings
  add column low_stock_threshold_kg numeric(12,3) not null default 5
  check (low_stock_threshold_kg >= 0 and low_stock_threshold_kg = round(low_stock_threshold_kg, 3));
