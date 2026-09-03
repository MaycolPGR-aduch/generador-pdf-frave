create extension if not exists "pgcrypto";
create extension if not exists "citext";

create type public.user_role as enum ('admin', 'seller');
create type public.document_type as enum ('proposal', 'proforma');
create type public.document_status as enum (
  'draft',
  'generating',
  'generated',
  'generation_failed',
  'sent',
  'void'
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email citext not null unique,
  full_name text not null,
  role public.user_role not null default 'seller',
  phone text,
  area text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.product_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  normalized_name text generated always as (lower(trim(name))) stored,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (normalized_name)
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  sku text not null,
  name text not null,
  category_id uuid not null references public.product_categories(id),
  unit_price_usd numeric(12,4) not null check (unit_price_usd >= 0),
  active boolean not null default true,
  legacy_source text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete restrict,
  name text not null,
  price_override_usd numeric(12,4) check (price_override_usd is null or price_override_usd >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  legal_name text not null,
  trade_name text,
  tax_id text not null,
  active boolean not null default true,
  legacy_source text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint clients_tax_id_format check (
    (legacy_source is not null) or tax_id ~ '^[0-9]{11}$'
  ),
  unique (tax_id)
);

create table public.client_contacts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete restrict,
  full_name text not null,
  salutation text,
  email citext,
  phone text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.client_addresses (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete restrict,
  label text not null default 'Principal',
  address text not null,
  district text,
  city text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.company_settings (
  id boolean primary key default true check (id),
  legal_name text not null default 'Frave-Fragancias y Envases E.I.R.L',
  display_name text not null default 'FRAVE - Fragancias y Envases',
  tax_id text not null default '',
  primary_address text not null default '',
  footer_address text not null default '',
  location text not null default 'Lima',
  district text not null default 'Comas',
  country text not null default 'Perú',
  brand_color text not null default '#FF8F26',
  logo_path text,
  tax_rate numeric(5,4) not null default 0.1800 check (tax_rate >= 0 and tax_rate <= 1),
  default_validity_days integer not null default 30 check (default_validity_days between 1 and 365),
  updated_at timestamptz not null default now()
);

insert into public.company_settings (id) values (true) on conflict (id) do nothing;

create table public.bank_accounts (
  id uuid primary key default gen_random_uuid(),
  currency text not null default 'USD' check (currency in ('PEN', 'USD')),
  bank_name text not null,
  account_type text not null,
  account_number text not null,
  cci text,
  display_order integer not null default 0,
  active boolean not null default true
);

create table public.commercial_options (
  id uuid primary key default gen_random_uuid(),
  option_type text not null check (option_type in ('payment', 'delivery', 'consideration')),
  label text not null,
  active boolean not null default true,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.commercial_options (option_type, label, display_order) values
  ('payment', '50% adelanto, 50% contra entrega', 10),
  ('payment', 'Pago contra entrega', 20),
  ('delivery', 'Despacho coordinado con el cliente', 10),
  ('delivery', 'Recojo en almacén FRAVE', 20),
  ('consideration', 'Precios expresados en USD/kg', 10),
  ('consideration', 'Sujeto a disponibilidad de stock', 20)
on conflict do nothing;

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  type public.document_type not null,
  status public.document_status not null default 'draft',
  number text unique,
  sequence_year integer,
  legacy_number text,
  legacy_file_name text,
  legacy_drive_url text,
  legacy_source_hash text,
  client_id uuid not null references public.clients(id),
  created_by uuid not null references public.profiles(id),
  seller_id uuid not null references public.profiles(id),
  contact_id uuid references public.client_contacts(id),
  address_id uuid references public.client_addresses(id),
  payment_method text not null,
  delivery_method text not null,
  valid_until date not null,
  considerations jsonb not null default '[]'::jsonb,
  subtotal_usd numeric(14,2),
  tax_usd numeric(14,2),
  total_usd numeric(14,2),
  client_snapshot jsonb,
  seller_snapshot jsonb,
  settings_snapshot jsonb,
  template_version text,
  generation_key text unique,
  generation_error text,
  supersedes_document_id uuid references public.documents(id),
  sent_at timestamptz,
  voided_at timestamptz,
  void_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'void' or nullif(trim(void_reason), '') is not null),
  check (
    type = 'proposal'
    or legacy_number is not null
    or status in ('draft', 'generating', 'generation_failed')
    or (subtotal_usd is not null and tax_usd is not null and total_usd is not null)
  )
);

create table public.document_items (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  position integer not null check (position between 1 and 100),
  product_id uuid not null references public.products(id),
  variant_id uuid references public.product_variants(id),
  quantity_kg numeric(12,3) check (quantity_kg is null or quantity_kg >= 0),
  observation text,
  sku_snapshot text,
  denomination_snapshot text,
  category_snapshot text,
  unit_price_usd numeric(12,4),
  subtotal_usd numeric(14,2),
  tax_usd numeric(14,2),
  total_usd numeric(14,2),
  unique (document_id, position)
);

create table public.document_sequences (
  type public.document_type not null,
  sequence_year integer not null,
  last_value integer not null default 0 check (last_value >= 0),
  primary key (type, sequence_year)
);

create table public.document_files (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null unique references public.documents(id) on delete restrict,
  storage_path text not null unique,
  sha256 text not null,
  file_size_bytes bigint not null check (file_size_bytes > 0),
  template_version text not null,
  created_at timestamptz not null default now()
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  request_id text,
  result text not null check (result in ('success', 'failure')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.migration_records (
  id uuid primary key default gen_random_uuid(),
  source_key text not null unique,
  source_hash text not null,
  source_type text not null,
  target_id uuid,
  status text not null check (status in ('imported', 'review', 'skipped')),
  issue text,
  created_at timestamptz not null default now()
);

create index products_active_name_idx on public.products (active, lower(name));
create unique index products_sku_normalized_uidx on public.products (lower(trim(sku)));
create unique index product_variants_name_uidx on public.product_variants (product_id, lower(trim(name)));
create unique index commercial_options_label_uidx on public.commercial_options (option_type, lower(trim(label)));
create index documents_created_by_idx on public.documents (created_by, created_at desc);
create index documents_client_idx on public.documents (client_id, created_at desc);
create index documents_status_idx on public.documents (status, created_at desc);
create index document_items_document_idx on public.document_items (document_id, position);
create index audit_logs_entity_idx on public.audit_logs (entity_type, entity_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at before update on public.profiles
for each row execute function public.set_updated_at();
create trigger products_set_updated_at before update on public.products
for each row execute function public.set_updated_at();
create trigger product_variants_set_updated_at before update on public.product_variants
for each row execute function public.set_updated_at();
create trigger clients_set_updated_at before update on public.clients
for each row execute function public.set_updated_at();
create trigger company_settings_set_updated_at before update on public.company_settings
for each row execute function public.set_updated_at();
create trigger documents_set_updated_at before update on public.documents
for each row execute function public.set_updated_at();
create trigger commercial_options_set_updated_at before update on public.commercial_options
for each row execute function public.set_updated_at();

create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, role, active)
  values (
    new.id,
    new.email,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(new.email, '@', 1)),
    'seller',
    true
  )
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

create or replace function public.is_active_user()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and active);
$$;

create or replace function public.has_role(required_role public.user_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and active and role = required_role
  );
$$;

create or replace function public.sync_draft_item_snapshot()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  parent_status public.document_status;
  product_row record;
  variant_row record;
begin
  select status into parent_status from public.documents where id = new.document_id;
  if parent_status = 'draft' then
    select p.sku, p.name, p.unit_price_usd, c.name as category
      into product_row
      from public.products p
      join public.product_categories c on c.id = p.category_id
      where p.id = new.product_id and p.active;
    if not found then raise exception 'Producto no disponible'; end if;
    new.sku_snapshot = product_row.sku;
    new.denomination_snapshot = product_row.name;
    new.category_snapshot = product_row.category;
    new.unit_price_usd = product_row.unit_price_usd;
    if new.variant_id is not null then
      select v.name, v.price_override_usd into variant_row
      from public.product_variants v
      where v.id = new.variant_id and v.product_id = new.product_id and v.active;
      if not found then raise exception 'Variación no disponible'; end if;
      new.denomination_snapshot = variant_row.name;
      if variant_row.price_override_usd is not null then
        new.unit_price_usd = variant_row.price_override_usd;
      end if;
    end if;
  elsif parent_status = 'generation_failed' and auth.role() = 'service_role' then
    -- A failed worker may recompute monetary fields while retrying. Commercial
    -- snapshots and product references are never changed by this path.
    null;
  elsif parent_status is distinct from 'draft' then
    raise exception 'Los ítems emitidos son inmutables';
  end if;
  return new;
end;
$$;

create trigger document_items_sync_snapshot before insert or update on public.document_items
for each row execute function public.sync_draft_item_snapshot();

create or replace function public.protect_emitted_document()
returns trigger language plpgsql as $$
declare
  old_content jsonb;
  new_content jsonb;
begin
  if old.status <> 'draft' then
    old_content := to_jsonb(old) - array['status','updated_at','sent_at','voided_at','void_reason','generation_error'];
    new_content := to_jsonb(new) - array['status','updated_at','sent_at','voided_at','void_reason','generation_error'];
    -- The PDF worker writes the engine version exactly once while moving
    -- generating -> generated. Every other commercial field stays frozen.
    if old.status in ('generating', 'generation_failed')
      and new.status in ('generating', 'generated', 'generation_failed') then
      old_content := old_content - array['template_version', 'generation_key'];
      new_content := new_content - array['template_version', 'generation_key'];
    end if;
    if old_content is distinct from new_content then
      raise exception 'El documento emitido es inmutable';
    end if;
    if new.status not in ('generating','generated','generation_failed','sent','void') then
      raise exception 'Transición de estado inválida';
    end if;
  end if;
  return new;
end;
$$;

create trigger documents_protect_emitted before update on public.documents
for each row execute function public.protect_emitted_document();

create or replace function public.audit_row_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  changed_id uuid;
  operation text := lower(TG_OP);
begin
  changed_id := case when TG_OP = 'DELETE' then old.id else new.id end;
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, result, metadata)
  values (
    auth.uid(), operation, TG_TABLE_NAME, changed_id, 'success',
    jsonb_build_object('operation', operation, 'table', TG_TABLE_NAME)
  );
  if TG_OP = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger products_audit after insert or update or delete on public.products
