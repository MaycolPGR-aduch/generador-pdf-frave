# Contexto del proyecto

FRAVE genera cotizaciones y confirmaciones de pedido a partir de plantillas de Excel/Word y un flujo anterior de Apps Script. Las plantillas contienen catálogos, vendedores e historial; el historial conserva números `FC...` y enlaces a Google Drive.

La nueva aplicación desacopla la operación de hojas de cálculo: los vendedores usan un constructor web, PostgreSQL valida y congela los datos comerciales, y una Edge Function genera PDFs programáticamente. Los archivos de origen se mantienen como referencia y los Excel reales se procesan únicamente desde `migration/input/`, ignorado por Git.

Decisiones actuales: USD/kg y stock en kg; IGV configurable iniciado en 18 % (opcional por cotización); series nuevas `COT-YYYY-####` y `CP-YYYY-####`, conservando `PPT`/`PRF` como históricos; cuentas y textos configurables, enlaces firmados de siete días, sin registro público y con roles administrador/vendedor.
