-- Allows the protected catalog importer to set one stock target while
-- preserving the inventory movement audit trail for every adjusted product.
create or replace function public.set_catalog_stock(
  p_target_stock numeric,
  p_reason text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  adjusted_count integer := 0;
begin
  if auth.role() <> 'service_role' then
    raise exception 'No autorizado';
  end if;

  if p_target_stock is null
    or p_target_stock < 0
    or p_target_stock <> round(p_target_stock, 3) then
    raise exception 'El stock objetivo debe ser mayor o igual a cero y tener como máximo tres decimales';
  end if;

  if nullif(trim(p_reason), '') is null then
    raise exception 'Indica el motivo del ajuste';
  end if;

  perform set_config('app.inventory_write', 'on', true);

  with stock_before as materialized (
    select id, stock_kg
    from public.products
    where stock_kg is distinct from p_target_stock
    for update
  ),
  updated as (
    update public.products product
    set stock_kg = p_target_stock
    from stock_before previous
    where product.id = previous.id
    returning product.id
  )
  insert into public.inventory_movements (
    product_id,
    movement_type,
    quantity_delta_kg,
    stock_before_kg,
    stock_after_kg,
    reason
  )
  select
    previous.id,
    'adjustment',
    p_target_stock - previous.stock_kg,
    previous.stock_kg,
    p_target_stock,
    trim(p_reason)
  from stock_before previous
  join updated on updated.id = previous.id;

  get diagnostics adjusted_count = row_count;
  return adjusted_count;
end;
$$;

revoke all on function public.set_catalog_stock(numeric, text) from public, anon, authenticated;
grant execute on function public.set_catalog_stock(numeric, text) to service_role;
