# Arquitectura de la primera versión

```text
Cloudflare Pages (React + Vite)
        │ Supabase client / RLS
        ▼
Supabase Auth ─ PostgreSQL ─ Storage privado
        │                 ▲
        └─ Edge Functions ─┘  (pdf-lib, hash y URLs firmadas)
```

El navegador solo prepara y guarda borradores. PostgreSQL valida reglas comerciales, congela snapshots y reserva números con bloqueo transaccional. `generate-document` es el único proceso que finaliza el documento, construye el PDF programático, calcula SHA-256 y sube el archivo privado.

La numeración y los totales no se calculan como autoridad en el navegador. La vista previa usa el mismo motor y añade `BORRADOR`, pero no reserva número ni crea `document_files`.
