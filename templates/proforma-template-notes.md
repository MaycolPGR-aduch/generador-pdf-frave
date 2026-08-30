# Notas del template de proforma

La plantilla histórica comparte catálogo, vendedores, configuración e historial con la propuesta, pero agrega cantidades y columnas de importe. La nueva salida usa `REF`, `Denominación`, `Categoría`, `Kg/Neto`, `USD/Kg`, `IGV` y `USD/Total`, con subtotales, IGV y total general.

El cálculo definitivo ocurre por línea en PostgreSQL con dos decimales. La configuración y las cuentas bancarias se almacenan en snapshot para que una modificación posterior no cambie un PDF emitido.
