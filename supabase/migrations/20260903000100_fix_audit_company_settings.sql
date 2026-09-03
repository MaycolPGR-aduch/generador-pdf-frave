-- company_settings usa un identificador booleano (id = true),
-- mientras que audit_logs.entity_id es UUID.
create or replace function public.audit_row_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  changed_id uuid;
  operation text := lower(TG_OP);
begin
  changed_id := null;
  if TG_TABLE_NAME <> 'company_settings' then
    changed_id := case when TG_OP = 'DELETE' then old.id else new.id end;
  end if;

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
