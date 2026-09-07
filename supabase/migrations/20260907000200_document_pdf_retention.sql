-- A removed PDF frees private Storage space while preserving the commercial
-- document, its numbering, frozen values and inventory/audit history.
alter table public.document_files
  add column deleted_at timestamptz,
  add column deleted_by uuid references public.profiles(id) on delete set null,
  add column deletion_reason text;

alter table public.document_files
  add constraint document_files_deletion_details_check check (
    deleted_at is null
    or (
      deleted_by is not null
      and nullif(trim(deletion_reason), '') is not null
    )
  );
