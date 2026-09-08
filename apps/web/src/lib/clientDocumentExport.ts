import type { WorkSheet } from 'xlsx';
import type { Client, ClientDocumentExport } from './types';

const documentTypeLabels = {
  proposal: 'Cotización',
  proforma: 'Confirmación de pedido',
} as const;

const documentStatusLabels = {
  draft: 'Borrador',
  generating: 'Generando',
  generated: 'Generado',
  generation_failed: 'Error de generación',
  sent: 'Enviado',
  void: 'Anulado',
} as const;

type ExportInput = {
  client: Client;
  from: string;
  to: string;
  documents: ClientDocumentExport[];
};

function safeText(value: string | null | undefined): string {
  const text = value?.trim() ?? '';
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
}

function asNumber(value: string | null): number | '' {
  if (value == null || value === '') return '';
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : '';
}

function dateInLima(value: string | null): Date | '' {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const limaDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Lima',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .formatToParts(date)
    .reduce<Record<string, string>>((parts, part) => {
      parts[part.type] = part.value;
      return parts;
    }, {});
  return new Date(
    Date.UTC(Number(limaDate.year), Number(limaDate.month) - 1, Number(limaDate.day), 12),
  );
}

function dateFromInput(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12));
}

function documentIdentifier(document: ClientDocumentExport): string {
  return safeText(document.number ?? document.legacy_number ?? 'Sin número');
}

function spreadsheetColumn(index: number): string {
  let value = index + 1;
  let column = '';
  while (value > 0) {
    const remainder = (value - 1) % 26;
    column = String.fromCharCode(65 + remainder) + column;
    value = Math.floor((value - 1) / 26);
  }
  return column;
}

function spreadsheetCell(row: number, column: number): string {
  return `${spreadsheetColumn(column)}${row + 1}`;
}

function setColumnFormats(
  worksheet: WorkSheet,
  rowCount: number,
  dateColumns: number[],
  decimalColumns: number[],
) {
  for (let row = 1; row < rowCount; row += 1) {
    for (const column of dateColumns) {
      const cell = worksheet[spreadsheetCell(row, column)];
      if (cell) cell.z = 'dd/mm/yyyy';
    }
    for (const column of decimalColumns) {
      const cell = worksheet[spreadsheetCell(row, column)];
      if (cell) cell.z = '0.00';
    }
  }
}

function setupTable(
  worksheet: WorkSheet,
  columns: number[],
  lastRow: number,
  dateColumns: number[] = [],
  decimalColumns: number[] = [],
) {
  worksheet['!cols'] = columns.map((wch) => ({ wch }));
  worksheet['!autofilter'] = { ref: `A1:${spreadsheetColumn(columns.length - 1)}${lastRow}` };
  setColumnFormats(worksheet, lastRow, dateColumns, decimalColumns);
}

