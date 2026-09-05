# Relación con las plantillas de Google Docs

La primera versión ya no rellena marcadores de Google Docs. El contenido equivalente se construye en componentes versionados de `supabase/functions/_shared/pdf.ts`:

- cabecera FRAVE y datos empresariales;
- cliente, vigencia y atención comercial;
- tabla paginada de productos;
- resumen monetario para confirmaciones y para cotizaciones con todas las cantidades;
- condiciones, bancos, firma comercial y pie de página.

`template_version` identifica la versión del motor que produjo cada archivo. Los documentos históricos mantienen únicamente su enlace de Drive.
