import { useEffect, useRef, useState } from 'react';
import {
  Download,
  Eye,
  History,
  PenLine,
  Printer,
  RotateCcw,
  Save,
} from 'lucide-react';
import { BankAccountsView } from './components/BankAccountsView';
import { InvoiceEditor } from './components/InvoiceEditor';
import { InvoiceLogsView } from './components/InvoiceLogsView';
import { InvoicePreview } from './components/InvoicePreview';
import { SalesPerformanceView } from './components/SalesPerformanceView';
import { SavedDraftsView } from './components/SavedDraftsView';
import {
  DEFAULT_BANK_ACCOUNTS,
  DEFAULT_COMPANY_PROFILE,
  DEFAULT_DOCUMENT_FOOTER,
  DEFAULT_INVOICE_DATA,
  SALES_REP_OPTIONS,
} from './data/defaultInvoice';
import {
  archiveInvoiceLog,
  createInvoiceLog,
  deleteCloudBankAccount,
  deleteInvoiceLog,
  fetchInvoiceLogItems,
  saveCloudBankAccount,
  subscribeCloudBankAccounts,
  subscribeInvoiceLogs,
  updateCloudBankAccount,
  updateInvoiceLogAction,
  updateInvoicePaymentStatus,
  updateInvoiceSalesName,
} from './services/invoiceLogService';
import {
  BankAccount,
  CompanyProfile,
  DocumentFooter,
  InvoiceItem,
  InvoiceLogAction,
  InvoiceLogRecord,
  InvoicePaymentStatus,
  ProformaInvoiceData,
  SavedInvoiceDraft,
} from './types/invoice';
import { calculateInvoiceTotals, formatTodayCityDate } from './utils/formatters';
import { downloadProformaInvoicePdf } from './utils/generatePdf';

type ActiveTab = 'editor' | 'logs' | 'sales' | 'banks' | 'drafts';
type MobilePane = 'edit' | 'preview';

const STORAGE_KEYS = {
  company: 'proformaku_company_v4',
  footer: 'proformaku_footer_v1',
  invoice: 'proformaku_active_invoice_v2',
  banks: 'proformaku_saved_banks_v2',
  drafts: 'proformaku_saved_drafts_v1',
  localLogs: 'proformaku_invoice_logs_local_v1',
  adminName: 'proformaku_admin_name_v1',
};

function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

const LEGACY_EXINDO_LOGO = '/assets/aistudio/Exindo_logo_jpg_b93bc77a.jpg';
const NEW_EXINDO_LOGO = '/assets/aistudio/Exindo_logo_png_disesuaikan_a98b1909.png';

function normalizeLogoUrl(url?: string): string {
  if (!url) return '';
  return url === LEGACY_EXINDO_LOGO ? NEW_EXINDO_LOGO : url;
}

