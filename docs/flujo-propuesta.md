# Flujo de cotización

1. El vendedor selecciona cliente, condiciones y productos del catálogo.
2. La cantidad por producto es opcional. Si todas las líneas tienen kg, el documento calcula subtotal y total; si falta una, solo muestra USD/kg.
3. El IGV puede activarse o desactivarse para cada cotización y queda congelado al emitir.
4. Se guarda un borrador sin reservar número.
5. La vista previa usa el mismo motor PDF y muestra `BORRADOR`.
6. Al generar, PostgreSQL reserva `COT-YYYY-####`, congela snapshots y la Edge Function guarda el PDF privado. No modifica stock.
7. El vendedor puede descargarlo, copiar un enlace de siete días o marcarlo como enviado. Las correcciones se hacen duplicando el documento.
8. Desde una cotización generada o enviada, cualquier usuario activo puede usar **Crear confirmación**. El sistema crea un borrador de confirmación propio y mantiene una relación trazable con la cotización; no afecta el stock.
