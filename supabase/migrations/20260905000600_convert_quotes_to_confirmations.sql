alter table public.documents
  add column source_quote_id uuid references public.documents(id) on delete restrict;
create index documents_source_quote_idx on public.documents(source_quote_id)
  where source_quote_id is not null;

alter table public.document_items
  add column source_quote_item_id uuid references public.document_items(id) on delete restrict;

create or replace function public.protect_source_quote_reference()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.source_quote_id is not null and new.type <> 'proforma' then
    raise exception 'Una cotización solo puede originar una confirmación de pedido';
  end if;
  if (
    (tg_op = 'INSERT' and new.source_quote_id is not null)
    or (tg_op = 'UPDATE' and new.source_quote_id is distinct from old.source_quote_id)
  ) and current_setting('app.quote_conversion_write', true) is distinct from 'on' then
    raise exception 'La cotización de origen solo puede asignarse mediante la conversión';
  end if;
  return new;
end;
$$;

create trigger documents_protect_source_quote_reference
before insert or update on public.documents
for each row execute function public.protect_source_quote_reference();

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
      if current_setting('app.quote_conversion_write', true) is distinct from 'on' then
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
      new.denomination_snapshot = variant_row.name;
      if variant_row.price_override_usd is not null then new.unit_price_usd = variant_row.price_override_usd; end if;
    end if;
  elsif parent_status = 'generation_failed' and auth.role() = 'service_role' then
    null;
  elsif parent_status is distinct from 'draft' then
    raise exception 'Los ítems emitidos son inmutables';
  end if;
  return new;
end;
$$;

create or replace function public.create_confirmation_from_quote(p_quote_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  quote_doc public.documents;
  new_id uuid;
  quote_item public.document_items;
begin
  if not public.is_active_user() then raise exception 'No autorizado'; end if;
  select * into quote_doc from public.documents where id = p_quote_id;
  if not found or quote_doc.type <> 'proposal' or quote_doc.status not in ('generated', 'sent') then
    raise exception 'Solo una cotización emitida puede convertirse en confirmación';
  end if;
  perform set_config('app.quote_conversion_write', 'on', true);
  insert into public.documents (
    type, apply_igv, source_quote_id, client_id, created_by, seller_id,
    contact_id, address_id, payment_method, delivery_method, valid_until, considerations
  ) values (
    'proforma', true, quote_doc.id, quote_doc.client_id, auth.uid(), auth.uid(),
    quote_doc.contact_id, quote_doc.address_id, quote_doc.payment_method,
    quote_doc.delivery_method, quote_doc.valid_until, quote_doc.considerations
  ) returning id into new_id;
  for quote_item in select * from public.document_items where document_id = quote_doc.id order by position loop
    insert into public.document_items (
      document_id, position, product_id, variant_id, source_quote_item_id, quantity_kg, observation
    ) values (
      new_id, quote_item.position, quote_item.product_id, quote_item.variant_id,
      quote_item.id, quote_item.quantity_kg, quote_item.observation
    );
  end loop;
  return new_id;
end;
$$;
grant execute on function public.create_confirmation_from_quote(uuid) to authenticated;

create or replace function public.replace_draft_items(p_document_id uuid, p_items jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare doc public.documents; item jsonb; item_position integer := 0;
begin
  if not public.is_active_user() then raise exception 'No autorizado'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 100 then raise exception 'El documento debe tener entre 1 y 100 productos'; end if;
  select * into doc from public.documents where id = p_document_id for update;
  if not found or doc.status <> 'draft' or (doc.created_by <> auth.uid() and not public.has_role('admin')) then raise exception 'El borrador no puede modificarse'; end if;
  if doc.source_quote_id is not null then perform set_config('app.quote_conversion_write', 'on', true); end if;
  delete from public.document_items where document_id = p_document_id;
  for item in select value from jsonb_array_elements(p_items) as elements(value) loop
    item_position := item_position + 1;
    insert into public.document_items (document_id, position, product_id, variant_id, source_quote_item_id, quantity_kg, observation)
    values (p_document_id, item_position, (item ->> 'productId')::uuid, nullif(item ->> 'variantId', '')::uuid, nullif(item ->> 'sourceQuoteItemId', '')::uuid, nullif(item ->> 'quantityKg', '')::numeric, nullif(item ->> 'observation', ''));
  end loop;
end;
$$;
