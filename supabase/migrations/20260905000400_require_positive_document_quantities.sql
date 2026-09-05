-- Zero kilograms cannot produce a stock movement. Keep the constraint NOT
-- VALID so historical imported rows remain readable while all new/changed
-- document items must have a strictly positive quantity when one is supplied.
alter table public.document_items
  add constraint document_items_quantity_positive_check
  check (quantity_kg is null or quantity_kg > 0) not valid;