for each row execute function public.audit_row_change();
create trigger clients_audit after insert or update or delete on public.clients
for each row execute function public.audit_row_change();
create trigger documents_audit after insert or update or delete on public.documents
for each row execute function public.audit_row_change();
create trigger profiles_audit after insert or update or delete on public.profiles
for each row execute function public.audit_row_change();
create trigger company_settings_audit after insert or update or delete on public.company_settings
for each row execute function public.audit_row_change();

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
  insert into public.document_sequences(type, sequence_year, last_value)
    values (p_type, p_year, 0)
    on conflict (type, sequence_year) do nothing;
  update public.document_sequences
    set last_value = last_value + 1
    where type = p_type and sequence_year = p_year
    returning last_value into next_value;
  prefix := case when p_type = 'proposal' then 'PPT' else 'PRF' end;
  return format('%s-%s-%s', prefix, p_year, lpad(next_value::text, 4, '0'));
end;
$$;
revoke all on function public.reserve_document_number(public.document_type, integer) from public, anon, authenticated;

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

  -- A failed worker already has a reserved number, calculated lines and
  -- frozen snapshots. Retry only reopens the worker state; it must not read
  -- changed catalog or company data.
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
    type, client_id, created_by, seller_id, contact_id, address_id,
    payment_method, delivery_method, valid_until, considerations, supersedes_document_id
  ) values (
    source_doc.type, source_doc.client_id, auth.uid(), auth.uid(), source_doc.contact_id, source_doc.address_id,
    source_doc.payment_method, source_doc.delivery_method, source_doc.valid_until,
    source_doc.considerations, source_doc.id
  ) returning id into new_id;
  insert into public.document_items (document_id, position, product_id, variant_id, quantity_kg, observation)
    select new_id, position, product_id, variant_id, quantity_kg, observation
    from public.document_items where document_id = source_doc.id order by position;
  return new_id;
