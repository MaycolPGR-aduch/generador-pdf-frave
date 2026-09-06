create sequence public.client_code_sequence as bigint start with 1 increment by 1;

alter table public.clients add column client_code text;

with numbered_clients as (
  select id, row_number() over (order by created_at, id) as sequence_number
  from public.clients
)
update public.clients as client
set client_code = 'CL-' || lpad(numbered_clients.sequence_number::text, 4, '0')
from numbered_clients
where client.id = numbered_clients.id;

select setval(
  'public.client_code_sequence',
  coalesce((select max(substring(client_code from 4)::bigint) from public.clients), 1),
  exists (select 1 from public.clients)
);

alter table public.clients
  alter column client_code set not null,
  add constraint clients_client_code_format check (client_code ~ '^CL-[0-9]{4,}$'),
  add constraint clients_client_code_unique unique (client_code);

create or replace function public.assign_client_code()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.client_code is not null then
      raise exception 'El código de cliente se genera automáticamente';
    end if;
    new.client_code := 'CL-' || lpad(nextval('public.client_code_sequence')::text, 4, '0');
  elsif new.client_code is distinct from old.client_code then
    raise exception 'El código de cliente no puede modificarse';
  end if;
  return new;
end;
$$;

create trigger clients_assign_client_code
before insert or update on public.clients
for each row execute function public.assign_client_code();
