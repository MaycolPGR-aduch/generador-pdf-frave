# Operación y despliegue

## Desarrollo local

1. Instala Node 20+ y pnpm 9+.
2. Ejecuta `pnpm install`.
3. Copia `apps/web/.env.example` a `apps/web/.env.local` y completa solo las claves públicas de Supabase.
4. Ejecuta `pnpm dev`.
5. Aplica la migración con `supabase db push` en el proyecto de desarrollo.

El primer administrador debe crearse mediante Supabase Auth y marcarse en SQL una sola vez (`update public.profiles set role = 'admin' where email = 'cuenta-operativa';`). No se deben subir correos reales ni esa cuenta al repositorio.

## CI/CD

El pipeline ejecuta lint, type-check, pruebas de dominio y build. Las migraciones y funciones se despliegan primero a desarrollo; producción requiere aprobación explícita. Cloudflare Pages recibe únicamente `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`. `SUPABASE_SERVICE_ROLE_KEY` solo vive como secreto de las Edge Functions.

## Backups y capacidad

Programa una exportación cifrada nocturna del esquema `public` y una copia periódica cifrada del bucket privado. Conserva 30 copias diarias y 12 mensuales; alerta al 70 % y 85 %. Los enlaces compartidos duran siete días y nunca sustituyen el backup.

Un administrador puede eliminar manualmente un PDF emitido para liberar Storage. La acción exige un motivo, elimina el objeto privado, invalida sus enlaces y queda auditada; no borra el documento comercial, sus totales, número ni movimientos de stock. Un administrador puede regenerar el archivo más adelante con las instantáneas congeladas del documento. No hay borrado automático.
