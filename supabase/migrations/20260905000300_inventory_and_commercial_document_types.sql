-- Stock is measured in kilograms. The existing enum values are deliberately
-- preserved so historical proposal/proforma records remain valid; the UI and
-- generated PDFs now name them Cotización and Confirmación de pedido.

alter table public.products
  add column stock_kg numeric(12,3) not null default 0
    check (stock_kg >= 0 and stock_kg = round(stock_kg, 3));

alter table public.documents
  add column apply_igv boolean not null default true;

create table public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete restrict,
  document_id uuid references public.documents(id) on delete restrict,
  movement_type text not null check (
    movement_type in ('opening_balance', 'adjustment', 'confirmation_issue', 'confirmation_void')
  ),
  quantity_delta_kg numeric(12,3) not null check (
    quantity_delta_kg <> 0 and quantity_delta_kg = round(quantity_delta_kg, 3)
  ),
  stock_before_kg numeric(12,3) not null check (stock_before_kg >= 0),
  stock_after_kg numeric(12,3) not null check (stock_after_kg >= 0),
  reason text not null check (nullif(trim(reason), '') is not null),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  check (
    (movement_type = 'confirmation_issue' and quantity_delta_kg < 0)
    or (movement_type = 'confirmation_void' and quantity_delta_kg > 0)
    or movement_type in ('opening_balance', 'adjustment')
  )
);

create index inventory_movements_product_created_idx
  on public.inventory_movements (product_id, created_at desc);
create index inventory_movements_document_idx
  on public.inventory_movements (document_id)
  where document_id is not null;
create unique index inventory_movements_confirmation_issue_uidx
  on public.inventory_movements (document_id, product_id, movement_type)
  where movement_type = 'confirmation_issue';
create unique index inventory_movements_confirmation_void_uidx
  on public.inventory_movements (document_id, product_id, movement_type)
  where movement_type = 'confirmation_void';

-- Existing sequence rows represent the legacy PPT/PRF numbering. New records
-- use the independent "current" series so the new COT/CP counters start at 1.
alter table public.document_sequences
  add column series_key text not null default 'legacy';
alter table public.document_sequences drop constraint document_sequences_pkey;
alter table public.document_sequences
  add primary key (type, sequence_year, series_key);

create or replace function public.reserve_document_number(
  p_type public.document_type,
  p_year integer
)
returns text language plpgsql security definer set search_path = public as $$
declare
  next_value integer;
  prefix text;
begin
  if auth.role() <> 'service_role' then raise exception 'No autorizado'; end if;

  insert into public.document_sequences(type, sequence_year, series_key, last_value)
    values (p_type, p_year, 'current', 0)
    on conflict (type, sequence_year, series_key) do nothing;

  update public.document_sequences
    set last_value = last_value + 1
    where type = p_type and sequence_year = p_year and series_key = 'current'
    returning last_value into next_value;

  prefix := case when p_type = 'proposal' then 'COT' else 'CP' end;
  return format('%s-%s-%s', prefix, p_year, lpad(next_value::text, 4, '0'));
end;
$$;

create or replace function public.prevent_direct_stock_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.stock_kg is distinct from old.stock_kg
    and current_setting('app.inventory_write', true) is distinct from 'on' then
    raise exception 'El stock solo puede modificarse mediante un movimiento de inventario';
  end if;
  return new;
end;
$$;

create trigger products_prevent_direct_stock_change
before update of stock_kg on public.products
for each row execute function public.prevent_direct_stock_change();

create or replace function public.record_opening_stock()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.stock_kg <> 0 then
    insert into public.inventory_movements (
      product_id, movement_type, quantity_delta_kg, stock_before_kg,
      stock_after_kg, reason, created_by
    ) values (
      new.id, 'opening_balance', new.stock_kg, 0, new.stock_kg,
      'Saldo inicial', auth.uid()
    );
  end if;
  return new;
end;
$$;

create trigger products_record_opening_stock
after insert on public.products
for each row execute function public.record_opening_stock();

create or replace function public.adjust_product_stock(
  p_product_id uuid,
  p_quantity_delta_kg numeric,
  p_reason text
)
returns public.products language plpgsql security definer set search_path = public as $$
declare
  product_row public.products;
  next_stock numeric(12,3);
