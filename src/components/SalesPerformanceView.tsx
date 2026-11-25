import React, { useMemo, useState } from 'react';
import { Download, Eye, FileUp, X } from 'lucide-react';
import { SALES_REP_OPTIONS } from '../data/defaultInvoice';
import {
  CompanyProfile,
  DocumentFooter,
  InvoiceItem,
  InvoiceLogRecord,
  InvoicePaymentStatus,
  ProformaInvoiceData,
} from '../types/invoice';
import { formatAmount, formatWeight } from '../utils/formatters';
import { InvoicePreview } from './InvoicePreview';

type PeriodPreset = 'today' | 'week' | 'month' | 'year' | 'all' | 'custom';

interface SalesPerformanceViewProps {
  logs: InvoiceLogRecord[];
  loadingLogs: boolean;
  onUpdatePaymentStatus: (
    log: InvoiceLogRecord,
    nextStatus: InvoicePaymentStatus
  ) => Promise<void>;
  onUpdateSalesName: (log: InvoiceLogRecord, nextSalesName: string) => Promise<void>;
  onFetchLogItems: (log: InvoiceLogRecord) => Promise<InvoiceItem[]>;
  onLoadLogToEditor: (
    invoice: ProformaInvoiceData,
    company: CompanyProfile,
    footer: DocumentFooter
  ) => void;
  onDownloadLogPdf: (log: InvoiceLogRecord, items: InvoiceItem[]) => Promise<void>;
}

function toInputDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getPresetRange(preset: PeriodPreset): { start: string; end: string } {
  const now = new Date();
  const todayStr = toInputDateStr(now);

  if (preset === 'today') {
    return { start: todayStr, end: todayStr };
  }
  if (preset === 'week') {
    const start = new Date(now);
    const day = start.getDay(); // 0=Sun..6=Sat
    const diffToMonday = day === 0 ? 6 : day - 1;
    start.setDate(start.getDate() - diffToMonday);
    return { start: toInputDateStr(start), end: todayStr };
  }
  if (preset === 'month') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return { start: toInputDateStr(start), end: todayStr };
  }
  if (preset === 'year') {
    const start = new Date(now.getFullYear(), 0, 1);
    return { start: toInputDateStr(start), end: todayStr };
  }
  return { start: '', end: '' };
}

function parseStartOfDayMs(dateStr: string): number | null {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
}

function parseEndOfDayMs(dateStr: string): number | null {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d, 23, 59, 59, 999).getTime();
}

const PAYMENT_STATUS_LABELS: Record<InvoicePaymentStatus, string> = {
  paid: 'Lunas',
  pending: 'Pending',
  cancelled: 'Cancel',
};

const PAYMENT_SELECT_CLASSES: Record<InvoicePaymentStatus, string> = {
  paid: 'border-emerald-300 bg-emerald-50 text-emerald-800',
  pending: 'border-amber-300 bg-amber-50 text-amber-800',
  cancelled: 'border-red-200 bg-red-50 text-red-700',
};

interface SalesSummaryRow {
  salesName: string;
  label: string;
  paidCount: number;
  paidRevenue: number;
  paidWeightKg: number;
  pendingCount: number;
  pendingAmount: number;
  cancelledCount: number;
  totalCount: number;
}

