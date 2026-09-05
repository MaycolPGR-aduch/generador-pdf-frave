# Flujo de confirmación de pedido

1. El vendedor selecciona cliente, condiciones y productos con cantidad obligatoria en kg.
2. El navegador muestra un cálculo preliminar; la autoridad final es PostgreSQL.
3. Cada línea se calcula como cantidad × precio, redondeada a dos decimales; después se suma IGV y total.
4. La vista previa muestra `BORRADOR` y no reserva número.
5. Al generar, PostgreSQL valida stock, lo descuenta por producto dentro de la misma transacción, registra el movimiento, reserva `CP-YYYY-####`, congela configuración y cuentas bancarias, y el servidor sube el PDF privado.
6. El documento emitido es inmutable. Un ajuste crea un borrador duplicado y un administrador puede anular el anterior con motivo; la anulación devuelve automáticamente el stock descontado.
