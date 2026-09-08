-- A confirmation created from a quote preserves its quoted prices through the
-- source_quote_item_id guard. During finalization, the service role must still
-- update calculated totals on those same items. Keep the guard for every user
-- request while allowing this internal, authenticated generation path.
create or replace function public.sync_draft_item_snapshot()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  parent_status public.document_status;
  parent_source_quote_id uuid;
  product_row record;
  variant_row record;
  source_item public.document_items;
  source_document public.documents;
begin
  select status, source_quote_id into parent_status, parent_source_quote_id
    from public.documents where id = new.document_id;

  if parent_status = 'draft' then
    if new.source_quote_item_id is not null then
      if current_setting('app.quote_conversion_write', true) is distinct from 'on'
        and auth.role() <> 'service_role' then
        raise exception 'Los precios cotizados solo pueden conservarse mediante la conversión';
      end if;
      select * into source_item from public.document_items
        where id = new.source_quote_item_id;
      select * into source_document from public.documents
        where id = source_item.document_id;
      if not found or source_document.type <> 'proposal'
        or source_document.status not in ('generated', 'sent')
        or source_item.document_id <> parent_source_quote_id
        or source_item.product_id <> new.product_id
        or source_item.variant_id is distinct from new.variant_id then
        raise exception 'Ítem de cotización de origen inválido';
      end if;
      new.sku_snapshot = source_item.sku_snapshot;
      new.denomination_snapshot = source_item.denomination_snapshot;
      new.category_snapshot = source_item.category_snapshot;
      new.unit_price_usd = source_item.unit_price_usd;
      return new;
    end if;

    select p.sku, p.name, p.unit_price_usd, c.name as category into product_row
      from public.products p join public.product_categories c on c.id = p.category_id
      where p.id = new.product_id and p.active;
    if not found then raise exception 'Producto no disponible'; end if;

    new.sku_snapshot = product_row.sku;
    new.denomination_snapshot = product_row.name;
    new.category_snapshot = product_row.category;
    new.unit_price_usd = product_row.unit_price_usd;

    if new.variant_id is not null then
      select v.name, v.price_override_usd into variant_row from public.product_variants v
        where v.id = new.variant_id and v.product_id = new.product_id and v.active;
      if not found then raise exception 'Variación no disponible'; end if;
      new.denomination_snapshot = concat_ws(' · ', product_row.name, variant_row.name);
      if variant_row.price_override_usd is not null then
        new.unit_price_usd = variant_row.price_override_usd;
      end if;
    end if;
  elsif parent_status = 'generation_failed' and auth.role() = 'service_role' then
    null;
  elsif parent_status is distinct from 'draft' then
    raise exception 'Los ítems emitidos son inmutables';
  end if;

  return new;
end;
$$;