const PAYMENT_STATUS_NOTICE: Record<InvoicePaymentStatus, string> = {
  paid: 'Lunas (masuk ke data penjualan sales)',
  pending: 'Pending (menunggu pembayaran)',
  cancelled: 'Cancel (dibatalkan)',
};

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('editor');
  const [mobilePane, setMobilePane] = useState<MobilePane>('edit');
  const [previewScale, setPreviewScale] = useState<number>(0.85);
  const [isExporting, setIsExporting] = useState(false);
  const [notice, setNotice] = useState<string>('');

  // Shared Firebase Log & Bank State (no login required)
  const [adminName, setAdminName] = useState<string>(() =>
    loadFromStorage<string>(STORAGE_KEYS.adminName, '')
  );
  const [cloudLogs, setCloudLogs] = useState<InvoiceLogRecord[]>([]);
  const [localLogs, setLocalLogs] = useState<InvoiceLogRecord[]>(() =>
    loadFromStorage<InvoiceLogRecord[]>(STORAGE_KEYS.localLogs, []).map((l) => ({
      ...l,
      salesName: l.salesName ?? l.invoiceSnapshot?.salesName ?? '',
      paymentStatus: l.paymentStatus ?? 'pending',
      storageSource: 'local' as const,
    }))
  );
  const [loadingLogs, setLoadingLogs] = useState(true);
  const [logsError, setLogsError] = useState('');
  const [cloudBanks, setCloudBanks] = useState<BankAccount[]>([]);

  const [company, setCompany] = useState<CompanyProfile>(() => {
    const loaded = {
      ...DEFAULT_COMPANY_PROFILE,
      ...loadFromStorage(STORAGE_KEYS.company, DEFAULT_COMPANY_PROFILE),
    };
    return {
      ...loaded,
      logoDataUrl: normalizeLogoUrl(loaded.logoDataUrl),
    };
  });
  const [footer, setFooter] = useState<DocumentFooter>(() => ({
    ...DEFAULT_DOCUMENT_FOOTER,
    ...loadFromStorage(STORAGE_KEYS.footer, DEFAULT_DOCUMENT_FOOTER),
  }));
  const [invoice, setInvoice] = useState<ProformaInvoiceData>(() => {
    const loaded = {
      ...DEFAULT_INVOICE_DATA,
      ...loadFromStorage(STORAGE_KEYS.invoice, DEFAULT_INVOICE_DATA),
    };
    return {
      ...loaded,
      cityDate: formatTodayCityDate(loaded.cityDate),
      salesName:
        loaded.salesName !== undefined ? loaded.salesName : SALES_REP_OPTIONS[0],
      showBestRegards:
        loaded.showBestRegards !== undefined ? loaded.showBestRegards : true,
    };
  });
  const [localBanks, setLocalBanks] = useState<BankAccount[]>(() =>
    loadFromStorage(STORAGE_KEYS.banks, DEFAULT_BANK_ACCOUNTS)
  );
  const [savedDrafts, setSavedDrafts] = useState<SavedInvoiceDraft[]>(() =>
    loadFromStorage(STORAGE_KEYS.drafts, [])
  );

  const autoMigratedRef = useRef(false);

  // Persist local editor state & admin label
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.adminName, JSON.stringify(adminName));
    } catch {
      // Ignore storage quota errors
    }
  }, [adminName]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.localLogs, JSON.stringify(localLogs));
    } catch {
      // Ignore storage quota errors
    }
  }, [localLogs]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.company, JSON.stringify(company));
    } catch {
      // Ignore storage quota errors
    }
  }, [company]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.footer, JSON.stringify(footer));
    } catch {
      // Ignore storage quota errors
    }
  }, [footer]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.invoice, JSON.stringify(invoice));
    } catch {
      // Ignore storage quota errors
    }
  }, [invoice]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.banks, JSON.stringify(localBanks));
    } catch {
      // Ignore storage quota errors
    }
  }, [localBanks]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.drafts, JSON.stringify(savedDrafts));
    } catch {
      // Ignore storage quota errors
    }
  }, [savedDrafts]);

  // Direct real-time Firestore subscriptions for unified shared team data
  useEffect(() => {
    setLoadingLogs(true);
    setLogsError('');

    const unsubLogs = subscribeInvoiceLogs(
      (records) => {
        setCloudLogs(records);
        setLogsError('');
        setLoadingLogs(false);
      },
      (err) => {
        setLogsError(err.message || 'Gagal memuat log bersama dari Firebase.');
        setLoadingLogs(false);
      }
    );

    const unsubBanks = subscribeCloudBankAccounts(
      (banks) => {
        setCloudBanks(banks);
      },
      () => {
        // Non-fatal fallback to local banks
      }
    );

    return () => {
      unsubLogs();
      unsubBanks();
    };
  }, []);

  // Automatically upload any legacy/offline local logs into the unified Firebase database
  useEffect(() => {
    if (autoMigratedRef.current || loadingLogs || logsError || localLogs.length === 0) return;
    autoMigratedRef.current = true;

    const migrate = async () => {
      const remaining: InvoiceLogRecord[] = [];
      let migrated = 0;
      for (const log of localLogs) {
        try {
          const fullInvoice: ProformaInvoiceData = {
            ...DEFAULT_INVOICE_DATA,
            ...log.invoiceSnapshot,
            salesName: log.salesName || log.invoiceSnapshot.salesName || '',
            items: log.localItems || [],
          };
          await createInvoiceLog(
            log.ownerName || adminName || 'Tim Admin',
            fullInvoice,
            log.companySnapshot,
            log.footerSnapshot,
            log.actionType,
            log.paymentStatus || 'pending'
          );
          migrated += 1;
        } catch {
          remaining.push(log);
        }
      }
      if (migrated > 0) {
        setLocalLogs(remaining);
      }
    };

    void migrate();
  }, [loadingLogs, logsError, localLogs, adminName]);

  const savedBanks: BankAccount[] = (() => {
    const merged = [...localBanks];
    for (const cb of cloudBanks) {
      const idx = merged.findIndex((b) => b.id === cb.id);
      if (idx >= 0) {
        merged[idx] = cb;
      } else {
        merged.push(cb);
      }
    }
    return merged;
  })();

  const showNotice = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(''), 3400);
  };

  const combinedLogs: InvoiceLogRecord[] = [...cloudLogs, ...localLogs].sort(
    (a, b) => b.createdAtMs - a.createdAtMs
  );

  const buildLocalLogEntry = (actionType: InvoiceLogAction): InvoiceLogRecord => {
    const totals = calculateInvoiceTotals(invoice);
    const now = Date.now();
    const { items, ...restSnapshot } = JSON.parse(
      JSON.stringify(invoice)
    ) as ProformaInvoiceData;
    const cleanedSales = (invoice.salesName || '').trim();
    return {
      id: `local_log_${now}_${Math.random().toString(36).slice(2, 6)}`,
      ownerId: 'shared_team',
      ownerEmail: '',
      ownerName: adminName.trim() || 'Tim Admin',
      actionType,
      status: 'active',
      salesName: cleanedSales,
      paymentStatus: 'pending',
      createdAtMs: now,
      updatedAtMs: now,
      itemCount: items.length,
      totalWeightKg: totals.totalWeightKg,
      subtotal: totals.subtotal,
      ppnAmount: totals.ppnAmount,
      shippingCost: totals.shippingCost,
      grandTotal: totals.grandTotal,
      appliedDeposit: totals.appliedDeposit,
      netPayable: totals.netPayable,
      sellerName: company.name || '-',
      invoiceSnapshot: restSnapshot,
      companySnapshot: JSON.parse(JSON.stringify(company)) as CompanyProfile,
      footerSnapshot: JSON.parse(JSON.stringify(footer)) as DocumentFooter,
      storageSource: 'local',
      localItems: items,
    };
  };

  const recordLogShared = async (
    actionType: InvoiceLogAction
  ): Promise<'firebase' | 'local'> => {
    try {
      await createInvoiceLog(
        adminName.trim() || 'Tim Admin',
        invoice,
        company,
        footer,
        actionType,
        'pending'
      );
      return 'firebase';
    } catch {
      const localEntry = buildLocalLogEntry(actionType);
      setLocalLogs((prev) => [localEntry, ...prev].slice(0, 150));
      return 'local';
    }
  };

  const handleSyncLocalLogsToFirebase = async () => {
    if (localLogs.length === 0) return;
    let syncedCount = 0;
    const remaining: InvoiceLogRecord[] = [];
    for (const log of localLogs) {
      try {
        const fullInvoice: ProformaInvoiceData = {
          ...DEFAULT_INVOICE_DATA,
          ...log.invoiceSnapshot,
          salesName: log.salesName || log.invoiceSnapshot.salesName || '',
          items: log.localItems || [],
        };
        await createInvoiceLog(
          log.ownerName || adminName.trim() || 'Tim Admin',
          fullInvoice,
          log.companySnapshot,
          log.footerSnapshot,
          log.actionType,
          log.paymentStatus || 'pending'
        );
        syncedCount += 1;
      } catch {
        remaining.push(log);
      }
    }
    setLocalLogs(remaining);
    if (syncedCount > 0) {
      showNotice(`${syncedCount} log berhasil disinkronkan ke database bersama Firebase.`);
    } else {
      showNotice('Gagal mengunggah log ke Firebase. Periksa koneksi internet.');
    }
  };

  const handleUpdatePaymentStatus = async (
    log: InvoiceLogRecord,
    nextStatus: InvoicePaymentStatus
  ) => {
    if (log.storageSource === 'local') {
      setLocalLogs((prev) =>
        prev.map((item) =>
          item.id === log.id
            ? { ...item, paymentStatus: nextStatus, updatedAtMs: Date.now() }
            : item
        )
      );
      showNotice(`Status diubah ke ${PAYMENT_STATUS_NOTICE[nextStatus]}.`);
      return;
    }

    await updateInvoicePaymentStatus(log.id, nextStatus);
    showNotice(`Status invoice diubah ke ${PAYMENT_STATUS_NOTICE[nextStatus]}.`);
  };

  const handleUpdateSalesName = async (log: InvoiceLogRecord, nextSalesName: string) => {
    if (log.storageSource === 'local') {
      setLocalLogs((prev) =>
        prev.map((item) =>
          item.id === log.id
            ? {
                ...item,
                salesName: nextSalesName,
                invoiceSnapshot: { ...item.invoiceSnapshot, salesName: nextSalesName },
                updatedAtMs: Date.now(),
              }
            : item
        )
      );
      showNotice(`Sales invoice ditetapkan ke ${nextSalesName}.`);
      return;
    }

    await updateInvoiceSalesName(log.id, nextSalesName);
    showNotice(`Sales invoice ditetapkan ke ${nextSalesName}.`);
  };

  const handleDownloadPdf = async () => {
    if (isExporting) return;
    setIsExporting(true);
    try {
      const filename = await downloadProformaInvoicePdf(invoice, company, footer);
      const savedTo = await recordLogShared('pdf_export');
      const salesInfo = invoice.salesName ? ` (Sales: ${invoice.salesName})` : '';
      showNotice(
        savedTo === 'firebase'
          ? `PDF diunduh & tercatat ke Log Firebase${salesInfo}: ${filename}`
          : `PDF diunduh & disimpan sementara di browser: ${filename}`
      );
    } catch {
      showNotice('Gagal membuat PDF. Periksa kembali logo atau data invoice.');
    } finally {
      setIsExporting(false);
    }
  };

  const handlePrint = async () => {
    window.print();
    await recordLogShared('print');
  };

  const handleSaveToCloudLog = async () => {
    const savedTo = await recordLogShared('manual_save');
    const salesInfo = invoice.salesName ? ` untuk sales ${invoice.salesName}` : '';
    showNotice(
      savedTo === 'firebase'
        ? `Proforma Invoice berhasil dicatat ke Log Firebase${salesInfo} (Status: Pending).`
        : 'Koneksi sedang terganggu; invoice disimpan sementara di browser.'
    );
  };

  const handleSaveDraft = () => {
    const draft: SavedInvoiceDraft = {
      id: `draft-${Date.now()}`,
      savedAt: new Date().toISOString(),
      data: JSON.parse(JSON.stringify(invoice)) as ProformaInvoiceData,
    };
    setSavedDrafts((prev) => [draft, ...prev]);
    showNotice('Draft invoice berhasil disimpan di browser.');
  };

  const handleResetExample = () => {
    setInvoice({
      ...DEFAULT_INVOICE_DATA,
      cityDate: formatTodayCityDate(),
    });
    setCompany((prev) => ({
      ...DEFAULT_COMPANY_PROFILE,
      logoDataUrl: prev.logoDataUrl || DEFAULT_COMPANY_PROFILE.logoDataUrl,
    }));
    setFooter(DEFAULT_DOCUMENT_FOOTER);
    showNotice('Data dikembalikan ke contoh awal.');
  };

  const handleAddBankPreset = (bank: BankAccount) => {
    setLocalBanks((prev) => {
      const exists = prev.some(
        (b) =>
          b.accountNumber.trim() === bank.accountNumber.trim() &&
          b.bankShortName.trim().toLowerCase() === bank.bankShortName.trim().toLowerCase()
      );
      if (exists) return prev;
      return [...prev, bank];
    });
    void saveCloudBankAccount(bank).catch(() => {});
    showNotice(`Rekening ${bank.bankShortName} ditambahkan ke daftar bersama.`);
  };

  const handleUpdateBank = (updated: BankAccount) => {
    setLocalBanks((prev) => prev.map((b) => (b.id === updated.id ? updated : b)));
    if (cloudBanks.some((b) => b.id === updated.id)) {
      void updateCloudBankAccount(updated).catch(() => {});
    } else {
      void saveCloudBankAccount(updated).catch(() => {});
    }
    if (invoice.bankAccount.id === updated.id) {
      setInvoice((prev) => ({ ...prev, bankAccount: updated }));
    }
    showNotice('Data rekening bersama diperbarui.');
  };

  const handleDeleteBank = (id: string) => {
    setLocalBanks((prev) => prev.filter((b) => b.id !== id));
    if (cloudBanks.some((b) => b.id === id)) {
      void deleteCloudBankAccount(id).catch(() => {});
    }
    showNotice('Rekening dihapus dari daftar.');
  };

  const handleUseBank = (bank: BankAccount) => {
    setInvoice((prev) => ({ ...prev, bankAccount: { ...bank } }));
    setActiveTab('editor');
    showNotice(`Rekening aktif diganti ke ${bank.bankShortName} (${bank.accountNumber}).`);
  };

  const handleFetchLogItems = async (log: InvoiceLogRecord): Promise<InvoiceItem[]> => {
    if (log.storageSource === 'local') {
      return log.localItems || [];
    }
    return fetchInvoiceLogItems(log.id);
  };

  const handleLoadLogToEditor = (
    restoredInvoice: ProformaInvoiceData,
    restoredCompany: CompanyProfile,
    restoredFooter: DocumentFooter
  ) => {
    setInvoice({ ...DEFAULT_INVOICE_DATA, ...restoredInvoice });
    setCompany((prev) => ({
      ...DEFAULT_COMPANY_PROFILE,
      ...restoredCompany,
      logoDataUrl: normalizeLogoUrl(restoredCompany.logoDataUrl || prev.logoDataUrl),
    }));
    setFooter({ ...DEFAULT_DOCUMENT_FOOTER, ...restoredFooter });
    setActiveTab('editor');
    showNotice('Data Proforma Invoice dari log dimuat ke editor.');
  };

  const handleDownloadLogPdf = async (log: InvoiceLogRecord, items: InvoiceItem[]) => {
    const fullInvoice: ProformaInvoiceData = {
      ...DEFAULT_INVOICE_DATA,
      ...log.invoiceSnapshot,
      salesName: log.salesName,
      showBestRegards: Boolean(log.salesName),
      items,
    };
    const filename = await downloadProformaInvoicePdf(
      fullInvoice,
      log.companySnapshot,
      log.footerSnapshot
    );
    if (log.storageSource === 'local') {
      setLocalLogs((prev) =>
        prev.map((item) =>
          item.id === log.id
            ? { ...item, actionType: 'pdf_export', updatedAtMs: Date.now() }
            : item
        )
      );
    } else if (log.status !== 'archived') {
      try {
        await updateInvoiceLogAction(log.id, 'pdf_export');
      } catch {
        // Non-fatal
      }
    }
    showNotice(`PDF diunduh dari log: ${filename}`);
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#F4F5F7] text-[#0F172A]">
      {/* Top Bar Contract: 3 zones */}
      <header className="no-print sticky top-0 z-30 bg-white border-b border-slate-200 px-4 sm:px-6 h-[60px] flex items-center justify-between gap-4 sm:gap-6">
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            setActiveTab('editor');
          }}
          className="font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
        >
          ProformaKu
        </a>

        <nav className="flex items-center gap-4 sm:gap-6 text-xs sm:text-sm font-medium overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab('editor')}
            className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'editor'
                ? 'border-[#1D4ED8] text-slate-900'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            Editor Invoice
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('logs')}
            className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'logs'
                ? 'border-[#1D4ED8] text-slate-900'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            Log Invoice ({combinedLogs.filter((l) => l.status !== 'archived').length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('sales')}
            className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'sales'
                ? 'border-[#1D4ED8] text-slate-900'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            Performa Sales
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('banks')}
            className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'banks'
                ? 'border-[#1D4ED8] text-slate-900'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            Daftar Rekening
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('drafts')}
            className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'drafts'
                ? 'border-[#1D4ED8] text-slate-900'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            Draft Lokal ({savedDrafts.length})
          </button>
        </nav>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleDownloadPdf}
            disabled={isExporting}
            className="inline-flex items-center gap-2 px-3.5 sm:px-4 py-2 text-xs sm:text-sm font-medium rounded-md bg-[#1D4ED8] text-white hover:bg-blue-800 disabled:opacity-60 transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <Download className="w-4 h-4" />
            {isExporting ? 'Memproses...' : 'Unduh PDF'}
          </button>
        </div>
      </header>

      {/* Non-intrusive toast feedback */}
      {notice && (
        <div
          role="status"
          className="no-print fixed bottom-5 right-5 z-50 bg-slate-900 text-white text-xs font-medium px-4 py-2.5 rounded-md shadow-lg"
        >
          {notice}
        </div>
      )}

      {/* Main Content */}
      {activeTab === 'editor' && (
        <main className="flex-1 flex flex-col lg:flex-row">
          {/* Mobile Pane Switcher */}
          <div className="no-print lg:hidden bg-white border-b border-slate-200 px-4 py-2 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setMobilePane('edit')}
              className={`flex-1 inline-flex items-center justify-center gap-1.5 py-2 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                mobilePane === 'edit'
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-700'
              }`}
            >
              <PenLine className="w-3.5 h-3.5" />
              Isi Data Invoice
            </button>
            <button
              type="button"
              onClick={() => setMobilePane('preview')}
              className={`flex-1 inline-flex items-center justify-center gap-1.5 py-2 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                mobilePane === 'preview'
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-700'
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              Pratinjau Dokumen
            </button>
          </div>

          {/* Left Pane: Form Editor */}
          <aside
            className={`no-print w-full lg:w-[490px] xl:w-[520px] shrink-0 border-r border-slate-200 bg-white lg:h-[calc(100vh-60px)] lg:overflow-y-auto ${
              mobilePane === 'edit' ? 'block' : 'hidden lg:block'
            }`}
          >
            <InvoiceEditor
              invoice={invoice}
              company={company}
              footer={footer}
              savedBanks={savedBanks}
              onChangeInvoice={setInvoice}
              onChangeCompany={setCompany}
              onChangeFooter={setFooter}
              onSaveBankPreset={handleAddBankPreset}
            />
          </aside>

          {/* Right Pane: Live A4 Preview Studio */}
          <section
            className={`flex-1 flex flex-col bg-[#E8EAEE] lg:h-[calc(100vh-60px)] ${
              mobilePane === 'preview' ? 'block' : 'hidden lg:flex'
            }`}
          >
            {/* Preview Workspace Toolbar */}
            <div className="no-print bg-white border-b border-slate-200 px-4 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-slate-600 mr-1">Zoom A4:</span>
                {[0.65, 0.85, 1].map((z) => (
                  <button
                    key={z}
                    type="button"
                    onClick={() => setPreviewScale(z)}
                    className={`px-2.5 py-1 text-xs font-mono rounded transition-colors cursor-pointer whitespace-nowrap ${
                      previewScale === z
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    {Math.round(z * 100)}%
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleSaveToCloudLog}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded border border-blue-200 bg-blue-50/70 text-[#1D4ED8] hover:bg-blue-100/70 transition-colors cursor-pointer whitespace-nowrap"
                >
                  <History className="w-3.5 h-3.5" />
                  Simpan ke Log
                </button>
                <button
                  type="button"
                  onClick={handleSaveDraft}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer whitespace-nowrap"
                >
                  <Save className="w-3.5 h-3.5" />
                  Draft Lokal
                </button>
                <button
                  type="button"
                  onClick={handleResetExample}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer whitespace-nowrap"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Contoh Awal
                </button>
                <button
                  type="button"
                  onClick={handlePrint}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer whitespace-nowrap"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Cetak
                </button>
              </div>
            </div>

            {/* Scrollable Paper Canvas */}
            <div className="flex-1 overflow-auto p-4 sm:p-8 flex justify-center items-start">
              <InvoicePreview
                invoice={invoice}
                company={company}
                footer={footer}
                scale={previewScale}
              />
            </div>
          </section>
        </main>
      )}

      {activeTab === 'logs' && (
        <main className="flex-1">
          <InvoiceLogsView
            adminName={adminName}
            onChangeAdminName={setAdminName}
            logs={combinedLogs}
            localOnlyCount={localLogs.length}
            loadingLogs={loadingLogs}
            logsError={logsError}
            onSyncLocalLogs={handleSyncLocalLogsToFirebase}
            onSaveCurrentToLog={handleSaveToCloudLog}
            onUpdatePaymentStatus={handleUpdatePaymentStatus}
            onUpdateSalesName={handleUpdateSalesName}
            onFetchLogItems={handleFetchLogItems}
            onLoadLogToEditor={handleLoadLogToEditor}
            onDownloadLogPdf={handleDownloadLogPdf}
            onArchiveLog={async (log) => {
              if (log.storageSource === 'local') {
                setLocalLogs((prev) =>
                  prev.map((item) =>
                    item.id === log.id
                      ? { ...item, status: 'archived', updatedAtMs: Date.now() }
                      : item
                  )
                );
              } else {
                await archiveInvoiceLog(log.id);
              }
              showNotice('Log dipindahkan ke arsip.');
            }}
            onDeleteLog={async (log) => {
              if (log.storageSource === 'local') {
                setLocalLogs((prev) => prev.filter((item) => item.id !== log.id));
                showNotice('Log lokal dihapus permanen.');
                return;
              }
              await deleteInvoiceLog(log.id);
              showNotice('Log dihapus permanen dari database bersama Firebase.');
            }}
          />
        </main>
      )}

      {activeTab === 'sales' && (
        <main className="flex-1">
          <SalesPerformanceView
            logs={combinedLogs}
            loadingLogs={loadingLogs}
            onUpdatePaymentStatus={handleUpdatePaymentStatus}
            onUpdateSalesName={handleUpdateSalesName}
            onFetchLogItems={handleFetchLogItems}
            onLoadLogToEditor={handleLoadLogToEditor}
            onDownloadLogPdf={handleDownloadLogPdf}
          />
        </main>
      )}

      {activeTab === 'banks' && (
        <main className="flex-1">
          <BankAccountsView
            banks={savedBanks}
            activeBankId={invoice.bankAccount.id}
            onAddBank={handleAddBankPreset}
            onUpdateBank={handleUpdateBank}
            onDeleteBank={handleDeleteBank}
            onUseBank={handleUseBank}
          />
        </main>
      )}

      {activeTab === 'drafts' && (
        <main className="flex-1">
          <SavedDraftsView
            drafts={savedDrafts}
            company={company}
            onSaveCurrentDraft={handleSaveDraft}
            onLoadDraft={(draft) => {
              setInvoice({
                ...DEFAULT_INVOICE_DATA,
                ...(JSON.parse(JSON.stringify(draft.data)) as ProformaInvoiceData),
              });
              setActiveTab('editor');
              showNotice('Draft lokal dimuat ke editor.');
            }}
            onDeleteDraft={(id) => {
              setSavedDrafts((prev) => prev.filter((d) => d.id !== id));
              showNotice('Draft lokal dihapus.');
            }}
            onDownloadDraftPdf={async (draft) => {
              try {
                const filename = await downloadProformaInvoicePdf(draft.data, company, footer);
                showNotice(`PDF diunduh: ${filename}`);
              } catch {
                showNotice('Gagal mengunduh PDF draft.');
              }
            }}
          />
        </main>
      )}
    </div>
  );
}
