import {
  PDFDocument,
  StandardFonts,
  degrees,
  rgb,
  type PDFFont,
  type PDFPage,
} from 'npm:pdf-lib@1.17.1';

export const TEMPLATE_VERSION = 'frave-pdf-v1.0.0';
type JsonRecord = Record<string, unknown>;
export type PdfItem = {
  sku: string;
  denomination: string;
  category: string;
  quantityKg: string | null;
  unitPriceUsd: string;
  taxUsd: string | null;
  totalUsd: string | null;
  observation?: string | null;
};
export type PdfData = {
  type: 'proposal' | 'proforma';
  number: string | null;
  validUntil: string;
  client: JsonRecord;
  seller: JsonRecord;
  settings: JsonRecord;
  paymentMethod: string;
  deliveryMethod: string;
  considerations: string[];
  items: PdfItem[];
  subtotalUsd: string | null;
  taxUsd: string | null;
  totalUsd: string | null;
  banks: Array<JsonRecord>;
};

const orange = rgb(0.96, 0.42, 0.08);
const ink = rgb(0.15, 0.14, 0.13);
const muted = rgb(0.42, 0.4, 0.38);
const light = rgb(0.96, 0.95, 0.94);
const textOf = (value: unknown, fallback = '') =>
  typeof value === 'string' ? value : value == null ? fallback : String(value);
const money = (value: string | null | undefined) =>
  value ? `USD ${Number(value).toFixed(2)}` : '—';
function colorFromHex(value: string): ReturnType<typeof rgb> {
  const match = /^#?([0-9a-f]{6})$/i.exec(value.trim());
  if (!match) return orange;
  const hex = match[1];
  return rgb(
    parseInt(hex.slice(0, 2), 16) / 255,
    parseInt(hex.slice(2, 4), 16) / 255,
    parseInt(hex.slice(4, 6), 16) / 255,
  );
}
function wrap(font: PDFFont, value: string, maxWidth: number, size: number): string[] {
  const words = value.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth || !line) line = candidate;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}
function drawText(
  page: PDFPage,
  font: PDFFont,
  value: string,
  x: number,
  y: number,
  size: number,
  color = ink,
  maxWidth?: number,
): number {
  const lines = maxWidth ? wrap(font, value, maxWidth, size) : [value];
  lines.forEach((line, index) =>
    page.drawText(line, { x, y: y - index * (size + 2), size, font, color }),
  );
  return lines.length * (size + 2);
}
function header(page: PDFPage, regular: PDFFont, bold: PDFFont, data: PdfData, draft: boolean) {
  const { width, height } = page.getSize();
  const settings = data.settings;
  const accent = colorFromHex(textOf(settings.brand_color, '#F47C20'));
  page.drawRectangle({ x: 0, y: height - 11, width, height: 11, color: accent });
  page.drawText('FRAVE', { x: width - 100, y: height - 58, size: 21, font: bold, color: accent });
  page.drawText('FRAGANCIAS Y ENVASES', {
    x: width - 157,
    y: height - 73,
    size: 6.3,
    font: bold,
    color: muted,
  });
  page.drawText(textOf(settings.display_name, 'FRAVE - Fragancias y Envases'), {
    x: 42,
    y: height - 49,
    size: 9.5,
    font: bold,
    color: ink,
  });
  page.drawText(`RUC ${textOf(settings.tax_id, '—')}`, {
    x: 42,
    y: height - 63,
    size: 8,
    font: regular,
    color: muted,
  });
  page.drawText(textOf(settings.primary_address, ''), {
    x: 42,
    y: height - 76,
    size: 7.5,
    font: regular,
    color: muted,
    maxWidth: 230,
  });
  page.drawLine({
    start: { x: 42, y: height - 91 },
    end: { x: width - 42, y: height - 91 },
    thickness: 1,
    color: accent,
  });
  if (draft) {
    page.drawText('BORRADOR', {
      x: width / 2 - 55,
      y: height / 2,
      size: 25,
      font: bold,
      color: rgb(0.95, 0.7, 0.5),
      rotate: degrees(25),
    });
  }
}
function tableHeader(
  page: PDFPage,
  bold: PDFFont,
  columns: Array<{ label: string; x: number; width: number }>,
  y: number,
) {
  page.drawRectangle({ x: 42, y: y - 5, width: 528, height: 21, color: ink });
  columns.forEach((column) =>
    page.drawText(column.label, {
      x: column.x,
      y: y + 1,
      size: 7,
      font: bold,
      color: rgb(1, 1, 1),
      maxWidth: column.width,
    }),
  );
}
function footer(page: PDFPage, regular: PDFFont, index: number, total: number, data: PdfData) {
  const { width } = page.getSize();
  page.drawLine({
    start: { x: 42, y: 38 },
    end: { x: width - 42, y: 38 },
    thickness: 0.5,
    color: light,
  });
  page.drawText(textOf(data.settings.footer_address, 'FRAVE · Documento comercial'), {
    x: 42,
    y: 25,
    size: 6.8,
    font: regular,
    color: muted,
    maxWidth: 340,
  });
  page.drawText(`Página ${index} de ${total}`, {
    x: width - 100,
    y: 25,
    size: 6.8,
    font: regular,
    color: muted,
  });
}

