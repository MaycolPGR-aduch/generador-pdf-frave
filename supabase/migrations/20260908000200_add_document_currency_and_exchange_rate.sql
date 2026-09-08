-- The catalogue remains priced in USD. Documents additionally store their
-- commercial currency and converted, immutable monetary snapshots.
alter table public.documents
  add column currency text not null default 'USD' check (currency in ('USD', 'PEN')),
  add column exchange_rate_pen_per_usd numeric(12,6),
  add column exchange_rate_source text,
  add column exchange_rate_observed_at date,
  add column subtotal_document numeric(16,2),
  add column tax_document numeric(16,2),
  add column total_document numeric(16,2),
  add constraint documents_pen_exchange_rate_check check (
    (currency = 'USD' and exchange_rate_pen_per_usd is null)
    or (currency = 'PEN' and exchange_rate_pen_per_usd > 0)
  );

alter table public.document_items
  add column unit_price_document numeric(14,4),
  add column subtotal_document numeric(16,2),
  add column tax_document numeric(16,2),
  add column total_document numeric(16,2);

-- Previously emitted rows stay strictly immutable. The application and PDF
-- loader fall back to their existing USD snapshots whenever these new columns
-- are null, while all documents issued after this migration fill them in.

create or replace function public.protect_source_quote_reference()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  quote_currency text;
  quote_rate numeric(12,6);
begin
  if new.source_quote_id is not null and new.type <> 'proforma' then
    raise exception 'Una cotización solo puede originar una confirmación de pedido';
  end if;
  if new.source_quote_id is not null then
    select currency, exchange_rate_pen_per_usd into quote_currency, quote_rate
      from public.documents where id = new.source_quote_id;
    if not found then raise exception 'Cotización de origen no encontrada'; end if;
    if new.currency is distinct from quote_currency
      or new.exchange_rate_pen_per_usd is distinct from quote_rate then
      raise exception 'La confirmación debe conservar la moneda y tasa de la cotización';
    end if;
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

create or replace function public.sync_draft_item_snapshot()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  parent_status public.document_status;
  parent_source_quote_id uuid;
  document_currency text;
  document_rate numeric(12,6);
  product_row record;
  variant_row record;
  source_item public.document_items;
  source_document public.documents;
begin
  select status, source_quote_id, currency, exchange_rate_pen_per_usd
    into parent_status, parent_source_quote_id, document_currency, document_rate
    from public.documents where id = new.document_id;

  if parent_status = 'draft' then
    if new.source_quote_item_id is not null then
      if current_setting('app.quote_conversion_write', true) is distinct from 'on'
        and auth.role() <> 'service_role' then
        raise exception 'Los precios cotizados solo pueden conservarse mediante la conversión';
      end if;
      select * into source_item from public.document_items where id = new.source_quote_item_id;
      select * into source_document from public.documents where id = source_item.document_id;
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
      new.unit_price_document = source_item.unit_price_document;
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
      if variant_row.price_override_usd is not null then new.unit_price_usd = variant_row.price_override_usd; end if;
    end if;
    new.unit_price_document := round(new.unit_price_usd * case
      when document_currency = 'PEN' then document_rate else 1 end, 4);
  elsif parent_status = 'generation_failed' and auth.role() = 'service_role' then
    null;
  elsif parent_status is distinct from 'draft' then
    raise exception 'Los ítems emitidos son inmutables';
  end if;
  return new;
end;
$$;

create or replace function public.finalize_document(
  p_document_id uuid,
  p_idempotency_key text
)
returns public.documents language plpgsql security definer set search_path = public as $$
declare
  doc public.documents;
  setting public.company_settings;
  client_row record;
  contact_row public.client_contacts%rowtype;
  address_row public.client_addresses%rowtype;
  seller_row record;
  item record;
  stock_row record;
  product_row public.products;
  line_subtotal_usd numeric(14,2);
  line_tax_usd numeric(14,2);
  line_total_usd numeric(14,2);
  line_subtotal_document numeric(16,2);
  line_tax_document numeric(16,2);
  line_total_document numeric(16,2);
  subtotal_usd numeric(14,2) := 0;
  tax_usd numeric(14,2) := 0;
  total_usd numeric(14,2) := 0;
  subtotal_document numeric(16,2) := 0;
  tax_document numeric(16,2) := 0;
  total_document numeric(16,2) := 0;
  issued_year integer := extract(year from timezone('America/Lima', now()));
  retry_failed boolean := false;
  calculate_totals boolean := false;
  tax_rate numeric(5,4) := 0;