export const SalesPerformanceView: React.FC<SalesPerformanceViewProps> = ({
  logs,
  loadingLogs,
  onUpdatePaymentStatus,
  onUpdateSalesName,
  onFetchLogItems,
  onLoadLogToEditor,
  onDownloadLogPdf,
}) => {
  const initialRange = getPresetRange('month');
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>('month');
  const [startDate, setStartDate] = useState<string>(initialRange.start);
  const [endDate, setEndDate] = useState<string>(initialRange.end);
  const [selectedSales, setSelectedSales] = useState<string>('all');
  const [ledgerStatusFilter, setLedgerStatusFilter] = useState<'all' | InvoicePaymentStatus>('all');
  const [busyLogId, setBusyLogId] = useState<string | null>(null);
  const [previewState, setPreviewState] = useState<{
    log: InvoiceLogRecord;
    items: InvoiceItem[];
  } | null>(null);

  const handleSelectPreset = (preset: PeriodPreset) => {
    setPeriodPreset(preset);
    if (preset === 'all') {
      setStartDate('');
      setEndDate('');
    } else if (preset !== 'custom') {
      const range = getPresetRange(preset);
      setStartDate(range.start);
      setEndDate(range.end);
    }
  };

  // Only active (non-archived) invoices within selected date period
  const periodLogs = useMemo(() => {
    const startMs = parseStartOfDayMs(startDate);
    const endMs = parseEndOfDayMs(endDate);

    return logs.filter((log) => {
      if (log.status === 'archived') return false;
      if (startMs !== null && log.createdAtMs < startMs) return false;
      if (endMs !== null && log.createdAtMs > endMs) return false;
      return true;
    });
  }, [logs, startDate, endDate]);

  // Per-sales performance breakdown (ALWAYS lists the 4 core sales reps)
  const salesBreakdown = useMemo(() => {
    const map = new Map<string, SalesSummaryRow>();

    for (const rep of SALES_REP_OPTIONS) {
      map.set(rep, {
        salesName: rep,
        label: rep,
        paidCount: 0,
        paidRevenue: 0,
        paidWeightKg: 0,
        pendingCount: 0,
        pendingAmount: 0,
        cancelledCount: 0,
        totalCount: 0,
      });
    }

    for (const log of periodLogs) {
      const key = log.salesName?.trim() || '__unassigned__';
      if (!map.has(key)) {
        map.set(key, {
          salesName: key,
          label: key === '__unassigned__' ? 'Belum Ditentukan' : key,
          paidCount: 0,
          paidRevenue: 0,
          paidWeightKg: 0,
          pendingCount: 0,
          pendingAmount: 0,
          cancelledCount: 0,
          totalCount: 0,
        });
      }
      const row = map.get(key)!;
      row.totalCount += 1;

      if (log.paymentStatus === 'paid') {
        row.paidCount += 1;
        row.paidRevenue += log.grandTotal;
        row.paidWeightKg += log.totalWeightKg;
      } else if (log.paymentStatus === 'cancelled') {
        row.cancelledCount += 1;
      } else {
        row.pendingCount += 1;
        row.pendingAmount += log.grandTotal;
      }
    }

    const rows = Array.from(map.values());
    // Sort by paid revenue descending, keeping canonical order on ties
    const canonicalOrder = new Map<string, number>(
      SALES_REP_OPTIONS.map((name, idx) => [name, idx])
    );
    rows.sort((a, b) => {
      if (b.paidRevenue !== a.paidRevenue) return b.paidRevenue - a.paidRevenue;
      const idxA = canonicalOrder.has(a.salesName) ? canonicalOrder.get(a.salesName)! : 99;
      const idxB = canonicalOrder.has(b.salesName) ? canonicalOrder.get(b.salesName)! : 99;
      return idxA - idxB;
    });

    return rows;
  }, [periodLogs]);

  // Scoped logs by selected sales rep
  const scopedLogs = useMemo(() => {
    if (selectedSales === 'all') return periodLogs;
    return periodLogs.filter((log) => {
      const key = log.salesName?.trim() || '__unassigned__';
      return key === selectedSales;
    });
  }, [periodLogs, selectedSales]);

  // Aggregate KPIs for current scope (ONLY 'paid' counts as Sales Revenue & Volume)
  const kpis = useMemo(() => {
    let paidRevenue = 0;
    let paidWeightKg = 0;
    let paidCount = 0;
    let pendingAmount = 0;
    let pendingCount = 0;
    let cancelledCount = 0;

    for (const log of scopedLogs) {
      if (log.paymentStatus === 'paid') {
        paidCount += 1;
        paidRevenue += log.grandTotal;
        paidWeightKg += log.totalWeightKg;
      } else if (log.paymentStatus === 'cancelled') {
        cancelledCount += 1;
      } else {
        pendingCount += 1;
        pendingAmount += log.grandTotal;
      }
    }

    const totalInvoices = scopedLogs.length;
    const paidRate = totalInvoices > 0 ? Math.round((paidCount / totalInvoices) * 100) : 0;
    const avgOrderValue = paidCount > 0 ? Math.round(paidRevenue / paidCount) : 0;

    return {
      paidRevenue,
      paidWeightKg,
      paidCount,
      pendingAmount,
      pendingCount,
      cancelledCount,
      totalInvoices,
      paidRate,
      avgOrderValue,
    };
  }, [scopedLogs]);

  const totalPeriodPaidRevenue = useMemo(
    () => salesBreakdown.reduce((sum, r) => sum + r.paidRevenue, 0),
    [salesBreakdown]
  );

  const maxRepPaidRevenue = useMemo(
    () => salesBreakdown.reduce((max, r) => Math.max(max, r.paidRevenue), 0),
    [salesBreakdown]
  );

  const ledgerLogs = useMemo(() => {
    if (ledgerStatusFilter === 'all') return scopedLogs;
    return scopedLogs.filter((log) => log.paymentStatus === ledgerStatusFilter);
  }, [scopedLogs, ledgerStatusFilter]);

  const buildFullInvoice = (log: InvoiceLogRecord, items: InvoiceItem[]): ProformaInvoiceData => ({
    ...log.invoiceSnapshot,
    salesName: log.salesName,
    showBestRegards: Boolean(log.salesName),
    items,
  });

  const handleOpenPreview = async (log: InvoiceLogRecord) => {
    setBusyLogId(log.id);
    try {
      const items = await onFetchLogItems(log);
      setPreviewState({ log, items });
    } finally {
      setBusyLogId(null);
    }
  };

  const handleRestoreToEditor = async (log: InvoiceLogRecord, cachedItems?: InvoiceItem[]) => {
    setBusyLogId(log.id);
    try {
      const items = cachedItems ?? (await onFetchLogItems(log));
      onLoadLogToEditor(buildFullInvoice(log, items), log.companySnapshot, log.footerSnapshot);
      setPreviewState(null);
    } finally {
      setBusyLogId(null);
    }
  };

  const handleDownloadPdf = async (log: InvoiceLogRecord, cachedItems?: InvoiceItem[]) => {
    setBusyLogId(log.id);
    try {
      const items = cachedItems ?? (await onFetchLogItems(log));
      await onDownloadLogPdf(log, items);
    } finally {
      setBusyLogId(null);
    }
  };

  const handleExportCsv = () => {
    const headers = [
      'Tanggal Log',
      'Nama Sales',
      'Status Pembayaran',
      'Pembeli',
      'Penjual',
      'Nomor Invoice',
      'Berat (Kg)',
      'Grand Total',
      'Potongan Deposit',
      'Sisa Transfer',
    ];

    const escapeCsv = (val: string | number) => {
      const str = String(val ?? '');
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const rows = ledgerLogs.map((log) => [
      new Date(log.createdAtMs).toLocaleDateString('id-ID'),
      log.salesName || 'Belum Ditentukan',
      PAYMENT_STATUS_LABELS[log.paymentStatus],
      log.invoiceSnapshot.buyerName || '-',
      log.sellerName || '-',
      log.invoiceSnapshot.invoiceNumber || '-',
      log.totalWeightKg,
      log.grandTotal,
      log.appliedDeposit,
      log.netPayable,
    ]);

    const csvContent = [headers, ...rows].map((row) => row.map(escapeCsv).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const periodTag =
      startDate && endDate ? `${startDate}_sd_${endDate}` : 'semua_waktu';
    const salesTag =
      selectedSales === 'all'
        ? 'semua_sales'
        : selectedSales.toLowerCase().replace(/\s+/g, '_');
    link.href = url;
    link.download = `Performa_Sales_${salesTag}_${periodTag}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const periodPresets: { id: PeriodPreset; label: string }[] = [
    { id: 'today', label: 'Hari Ini' },
    { id: 'week', label: 'Minggu Ini' },
    { id: 'month', label: 'Bulan Ini' },
    { id: 'year', label: 'Tahun Ini' },
    { id: 'all', label: 'Semua Waktu' },
  ];

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-8 py-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Performa Penjualan Sales</h1>
          <p className="text-sm text-slate-600 mt-1">
            Rekap data penjualan per sales berdasarkan rentang waktu. Hanya Proforma Invoice berstatus{' '}
            <strong className="font-semibold text-emerald-700">Lunas</strong> yang masuk ke perhitungan omzet dan berat terjual.
          </p>
        </div>

        <button
          type="button"
          onClick={handleExportCsv}
          disabled={ledgerLogs.length === 0}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-md border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 disabled:opacity-50 transition-colors cursor-pointer whitespace-nowrap shrink-0"
        >
          <Download className="w-3.5 h-3.5" />
          Unduh Laporan CSV
        </button>
      </div>

      {/* Period & Sales Filter Bar */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* Quick period presets */}
          <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-md w-fit">
            {periodPresets.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => handleSelectPreset(p.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
                  periodPreset === p.id
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Custom date range + Sales dropdown */}
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center gap-1.5 text-xs text-slate-600">
              <label htmlFor="sales-date-start" className="whitespace-nowrap">
                Dari
              </label>
              <input
                id="sales-date-start"
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setPeriodPreset('custom');
                }}
                className="px-2.5 py-1.5 text-xs font-mono rounded-md border border-slate-300 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20 focus:border-[#1D4ED8]"
              />
              <span className="text-slate-400">–</span>
              <input
                id="sales-date-end"
                type="date"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setPeriodPreset('custom');
                }}
                className="px-2.5 py-1.5 text-xs font-mono rounded-md border border-slate-300 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20 focus:border-[#1D4ED8]"
              />
            </div>

            <select
              value={selectedSales}
              onChange={(e) => setSelectedSales(e.target.value)}
              className="px-3 py-1.5 text-xs font-medium rounded-md border border-slate-300 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20 focus:border-[#1D4ED8]"
            >
              <option value="all">Semua Sales (4 Orang)</option>
              {SALES_REP_OPTIONS.map((name) => (
                <option key={name} value={name}>
                  Sales: {name}
                </option>
              ))}
              {salesBreakdown.some((r) => r.salesName === '__unassigned__') && (
                <option value="__unassigned__">Belum Ditentukan</option>
              )}
            </select>
          </div>
        </div>
      </div>

      {/* 4-Column KPI Summary Strip */}
      <div className="bg-white border border-slate-200 rounded-lg grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-200">
        <div className="p-4 sm:p-5">
          <div className="text-xs font-medium text-slate-500">Total Penjualan (Lunas)</div>
          <div className="mt-1.5 text-xl font-bold text-slate-900 font-mono tabular-nums">
            Rp {formatAmount(kpis.paidRevenue, 'dot')}
          </div>
          <div className="mt-1 text-xs text-emerald-700 font-medium tabular-nums">
            {kpis.paidCount} invoice lunas · Rata-rata Rp {formatAmount(kpis.avgOrderValue, 'dot')}
          </div>
        </div>

        <div className="p-4 sm:p-5">
          <div className="text-xs font-medium text-slate-500">Volume Berat Terjual (Lunas)</div>
          <div className="mt-1.5 text-xl font-bold text-slate-900 font-mono tabular-nums">
            {formatWeight(kpis.paidWeightKg, 'dot')} kg
          </div>
          <div className="mt-1 text-xs text-slate-500 tabular-nums">
            Hanya menghitung barang dari invoice lunas
          </div>
        </div>

        <div className="p-4 sm:p-5">
          <div className="text-xs font-medium text-slate-500">Menunggu Bayar (Pending)</div>
          <div className="mt-1.5 text-xl font-bold text-amber-700 font-mono tabular-nums">
            Rp {formatAmount(kpis.pendingAmount, 'dot')}
          </div>
          <div className="mt-1 text-xs text-slate-500 tabular-nums">
            {kpis.pendingCount} invoice pending · Belum masuk omzet
          </div>
        </div>

        <div className="p-4 sm:p-5">
          <div className="text-xs font-medium text-slate-500">Rasio Lunas &amp; Pembatalan</div>
          <div className="mt-1.5 text-xl font-bold text-slate-900 font-mono tabular-nums">
            {kpis.paidRate}%
          </div>
          <div className="mt-1 text-xs text-slate-500 tabular-nums">
            {kpis.totalInvoices} total invoice · {kpis.cancelledCount} dibatalkan (Cancel)
          </div>
        </div>
      </div>

      {/* Per-Sales Comparison Table */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-4 sm:px-5 py-3.5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              Ringkasan Performa per Sales
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Klik baris nama sales untuk melihat rincian invoice khusus sales tersebut.
            </p>
          </div>
          {selectedSales !== 'all' && (
            <button
              type="button"
              onClick={() => setSelectedSales('all')}
              className="text-xs font-medium text-[#1D4ED8] hover:text-blue-800 transition-colors cursor-pointer self-start sm:self-auto"
            >
              Tampilkan Semua Sales
            </button>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs sm:text-sm tabular-nums">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 text-xs font-semibold">
                <th className="py-2.5 px-4">Nama Sales</th>
                <th className="py-2.5 px-4 min-w-[210px]">Omzet Penjualan (Lunas)</th>
                <th className="py-2.5 px-4 text-right">Kontribusi</th>
                <th className="py-2.5 px-4 text-right">Lunas</th>
                <th className="py-2.5 px-4 text-right">Berat Lunas</th>
                <th className="py-2.5 px-4 text-right">Pending</th>
                <th className="py-2.5 px-4 text-right">Cancel</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {salesBreakdown.map((row) => {
                const isSelected = selectedSales === row.salesName;
                const sharePct =
                  totalPeriodPaidRevenue > 0
                    ? Math.round((row.paidRevenue / totalPeriodPaidRevenue) * 100)
                    : 0;
                const barWidthPct =
                  maxRepPaidRevenue > 0
                    ? Math.max(row.paidRevenue > 0 ? 4 : 0, Math.round((row.paidRevenue / maxRepPaidRevenue) * 100))
                    : 0;

                return (
                  <tr
                    key={row.salesName}
                    onClick={() =>
                      setSelectedSales(isSelected ? 'all' : row.salesName)
                    }
                    className={`transition-colors cursor-pointer ${
                      isSelected ? 'bg-blue-50/70' : 'hover:bg-slate-50'
                    }`}
                  >
                    <td className="py-3 px-4 font-semibold text-slate-900 whitespace-nowrap">
                      <span>{row.label}</span>
                      {isSelected && (
                        <span className="ml-2 text-[11px] font-medium text-[#1D4ED8]">
                          (Aktif)
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-mono font-semibold text-slate-900">
                        Rp {formatAmount(row.paidRevenue, 'dot')}
                      </div>
                      <div className="mt-1.5 h-1.5 w-full bg-slate-100 rounded-sm overflow-hidden">
                        <div
                          className="h-full bg-[#1D4ED8] rounded-sm transition-all duration-200"
                          style={{ width: `${barWidthPct}%` }}
                        />
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-slate-700 whitespace-nowrap">
                      {sharePct}%
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-semibold text-emerald-700 whitespace-nowrap">
                      {row.paidCount} inv
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-slate-700 whitespace-nowrap">
                      {formatWeight(row.paidWeightKg, 'dot')} kg
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-amber-700 whitespace-nowrap">
                      {row.pendingCount} inv
                      {row.pendingAmount > 0 && (
                        <div className="text-[11px] text-slate-500 font-normal">
                          Rp {formatAmount(row.pendingAmount, 'dot')}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-slate-500 whitespace-nowrap">
                      {row.cancelledCount} inv
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold text-slate-900">
                <td className="py-3 px-4">Total Semua Sales</td>
                <td className="py-3 px-4 font-mono">
                  Rp {formatAmount(totalPeriodPaidRevenue, 'dot')}
                </td>
                <td className="py-3 px-4 text-right font-mono">100%</td>
                <td className="py-3 px-4 text-right font-mono text-emerald-700">
                  {salesBreakdown.reduce((s, r) => s + r.paidCount, 0)} inv
                </td>
                <td className="py-3 px-4 text-right font-mono">
                  {formatWeight(
                    salesBreakdown.reduce((s, r) => s + r.paidWeightKg, 0),
                    'dot'
                  )}{' '}
                  kg
                </td>
                <td className="py-3 px-4 text-right font-mono text-amber-700">
                  {salesBreakdown.reduce((s, r) => s + r.pendingCount, 0)} inv
                </td>
                <td className="py-3 px-4 text-right font-mono text-slate-500">
                  {salesBreakdown.reduce((s, r) => s + r.cancelledCount, 0)} inv
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Detailed Transaction Ledger with Inline Status Update */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-4 sm:px-5 py-3.5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              Rincian Proforma Invoice{' '}
              {selectedSales === 'all'
                ? '(Semua Sales)'
                : `— ${selectedSales === '__unassigned__' ? 'Belum Ditentukan' : selectedSales}`}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Ubah status pembayaran menjadi Lunas agar otomatis terhitung ke penjualan sales.
            </p>
          </div>

          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-md w-fit">
            {(
              [
                { id: 'all', label: 'Semua' },
                { id: 'paid', label: 'Lunas' },
                { id: 'pending', label: 'Pending' },
                { id: 'cancelled', label: 'Cancel' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setLedgerStatusFilter(tab.id)}
                className={`px-2.5 py-1 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
                  ledgerStatusFilter === tab.id
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {loadingLogs && logs.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">
            Memuat data penjualan dari Firebase...
          </div>
        ) : ledgerLogs.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-sm font-medium text-slate-800">
              Belum ada data Proforma Invoice pada filter ini
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Buat Proforma Invoice di Editor, pilih Nama Sales, lalu simpan atau unduh PDF. Setelah customer membayar, ubah status menjadi Lunas agar masuk ke laporan penjualan.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-200">
            {ledgerLogs.map((log) => {
              const isBusy = busyLogId === log.id;
              const dateStr = new Date(log.createdAtMs).toLocaleDateString('id-ID', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
              });

              return (
                <div
                  key={log.id}
                  className="px-4 sm:px-5 py-3.5 flex flex-col lg:flex-row lg:items-center justify-between gap-3 hover:bg-slate-50/70 transition-colors"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-sm font-semibold text-slate-900">
                        {log.invoiceSnapshot.buyerName || 'Tanpa Nama Pembeli'}
                      </span>
                      {log.invoiceSnapshot.showInvoiceNumber &&
                        log.invoiceSnapshot.invoiceNumber.trim() && (
                          <span className="text-xs font-mono text-slate-600">
                            · {log.invoiceSnapshot.invoiceNumber}
                          </span>
                        )}
                    </div>
                    <div className="text-xs text-slate-600 flex flex-wrap items-center gap-x-2 gap-y-0.5 tabular-nums">
                      <span className="font-medium text-slate-800">
                        Sales: {log.salesName || 'Belum Ditentukan'}
                      </span>
                      <span className="text-slate-300">·</span>
                      <span>{log.sellerName || '-'}</span>
                      <span className="text-slate-300">·</span>
                      <span>{dateStr}</span>
                      <span className="text-slate-300">·</span>
                      <span>{formatWeight(log.totalWeightKg, 'dot')} kg</span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 shrink-0">
                    <div className="text-left lg:text-right tabular-nums min-w-[130px]">
                      <div className="text-[11px] text-slate-500">Nilai Penjualan</div>
                      <div
                        className={`text-sm font-bold font-mono ${
                          log.paymentStatus === 'cancelled'
                            ? 'text-slate-400 line-through'
                            : log.paymentStatus === 'paid'
                            ? 'text-emerald-800'
                            : 'text-slate-900'
                        }`}
                      >
                        {log.invoiceSnapshot.currency}{' '}
                        {formatAmount(log.grandTotal, log.invoiceSnapshot.numberFormat)}
                      </div>
                    </div>

                    {/* Assign sales if empty */}
                    {!log.salesName && (
                      <select
                        value=""
                        disabled={isBusy}
                        onChange={async (e) => {
                          if (!e.target.value) return;
                          setBusyLogId(log.id);
                          try {
                            await onUpdateSalesName(log, e.target.value);
                          } finally {
                            setBusyLogId(null);
                          }
                        }}
                        className="px-2.5 py-1.5 text-xs rounded-md border border-slate-300 bg-white text-slate-700 cursor-pointer"
                      >
                        <option value="">Pilih Sales...</option>
                        {SALES_REP_OPTIONS.map((rep) => (
                          <option key={rep} value={rep}>
                            {rep}
                          </option>
                        ))}
                      </select>
                    )}

                    {/* Inline Payment Status Selector */}
                    <select
                      aria-label="Status Pembayaran"
                      value={log.paymentStatus}
                      disabled={isBusy}
                      onChange={async (e) => {
                        const next = e.target.value as InvoicePaymentStatus;
                        setBusyLogId(log.id);
                        try {
                          await onUpdatePaymentStatus(log, next);
                        } finally {
                          setBusyLogId(null);
                        }
                      }}
                      className={`px-2.5 py-1.5 text-xs font-semibold rounded-md border transition-colors cursor-pointer focus:outline-none ${
                        PAYMENT_SELECT_CLASSES[log.paymentStatus]
                      }`}
                    >
                      <option value="pending">Pending</option>
                      <option value="paid">Lunas (Sudah Bayar)</option>
                      <option value="cancelled">Cancel</option>
                    </select>

                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => handleOpenPreview(log)}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors cursor-pointer whitespace-nowrap"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      Lihat
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal Pratinjau A4 */}
      {previewState && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex flex-col">
          <div className="bg-white border-b border-slate-200 px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="text-sm font-bold text-slate-900 truncate">
                Pratinjau Invoice: {previewState.log.invoiceSnapshot.buyerName || 'Proforma Invoice'}
              </div>
              <div className="text-xs text-slate-500">
                Sales: {previewState.log.salesName || 'Belum Ditentukan'} · Status:{' '}
                {PAYMENT_STATUS_LABELS[previewState.log.paymentStatus]} ·{' '}
                {previewState.log.invoiceSnapshot.cityDate}
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => void handleRestoreToEditor(previewState.log, previewState.items)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer whitespace-nowrap"
              >
                <FileUp className="w-3.5 h-3.5" />
                Muat ke Editor
              </button>
              <button
                type="button"
                onClick={() => void handleDownloadPdf(previewState.log, previewState.items)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-[#1D4ED8] text-white hover:bg-blue-800 transition-colors cursor-pointer whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5" />
                Unduh PDF
              </button>
              <button
                type="button"
                onClick={() => setPreviewState(null)}
                title="Tutup pratinjau"
                className="p-1.5 rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-auto p-4 sm:p-8 flex justify-center items-start bg-[#E8EAEE]">
            <InvoicePreview
              invoice={buildFullInvoice(previewState.log, previewState.items)}
              company={previewState.log.companySnapshot}
              footer={previewState.log.footerSnapshot}
              scale={0.85}
            />
          </div>
        </div>
      )}
    </div>
  );
};