end;
$$;

create or replace function public.replace_draft_items(p_document_id uuid, p_items jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  doc public.documents;
  item jsonb;
  item_position integer := 0;
begin
  if not public.is_active_user() then raise exception 'No autorizado'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 100 then
    raise exception 'El documento debe tener entre 1 y 100 productos';
  end if;
  select * into doc from public.documents where id = p_document_id for update;
  if not found or doc.status <> 'draft' or (doc.created_by <> auth.uid() and not public.has_role('admin')) then
    raise exception 'El borrador no puede modificarse';
  end if;
  delete from public.document_items where document_id = p_document_id;
  for item in select value from jsonb_array_elements(p_items) as elements(value) loop
    item_position := item_position + 1;
    insert into public.document_items (document_id, position, product_id, variant_id, quantity_kg, observation)
    values (
      p_document_id,
      item_position,
      (item ->> 'productId')::uuid,
      nullif(item ->> 'variantId', '')::uuid,
      nullif(item ->> 'quantityKg', '')::numeric,
      nullif(item ->> 'observation', '')
    );
  end loop;
end;
$$;

grant execute on function public.replace_draft_items(uuid, jsonb) to authenticated;

create or replace function public.mark_document_sent(p_document_id uuid)
returns public.documents language plpgsql security definer set search_path = public as $$
declare doc public.documents;
begin
  if not public.is_active_user() then raise exception 'No autorizado'; end if;
  update public.documents set status = 'sent', sent_at = now()
  where id = p_document_id and status = 'generated'
    and (created_by = auth.uid() or public.has_role('admin'))
  returning * into doc;
  if not found then raise exception 'El documento no puede marcarse como enviado'; end if;
  return doc;
end;
$$;

create or replace function public.void_document(p_document_id uuid, p_reason text)
returns public.documents language plpgsql security definer set search_path = public as $$
declare doc public.documents;
begin
  if not public.has_role('admin') then raise exception 'Solo un administrador puede anular'; end if;
  if nullif(trim(p_reason), '') is null then raise exception 'Indica el motivo de anulación'; end if;
  update public.documents set status = 'void', voided_at = now(), void_reason = trim(p_reason)
  where id = p_document_id and status in ('generated', 'sent')
  returning * into doc;
  if not found then raise exception 'El documento no puede anularse'; end if;
  return doc;
end;
$$;

grant execute on function public.duplicate_document(uuid) to authenticated;
grant execute on function public.mark_document_sent(uuid) to authenticated;
grant execute on function public.void_document(uuid, text) to authenticated;

alter table public.profiles enable row level security;
alter table public.product_categories enable row level security;
alter table public.products enable row level security;
alter table public.product_variants enable row level security;
alter table public.clients enable row level security;
alter table public.client_contacts enable row level security;
alter table public.client_addresses enable row level security;
alter table public.company_settings enable row level security;
alter table public.bank_accounts enable row level security;
alter table public.commercial_options enable row level security;
alter table public.documents enable row level security;
alter table public.document_items enable row level security;
alter table public.document_files enable row level security;
alter table public.audit_logs enable row level security;
alter table public.migration_records enable row level security;
alter table public.document_sequences enable row level security;

create policy profiles_read_active on public.profiles for select using (public.is_active_user());
create policy profiles_admin_write on public.profiles for all using (public.has_role('admin')) with check (public.has_role('admin'));

create policy categories_read_active on public.product_categories for select using (public.is_active_user());
create policy categories_admin_write on public.product_categories for all using (public.has_role('admin')) with check (public.has_role('admin'));
create policy products_read_active on public.products for select using (public.is_active_user());
create policy products_admin_write on public.products for all using (public.has_role('admin')) with check (public.has_role('admin'));
create policy variants_read_active on public.product_variants for select using (public.is_active_user());
create policy variants_admin_write on public.product_variants for all using (public.has_role('admin')) with check (public.has_role('admin'));

create policy clients_read on public.clients for select using (public.is_active_user());
create policy clients_admin_write on public.clients for all using (public.has_role('admin')) with check (public.has_role('admin'));
create policy contacts_read on public.client_contacts for select using (public.is_active_user());
create policy contacts_admin_write on public.client_contacts for all using (public.has_role('admin')) with check (public.has_role('admin'));
create policy addresses_read on public.client_addresses for select using (public.is_active_user());
create policy addresses_admin_write on public.client_addresses for all using (public.has_role('admin')) with check (public.has_role('admin'));

create policy settings_read on public.company_settings for select using (public.is_active_user());
create policy settings_admin_write on public.company_settings for all using (public.has_role('admin')) with check (public.has_role('admin'));
create policy banks_read on public.bank_accounts for select using (public.is_active_user());
create policy banks_admin_write on public.bank_accounts for all using (public.has_role('admin')) with check (public.has_role('admin'));
create policy options_read on public.commercial_options for select using (public.is_active_user());
create policy options_admin_write on public.commercial_options for all using (public.has_role('admin')) with check (public.has_role('admin'));

create policy documents_read on public.documents for select using (public.is_active_user());
create policy documents_insert on public.documents for insert with check (
  public.is_active_user() and created_by = auth.uid() and seller_id = auth.uid()
);
create policy documents_update_drafts on public.documents for update using (
  public.is_active_user() and status = 'draft' and (created_by = auth.uid() or public.has_role('admin'))
) with check (
  status = 'draft' and (created_by = auth.uid() or public.has_role('admin'))
);
create policy documents_delete_drafts on public.documents for delete using (
  status = 'draft' and (created_by = auth.uid() or public.has_role('admin'))
);

create policy items_read on public.document_items for select using (public.is_active_user());
create policy items_insert_drafts on public.document_items for insert with check (
  exists (select 1 from public.documents d where d.id = document_id and d.status = 'draft' and (d.created_by = auth.uid() or public.has_role('admin')))
);
create policy items_update_drafts on public.document_items for update using (
  exists (select 1 from public.documents d where d.id = document_id and d.status = 'draft' and (d.created_by = auth.uid() or public.has_role('admin')))
) with check (true);
create policy items_delete_drafts on public.document_items for delete using (
  exists (select 1 from public.documents d where d.id = document_id and d.status = 'draft' and (d.created_by = auth.uid() or public.has_role('admin')))
);

create policy document_files_read on public.document_files for select using (public.is_active_user());
create policy audit_admin_read on public.audit_logs for select using (public.has_role('admin'));
create policy migration_admin_read on public.migration_records for select using (public.has_role('admin'));

insert into storage.buckets (id, name, public) values ('documents', 'documents', false)
on conflict (id) do update set public = false;

create policy document_storage_read on storage.objects for select using (
  bucket_id = 'documents' and public.is_active_user()
);
create policy document_storage_admin_write on storage.objects for all using (
  bucket_id = 'documents' and public.has_role('admin')
) with check (bucket_id = 'documents' and public.has_role('admin'));
