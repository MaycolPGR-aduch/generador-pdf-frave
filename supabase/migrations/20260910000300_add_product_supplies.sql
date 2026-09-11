-- Stores up to three optional descriptive supplies for each catalog product.
-- These fields are informational only and do not participate in price, stock, or document calculations.
alter table public.products
  add column supply_1 text,
  add column supply_2 text,
  add column supply_3 text,
  add constraint products_supply_1_nonblank_check
    check (supply_1 is null or nullif(btrim(supply_1), '') is not null),
  add constraint products_supply_2_nonblank_check
    check (supply_2 is null or nullif(btrim(supply_2), '') is not null),
  add constraint products_supply_3_nonblank_check
    check (supply_3 is null or nullif(btrim(supply_3), '') is not null);
