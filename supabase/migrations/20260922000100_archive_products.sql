-- Keep commercial and inventory history intact when an administrator removes
-- a product from the active catalogue.
create or replace function public.archive_product(p_product_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_role('admin') then
    raise exception 'Solo un administrador puede eliminar productos';
  end if;

  update public.products
  set active = false
  where id = p_product_id
    and active = true;

  if not found then
    raise exception 'El producto ya no está disponible o no existe';
  end if;

  update public.product_variants
  set active = false
  where product_id = p_product_id
    and active = true;
end;
$$;

revoke all on function public.archive_product(uuid) from public;
grant execute on function public.archive_product(uuid) to authenticated;