export async function exportClientDocumentsToExcel({ client, from, to, documents }: ExportInput) {
  const XLSX = await import('xlsx');
  const clientName = client.trade_name || client.legal_name;
  const documentsByStatus = Object.entries(documentStatusLabels).map(([status, label]) => [
    label,
    documents.filter((document) => document.status === status).length,
  ]);
  const quotations = documents.filter((document) => document.type === 'proposal');
  const confirmations = documents.filter((document) => document.type === 'proforma');
  const workbook = XLSX.utils.book_new();

  const summary = XLSX.utils.aoa_to_sheet([
    ['Exportación de documentos comerciales FRAVE'],
    [],
    ['Cliente', safeText(`${client.client_code} · ${clientName}`)],
    ['Razón social', safeText(client.legal_name)],
    ['RUC', safeText(client.tax_id)],
    ['Período desde', dateFromInput(from)],
    ['Período hasta', dateFromInput(to)],
    ['Generado el', new Date()],
    [],
    ['Indicador', 'Cantidad'],
    ['Cotizaciones', quotations.length],
    ['Confirmaciones de pedido', confirmations.length],
    ['Documentos totales', documents.length],
    ...documentsByStatus,
  ]);
  summary['!cols'] = [{ wch: 30 }, { wch: 34 }];
  setColumnFormats(summary, 9, [1], []);
  XLSX.utils.book_append_sheet(workbook, summary, 'Resumen');

  const documentRows = [
    [
      'Número',
      'Tipo',
      'Estado',
      'Fecha de creación',
      'Fecha de envío',
      'Vigencia hasta',
      'Forma de pago',
      'Forma de entrega',
      'IGV aplicado',
      'Moneda',
      'Tasa PEN por USD',
      'Subtotal USD',
      'IGV USD',
      'Total USD',
      'Subtotal documento',
      'IGV documento',
      'Total documento',
      'Fecha de anulación',
      'Motivo de anulación',
    ],
    ...documents.map((document) => [
      documentIdentifier(document),
      documentTypeLabels[document.type],
      documentStatusLabels[document.status],
      dateInLima(document.created_at),
      dateInLima(document.sent_at),
      dateFromInput(document.valid_until),
      safeText(document.payment_method),
      safeText(document.delivery_method),
      document.apply_igv ? 'Sí' : 'No',
      document.currency,
      asNumber(document.exchange_rate_pen_per_usd),
      asNumber(document.subtotal_usd),
      asNumber(document.tax_usd),
      asNumber(document.total_usd),
      asNumber(document.subtotal_document),
      asNumber(document.tax_document),
      asNumber(document.total_document),
      dateInLima(document.voided_at),
      safeText(document.void_reason),
    ]),
  ];
  const documentSheet = XLSX.utils.aoa_to_sheet(documentRows, { cellDates: true });
  setupTable(
    documentSheet,
    [20, 28, 22, 18, 18, 18, 32, 32, 14, 12, 16, 16, 16, 18, 18, 18, 20, 38],
    documentRows.length,
    [3, 4, 5, 16],
    [10, 11, 12, 13, 14, 15],
  );
  XLSX.utils.book_append_sheet(workbook, documentSheet, 'Documentos');

  const productRows = [
    [
      'Número de documento',
      'Tipo',
      'Estado',
      'Fecha de creación',
      'Posición',
      'SKU / Código',
      'Denominación',
      'Categoría',
      'Cantidad kg',
      'Moneda documento',
      'Precio USD/kg',
      'Subtotal USD',
      'IGV USD',
      'Total USD',
      'Precio documento/kg',
      'Subtotal documento',
      'IGV documento',
      'Total documento',
      'Observación',
    ],
    ...documents.flatMap((document) =>
      document.document_items.map((item) => [
        documentIdentifier(document),
        documentTypeLabels[document.type],
        documentStatusLabels[document.status],
        dateInLima(document.created_at),
        item.position,
        safeText(item.sku_snapshot),
        safeText(item.denomination_snapshot),
        safeText(item.category_snapshot),
        asNumber(item.quantity_kg),
        document.currency,
        asNumber(item.unit_price_usd),
        asNumber(item.subtotal_usd),
        asNumber(item.tax_usd),
        asNumber(item.total_usd),
        asNumber(item.unit_price_document),
        asNumber(item.subtotal_document),
        asNumber(item.tax_document),
        asNumber(item.total_document),
        safeText(item.observation),
      ]),
    ),
  ];
  const productSheet = XLSX.utils.aoa_to_sheet(productRows, { cellDates: true });
  setupTable(
    productSheet,
    [20, 28, 22, 18, 10, 18, 36, 28, 14, 14, 16, 16, 16, 16, 18, 18, 18, 18, 38],
    productRows.length,
    [3],
    [8, 10, 11, 12, 13, 14, 15, 16, 17],
  );
  XLSX.utils.book_append_sheet(workbook, productSheet, 'Productos');

  const sanitizedCode = client.client_code.replace(/[^A-Za-z0-9_-]/g, '_');
  XLSX.writeFileXLSX(workbook, `FRAVE_${sanitizedCode}_${from}_${to}.xlsx`, {
    compression: true,
  });
}