export async function createFravePdf(data: PdfData, draft = false): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const accent = colorFromHex(textOf(data.settings.brand_color, '#F47C20'));
  const pages: PDFPage[] = [];
  const margin = 42;
  let page = pdf.addPage([612, 792]);
  pages.push(page);
  header(page, regular, bold, data, draft);
  let y = 660;
  const { width } = page.getSize();
  const title = data.type === 'proposal' ? 'PROPUESTA ECONÓMICA' : 'PROFORMA ECONÓMICA';
  page.drawText(title, { x: margin, y, size: 16, font: bold, color: ink });
  page.drawText(data.number ?? 'Documento en borrador', {
    x: width - 180,
    y: y + 1,
    size: 8.5,
    font: bold,
    color: accent,
  });
  y -= 25;
  const client = data.client;
  page.drawText('DATOS DEL CLIENTE', { x: margin, y, size: 7.5, font: bold, color: accent });
  y -= 13;
  y -= drawText(
    page,
    regular,
    textOf(client.tradeName || client.legalName, 'Cliente'),
    margin,
    y,
    9,
    ink,
    255,
  );
  page.drawText(`RUC: ${textOf(client.taxId, '—')}`, {
    x: margin,
    y,
    size: 7.5,
    font: regular,
    color: muted,
  });
  const contact = client.contact as JsonRecord | undefined;
  if (contact?.fullName)
    page.drawText(`Atención: ${textOf(contact.fullName)}`, {
      x: 320,
      y: y + 13,
      size: 7.5,
      font: regular,
      color: muted,
    });
  page.drawText(`Vigencia: ${data.validUntil}`, {
    x: 320,
    y,
    size: 7.5,
    font: regular,
    color: muted,
  });
  y -= 24;
  const proposalColumns = [
    { label: 'REF', x: 48, width: 53 },
    { label: 'DENOMINACIÓN', x: 105, width: 245 },
    { label: 'CATEGORÍA', x: 355, width: 105 },
    { label: 'USD/KG', x: 488, width: 70 },
  ];
  const proformaColumns = [
    { label: 'REF', x: 47, width: 44 },
    { label: 'DENOMINACIÓN', x: 94, width: 174 },
    { label: 'CATEGORÍA', x: 271, width: 75 },
    { label: 'KG/NETO', x: 349, width: 59 },
    { label: 'USD/KG', x: 411, width: 57 },
    { label: 'IGV', x: 471, width: 43 },
    { label: 'USD/TOTAL', x: 517, width: 49 },
  ];
  const columns = data.type === 'proposal' ? proposalColumns : proformaColumns;
  tableHeader(page, bold, columns, y);
  y -= 22;
  for (const item of data.items.filter((row) => row.sku || row.denomination)) {
    const denomLines = wrap(regular, item.denomination, data.type === 'proposal' ? 240 : 168, 7.4);
    const categoryLines = wrap(regular, item.category, data.type === 'proposal' ? 100 : 70, 7.2);
    const rowHeight = Math.max(20, Math.max(denomLines.length, categoryLines.length) * 10 + 8);
    if (y - rowHeight < 70) {
      page = pdf.addPage([612, 792]);
      pages.push(page);
      header(page, regular, bold, data, draft);
      y = 660;
      tableHeader(page, bold, columns, y);
      y -= 22;
    }
    if (pages.length % 2 === 0)
      page.drawRectangle({
        x: 42,
        y: y - rowHeight + 5,
        width: 528,
        height: rowHeight,
        color: rgb(0.99, 0.98, 0.97),
      });
    const baseY = y - 12;
    page.drawText(item.sku, {
      x: columns[0].x,
      y: baseY,
      size: 7.3,
      font: regular,
      color: ink,
      maxWidth: columns[0].width,
    });
    denomLines.forEach((line, index) =>
      page.drawText(line, {
        x: columns[1].x,
        y: baseY - index * 10,
        size: 7.4,
        font: regular,
        color: ink,
      }),
    );
    categoryLines.forEach((line, index) =>
      page.drawText(line, {
        x: columns[2].x,
        y: baseY - index * 10,
        size: 7.2,
        font: regular,
        color: muted,
      }),
    );
    if (data.type === 'proposal')
      page.drawText(money(item.unitPriceUsd).replace('USD ', ''), {
        x: columns[3].x,
        y: baseY,
        size: 7.3,
        font: bold,
        color: ink,
      });
    else {
      page.drawText(item.quantityKg ?? '—', {
        x: columns[3].x,
        y: baseY,
        size: 7.2,
        font: regular,
        color: ink,
      });
      page.drawText(money(item.unitPriceUsd).replace('USD ', ''), {
        x: columns[4].x,
        y: baseY,
        size: 7.2,
        font: regular,
        color: ink,
      });
      page.drawText(money(item.taxUsd).replace('USD ', ''), {
        x: columns[5].x,
        y: baseY,
        size: 7.2,
        font: regular,
        color: ink,
      });
      page.drawText(money(item.totalUsd).replace('USD ', ''), {
        x: columns[6].x,
        y: baseY,
        size: 7.2,
        font: bold,
        color: ink,
      });
    }
    y -= rowHeight;
    page.drawLine({
      start: { x: 42, y: y + 4 },
      end: { x: 570, y: y + 4 },
      thickness: 0.35,
      color: light,
    });
  }
  if (data.type === 'proforma') {
    if (y < 165) {
      page = pdf.addPage([612, 792]);
      pages.push(page);
      header(page, regular, bold, data, draft);
      y = 660;
    }
    y -= 14;
    page.drawText('RESUMEN', { x: 375, y, size: 7.5, font: bold, color: accent });
    y -= 16;
    [
      ['Subtotal', data.subtotalUsd],
      ['IGV', data.taxUsd],
      ['TOTAL', data.totalUsd],
    ].forEach(([label, amount], index) => {
      page.drawText(label, {
        x: 375,
        y: y - index * 17,
        size: index === 2 ? 9 : 8,
        font: index === 2 ? bold : regular,
        color: index === 2 ? ink : muted,
      });
      page.drawText(money(amount), {
        x: 490,
        y: y - index * 17,
        size: index === 2 ? 9 : 8,
        font: bold,
        color: index === 2 ? accent : ink,
      });
    });
    y -= 72;
  }
  if (y < 135) {
    page = pdf.addPage([612, 792]);
    pages.push(page);
    header(page, regular, bold, data, draft);
    y = 660;
  }
  page.drawText('CONDICIONES COMERCIALES', { x: margin, y, size: 7.5, font: bold, color: accent });
  y -= 15;
  page.drawText(`Pago: ${data.paymentMethod}`, {
    x: margin,
    y,
    size: 7.5,
    font: regular,
    color: ink,
  });
  page.drawText(`Entrega: ${data.deliveryMethod}`, {
    x: 320,
    y,
    size: 7.5,
    font: regular,
    color: ink,
  });
  y -= 15;
  for (const condition of data.considerations.filter(Boolean)) {
    y -= drawText(page, regular, `• ${condition}`, margin, y, 7.3, muted, 520);
    if (y < 75) break;
  }
  if (data.type === 'proforma' && data.banks.length) {
    y -= 12;
    page.drawText('CUENTAS BANCARIAS', { x: margin, y, size: 7.5, font: bold, color: accent });
    y -= 14;
    for (const bank of data.banks) {
      if (y < 65) break;
      page.drawText(
        `${textOf(bank.bank_name)} · ${textOf(bank.currency)} · ${textOf(bank.account_type)} · ${textOf(bank.account_number)}${bank.cci ? ` · CCI ${textOf(bank.cci)}` : ''}`,
        { x: margin, y, size: 7.1, font: regular, color: muted },
      );
      y -= 12;
    }
  }
  if (y < 105) {
    page = pdf.addPage([612, 792]);
    pages.push(page);
    header(page, regular, bold, data, draft);
    y = 660;
  }
  y -= 14;
  page.drawText('ATENCIÓN COMERCIAL', { x: margin, y, size: 7.5, font: bold, color: accent });
  y -= 17;
  page.drawText(textOf(data.seller.fullName, 'Equipo comercial FRAVE'), {
    x: margin,
    y,
    size: 8,
    font: bold,
    color: ink,
  });
  page.drawText(textOf(data.seller.area, 'Área comercial'), {
    x: margin,
    y: y - 12,
    size: 7.2,
    font: regular,
    color: muted,
  });
  if (data.seller.email)
    page.drawText(textOf(data.seller.email), { x: 320, y, size: 7.2, font: regular, color: muted });
  if (data.seller.phone)
    page.drawText(textOf(data.seller.phone), {
      x: 320,
      y: y - 12,
      size: 7.2,
      font: regular,
      color: muted,
    });
  const totalPages = pages.length;
  pages.forEach((current, index) => footer(current, regular, index + 1, totalPages, data));
  return pdf.save();
}
