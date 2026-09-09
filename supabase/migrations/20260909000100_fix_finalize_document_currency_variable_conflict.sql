-- The initial currency function used accumulator names which matched document
-- column names. Redefine it with unambiguous names for the deployed database.
create or replace function public.finalize_document(
  p_document_id uuid,
  p_idempotency_key text
)
returns public.documents language plpgsql security definer set search_path = public as $$
declare
  doc public.documents; setting public.company_settings; client_row record;
  contact_row public.client_contacts%rowtype; address_row public.client_addresses%rowtype;
  seller_row record; item record; stock_row record; product_row public.products;
  line_subtotal_usd numeric(14,2); line_tax_usd numeric(14,2); line_total_usd numeric(14,2);
  line_subtotal_document numeric(16,2); line_tax_document numeric(16,2); line_total_document numeric(16,2);
  usd_subtotal_amount numeric(14,2) := 0; usd_tax_amount numeric(14,2) := 0; usd_total_amount numeric(14,2) := 0;
  document_subtotal_amount numeric(16,2) := 0; document_tax_amount numeric(16,2) := 0; document_total_amount numeric(16,2) := 0;
  issued_year integer := extract(year from timezone('America/Lima', now()));
  retry_failed boolean := false; calculate_totals boolean := false; tax_rate numeric(5,4) := 0;
begin
  if auth.role() <> 'service_role' then raise exception 'No autorizado'; end if;
  if nullif(trim(p_idempotency_key), '') is null then raise exception 'Falta idempotencyKey'; end if;
  select * into doc from public.documents where id = p_document_id for update;
  if not found then raise exception 'Documento no encontrado'; end if;
  if doc.generation_key is not null and doc.generation_key = p_idempotency_key and doc.status in ('generating', 'generated') then return doc; end if;
  if doc.status in ('draft', 'generating', 'generated') and doc.generation_key is not null and doc.generation_key <> p_idempotency_key then raise exception 'El documento ya tiene una generación en curso o completada'; end if;
  if doc.status not in ('draft', 'generation_failed') then raise exception 'El documento no puede generarse desde su estado actual'; end if;
  if not exists (select 1 from public.document_items where document_id = doc.id) then raise exception 'Agrega al menos un producto'; end if;
  if doc.currency = 'PEN' and doc.exchange_rate_pen_per_usd is null then raise exception 'La tasa de cambio es obligatoria para documentos en soles'; end if;
  if doc.type = 'proforma' and exists (select 1 from public.document_items where document_id = doc.id and quantity_kg is null) then raise exception 'La confirmación de pedido requiere cantidad en todos los productos'; end if;

  retry_failed := doc.status = 'generation_failed';
  if retry_failed then
    update public.documents set status = 'generating', generation_key = p_idempotency_key, generation_error = null where id = doc.id returning * into doc;
    return doc;
  end if;

  select * into setting from public.company_settings where id = true;
  select c.legal_name, c.trade_name, c.tax_id into client_row from public.clients c where c.id = doc.client_id and c.active;
  if not found then raise exception 'Cliente no disponible'; end if;
  if doc.contact_id is not null then
    select * into contact_row from public.client_contacts where id = doc.contact_id and client_id = doc.client_id and active;
    if not found then raise exception 'Contacto no disponible'; end if;
  end if;
  if doc.address_id is not null then
    select * into address_row from public.client_addresses where id = doc.address_id and client_id = doc.client_id and active;
    if not found then raise exception 'Dirección no disponible'; end if;
  end if;
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
      usd_subtotal_amount := usd_subtotal_amount + line_subtotal_usd;
      usd_tax_amount := usd_tax_amount + line_tax_usd;
      usd_total_amount := usd_total_amount + line_total_usd;
      document_subtotal_amount := document_subtotal_amount + line_subtotal_document;
      document_tax_amount := document_tax_amount + line_tax_document;
      document_total_amount := document_total_amount + line_total_document;
    end if;
    update public.document_items set
      subtotal_usd = line_subtotal_usd, tax_usd = line_tax_usd, total_usd = line_total_usd,
      subtotal_document = line_subtotal_document, tax_document = line_tax_document, total_document = line_total_document
    where id = item.id;
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

  update public.documents set
    number = coalesce(doc.number, public.reserve_document_number(doc.type, issued_year)),
    sequence_year = coalesce(doc.sequence_year, issued_year), status = 'generating', generation_key = p_idempotency_key,
    subtotal_usd = case when calculate_totals then usd_subtotal_amount else null end,
    tax_usd = case when calculate_totals then usd_tax_amount else null end,
    total_usd = case when calculate_totals then usd_total_amount else null end,
    subtotal_document = case when calculate_totals then document_subtotal_amount else null end,
    tax_document = case when calculate_totals then document_tax_amount else null end,
    total_document = case when calculate_totals then document_total_amount else null end,
    client_snapshot = jsonb_build_object(
      'legalName', client_row.legal_name, 'tradeName', client_row.trade_name, 'taxId', client_row.tax_id,
      'contact', case when doc.contact_id is null then null else jsonb_build_object('fullName', contact_row.full_name, 'salutation', contact_row.salutation, 'email', contact_row.email, 'phone', contact_row.phone) end,
      'address', case when doc.address_id is null then null else jsonb_build_object('label', address_row.label, 'address', address_row.address, 'district', address_row.district, 'city', address_row.city) end),
    seller_snapshot = jsonb_build_object('fullName', seller_row.full_name, 'email', seller_row.email, 'phone', seller_row.phone, 'area', seller_row.area),
    settings_snapshot = to_jsonb(setting) || jsonb_build_object('bankAccounts', coalesce((select jsonb_agg(to_jsonb(bank) order by bank.display_order) from public.bank_accounts bank where bank.active), '[]'::jsonb))
  where id = doc.id returning * into doc;
  return doc;
end;
$$;

revoke all on function public.finalize_document(uuid, text) from public, anon, authenticated;
