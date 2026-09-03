-- Fix finalization when a document has no optional contact or address.
-- A bare PL/pgSQL record has no known structure until it is assigned. The
-- previous function referenced contact_row/address_row from a CASE branch even
-- when the corresponding id was null, which raised SQLSTATE 55000.

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
  line_subtotal numeric(14,2);
  line_tax numeric(14,2);
  line_total numeric(14,2);
  subtotal numeric(14,2) := 0;
  tax numeric(14,2) := 0;
  total numeric(14,2) := 0;
  issued_year integer := extract(year from timezone('America/Lima', now()));
  retry_failed boolean := false;
begin
  if auth.role() <> 'service_role' then raise exception 'No autorizado'; end if;
  if nullif(trim(p_idempotency_key), '') is null then raise exception 'Falta idempotencyKey'; end if;

  select * into doc from public.documents where id = p_document_id for update;
  if not found then raise exception 'Documento no encontrado'; end if;
  if doc.generation_key is not null and doc.generation_key = p_idempotency_key
    and doc.status in ('generating', 'generated') then
    return doc;
  end if;
  if doc.status in ('draft', 'generating', 'generated')
    and doc.generation_key is not null and doc.generation_key <> p_idempotency_key then
    raise exception 'El documento ya tiene una generación en curso o completada';
  end if;
  if doc.status not in ('draft', 'generation_failed') then
    raise exception 'El documento no puede generarse desde su estado actual';
  end if;
  if not exists (select 1 from public.document_items where document_id = doc.id) then
    raise exception 'Agrega al menos un producto';
  end if;
  if doc.type = 'proforma' and exists (
    select 1 from public.document_items where document_id = doc.id and quantity_kg is null
  ) then
    raise exception 'La proforma requiere cantidad en todos los productos';
  end if;

  retry_failed := doc.status = 'generation_failed';
  if retry_failed then
    update public.documents set
      status = 'generating',
      generation_key = p_idempotency_key,
      generation_error = null
    where id = doc.id
    returning * into doc;
    return doc;
  end if;

  select * into setting from public.company_settings where id = true;
  select c.legal_name, c.trade_name, c.tax_id into client_row
    from public.clients c where c.id = doc.client_id and c.active;
  if not found then raise exception 'Cliente no disponible'; end if;
  if doc.contact_id is not null then
    select * into contact_row
      from public.client_contacts
      where id = doc.contact_id and client_id = doc.client_id and active;
    if not found then raise exception 'Contacto no disponible'; end if;
  end if;
  if doc.address_id is not null then
    select * into address_row
      from public.client_addresses
      where id = doc.address_id and client_id = doc.client_id and active;
    if not found then raise exception 'Dirección no disponible'; end if;
  end if;
  select p.full_name, p.email, p.phone, p.area into seller_row
    from public.profiles p where p.id = doc.seller_id and p.active;
  if not found then raise exception 'Vendedor no disponible'; end if;

  for item in select * from public.document_items where document_id = doc.id order by position loop
    line_subtotal := null;
    line_tax := null;
    line_total := null;
    if doc.type = 'proforma' then
      line_subtotal := round(item.quantity_kg * item.unit_price_usd, 2);
      line_tax := round(line_subtotal * setting.tax_rate, 2);
      line_total := line_subtotal + line_tax;
      subtotal := subtotal + line_subtotal;
      tax := tax + line_tax;
      total := total + line_total;
    end if;
    update public.document_items set
      subtotal_usd = line_subtotal,
      tax_usd = line_tax,
      total_usd = line_total
    where id = item.id;
  end loop;

  update public.documents set
    number = coalesce(doc.number, public.reserve_document_number(doc.type, issued_year)),
    sequence_year = coalesce(doc.sequence_year, issued_year),
    status = 'generating',
    generation_key = p_idempotency_key,
    subtotal_usd = case when doc.type = 'proforma' then subtotal else null end,
    tax_usd = case when doc.type = 'proforma' then tax else null end,
    total_usd = case when doc.type = 'proforma' then total else null end,
    client_snapshot = jsonb_build_object(
      'legalName', client_row.legal_name,
      'tradeName', client_row.trade_name,
      'taxId', client_row.tax_id,
      'contact', case when doc.contact_id is null then null else jsonb_build_object(
        'fullName', contact_row.full_name, 'salutation', contact_row.salutation,
        'email', contact_row.email, 'phone', contact_row.phone) end,
      'address', case when doc.address_id is null then null else jsonb_build_object(
        'label', address_row.label, 'address', address_row.address,
        'district', address_row.district, 'city', address_row.city) end
    ),
    seller_snapshot = jsonb_build_object(
      'fullName', seller_row.full_name,
      'email', seller_row.email,
      'phone', seller_row.phone,
      'area', seller_row.area
    ),
    settings_snapshot = to_jsonb(setting) || jsonb_build_object(
      'bankAccounts', coalesce((
        select jsonb_agg(to_jsonb(bank) order by bank.display_order)
        from public.bank_accounts bank
        where bank.active
      ), '[]'::jsonb)
    )
  where id = doc.id
  returning * into doc;
  return doc;
end;
$$;

revoke all on function public.finalize_document(uuid, text) from public, anon, authenticated;
