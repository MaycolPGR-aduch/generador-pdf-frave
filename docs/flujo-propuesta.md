# Flujo de propuesta

1. El vendedor selecciona cliente, condiciones y productos del catálogo.
2. La aplicación muestra REF, denominación, categoría y USD/kg; la cantidad, si se captura, queda como dato interno.
3. Se guarda un borrador sin reservar número.
4. La vista previa usa el mismo motor PDF y muestra `BORRADOR`.
5. Al generar, PostgreSQL reserva `PPT-YYYY-####`, congela snapshots y la Edge Function guarda el PDF privado.
6. El vendedor puede descargarlo, copiar un enlace de siete días o marcarlo como enviado. Las correcciones se hacen duplicando el documento.
