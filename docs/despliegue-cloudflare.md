# Despliegue en Cloudflare Pages

Configura el proyecto con el repositorio y estos valores:

- Build command: `pnpm install --frozen-lockfile && pnpm --filter @frave/web build`
- Build output directory: `apps/web/dist`
- Node.js: 20 o superior
- Variables públicas: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`

Usa un proyecto Pages para desarrollo y otro para producción, ambos conectados al mismo código pero con proyectos Supabase separados. La clave `service_role` no se registra como variable de Pages: pertenece exclusivamente a los secretos de las Edge Functions.
