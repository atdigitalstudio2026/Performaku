import { COMPANY_LOGO_PRESETS } from '../data/defaultInvoice';
import { InvoiceLogRecord } from '../types/invoice';

export function getCurrentPeriodKey(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

export function resolveCompanyCode(companyName: string): string {
  const raw = (companyName || '').trim();
  if (!raw) return 'INV';

  const normalized = raw.toLowerCase().replace(/[^a-z0-9]/g, '');
  const matchedPreset = COMPANY_LOGO_PRESETS.find((preset) => {
    const presetNorm = preset.companyName.toLowerCase().replace(/[^a-z0-9]/g, '');
    return presetNorm === normalized || normalized.includes(presetNorm) || presetNorm.includes(normalized);
  });
  if (matchedPreset) {
    return matchedPreset.code;
  }

  // Fallback for custom PT names: derive uppercase initials skipping legal prefixes
  const cleanedWords = raw
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 0 && !['pt', 'cv', 'ud', 'tbk', 'fa'].includes(w.toLowerCase()));

  if (cleanedWords.length === 0) return 'INV';
  if (cleanedWords.length === 1) {
    return cleanedWords[0].slice(0, 4).toUpperCase().replace(/[^A-Z0-9]/g, '') || 'INV';
  }

  const initials = cleanedWords
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 6);

  return initials.length >= 2 ? initials : cleanedWords[0].slice(0, 3).toUpperCase();
}

export function getCounterDocId(companyCode: string, periodKey: string): string {
  const safeCode = (companyCode || 'INV').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 16) || 'INV';
  const safePeriod = /^\d{4}-\d{2}$/.test(periodKey) ? periodKey.replace('-', '_') : getCurrentPeriodKey().replace('-', '_');
  return `counter_${safeCode}_${safePeriod}`;
}

export function formatProformaInvoiceNumber(
  companyCode: string,
  periodKey: string,
  sequence: number
): string {
  const safeCode = (companyCode || 'INV').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 16) || 'INV';
  const [year, month] = /^\d{4}-\d{2}$/.test(periodKey)
    ? periodKey.split('-')
    : getCurrentPeriodKey().split('-');
  const safeSeq = Math.max(1, Math.floor(Number.isFinite(sequence) ? sequence : 1));
  const padded = String(safeSeq).padStart(3, '0');
  return `PI/${safeCode}/${year}/${month}/${padded}`;
}

export function isAutoFormatInvoiceNumber(invoiceNumber: string): boolean {
  return /^PI\/[A-Z0-9]{1,16}\/\d{4}\/\d{2}\/\d{1,6}$/i.test((invoiceNumber || '').trim());
}

export function parseSequenceFromInvoiceNumber(
  invoiceNumber: string,
  companyCode: string,
  periodKey: string
): number {
  const trimmed = (invoiceNumber || '').trim();
  const [year, month] = periodKey.split('-');
  if (!trimmed || !year || !month) return 0;

  const escapedCode = companyCode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`^PI/${escapedCode}/${year}/${month}/(\\d{1,6})$`, 'i');
  const match = trimmed.match(regex);
  if (!match) return 0;
  const parsed = parseInt(match[1], 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

export function computeFloorSequenceFromLogs(
  logs: InvoiceLogRecord[],
  companyCode: string,
  periodKey: string
): number {
  let maxSeq = 0;
  for (const log of logs) {
    const seq = parseSequenceFromInvoiceNumber(
      log.invoiceSnapshot.invoiceNumber,
      companyCode,
      periodKey
    );
    if (seq > maxSeq) {
      maxSeq = seq;
    }
  }
  return maxSeq;
}

export function isDuplicateInvoiceNumber(
  logs: InvoiceLogRecord[],
  invoiceNumber: string
): boolean {
  const target = (invoiceNumber || '').trim().toLowerCase();
  if (!target) return false;
  return logs.some(
    (log) =>
      log.status !== 'archived' &&
      (log.invoiceSnapshot.invoiceNumber || '').trim().toLowerCase() === target
  );
}
