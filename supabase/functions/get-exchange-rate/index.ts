import { errorResponse, handleOptions, json } from '../_shared/http.ts';
import { authenticatedUser, serviceClient } from '../_shared/supabase.ts';

type BcrpResponse = { periods?: Array<{ name?: string; values?: string[] }> };

const monthNumbers: Record<string, string> = {
  Jan: '01',
  Feb: '02',
  Mar: '03',
  Apr: '04',
  May: '05',
  Jun: '06',
  Jul: '07',
  Aug: '08',
  Sep: '09',
  Oct: '10',
  Nov: '11',
  Dec: '12',
};

function formatDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function bcrpPeriodToDate(period: string | undefined) {
  const match = /^(\d{2})\.([A-Za-z]{3})\.(\d{2})$/.exec(period ?? '');
  if (!match || !monthNumbers[match[2]]) return null;
  return `20${match[3]}-${monthNumbers[match[2]]}-${match[1]}`;
}

Deno.serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;
  try {
    if (request.method !== 'POST') return errorResponse('Método no permitido', 405);
    const admin = serviceClient();
    await authenticatedUser(request, admin);
    const end = new Date();
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - 12);
    const url = `https://estadisticas.bcrp.gob.pe/estadisticas/series/api/PD04640PD/json/${formatDate(start)}/${formatDate(end)}`;
    const response = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error('BCRP no respondió una tasa disponible');
    const payload = (await response.json()) as BcrpResponse;
    const period = [...(payload.periods ?? [])]
      .reverse()
      .find((entry) => /^\d+(?:\.\d+)?$/.test(entry.values?.[0] ?? ''));
    if (!period?.values?.[0]) throw new Error('BCRP no publicó una tasa de venta reciente');
    return json({
      rate: period.values[0],
      source: 'BCRPData · Sistema bancario SBS · Venta',
      observedAt: bcrpPeriodToDate(period.name),
      sourcePeriod: period.name ?? null,
    });
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : 'No se pudo obtener la tasa',
      502,
    );
  }
});
