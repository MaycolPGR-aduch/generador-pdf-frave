# Migración de los archivos históricos

Los Excel con datos operativos no deben entrar al repositorio. Colócalos temporalmente en `migration/input/`, una carpeta ignorada por git, y ejecuta:

```bash
node scripts/migrate-xlsx.mjs
```

Para cargar únicamente el catálogo de las plantillas —sin clientes, historial ni
documentos— se puede apuntar directamente a la carpeta que contiene los Excel:

```bash
node scripts/migrate-xlsx.mjs . --catalog-only
```

Este modo extrae SKU, denominación, categoría, precio y variaciones. Cuando un
SKU difiere entre archivos, se excluye del reporte de importación hasta que se
revise manualmente.

El script no modifica los archivos de origen. Normaliza SKU, categorías y RUC, calcula un hash por fila y genera `migration/output/report.json` con catálogos deduplicados, conflictos y claves de migración repetibles. Los PDF históricos y sus enlaces no se descargan.

La importación a Supabase debe ejecutarse únicamente después de revisar el reporte. La primera versión incluye la Edge Function `admin-import-migration`, que acepta un token efímero configurado como secreto `MIGRATION_TOKEN` (o un JWT de un administrador):

```bash
MIGRATION_ENDPOINT="https://<proyecto>.supabase.co/functions/v1/admin-import-migration" \
MIGRATION_TOKEN="<token efímero fuera de git>" \
node scripts/migrate-xlsx.mjs migration/input --apply
```

Antes de usarlo, configura el secreto con `supabase secrets set MIGRATION_TOKEN=...` y despliega `supabase functions deploy admin-import-migration --no-verify-jwt`.

La función valida tamaño, normaliza catálogos, conserva registros de migración por `source_key` y `source_hash`, y registra únicamente conteos y conflictos en `audit_logs`. La importación de documentos históricos requiere que el reporte incluya columnas documentales (número, tipo, fecha y cliente); hasta entonces se marca para revisión. Nunca guardes tokens, archivos reales ni el reporte resultante en git.
