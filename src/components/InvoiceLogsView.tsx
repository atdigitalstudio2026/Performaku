import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Archive,
  CalendarCheck2,
  Cloud,
  CloudUpload,
  Download,
  Eye,
  FileSpreadsheet,
  FileText,
  FileUp,
  History,
  MessageCircle,
  Search,
  Trash2,
  User as UserIcon,
  X,
} from 'lucide-react';
import { SALES_REP_OPTIONS } from '../data/defaultInvoice';
import {
  CompanyProfile,
  DocumentFooter,
  InvoiceItem,
  InvoiceLogAction,
  InvoiceLogRecord,
  InvoicePaymentStatus,
  ProformaInvoiceData,
} from '../types/invoice';
import { exportAllInvoicesExcel, exportAllInvoicesPdf } from '../utils/exportReports';
import { formatAmount, formatWeight } from '../utils/formatters';
import {
  FOLLOW_UP_WARNING_DAYS,
  formatIsoDateId,
  getEffectivePaymentDateIso,
  getPendingAgeDays,
  getPendingUrgency,
  isFollowUpPendingLog,
} from '../utils/paymentHelpers';
import { InvoicePreview } from './InvoicePreview';

interface InvoiceLogsViewProps {
  adminName: string;
  onChangeAdminName: (name: string) => void;
  logs: InvoiceLogRecord[];
  localOnlyCount: number;
  loadingLogs: boolean;
  logsError: string;
  onSyncLocalLogs: () => Promise<void>;
  onSaveCurrentToLog: () => Promise<void>;
  onUpdatePaymentStatus: (
    log: InvoiceLogRecord,
    nextStatus: InvoicePaymentStatus
  ) => Promise<void>;
  onOpenPaymentModal: (log: InvoiceLogRecord, targetStatus: InvoicePaymentStatus) => void;
  onUpdateSalesName: (log: InvoiceLogRecord, nextSalesName: string) => Promise<void>;
  onFetchLogItems: (log: InvoiceLogRecord) => Promise<InvoiceItem[]>;
  onLoadLogToEditor: (
    invoice: ProformaInvoiceData,
    company: CompanyProfile,
    footer: DocumentFooter
  ) => void;
  onDownloadLogPdf: (
    log: InvoiceLogRecord,
    items: InvoiceItem[]
  ) => Promise<void>;
  onArchiveLog: (log: InvoiceLogRecord) => Promise<void>;
  onDeleteLog: (log: InvoiceLogRecord) => Promise<void>;
  onOpenWhatsApp: (log: InvoiceLogRecord, cachedItems?: InvoiceItem[]) => Promise<void>;
  onNotify?: (message: string) => void;
}

const ACTION_LABELS: Record<InvoiceLogAction, string> = {
  pdf_export: 'Unduh PDF',
  manual_save: 'Simpan Log',
  print: 'Cetak',
  restored: 'Dibuka Ulang',
};

const PAYMENT_SELECT_CLASSES: Record<InvoicePaymentStatus, string> = {
  paid: 'border-emerald-300 bg-emerald-50 text-emerald-800',
  pending: 'border-amber-300 bg-amber-50 text-amber-800',
  cancelled: 'border-red-200 bg-red-50 text-red-700',
};