begin
  if auth.role() <> 'service_role' then raise exception 'No autorizado'; end if;
  if nullif(trim(p_idempotency_key), '') is null then raise exception 'Falta idempotencyKey'; end if;
  select * into doc from public.documents where id = p_document_id for update;
  if not found then raise exception 'Documento no encontrado'; end if;
  if doc.generation_key is not null and doc.generation_key = p_idempotency_key
    and doc.status in ('generating', 'generated') then return doc; end if;
  if doc.status in ('draft', 'generating', 'generated')
    and doc.generation_key is not null and doc.generation_key <> p_idempotency_key then
    raise exception 'El documento ya tiene una generación en curso o completada';
  end if;
  if doc.status not in ('draft', 'generation_failed') then raise exception 'El documento no puede generarse desde su estado actual'; end if;
  if not exists (select 1 from public.document_items where document_id = doc.id) then raise exception 'Agrega al menos un producto'; end if;
  if doc.currency = 'PEN' and doc.exchange_rate_pen_per_usd is null then raise exception 'La tasa de cambio es obligatoria para documentos en soles'; end if;
  if doc.type = 'proforma' and exists (select 1 from public.document_items where document_id = doc.id and quantity_kg is null) then
    raise exception 'La confirmación de pedido requiere cantidad en todos los productos';
  end if;
  retry_failed := doc.status = 'generation_failed';
  if retry_failed then
    update public.documents set status = 'generating', generation_key = p_idempotency_key, generation_error = null where id = doc.id returning * into doc;
    return doc;
  end if;
  select * into setting from public.company_settings where id = true;
  select c.legal_name, c.trade_name, c.tax_id into client_row from public.clients c where c.id = doc.client_id and c.active;
  if not found then raise exception 'Cliente no disponible'; end if;
  if doc.contact_id is not null then select * into contact_row from public.client_contacts where id = doc.contact_id and client_id = doc.client_id and active; if not found then raise exception 'Contacto no disponible'; end if; end if;
  if doc.address_id is not null then select * into address_row from public.client_addresses where id = doc.address_id and client_id = doc.client_id and active; if not found then raise exception 'Dirección no disponible'; end if; end if;
  select p.full_name, p.email, p.phone, p.area into seller_row from public.profiles p where p.id = doc.seller_id and p.active;
  if not found then raise exception 'Vendedor no disponible'; end if;
  calculate_totals := doc.type = 'proforma' or not exists (select 1 from public.document_items where document_id = doc.id and quantity_kg is null);
  tax_rate := case when doc.type = 'proforma' or doc.apply_igv then setting.tax_rate else 0 end;
  for item in select * from public.document_items where document_id = doc.id order by position loop
    line_subtotal_usd := null; line_tax_usd := null; line_total_usd := null;
    line_subtotal_document := null; line_tax_document := null; line_total_document := null;
    if calculate_totals then
      line_subtotal_usd := round(item.quantity_kg * item.unit_price_usd, 2);
      line_tax_usd := round(line_subtotal_usd * tax_rate, 2);
      line_total_usd := line_subtotal_usd + line_tax_usd;
      line_subtotal_document := round(item.quantity_kg * item.unit_price_document, 2);
      line_tax_document := round(line_subtotal_document * tax_rate, 2);
      line_total_document := line_subtotal_document + line_tax_document;
      subtotal_usd := subtotal_usd + line_subtotal_usd; tax_usd := tax_usd + line_tax_usd; total_usd := total_usd + line_total_usd;
      subtotal_document := subtotal_document + line_subtotal_document; tax_document := tax_document + line_tax_document; total_document := total_document + line_total_document;
    end if;
    update public.document_items set subtotal_usd = line_subtotal_usd, tax_usd = line_tax_usd, total_usd = line_total_usd,
      subtotal_document = line_subtotal_document, tax_document = line_tax_document, total_document = line_total_document where id = item.id;
  end loop;
  if doc.type = 'proforma' then
    perform 1 from public.products where id in (select product_id from public.document_items where document_id = doc.id) order by id for update;
    for stock_row in select product_id, sum(quantity_kg)::numeric(12,3) as required_kg from public.document_items where document_id = doc.id group by product_id order by product_id loop
      select * into product_row from public.products where id = stock_row.product_id;
      if not found then raise exception 'Producto no encontrado para controlar stock'; end if;
      if product_row.stock_kg < stock_row.required_kg then raise exception 'Stock insuficiente para %: disponible % kg, requerido % kg', product_row.sku, product_row.stock_kg, stock_row.required_kg; end if;
      perform set_config('app.inventory_write', 'on', true);
      update public.products set stock_kg = stock_kg - stock_row.required_kg where id = product_row.id returning * into product_row;
      insert into public.inventory_movements (product_id, document_id, movement_type, quantity_delta_kg, stock_before_kg, stock_after_kg, reason, created_by)
      values (product_row.id, doc.id, 'confirmation_issue', -stock_row.required_kg, product_row.stock_kg + stock_row.required_kg, product_row.stock_kg, 'Confirmación de pedido emitida', doc.created_by);
    end loop;
  end if;
  update public.documents set number = coalesce(doc.number, public.reserve_document_number(doc.type, issued_year)), sequence_year = coalesce(doc.sequence_year, issued_year),
    status = 'generating', generation_key = p_idempotency_key, subtotal_usd = case when calculate_totals then subtotal_usd else null end,
    tax_usd = case when calculate_totals then tax_usd else null end, total_usd = case when calculate_totals then total_usd else null end,
    subtotal_document = case when calculate_totals then subtotal_document else null end,
    tax_document = case when calculate_totals then tax_document else null end, total_document = case when calculate_totals then total_document else null end,
    client_snapshot = jsonb_build_object('legalName', client_row.legal_name, 'tradeName', client_row.trade_name, 'taxId', client_row.tax_id,
      'contact', case when doc.contact_id is null then null else jsonb_build_object('fullName', contact_row.full_name, 'salutation', contact_row.salutation, 'email', contact_row.email, 'phone', contact_row.phone) end,
      'address', case when doc.address_id is null then null else jsonb_build_object('label', address_row.label, 'address', address_row.address, 'district', address_row.district, 'city', address_row.city) end),
    seller_snapshot = jsonb_build_object('fullName', seller_row.full_name, 'email', seller_row.email, 'phone', seller_row.phone, 'area', seller_row.area),
    settings_snapshot = to_jsonb(setting) || jsonb_build_object('bankAccounts', coalesce((select jsonb_agg(to_jsonb(bank) order by bank.display_order) from public.bank_accounts bank where bank.active), '[]'::jsonb))
  where id = doc.id returning * into doc;
  return doc;
