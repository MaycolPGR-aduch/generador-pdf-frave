# Pendientes antes del piloto

La base del producto ya está implementada. Antes de usar datos operativos se deben completar estas tareas de despliegue y aceptación:

- [ ] Crear los proyectos Supabase de desarrollo y producción y aplicar la migración SQL.
- [ ] Crear y verificar el bucket privado `documents` en Storage de cada ambiente antes de emitir PDFs.
- [ ] Configurar SMTP de Google Workspace si el correo incorporado de Supabase no es suficiente.
- [ ] Cargar el logo aprobado como asset binario y validar su render en el PDF final.
- [ ] Ejecutar pgTAP/RLS y Playwright contra un proyecto Supabase de desarrollo.
- [ ] Añadir autoguardado remoto con control de versión optimista si el piloto confirma que el guardado explícito no es suficiente.
- [ ] Colocar los Excel históricos en `migration/input/`, revisar `migration/output/report.json` y resolver conflictos antes de `--apply`.
- [ ] Comparar propuestas y proformas generadas con los casos aprobados de las plantillas originales.
- [ ] Extraer el logo aprobado y ajustar fuentes/espaciado para lograr fidelidad visual con las plantillas Word; hoy el motor usa una aproximación programática.
- [ ] Configurar Cloudflare Pages, variables públicas y secretos de Edge Functions sin guardarlos en Git.
- [ ] Configurar exportación nocturna de `public` y copia externa cifrada de Storage.

La primera versión no incluye descuentos, múltiples monedas, firma digital, correo automático ni integración SUNAT.