export const InvoiceLogsView: React.FC<InvoiceLogsViewProps> = ({
  adminName,
  onChangeAdminName,
  logs,
  localOnlyCount,
  loadingLogs,
  logsError,
  onSyncLocalLogs,
  onSaveCurrentToLog,
  onUpdatePaymentStatus,
  onOpenPaymentModal,
  onUpdateSalesName,
  onFetchLogItems,
  onLoadLogToEditor,
  onDownloadLogPdf,
  onArchiveLog,
  onDeleteLog,
  onOpenWhatsApp,
  onNotify,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | InvoiceLogAction | 'archived'>('all');
  const [salesFilter, setSalesFilter] = useState<string>('all');
  const [paymentFilter, setPaymentFilter] = useState<'all' | 'followup' | InvoicePaymentStatus>('all');
  const [busyLogId, setBusyLogId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [isSavingCurrent, setIsSavingCurrent] = useState(false);
  const [isSyncingLocal, setIsSyncingLocal] = useState(false);
  const [exportingReport, setExportingReport] = useState<'excel' | 'pdf' | null>(null);

  const [previewState, setPreviewState] = useState<{
    log: InvoiceLogRecord;
    items: InvoiceItem[];
  } | null>(null);

  const followUpPendingCount = useMemo(
    () => logs.filter((l) => isFollowUpPendingLog(l)).length,
    [logs]
  );

  const filteredLogs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return logs.filter((log) => {
      if (filterMode === 'archived') {
        if (log.status !== 'archived') return false;
      } else if (filterMode !== 'all') {
        if (log.status === 'archived' || log.actionType !== filterMode) return false;
      } else {
        if (log.status === 'archived') return false;
      }

      if (salesFilter !== 'all') {
        const currentSales = log.salesName?.trim() || '__unassigned__';
        if (currentSales !== salesFilter) return false;
      }

      if (paymentFilter === 'followup') {
        if (!isFollowUpPendingLog(log)) return false;
      } else if (paymentFilter !== 'all') {
        if (log.paymentStatus !== paymentFilter) return false;
      }

      if (!q) return true;
      const hay = [
        log.invoiceSnapshot.buyerName,
        log.invoiceSnapshot.invoiceNumber,
        log.sellerName,
        log.invoiceSnapshot.cityDate,
        log.salesName,
        log.ownerName,
        log.paymentNote,
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [logs, searchQuery, filterMode, salesFilter, paymentFilter]);

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
      const restoredInvoice = buildFullInvoice(log, items);
      onLoadLogToEditor(restoredInvoice, log.companySnapshot, log.footerSnapshot);
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

  const handleOpenWa = async (log: InvoiceLogRecord, cachedItems?: InvoiceItem[]) => {
    setBusyLogId(log.id);
    try {
      await onOpenWhatsApp(log, cachedItems);
    } finally {
      setBusyLogId(null);
    }
  };

  const handleSaveCurrent = async () => {
    setIsSavingCurrent(true);
    try {
      await onSaveCurrentToLog();
    } finally {
      setIsSavingCurrent(false);
    }
  };

  const handleSyncLocal = async () => {
    setIsSyncingLocal(true);
    try {
      await onSyncLocalLogs();
    } finally {
      setIsSyncingLocal(false);
    }
  };

  const hasActiveFilter =
    searchQuery.trim() !== '' ||
    filterMode !== 'all' ||
    salesFilter !== 'all' ||
    paymentFilter !== 'all';

  const exportTargetLogs = hasActiveFilter ? filteredLogs : logs;

  const exportFilterSummary = useMemo(() => {
    if (!hasActiveFilter) {
      return 'Seluruh Data Proforma Invoice';
    }
    const parts: string[] = [];
    if (salesFilter !== 'all') {
      parts.push(
        `Sales: ${salesFilter === '__unassigned__' ? 'Belum Ditentukan' : salesFilter}`
      );
    }
    if (paymentFilter !== 'all') {
      const label =
        paymentFilter === 'followup'
          ? `Perlu Follow-Up (≥ ${FOLLOW_UP_WARNING_DAYS} Hari)`
          : paymentFilter === 'paid'
          ? 'Lunas'
          : paymentFilter === 'pending'
          ? 'Pending'
          : 'Cancel';
      parts.push(`Status: ${label}`);
    }
    if (filterMode === 'archived') {
      parts.push('Arsip Log');
    } else if (filterMode !== 'all') {
      parts.push(`Aktivitas: ${ACTION_LABELS[filterMode]}`);
    }
    if (searchQuery.trim()) {
      parts.push(`Cari: "${searchQuery.trim()}"`);
    }
    return `Data Invoice Terfilter (${parts.join(' · ')})`;
  }, [hasActiveFilter, salesFilter, paymentFilter, filterMode, searchQuery]);

  const handleExportAllExcel = async () => {
    if (exportingReport || exportTargetLogs.length === 0) return;
    setExportingReport('excel');
    try {
      const filename = await exportAllInvoicesExcel(exportTargetLogs, exportFilterSummary);
      onNotify?.(`Laporan Excel data invoice berhasil diunduh: ${filename}`);
    } catch {
      onNotify?.('Gagal membuat file Excel seluruh data invoice.');
    } finally {
      setExportingReport(null);
    }
  };

  const handleExportAllPdf = () => {
    if (exportingReport || exportTargetLogs.length === 0) return;
    setExportingReport('pdf');
    try {
      const filename = exportAllInvoicesPdf(exportTargetLogs, exportFilterSummary);
      onNotify?.(`Laporan PDF data invoice berhasil diunduh: ${filename}`);
    } catch {
      onNotify?.('Gagal membuat file PDF seluruh data invoice.');
    } finally {
      setExportingReport(null);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-8 py-8">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-5">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Log Proforma Invoice</h1>
          <p className="text-sm text-slate-600 mt-1">
            Data terpusat di Firebase untuk seluruh tim admin. Perbarui status pembayaran menjadi{' '}
            <strong className="font-semibold text-emerald-700">Lunas</strong> agar transaksi masuk ke data penjualan sales.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => void handleExportAllExcel()}
            disabled={exportTargetLogs.length === 0 || exportingReport !== null}
            title={
              hasActiveFilter
                ? 'Unduh Excel sesuai filter aktif'
                : 'Unduh seluruh data invoice dalam format Excel rapi'
            }
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-md border border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 disabled:opacity-50 transition-colors cursor-pointer whitespace-nowrap"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            {exportingReport === 'excel'
              ? 'Menyusun Excel...'
              : hasActiveFilter
              ? 'Unduh Excel (Filter)'
              : 'Unduh Excel (.xlsx)'}
          </button>

          <button
            type="button"
            onClick={handleExportAllPdf}
            disabled={exportTargetLogs.length === 0 || exportingReport !== null}
            title={
              hasActiveFilter
                ? 'Unduh PDF presentasi sesuai filter aktif'
                : 'Unduh seluruh data invoice dalam format PDF presentasi'
            }
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-md border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 disabled:opacity-50 transition-colors cursor-pointer whitespace-nowrap"
          >
            <FileText className="w-3.5 h-3.5" />
            {exportingReport === 'pdf'
              ? 'Menyusun PDF...'
              : hasActiveFilter
              ? 'Unduh PDF (Filter)'
              : 'Unduh PDF Laporan'}
          </button>

          <button
            type="button"
            onClick={handleSaveCurrent}
            disabled={isSavingCurrent}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-md bg-[#1D4ED8] text-white hover:bg-blue-800 disabled:opacity-60 transition-colors cursor-pointer whitespace-nowrap"
          >
            <History className="w-3.5 h-3.5" />
            {isSavingCurrent ? 'Menyimpan...' : 'Catat Invoice Aktif'}
          </button>
        </div>
      </div>

      {/* Sync Banner if any offline/legacy local logs exist */}
      {localOnlyCount > 0 && (
        <div className="mb-5 bg-white border border-blue-200 rounded-lg p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 text-xs text-slate-700">
            <Cloud className="w-4 h-4 text-[#1D4ED8] shrink-0" />
            <span>
              Terdapat <strong>{localOnlyCount} log lokal</strong> di browser ini yang belum masuk ke database bersama Firebase.
            </span>
          </div>
          <button
            type="button"
            onClick={handleSyncLocal}
            disabled={isSyncingLocal}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-[#1D4ED8] text-white hover:bg-blue-800 disabled:opacity-60 transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <CloudUpload className="w-3.5 h-3.5" />
            {isSyncingLocal ? 'Menyinkronkan...' : `Unggah (${localOnlyCount}) ke Database Bersama`}
          </button>
        </div>
      )}

      {/* Follow-Up Pending Alert Banner */}
      {followUpPendingCount > 0 && (
        <div className="mb-4 bg-amber-50 border border-amber-200 rounded-lg p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 text-xs text-amber-900">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              Ada <strong>{followUpPendingCount} invoice Pending</strong> yang sudah melewati{' '}
              {FOLLOW_UP_WARNING_DAYS} hari belum lunas. Segera kirim pengingat via tombol{' '}
              <strong>WA</strong>.
            </span>
          </div>
          <button
            type="button"
            onClick={() =>
              setPaymentFilter(paymentFilter === 'followup' ? 'all' : 'followup')
            }
            className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
              paymentFilter === 'followup'
                ? 'border-amber-400 bg-amber-600 text-white'
                : 'border-amber-300 bg-white text-amber-900 hover:bg-amber-100'
            }`}
          >
            {paymentFilter === 'followup'
              ? 'Tampilkan Semua Status'
              : `Lihat Perlu Follow-Up (${followUpPendingCount})`}
          </button>
        </div>
      )}

      {/* Filter, Sales, Status, Admin Name & Search Bar */}
      <div className="bg-white border border-slate-200 rounded-lg p-3.5 mb-4 space-y-2.5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari nama pembeli, sales, nomor invoice, penjual, catatan bayar, atau admin..."
              className="w-full pl-9 pr-3 py-2 text-sm rounded-md border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20 focus:border-[#1D4ED8]"
            />
          </div>

          <div className="relative shrink-0">
            <UserIcon className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={adminName}
              onChange={(e) => onChangeAdminName(e.target.value)}
              placeholder="Nama Admin (opsional)"
              maxLength={80}
              className="w-full lg:w-44 pl-8 pr-2.5 py-2 text-xs rounded-md border border-slate-300 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20 focus:border-[#1D4ED8]"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2.5 pt-2 border-t border-slate-100">
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={salesFilter}
              onChange={(e) => setSalesFilter(e.target.value)}
              className="px-2.5 py-1.5 text-xs font-medium rounded-md border border-slate-300 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20 focus:border-[#1D4ED8]"
            >
              <option value="all">Semua Sales</option>
              {SALES_REP_OPTIONS.map((rep) => (
                <option key={rep} value={rep}>
                  Sales: {rep}
                </option>
              ))}
              <option value="__unassigned__">Sales: Belum Ditentukan</option>
            </select>

            <select
              value={paymentFilter}
              onChange={(e) =>
                setPaymentFilter(e.target.value as 'all' | 'followup' | InvoicePaymentStatus)
              }
              className="px-2.5 py-1.5 text-xs font-medium rounded-md border border-slate-300 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20 focus:border-[#1D4ED8]"
            >
              <option value="all">Semua Status Bayar</option>
              <option value="followup">
                Perlu Follow-Up (≥ {FOLLOW_UP_WARNING_DAYS} Hari)
              </option>
              <option value="pending">Status: Pending</option>
              <option value="paid">Status: Lunas</option>
              <option value="cancelled">Status: Cancel</option>
            </select>

            <select
              value={filterMode}
              onChange={(e) =>
                setFilterMode(e.target.value as 'all' | InvoiceLogAction | 'archived')
              }
              className="px-2.5 py-1.5 text-xs font-medium rounded-md border border-slate-300 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20 focus:border-[#1D4ED8]"
            >
              <option value="all">Semua Aktivitas</option>
              <option value="pdf_export">Aktivitas: Unduh PDF</option>
              <option value="manual_save">Aktivitas: Simpan Log</option>
              <option value="print">Aktivitas: Cetak</option>
              <option value="archived">Arsip Log</option>
            </select>
          </div>

          <span className="text-xs text-slate-500 font-mono tabular-nums whitespace-nowrap">
            {filteredLogs.length} catatan
          </span>
        </div>
      </div>

      {logsError && (
        <div className="mb-4 p-3.5 rounded-lg border border-red-200 bg-red-50 text-xs text-red-700">
          {logsError}
        </div>
      )}

      {/* Logs List */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        {loadingLogs && logs.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">
            Memuat data log bersama dari Firebase...
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-sm font-medium text-slate-800">
              {logs.length === 0 ? 'Belum ada log Proforma Invoice' : 'Tidak ada log yang cocok'}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              {logs.length === 0
                ? 'Saat admin mengunduh PDF, mencetak, atau menekan "Catat Invoice Aktif ke Log", datanya otomatis tersimpan dan tampil untuk semua admin di sini.'
                : 'Coba ubah kata kunci pencarian atau filter sales / status pembayaran.'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-200">
            {filteredLogs.map((log) => {
              const isBusy = busyLogId === log.id;
              const isConfirmingDelete = confirmDeleteId === log.id;
              const isLocal = log.storageSource === 'local';
              const isArchived = log.status === 'archived';
              const dateStr = new Date(log.createdAtMs).toLocaleString('id-ID', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              });

              const pendingAgeDays =
                !isArchived && log.paymentStatus === 'pending'
                  ? getPendingAgeDays(log.createdAtMs)
                  : 0;
              const pendingUrgency = getPendingUrgency(pendingAgeDays);
              const paidDateFormatted =
                log.paymentStatus === 'paid'
                  ? formatIsoDateId(getEffectivePaymentDateIso(log))
                  : '';

              return (
                <div
                  key={log.id}
                  className="p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4 hover:bg-slate-50/70 transition-colors"
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
                      <span className="text-xs text-slate-500">
                        · {ACTION_LABELS[log.actionType] || log.actionType}
                      </span>
                      {pendingUrgency === 'overdue' && (
                        <span className="text-[11px] font-semibold text-red-700 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded">
                          Perlu Follow-Up ({pendingAgeDays} hari)
                        </span>
                      )}
                      {pendingUrgency === 'warning' && (
                        <span className="text-[11px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
                          Pending {pendingAgeDays} hari
                        </span>
                      )}
                      {isArchived && (
                        <span className="text-xs font-medium text-slate-500">· Diarsipkan</span>
                      )}
                    </div>

                    <div className="text-xs text-slate-600 flex flex-wrap items-center gap-x-2 gap-y-0.5 tabular-nums">
                      <span className="font-semibold text-[#1D4ED8]">
                        Sales: {log.salesName || 'Belum Ditentukan'}
                      </span>
                      <span className="text-slate-300">·</span>
                      <span className="font-medium text-slate-800">{log.sellerName || '-'}</span>
                      <span className="text-slate-300">·</span>
                      <span>{log.invoiceSnapshot.cityDate || '-'}</span>
                      <span className="text-slate-300">·</span>
                      <span>{log.itemCount} barang</span>
                      <span className="text-slate-300">·</span>
                      <span>
                        {formatWeight(log.totalWeightKg, log.invoiceSnapshot.numberFormat)} kg
                      </span>
                    </div>

                    <div className="text-[11px] text-slate-500 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="tabular-nums">Tercatat {dateStr}</span>
                      <span className="text-slate-300">·</span>
                      <span>Admin: {log.ownerName || 'Tim Admin'}</span>
                      <span className="text-slate-300">·</span>
                      <span>
                        Rek. {log.invoiceSnapshot.bankAccount.bankShortName}{' '}
                        {log.invoiceSnapshot.bankAccount.accountNumber}
                      </span>
                      {isLocal && (
                        <>
                          <span className="text-slate-300">·</span>
                          <span className="text-amber-700 font-medium">Menunggu sinkronisasi</span>
                        </>
                      )}
                    </div>

                    {/* Payment Date & Transfer Note Strip */}
                    {(paidDateFormatted || log.paymentNote) && (
                      <div className="text-[11px] flex flex-wrap items-center gap-x-2 gap-y-0.5 pt-0.5">
                        {paidDateFormatted && (
                          <span className="inline-flex items-center gap-1 font-medium text-emerald-700">
                            <CalendarCheck2 className="w-3 h-3" />
                            Lunas: {paidDateFormatted}
                          </span>
                        )}
                        {paidDateFormatted && log.paymentNote && (
                          <span className="text-slate-300">·</span>
                        )}
                        {log.paymentNote && (
                          <span className="text-slate-600">Catatan: {log.paymentNote}</span>
                        )}
                        {!isArchived && (
                          <button
                            type="button"
                            onClick={() => onOpenPaymentModal(log, log.paymentStatus)}
                            className="text-[#1D4ED8] hover:text-blue-800 font-medium cursor-pointer ml-1"
                          >
                            Edit Info Bayar
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Financial summary, Status Switcher & Actions */}
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3.5 shrink-0">
                    <div className="text-left lg:text-right tabular-nums">
                      {log.shippingCost > 0 && (
                        <div className="text-[11px] text-slate-500 font-mono">
                          Termasuk ongkir: +{log.invoiceSnapshot.currency}{' '}
                          {formatAmount(log.shippingCost, log.invoiceSnapshot.numberFormat)}
                        </div>
                      )}
                      {log.appliedDeposit > 0 && (
                        <div className="text-[11px] text-emerald-700 font-mono">
                          Potong deposit: -{log.invoiceSnapshot.currency}{' '}
                          {formatAmount(log.appliedDeposit, log.invoiceSnapshot.numberFormat)}
                        </div>
                      )}
                      <div className="text-[11px] text-slate-500">
                        {log.appliedDeposit > 0 ? 'Sisa Pembayaran' : 'Total Tagihan'}
                      </div>
                      <div
                        className={`text-sm font-bold font-mono ${
                          log.paymentStatus === 'cancelled'
                            ? 'text-slate-400 line-through'
                            : 'text-slate-900'
                        }`}
                      >
                        {log.invoiceSnapshot.currency}{' '}
                        {formatAmount(log.netPayable, log.invoiceSnapshot.numberFormat)}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      {/* Quick Sales Assignment if unassigned */}
                      {!isArchived && !log.salesName && (
                        <select
                          aria-label="Pilih Sales"
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
                          className="px-2 py-1.5 text-xs rounded-md border border-slate-300 bg-white text-slate-700 cursor-pointer"
                        >
                          <option value="">Set Sales...</option>
                          {SALES_REP_OPTIONS.map((rep) => (
                            <option key={rep} value={rep}>
                              {rep}
                            </option>
                          ))}
                        </select>
                      )}

                      {/* Status Pembayaran Dropdown */}
                      <select
                        aria-label="Status Pembayaran"
                        value={log.paymentStatus}
                        disabled={isBusy || isArchived}
                        onChange={async (e) => {
                          const next = e.target.value as InvoicePaymentStatus;
                          if (next === 'paid') {
                            onOpenPaymentModal(log, 'paid');
                            return;
                          }
                          setBusyLogId(log.id);
                          try {
                            await onUpdatePaymentStatus(log, next);
                          } finally {
                            setBusyLogId(null);
                          }
                        }}
                        className={`px-2.5 py-1.5 text-xs font-semibold rounded-md border transition-colors cursor-pointer disabled:opacity-60 focus:outline-none ${
                          PAYMENT_SELECT_CLASSES[log.paymentStatus]
                        }`}
                      >
                        <option value="pending">Pending</option>
                        <option value="paid">Lunas</option>
                        <option value="cancelled">Cancel</option>
                      </select>

                      {!isArchived && !paidDateFormatted && !log.paymentNote && (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => onOpenPaymentModal(log, log.paymentStatus)}
                          title="Catat tanggal bayar atau catatan follow-up"
                          className="p-1.5 text-slate-500 hover:text-slate-900 rounded border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-50 transition-colors cursor-pointer"
                        >
                          <CalendarCheck2 className="w-3.5 h-3.5" />
                        </button>
                      )}

                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => handleOpenPreview(log)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors cursor-pointer whitespace-nowrap"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        Lihat
                      </button>

                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => handleRestoreToEditor(log)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors cursor-pointer whitespace-nowrap"
                      >
                        <FileUp className="w-3.5 h-3.5" />
                        Muat
                      </button>

                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void handleOpenWa(log)}
                        title="Buat pesan WhatsApp siap kirim"
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md border border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 disabled:opacity-50 transition-colors cursor-pointer whitespace-nowrap"
                      >
                        <MessageCircle className="w-3.5 h-3.5" />
                        WA
                      </button>

                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => handleDownloadPdf(log)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50 transition-colors cursor-pointer whitespace-nowrap"
                      >
                        <Download className="w-3.5 h-3.5" />
                        PDF
                      </button>

                      {!isArchived && (
                        <button
                          type="button"
                          disabled={isBusy}
                          title="Arsipkan log"
                          onClick={() => void onArchiveLog(log)}
                          className="p-1.5 text-slate-400 hover:text-amber-700 rounded hover:bg-amber-50 disabled:opacity-50 transition-colors cursor-pointer"
                        >
                          <Archive className="w-3.5 h-3.5" />
                        </button>
                      )}

                      {isConfirmingDelete ? (
                        <div className="inline-flex items-center gap-1 pl-1">
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={async () => {
                              setBusyLogId(log.id);
                              try {
                                await onDeleteLog(log);
                                setConfirmDeleteId(null);
                              } finally {
                                setBusyLogId(null);
                              }
                            }}
                            className="px-2 py-1 text-[11px] font-medium rounded bg-red-600 text-white hover:bg-red-700 cursor-pointer"
                          >
                            Hapus
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(null)}
                            className="px-2 py-1 text-[11px] font-medium rounded border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 cursor-pointer"
                          >
                            Batal
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          disabled={isBusy}
                          title="Hapus permanen"
                          onClick={() => setConfirmDeleteId(log.id)}
                          className="p-1.5 text-slate-400 hover:text-red-600 rounded hover:bg-red-50 disabled:opacity-50 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal Pratinjau A4 dari Log */}
      {previewState && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex flex-col">
          <div className="bg-white border-b border-slate-200 px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="text-sm font-bold text-slate-900 truncate">
                Pratinjau Log: {previewState.log.invoiceSnapshot.buyerName || 'Proforma Invoice'}
              </div>
              <div className="text-xs text-slate-500">
                Sales: {previewState.log.salesName || 'Belum Ditentukan'} ·{' '}
                {previewState.log.invoiceSnapshot.invoiceNumber || 'Tanpa Nomor'} ·{' '}
                {previewState.log.invoiceSnapshot.cityDate}
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => void handleOpenWa(previewState.log, previewState.items)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 transition-colors cursor-pointer whitespace-nowrap"
              >
                <MessageCircle className="w-3.5 h-3.5" />
                Pesan WA
              </button>
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
