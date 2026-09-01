#!/usr/bin/env node
/*
 * Safe, repeatable migration assistant. It never changes source workbooks and
 * writes its report under migration/output (ignored by git). Use --apply only
 * after reviewing conflicts; the apply mode sends normalized batches to the
 * optional migration endpoint configured by MIGRATION_ENDPOINT.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import process from 'node:process';
import * as XLSX from 'xlsx';

const inputDir = path.resolve(process.argv[2] ?? 'migration/input');
const apply = process.argv.includes('--apply');
const outputDir = path.resolve('migration/output');
const text = (value) => (value == null ? '' : String(value).trim());
const key = (value) =>
  text(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
const hash = (value) => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const first = (row, names) => {
  for (const name of names) {
    const match = Object.keys(row).find((candidate) => key(candidate) === key(name));
    if (match && text(row[match])) return text(row[match]);
  }
  return '';
};

const files = (await fs.readdir(inputDir, { withFileTypes: true }).catch(() => [])).filter(
  (entry) => entry.isFile() && /\.(xlsx|xls)$/i.test(entry.name),
);
if (!files.length) {
  console.log(
    `No se encontraron archivos Excel en ${inputDir}. Copia allí los archivos de origen y repite.`,
  );
  process.exit(0);
}
const products = new Map();
const clients = new Map();
const conflicts = [];
const records = [];
const legacyDocuments = [];
for (const file of files) {
  const filePath = path.join(inputDir, file.name);
  const workbook = XLSX.read(await fs.readFile(filePath), { cellDates: true, raw: false });
  for (const sheetName of workbook.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });
    const normalizedSheet = key(sheetName);
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      const sourceKey = `${file.name}:${sheetName}:${index + 2}`;
      records.push({
        sourceKey,
        sourceType: 'xlsx',
        sourceHash: hash(row),
        file: file.name,
        sheet: sheetName,
        row: index + 2,
      });
      const sku = first(row, ['SKU', 'Código', 'Codigo', 'REF', 'Referencia']);
      if (normalizedSheet.includes('producto') && sku) {
        const product = {
          sku,
          name: first(row, ['Denominación', 'Denominacion', 'Producto', 'Nombre']),
          category: first(row, [
            'Categoría',
            'Categoria',
            'Categoría HC / PC',
            'Categoria HC / PC',
            'Categoría HC/PC',
            'Categoria HC/PC',
          ]),
          unitPriceUsd: first(row, ['Precio', 'USD/Kg', 'USD / Kg', 'Precio USD/kg']),
        };
        const productKey = key(sku);
        const previous = products.get(productKey);
        if (previous && JSON.stringify(previous.value) !== JSON.stringify(product))
          conflicts.push({
            type: 'product',
            key: sku,
            sources: [previous.sourceKey, sourceKey],
            values: [previous.value, product],
          });
        else if (!previous) products.set(productKey, { sourceKey, value: product });
      }
      const taxId = first(row, ['RUC', 'Tax ID', 'Documento']);
      if (normalizedSheet.includes('historial')) {
        const legacyNumber = first(row, [
          'N° Propuesta',
          'N° Proforma',
          'Número',
          'Numero',
          'Referencia',
        ]);
        if (legacyNumber || taxId) {
          const rawType = first(row, ['Tipo', 'Tipo de documento']);
          legacyDocuments.push({
            sourceKey,
            sourceHash: hash(row),
            type:
              /proforma/i.test(rawType) || /confirm|pedido|total/i.test(file.name)
                ? 'proforma'
                : 'proposal',
            legacyNumber,
            generatedAt: first(row, [
              'Fecha de generación',
              'Fecha',
              'Fecha de emision',
              'Fecha de emisión',
            ]),
            taxId,
            clientName: first(row, ['Razón social', 'Razon social', 'Cliente', 'Empresa']),
            fileName: first(row, ['Archivo PDF', 'Archivo']),
            driveUrl: first(row, ['Link PDF', 'URL', 'Drive']),
          });
        }
      }
      if (normalizedSheet.includes('historial') && taxId) {
        const client = {
          taxId,
          legalName: first(row, ['Razón social', 'Razon social', 'Cliente', 'Empresa']),
          tradeName: first(row, ['Nombre comercial']),
        };
        const clientKey = key(taxId);
        const previous = clients.get(clientKey);
        if (previous && JSON.stringify(previous.value) !== JSON.stringify(client))
          conflicts.push({
            type: 'client',
            key: taxId,
            sources: [previous.sourceKey, sourceKey],
            values: [previous.value, client],
          });
        else if (!previous) clients.set(clientKey, { sourceKey, value: client });
      }
    }
  }
}
const report = {
  generatedAt: new Date().toISOString(),
  inputDir,
  files: files.map((file) => file.name),
  products: [...products.values()].map((entry) => entry.value),
  clients: [...clients.values()].map((entry) => entry.value),
  legacyDocuments,
  conflicts,
  migrationRecords: records,
  applyRequested: apply,
  notes: [
    'Los PDF históricos no se descargan ni se copian.',
    'Los RUC inválidos se conservan para revisión.',
    'Repetir el proceso produce las mismas claves y hashes.',
  ],
};
await fs.mkdir(outputDir, { recursive: true });
await fs.writeFile(path.join(outputDir, 'report.json'), JSON.stringify(report, null, 2), 'utf8');
if (apply) {
  const endpoint = process.env.MIGRATION_ENDPOINT;
  const token = process.env.MIGRATION_TOKEN;
  if (!endpoint || !token)
    throw new Error(
      'Para --apply define MIGRATION_ENDPOINT y MIGRATION_TOKEN fuera del repositorio.',
    );
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(report),
  });
  if (!response.ok) throw new Error(`El endpoint de migración respondió ${response.status}`);
  console.log('Importación enviada al endpoint de migración.');
}
console.log(`Reporte generado: ${path.join(outputDir, 'report.json')}`);
console.log(
  `Productos únicos: ${products.size} · Clientes únicos: ${clients.size} · Conflictos: ${conflicts.length}`,
);
