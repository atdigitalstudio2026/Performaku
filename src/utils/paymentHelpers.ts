import { InvoiceLogRecord } from '../types/invoice';

export const FOLLOW_UP_WARNING_DAYS = 3;
export const FOLLOW_UP_OVERDUE_DAYS = 7;

export function toLocalDateIso(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function isValidIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test((value || '').trim());
}

export function formatIsoDateId(isoDate: string): string {
  const trimmed = (isoDate || '').trim();
  if (!isValidIsoDate(trimmed)) return '';
  const [y, m, d] = trimmed.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function getEffectivePaymentDateIso(log: InvoiceLogRecord): string {
  if (log.paymentStatus !== 'paid') return '';
  if (isValidIsoDate(log.paidAtDate)) return log.paidAtDate;
  return toLocalDateIso(new Date(log.updatedAtMs || log.createdAtMs));
}

export function getEffectivePaymentDateMs(log: InvoiceLogRecord): number {
  const iso = getEffectivePaymentDateIso(log);
  if (isValidIsoDate(iso)) {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d, 12, 0, 0, 0).getTime();
  }
  return log.updatedAtMs || log.createdAtMs;
}

export function getPendingAgeDays(createdAtMs: number, nowMs: number = Date.now()): number {
  const created = new Date(createdAtMs);
  const now = new Date(nowMs);
  const createdDay = new Date(created.getFullYear(), created.getMonth(), created.getDate()).getTime();
  const nowDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const diffDays = Math.floor((nowDay - createdDay) / (24 * 60 * 60 * 1000));
  return Math.max(0, diffDays);
}

export type PendingUrgency = 'normal' | 'warning' | 'overdue';

export function getPendingUrgency(ageDays: number): PendingUrgency {
  if (ageDays >= FOLLOW_UP_OVERDUE_DAYS) return 'overdue';
  if (ageDays >= FOLLOW_UP_WARNING_DAYS) return 'warning';
  return 'normal';
}

export function isFollowUpPendingLog(log: InvoiceLogRecord, nowMs: number = Date.now()): boolean {
  if (log.status === 'archived' || log.paymentStatus !== 'pending') return false;
  return getPendingAgeDays(log.createdAtMs, nowMs) >= FOLLOW_UP_WARNING_DAYS;
}