begin
  if not public.has_role('admin') then raise exception 'Solo un administrador puede ajustar stock'; end if;
  if p_quantity_delta_kg is null or p_quantity_delta_kg = 0
    or p_quantity_delta_kg <> round(p_quantity_delta_kg, 3) then
    raise exception 'El ajuste debe ser distinto de cero y tener como máximo tres decimales';
  end if;
  if nullif(trim(p_reason), '') is null then raise exception 'Indica el motivo del ajuste'; end if;

  select * into product_row from public.products where id = p_product_id for update;
  if not found then raise exception 'Producto no encontrado'; end if;
  next_stock := product_row.stock_kg + p_quantity_delta_kg;
  if next_stock < 0 then raise exception 'El ajuste dejaría el stock en negativo'; end if;

  perform set_config('app.inventory_write', 'on', true);
  update public.products set stock_kg = next_stock where id = product_row.id
    returning * into product_row;
  insert into public.inventory_movements (
    product_id, movement_type, quantity_delta_kg, stock_before_kg,
    stock_after_kg, reason, created_by
  ) values (
    product_row.id, 'adjustment', p_quantity_delta_kg,
    product_row.stock_kg - p_quantity_delta_kg, product_row.stock_kg,
    trim(p_reason), auth.uid()
  );
  return product_row;
end;
$$;

grant execute on function public.adjust_product_stock(uuid, numeric, text) to authenticated;

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
  line_subtotal numeric(14,2);
  line_tax numeric(14,2);
  line_total numeric(14,2);
  subtotal numeric(14,2) := 0;
  tax numeric(14,2) := 0;
  total numeric(14,2) := 0;
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
    raise exception 'La confirmación de pedido requiere cantidad en todos los productos';
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
    select * into contact_row from public.client_contacts
      where id = doc.contact_id and client_id = doc.client_id and active;
    if not found then raise exception 'Contacto no disponible'; end if;
  end if;
  if doc.address_id is not null then
    select * into address_row from public.client_addresses
      where id = doc.address_id and client_id = doc.client_id and active;
    if not found then raise exception 'Dirección no disponible'; end if;
  end if;
  select p.full_name, p.email, p.phone, p.area into seller_row
    from public.profiles p where p.id = doc.seller_id and p.active;
  if not found then raise exception 'Vendedor no disponible'; end if;

  calculate_totals := doc.type = 'proforma' or not exists (
    select 1 from public.document_items where document_id = doc.id and quantity_kg is null
  );
  tax_rate := case when doc.type = 'proforma' or doc.apply_igv then setting.tax_rate else 0 end;

  for item in select * from public.document_items where document_id = doc.id order by position loop
    line_subtotal := null;
    line_tax := null;
    line_total := null;
    if calculate_totals then
      line_subtotal := round(item.quantity_kg * item.unit_price_usd, 2);
      line_tax := round(line_subtotal * tax_rate, 2);
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

  -- Confirmations reserve stock once, while the document is finalized. Product
  -- rows are locked in a deterministic order to make concurrent confirmation
  -- generation safe.
  if doc.type = 'proforma' then
    perform 1 from public.products
      where id in (select product_id from public.document_items where document_id = doc.id)
      order by id for update;
    for stock_row in
      select product_id, sum(quantity_kg)::numeric(12,3) as required_kg
      from public.document_items where document_id = doc.id
      group by product_id order by product_id
    loop
      select * into product_row from public.products where id = stock_row.product_id;
      if not found then raise exception 'Producto no encontrado para controlar stock'; end if;
      if product_row.stock_kg < stock_row.required_kg then
        raise exception 'Stock insuficiente para %: disponible % kg, requerido % kg',
          product_row.sku, product_row.stock_kg, stock_row.required_kg;
      end if;
      perform set_config('app.inventory_write', 'on', true);
      update public.products
        set stock_kg = stock_kg - stock_row.required_kg
        where id = product_row.id
        returning * into product_row;
      insert into public.inventory_movements (
        product_id, document_id, movement_type, quantity_delta_kg,
        stock_before_kg, stock_after_kg, reason, created_by
      ) values (
        product_row.id, doc.id, 'confirmation_issue', -stock_row.required_kg,
        product_row.stock_kg + stock_row.required_kg, product_row.stock_kg,
        'Confirmación de pedido emitida', doc.created_by
      );
    end loop;
  end if;

  update public.documents set
    number = coalesce(doc.number, public.reserve_document_number(doc.type, issued_year)),
    sequence_year = coalesce(doc.sequence_year, issued_year),
    status = 'generating',
    generation_key = p_idempotency_key,
    subtotal_usd = case when calculate_totals then subtotal else null end,
    tax_usd = case when calculate_totals then tax else null end,
    total_usd = case when calculate_totals then total else null end,
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
        from public.bank_accounts bank where bank.active
      ), '[]'::jsonb)
    )
  where id = doc.id
  returning * into doc;
  return doc;
