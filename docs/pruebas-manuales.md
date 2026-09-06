# Pruebas manuales del piloto

Ejecuta estas pruebas en Supabase de desarrollo con una cuenta administradora y dos cuentas vendedoras ficticias.

1. Inicia sesión con credenciales válidas, prueba una contraseña incorrecta y confirma que un usuario desactivado no puede entrar.
2. Como administrador, crea una categoría, producto, variante, cliente y cuenta bancaria. Comprueba que aparecen en el constructor.
3. Invita un vendedor y verifica que puede consultar catálogos e historial, pero no abrir `/admin` ni modificar precios.
4. Crea una cotización sin kg y otra con kg en todas sus líneas. Confirma que la primera solo muestra USD/kg y la segunda usa `COT-YYYY-0001` con totales; repite la segunda con IGV desactivado.
5. Crea una confirmación de pedido con cantidades fraccionarias y precios de cuatro decimales. Recalcula manualmente subtotal, IGV y total; confirma la serie `CP-YYYY-0001` y el descuento del stock en kg.
6. Genera dos documentos de forma concurrente y repite el clic de generación. No deben aparecer números repetidos ni dos archivos para el mismo documento.
7. Fuerza un fallo temporal de Storage, reintenta y confirma que se conserva el mismo número y el mismo documento.
8. Duplica un documento emitido desde la cuenta del segundo vendedor. El resultado debe ser un borrador propio relacionado con `supersedes_document_id`.
9. Desde una cotización generada o enviada, usa **Crear confirmación**. Confirma que abre un borrador propio con el cliente, condiciones, cantidades y precios de la cotización; completa cualquier kg faltante y verifica que el stock no cambie hasta generar la confirmación.
10. Marca un PDF como enviado, genera un enlace firmado y comprueba que abre sin iniciar sesión durante siete días; no uses enlaces públicos permanentes.
11. Como administrador, anula una confirmación enviada con motivo. Verifica estado `void`, auditoría, bloqueo de edición, movimiento de devolución y restitución exacta del stock.
12. Ejecuta la migración Excel en modo reporte, revisa conflictos y repítela con `--apply`. La segunda ejecución no debe duplicar catálogos ni históricos.
13. En **Administración > Clientes**, exporta un período que incluya cotizaciones, confirmaciones y un documento anulado. Comprueba que el Excel contiene las hojas `Resumen`, `Documentos` y `Productos`, respeta el cliente y fechas seleccionados, e identifica el estado de cada documento. Intenta un período sin documentos y confirma que muestra un mensaje sin descargar un archivo vacío.

Automatización prevista: Vitest para dominio, pgTAP para SQL/RLS, React Testing Library para formularios y Playwright para estos flujos.
