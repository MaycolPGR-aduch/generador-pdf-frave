# Generador FRAVE de Cotizaciones y Confirmaciones de Pedido

Aplicación interna para preparar dos tipos de documentos comerciales en PDF:

- **Cotización:** muestra precios y permite cantidades opcionales. Solo calcula subtotal, IGV y total cuando todas las líneas tienen cantidad; el IGV se puede desactivar para cada cotización.
- **Confirmación de pedido:** exige cantidades, calcula IGV y total, y descuenta stock en kg de manera transaccional al emitirse.
- Una cotización generada o enviada puede convertirse en un borrador de confirmación. Conserva cliente, condiciones, líneas, cantidades existentes y precios cotizados; el stock se valida y descuenta únicamente al emitir la confirmación.

El frontend usa React, TypeScript y Vite. El backend utiliza Supabase PostgreSQL, Auth, Edge Functions y Storage privado. La composición del PDF está versionada en código y no depende de fórmulas de hojas de cálculo.

## Estado actual

- Monorepo pnpm con `apps/web` y `packages/domain`.
- Acceso interno con Supabase email/password y roles `admin`/`seller`.
- Dashboard, historial y constructor documental por pasos.
- Administración de categorías, productos, variantes, clientes, contactos, direcciones, bancos, configuración e invitaciones.
- Exportación Excel por cliente y período, con resumen, documentos y productos por documento.
- Cálculos decimales con redondeo por línea y pruebas Vitest.
- Migración SQL con RLS, numeración transaccional, snapshots, auditoría, inmutabilidad y libro de movimientos de stock.
- Edge Functions para preview, generación, enlaces firmados y administración.
- Asistente de migración repetible para Excel históricos.

La base de datos se crea inicialmente sin clientes ni productos. Los catálogos se cargan desde **Administración** o mediante una migración revisada.

## Estructura

```text
apps/web          React + TypeScript + Vite
packages/domain   tipos, validadores y cálculos monetarios
supabase/
  migrations/     esquema PostgreSQL, funciones, triggers y RLS
  functions/      preview, generación, enlaces y administración
scripts/          asistencia de migración de Excel
templates/        notas de diseño y referencias sanitizadas
```

## Requisitos

- Node.js 20 o superior.
- pnpm `9.15.5`, fijado en `package.json`.
- Proyecto Supabase de desarrollo y proyecto Supabase de producción.
- Docker Desktop solo para ejecutar Supabase completamente local.

```powershell
node --version
pnpm --version
```

Si pnpm aún no está instalado y tu versión de Node incluye Corepack:

```powershell
corepack enable
corepack prepare pnpm@9.15.5 --activate
```

## Inicio rápido

La modalidad recomendada es frontend local conectado a Supabase remoto de desarrollo.

### 1. Instalar dependencias

```powershell
cd D:\frave-pdf-generator
pnpm install
```

### 2. Configurar el frontend

```powershell
Copy-Item apps/web/.env.example apps/web/.env.local
notepad apps/web/.env.local
```

Usa la URL y la clave pública (`anon` o `publishable`) del proyecto de desarrollo:

```env
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<clave-publica>
```

Nunca pongas una clave `sb_secret_...` o `service_role` en este archivo.

### 3. Vincular Supabase y aplicar el esquema

```powershell
pnpm exec supabase login
pnpm exec supabase projects list
pnpm exec supabase link --project-ref <PROJECT_REF_DEV>
pnpm exec supabase db push --dry-run
pnpm exec supabase db push
```

La migración inicial está en `supabase/migrations/20260826000100_initial_schema.sql`. No ejecutes `db reset --linked` contra un proyecto remoto.

### 4. Crear el primer administrador

En Supabase, abre `Authentication > Users` y crea el primer usuario. Después ejecuta en `SQL Editor`:

```sql
update public.profiles
set role = 'admin',
    active = true
where lower(email) = lower('cuenta-operativa@ejemplo.com');
```

No guardes correos reales en Git.

### 5. Configurar y desplegar Edge Functions

El prefijo `SUPABASE_` está reservado por Supabase. No intentes registrar manualmente `SUPABASE_SERVICE_ROLE_KEY`; las funciones alojadas reciben sus variables internas. Configura únicamente valores propios de la aplicación:

```powershell
pnpm exec supabase secrets set APP_ORIGIN=http://localhost:5173
```

Despliega las funciones operativas:

```powershell
pnpm exec supabase functions deploy preview-document
pnpm exec supabase functions deploy generate-document
pnpm exec supabase functions deploy create-share-link
pnpm exec supabase functions deploy delete-document-pdf
pnpm exec supabase functions deploy delete-voided-document
pnpm exec supabase functions deploy admin-invite-user
```