end;
$$;

revoke all on function public.finalize_document(uuid, text) from public, anon, authenticated;

create or replace function public.void_document(p_document_id uuid, p_reason text)
returns public.documents language plpgsql security definer set search_path = public as $$
declare
  doc public.documents;
  movement record;
  product_row public.products;
begin
  if not public.has_role('admin') then raise exception 'Solo un administrador puede anular'; end if;
  if nullif(trim(p_reason), '') is null then raise exception 'Indica el motivo de anulación'; end if;

  select * into doc from public.documents where id = p_document_id for update;
  if not found or doc.status not in ('generated', 'sent') then
    raise exception 'El documento no puede anularse';
  end if;

  -- Historical PRF documents have no stock movement and must not invent stock
  -- during an annulment. Current confirmations have one issue movement per SKU.
  if doc.type = 'proforma' and exists (
    select 1 from public.inventory_movements
    where document_id = doc.id and movement_type = 'confirmation_issue'
  ) then
    perform 1 from public.products
      where id in (
        select product_id from public.inventory_movements
        where document_id = doc.id and movement_type = 'confirmation_issue'
      ) order by id for update;
    for movement in
      select * from public.inventory_movements
      where document_id = doc.id and movement_type = 'confirmation_issue'
      order by product_id
    loop
      select * into product_row from public.products where id = movement.product_id;
      if not found then raise exception 'Producto no encontrado para devolver stock'; end if;
      perform set_config('app.inventory_write', 'on', true);
      update public.products
        set stock_kg = stock_kg + abs(movement.quantity_delta_kg)
        where id = product_row.id
        returning * into product_row;
      insert into public.inventory_movements (
        product_id, document_id, movement_type, quantity_delta_kg,
        stock_before_kg, stock_after_kg, reason, created_by
      ) values (
        product_row.id, doc.id, 'confirmation_void', abs(movement.quantity_delta_kg),
        product_row.stock_kg - abs(movement.quantity_delta_kg), product_row.stock_kg,
        'Devolución por anulación: ' || trim(p_reason), auth.uid()
      );
    end loop;
  end if;

  update public.documents set
    status = 'void', voided_at = now(), void_reason = trim(p_reason)
  where id = doc.id
  returning * into doc;
  return doc;
end;
$$;

create or replace function public.duplicate_document(p_source_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  source_doc public.documents;
  new_id uuid;
begin
  if not public.is_active_user() then raise exception 'No autorizado'; end if;
  select * into source_doc from public.documents where id = p_source_id;
  if not found then raise exception 'Documento no encontrado'; end if;
  insert into public.documents (
    type, apply_igv, client_id, created_by, seller_id, contact_id, address_id,
    payment_method, delivery_method, valid_until, considerations, supersedes_document_id
  ) values (
    source_doc.type, source_doc.apply_igv, source_doc.client_id, auth.uid(), auth.uid(), source_doc.contact_id, source_doc.address_id,
    source_doc.payment_method, source_doc.delivery_method, source_doc.valid_until,
    source_doc.considerations, source_doc.id
  ) returning id into new_id;
  insert into public.document_items (document_id, position, product_id, variant_id, quantity_kg, observation)
    select new_id, position, product_id, variant_id, quantity_kg, observation
    from public.document_items where document_id = source_doc.id order by position;
  return new_id;
end;
$$;

alter table public.inventory_movements enable row level security;
create policy inventory_movements_read on public.inventory_movements
  for select using (public.is_active_user());
