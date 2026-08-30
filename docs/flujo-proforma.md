# Flujo de proforma

1. El vendedor selecciona cliente, condiciones y productos con cantidad en kg.
2. El navegador muestra un cálculo preliminar; la autoridad final es PostgreSQL.
3. Cada línea se calcula como cantidad × precio, redondeada a dos decimales; después se suma IGV y total.
4. La vista previa muestra `BORRADOR` y no reserva número.
5. Al generar, PostgreSQL reserva `PRF-YYYY-####`, congela configuración y cuentas bancarias, y el servidor sube el PDF privado.
6. El documento emitido es inmutable. Un ajuste crea un borrador duplicado y un administrador puede anular el anterior con motivo.
