# Notas del template de propuesta

La plantilla histórica contiene hojas de captura, catálogo, vendedores, salida auxiliar e historial. La propuesta comercial de la nueva aplicación conserva la identidad naranja FRAVE y las columnas `REF`, `Denominación`, `Categoría` y `USD/Kg`, pero elimina la dependencia de celdas ocultas y fórmulas.

Las variaciones se modelan como registros de `product_variants`; los datos del cliente, vendedor y configuración se congelan al emitir. El número legado `FC...` solo se importa como referencia histórica.
