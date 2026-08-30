# Contexto del proyecto

FRAVE genera propuestas económicas sin totales y proformas con totales a partir de plantillas de Excel/Word y un flujo anterior de Apps Script. Las plantillas contienen catálogos, vendedores e historial; el historial conserva números `FC...` y enlaces a Google Drive.

La nueva aplicación desacopla la operación de hojas de cálculo: los vendedores usan un constructor web, PostgreSQL valida y congela los datos comerciales, y una Edge Function genera PDFs programáticamente. Los archivos de origen se mantienen como referencia y los Excel reales se procesan únicamente desde `migration/input/`, ignorado por Git.

Decisiones iniciales: USD/kg, IGV configurable iniciado en 18 %, series `PPT-YYYY-####` y `PRF-YYYY-####`, cuentas y textos configurables, enlaces firmados de siete días, sin registro público y con roles administrador/vendedor.