`admin-import-migration` es opcional y solo debe desplegarse para una importación histórica protegida con un token temporal.

### 6. Ejecutar la aplicación

```powershell
pnpm dev
```

Abre <http://localhost:5173>. Ejecuta un solo servidor Vite y detenlo con `Ctrl+C` antes de iniciarlo nuevamente.

## Cargar catálogos

Como administrador:

1. Abre **Administración > Catálogo**.
2. Crea una categoría.
3. Crea productos con SKU, denominación, precio USD/kg y stock inicial en kg.
4. Añade variantes si cambia la denominación o el precio.
5. En **Clientes**, registra razón social y RUC de 11 dígitos.
6. En **Configuración > Opciones comerciales**, registra las formas de pago y entrega reutilizables.
7. Configura empresa y bancos antes de emitir PDFs definitivos. En el generador, pago y entrega se seleccionan desde combos.
8. Usa **Control de stock** para ajustes manuales; cada ajuste requiere motivo y queda registrado.
9. En **Clientes > Exportar documentos del cliente**, selecciona un cliente y un período para descargar un Excel. El archivo incluye cotizaciones y confirmaciones, incluso borradores o anulados, identificados por su estado.

## Migración de datos históricos

Los Excel operativos deben copiarse temporalmente a `migration/input/`, carpeta ignorada por Git:

```powershell
node scripts/migrate-xlsx.mjs migration/input
```

Revisa `migration/output/report.json` y resuelve conflictos antes de aplicar la importación. El procedimiento está documentado en [migration/README.md](migration/README.md).

Los Excel y Word históricos que acompañan este proyecto contienen datos comerciales reales. Deben permanecer fuera de GitHub o reemplazarse por copias completamente anonimizadas.

## Pruebas y validaciones

```powershell
pnpm test
pnpm typecheck
pnpm lint
pnpm build
pnpm format:check
```

La suite actual cubre principalmente dominio y compilación. El plan contempla ampliar RLS, integración, PDF y Playwright.

## Supabase completamente local (opcional)

Requiere Docker Desktop:

```powershell
pnpm exec supabase start
pnpm exec supabase status
pnpm exec supabase db reset
pnpm exec supabase functions serve
```

Usa las URL y claves de `supabase status`. Nunca mezcles claves de producción con el entorno local.

## Despliegue en Cloudflare Pages

Consulta [docs/despliegue-cloudflare.md](docs/despliegue-cloudflare.md).

```text
Build command: pnpm install --frozen-lockfile && pnpm --filter @frave/web build
Output directory: apps/web/dist
Node.js: 20 o superior
```

Cloudflare Pages solo recibe `VITE_SUPABASE_URL` y la clave pública. Las claves administrativas viven exclusivamente en Edge Functions.

## Seguridad y GitHub

- No existe registro público y RLS está habilitado.
- Los vendedores solo editan sus propios borradores.
- Los documentos emitidos son inmutables.
- Storage es privado y los enlaces expiran.
- No se registran contraseñas, PDFs ni datos completos de clientes en logs.
- `.env`, claves, certificados, builds, cachés, PDFs y archivos Office están excluidos por `.gitignore`.
- Los datos reales de migración nunca deben entrar al control de versiones.

Antes de subir cambios:

```powershell
git status --short --ignored
git check-ignore -v apps/web/.env.local migration/input 'Plantilla COTIZACION FRAVE_.xlsx' .pnpm-store
```

No uses `git add -f` sobre archivos ignorados con datos reales.

## Documentación relacionada

- [Arquitectura](docs/arquitectura.md)
- [Operación](docs/operacion.md)
- [Pruebas manuales](docs/pruebas-manuales.md)
- [Flujo de cotización](docs/flujo-propuesta.md)
- [Flujo de confirmación](docs/flujo-proforma.md)
- [Despliegue Cloudflare](docs/despliegue-cloudflare.md)
- [Migración histórica](migration/README.md)
- [Pendientes](docs/pendientes.md)

## Limitaciones de la primera versión

- Moneda inicial: USD.
- IGV configurable, iniciado en 18 %.
- Sin descuentos, múltiples monedas, tipo de cambio, firma digital, correo automático ni integración SUNAT.
- Los PDFs históricos permanecen en Google Drive como referencias legadas.

## Uso interno

Este proyecto es software interno de FRAVE. No contiene una licencia pública y no debe publicarse con datos operativos reales.
