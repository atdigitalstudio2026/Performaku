import React, { useMemo, useState } from 'react';
import { User } from 'firebase/auth';
import {
  Archive,
  Download,
  Eye,
  FileUp,
  History,
  LogIn,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import {
  CompanyProfile,
  DocumentFooter,
  InvoiceItem,
  InvoiceLogAction,
  InvoiceLogRecord,
  ProformaInvoiceData,
} from '../types/invoice';
import { formatAmount, formatWeight } from '../utils/formatters';
import { InvoicePreview } from './InvoicePreview';

interface InvoiceLogsViewProps {
  user: User | null;
  authReady: boolean;
  logs: InvoiceLogRecord[];
  loadingLogs: boolean;
  logsError: string;
  isAdmin: boolean;
  onSignIn: () => void;
  onSaveCurrentToLog: () => Promise<void>;
  onFetchLogItems: (logId: string) => Promise<InvoiceItem[]>;
  onLoadLogToEditor: (
    invoice: ProformaInvoiceData,
    company: CompanyProfile,
    footer: DocumentFooter
  ) => void;
  onDownloadLogPdf: (
    log: InvoiceLogRecord,
    items: InvoiceItem[]
  ) => Promise<void>;
  onArchiveLog: (logId: string) => Promise<void>;
  onDeleteLog: (logId: string) => Promise<void>;
}

const ACTION_LABELS: Record<InvoiceLogAction, string> = {
  pdf_export: 'Unduh PDF',
  manual_save: 'Simpan Log',
  print: 'Cetak',
  restored: 'Dibuka Ulang',
};

export const InvoiceLogsView: React.FC<InvoiceLogsViewProps> = ({
  user,
  authReady,
  logs,
  loadingLogs,
  logsError,
  isAdmin,
  onSignIn,
  onSaveCurrentToLog,
  onFetchLogItems,
  onLoadLogToEditor,
  onDownloadLogPdf,
  onArchiveLog,
  onDeleteLog,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | InvoiceLogAction | 'archived'>('all');
  const [busyLogId, setBusyLogId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [isSavingCurrent, setIsSavingCurrent] = useState(false);

  const [previewState, setPreviewState] = useState<{
    log: InvoiceLogRecord;
    items: InvoiceItem[];
  } | null>(null);

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

      if (!q) return true;
      const hay = [
        log.invoiceSnapshot.buyerName,
        log.invoiceSnapshot.invoiceNumber,
        log.sellerName,
        log.invoiceSnapshot.cityDate,
        log.ownerEmail,
        log.ownerName,
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [logs, searchQuery, filterMode]);

  const buildFullInvoice = (log: InvoiceLogRecord, items: InvoiceItem[]): ProformaInvoiceData => ({
    ...log.invoiceSnapshot,
    items,
  });

  const handleOpenPreview = async (log: InvoiceLogRecord) => {
    setBusyLogId(log.id);
    try {
      const items = await onFetchLogItems(log.id);
      setPreviewState({ log, items });
    } finally {
      setBusyLogId(null);
    }
  };

  const handleRestoreToEditor = async (log: InvoiceLogRecord, cachedItems?: InvoiceItem[]) => {
    setBusyLogId(log.id);
    try {
      const items = cachedItems ?? (await onFetchLogItems(log.id));
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
      const items = cachedItems ?? (await onFetchLogItems(log.id));
      await onDownloadLogPdf(log, items);
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

  if (!authReady) {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-8 py-12">
        <div className="bg-white border border-slate-200 rounded-lg p-8 text-center text-sm text-slate-600">
          Memeriksa koneksi Firebase...
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-8 py-12">
        <div className="bg-white border border-slate-200 rounded-lg p-8 text-center">
          <div className="w-10 h-10 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center mx-auto mb-3">
            <History className="w-5 h-5" />
          </div>
          <h1 className="text-lg font-bold text-slate-900">
            Log Proforma Invoice Terhubung ke Firebase
          </h1>
          <p className="text-sm text-slate-600 mt-1.5 max-w-md mx-auto leading-relaxed">
            Masuk dengan akun Google untuk mencatat otomatis setiap Proforma Invoice yang dibuat,
            dicetak, atau diunduh ke database Firebase agar bisa dibuka kembali kapan saja.
          </p>
          <button
            type="button"
            onClick={onSignIn}
            className="mt-5 inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-md bg-[#1D4ED8] text-white hover:bg-blue-800 transition-colors cursor-pointer"
          >
            <LogIn className="w-4 h-4" />
            Masuk dengan Google
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-8 py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-bold text-slate-900">Log Proforma Invoice</h1>
            {isAdmin && (
              <span className="text-[11px] font-medium text-[#1D4ED8] border border-blue-200 bg-blue-50 px-2 py-0.5 rounded">
                Akses Admin
              </span>
            )}
          </div>
          <p className="text-sm text-slate-600 mt-1">
            Catatan permanen di Firebase untuk setiap Proforma Invoice yang pernah dibuat atau diekspor.
          </p>
        </div>

        <button
          type="button"
          onClick={handleSaveCurrent}
          disabled={isSavingCurrent}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-md bg-[#1D4ED8] text-white hover:bg-blue-800 disabled:opacity-60 transition-colors cursor-pointer whitespace-nowrap shrink-0"
        >
          <History className="w-3.5 h-3.5" />
          {isSavingCurrent ? 'Menyimpan...' : 'Catat Invoice Aktif ke Log'}
        </button>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-white border border-slate-200 rounded-lg p-3.5 mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari nama pembeli, nomor invoice, penjual, atau pembuat..."
            className="w-full pl-9 pr-3 py-2 text-sm rounded-md border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20 focus:border-[#1D4ED8]"
          />
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <select
            value={filterMode}
            onChange={(e) =>
              setFilterMode(e.target.value as 'all' | InvoiceLogAction | 'archived')
            }
            className="px-3 py-2 text-xs font-medium rounded-md border border-slate-300 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20 focus:border-[#1D4ED8]"
          >
            <option value="all">Semua Log Aktif</option>
            <option value="pdf_export">Aktivitas: Unduh PDF</option>
            <option value="manual_save">Aktivitas: Simpan Log</option>
            <option value="print">Aktivitas: Cetak</option>
            <option value="archived">Arsip Log</option>
          </select>

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
        {loadingLogs ? (
          <div className="p-10 text-center text-sm text-slate-500">
            Memuat data log dari Firebase...
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-sm font-medium text-slate-800">
              {logs.length === 0 ? 'Belum ada log Proforma Invoice' : 'Tidak ada log yang cocok'}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              {logs.length === 0
                ? 'Saat Anda mengunduh PDF, mencetak, atau menekan "Catat Invoice Aktif ke Log", datanya akan tercatat otomatis di sini.'
                : 'Coba ubah kata kunci pencarian atau filter aktivitas.'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-200">
            {filteredLogs.map((log) => {
              const isBusy = busyLogId === log.id;
              const isConfirmingDelete = confirmDeleteId === log.id;
              const dateStr = new Date(log.createdAtMs).toLocaleString('id-ID', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              });

              return (
                <div
                  key={log.id}
                  className="p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4 hover:bg-slate-50/70 transition-colors"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                      <span className="text-sm font-semibold text-slate-900">
                        {log.invoiceSnapshot.buyerName || 'Tanpa Nama Pembeli'}
                      </span>
                      {log.invoiceSnapshot.showInvoiceNumber &&
                        log.invoiceSnapshot.invoiceNumber.trim() && (
                          <span className="text-xs font-mono text-slate-700 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded">
                            {log.invoiceSnapshot.invoiceNumber}
                          </span>
                        )}
                      <span className="text-xs text-slate-500">
                        · {ACTION_LABELS[log.actionType] || log.actionType}
                      </span>
                      {log.status === 'archived' && (
                        <span className="text-[11px] font-medium text-slate-500 border border-slate-300 px-1.5 py-0.5 rounded">
                          Diarsipkan
                        </span>
                      )}
                    </div>

                    <div className="text-xs text-slate-600 flex flex-wrap items-center gap-x-2 gap-y-0.5 tabular-nums">
                      <span className="font-medium text-slate-800">{log.sellerName || '-'}</span>
                      <span className="text-slate-300">·</span>
                      <span>{log.invoiceSnapshot.cityDate || '-'}</span>
                      <span className="text-slate-300">·</span>
                      <span>{log.itemCount} barang</span>
                      <span className="text-slate-300">·</span>
                      <span>{formatWeight(log.totalWeightKg, log.invoiceSnapshot.numberFormat)} kg</span>
                      <span className="text-slate-300">·</span>
                      <span>
                        Rek. {log.invoiceSnapshot.bankAccount.bankShortName}{' '}
                        {log.invoiceSnapshot.bankAccount.accountNumber}
                      </span>
                    </div>

                    <div className="text-[11px] text-slate-500 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="tabular-nums">Tercatat {dateStr}</span>
                      <span className="text-slate-300">·</span>
                      <span>Oleh {log.ownerEmail || log.ownerName}</span>
                    </div>
                  </div>

                  {/* Financial summary & Actions */}
                  <div className="flex flex-col sm:flex-row sm:items-center gap-4 shrink-0">
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
                      <div className="text-sm font-bold text-slate-900 font-mono">
                        {log.invoiceSnapshot.currency}{' '}
                        {formatAmount(log.netPayable, log.invoiceSnapshot.numberFormat)}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
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
                        onClick={() => handleDownloadPdf(log)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50 transition-colors cursor-pointer whitespace-nowrap"
                      >
                        <Download className="w-3.5 h-3.5" />
                        PDF
                      </button>

                      {log.status !== 'archived' && (
                        <button
                          type="button"
                          disabled={isBusy}
                          title="Arsipkan log"
                          onClick={() => void onArchiveLog(log.id)}
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
                                await onDeleteLog(log.id);
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

      {/* Modal Pratinjau A4 dari Log Firebase */}
      {previewState && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex flex-col">
          <div className="bg-white border-b border-slate-200 px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="text-sm font-bold text-slate-900 truncate">
                Pratinjau Log: {previewState.log.invoiceSnapshot.buyerName || 'Proforma Invoice'}
              </div>
              <div className="text-xs text-slate-500">
                {previewState.log.invoiceSnapshot.invoiceNumber || 'Tanpa Nomor'} ·{' '}
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