end;
$$;

create or replace function public.create_confirmation_from_quote(p_quote_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare quote_doc public.documents; new_id uuid; quote_item public.document_items;
begin
  if not public.is_active_user() then raise exception 'No autorizado'; end if;
  select * into quote_doc from public.documents where id = p_quote_id;
  if not found or quote_doc.type <> 'proposal' or quote_doc.status not in ('generated', 'sent') then raise exception 'Solo una cotización emitida puede convertirse en confirmación'; end if;
  perform set_config('app.quote_conversion_write', 'on', true);
  insert into public.documents (type, apply_igv, source_quote_id, currency, exchange_rate_pen_per_usd, exchange_rate_source, exchange_rate_observed_at, client_id, created_by, seller_id, contact_id, address_id, payment_method, delivery_method, valid_until, considerations)
  values ('proforma', true, quote_doc.id, quote_doc.currency, quote_doc.exchange_rate_pen_per_usd, quote_doc.exchange_rate_source, quote_doc.exchange_rate_observed_at, quote_doc.client_id, auth.uid(), auth.uid(), quote_doc.contact_id, quote_doc.address_id, quote_doc.payment_method, quote_doc.delivery_method, quote_doc.valid_until, quote_doc.considerations) returning id into new_id;
  for quote_item in select * from public.document_items where document_id = quote_doc.id order by position loop
    insert into public.document_items (document_id, position, product_id, variant_id, source_quote_item_id, quantity_kg, observation)
    values (new_id, quote_item.position, quote_item.product_id, quote_item.variant_id, quote_item.id, quote_item.quantity_kg, quote_item.observation);
  end loop;
  return new_id;
end;
$$;

create or replace function public.duplicate_document(p_source_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare source_doc public.documents; new_id uuid;
begin
  if not public.is_active_user() then raise exception 'No autorizado'; end if;
  select * into source_doc from public.documents where id = p_source_id;
  if not found then raise exception 'Documento no encontrado'; end if;
  insert into public.documents (type, apply_igv, currency, exchange_rate_pen_per_usd, exchange_rate_source, exchange_rate_observed_at, client_id, created_by, seller_id, contact_id, address_id, payment_method, delivery_method, valid_until, considerations, supersedes_document_id)
  values (source_doc.type, source_doc.apply_igv, source_doc.currency, source_doc.exchange_rate_pen_per_usd, source_doc.exchange_rate_source, source_doc.exchange_rate_observed_at, source_doc.client_id, auth.uid(), auth.uid(), source_doc.contact_id, source_doc.address_id, source_doc.payment_method, source_doc.delivery_method, source_doc.valid_until, source_doc.considerations, source_doc.id) returning id into new_id;
  insert into public.document_items (document_id, position, product_id, variant_id, quantity_kg, observation)
  select new_id, position, product_id, variant_id, quantity_kg, observation from public.document_items where document_id = source_doc.id order by position;
  return new_id;
end;
$$;
