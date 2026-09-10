-- Correo institucional usado en los documentos comerciales. Se permite vacío
-- para conservar la compatibilidad con instalaciones existentes: en ese caso
-- el PDF usa el correo del vendedor asignado.
alter table public.company_settings
  add column commercial_email text not null default ''
  check (
    commercial_email = ''
    or commercial_email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  );

comment on column public.company_settings.commercial_email is
  'Correo institucional mostrado en los documentos comerciales emitidos.';
