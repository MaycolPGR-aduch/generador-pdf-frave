# Estructura de las plantillas históricas

Las hojas principales detectadas en las plantillas son:

- `Cotización`: formulario comercial con número, fecha, cliente, RUC, contacto, dirección, pago, entrega y productos.
- `Productos`: `REF`, denominación, categoría, precio USD/kg y hasta tres variaciones.
- `Vendedores`: nombre, celular, área y correo.
- `Historial`: fecha, número legado, cliente, RUC, nombre del PDF y enlace de Google Drive.
- `Config`: razón social, nombre visible, direcciones, ubicación y datos bancarios/configurables.
- `Plantilla_PDF`: composición visual auxiliar de la salida anterior.

La aplicación nueva conserva la información operativa relevante, elimina la dependencia de fórmulas y trata los números `FC...` como legado sin transformarlos.
