import { useEffect, useRef, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import {
  Cloud,
  Download,
  Eye,
  History,
  LogIn,
  LogOut,
  PenLine,
  Printer,
  RotateCcw,
  Save,
} from 'lucide-react';
import { BankAccountsView } from './components/BankAccountsView';
import { InvoiceEditor } from './components/InvoiceEditor';
import { InvoiceLogsView } from './components/InvoiceLogsView';
import { InvoicePreview } from './components/InvoicePreview';
import { SavedDraftsView } from './components/SavedDraftsView';
import {
  DEFAULT_BANK_ACCOUNTS,
  DEFAULT_COMPANY_PROFILE,
  DEFAULT_DOCUMENT_FOOTER,
  DEFAULT_INVOICE_DATA,
} from './data/defaultInvoice';
import { auth, signInWithGoogle, signOutUser } from './firebase';
import {
  archiveInvoiceLog,
  createInvoiceLog,
  deleteCloudBankAccount,
  deleteInvoiceLog,
  fetchInvoiceLogItems,
  isAdminUser,
  loadCloudUserSettings,
  saveCloudBankAccount,
  saveCloudUserSettings,
  subscribeCloudBankAccounts,
  subscribeInvoiceLogs,
  updateCloudBankAccount,
  updateInvoiceLogAction,
} from './services/invoiceLogService';
import {
  BankAccount,
  CompanyProfile,
  DocumentFooter,
  InvoiceItem,
  InvoiceLogRecord,
  ProformaInvoiceData,
  SavedInvoiceDraft,
} from './types/invoice';
import { downloadProformaInvoicePdf } from './utils/generatePdf';

type ActiveTab = 'editor' | 'logs' | 'banks' | 'drafts';
type MobilePane = 'edit' | 'preview';

const STORAGE_KEYS = {
  company: 'proformaku_company_v4',
  footer: 'proformaku_footer_v1',
  invoice: 'proformaku_active_invoice_v2',
  banks: 'proformaku_saved_banks_v2',
  drafts: 'proformaku_saved_drafts_v1',
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

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('editor');
  const [mobilePane, setMobilePane] = useState<MobilePane>('edit');
  const [previewScale, setPreviewScale] = useState<number>(0.85);
  const [isExporting, setIsExporting] = useState(false);
  const [notice, setNotice] = useState<string>('');

  // Firebase Auth & Cloud Log State
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [logs, setLogs] = useState<InvoiceLogRecord[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
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
  const [invoice, setInvoice] = useState<ProformaInvoiceData>(() => ({
    ...DEFAULT_INVOICE_DATA,
    ...loadFromStorage(STORAGE_KEYS.invoice, DEFAULT_INVOICE_DATA),
  }));
  const [localBanks, setLocalBanks] = useState<BankAccount[]>(() =>
    loadFromStorage(STORAGE_KEYS.banks, DEFAULT_BANK_ACCOUNTS)
  );
  const [savedDrafts, setSavedDrafts] = useState<SavedInvoiceDraft[]>(() =>
    loadFromStorage(STORAGE_KEYS.drafts, [])
  );

  const cloudSettingsLoadedRef = useRef(false);

  // Persist locally
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

  // Firebase Auth listener & real-time Firestore subscriptions
  useEffect(() => {
    let unsubLogs: (() => void) | null = null;
    let unsubBanks: (() => void) | null = null;

    const unsubAuth = onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser);
      setAuthReady(true);

      if (unsubLogs) {
        unsubLogs();
        unsubLogs = null;
      }
      if (unsubBanks) {
        unsubBanks();
        unsubBanks = null;
      }

      if (!nextUser) {
        setLogs([]);
        setCloudBanks([]);
        setLogsError('');
        setLoadingLogs(false);
        cloudSettingsLoadedRef.current = false;
        return;
      }

      setLoadingLogs(true);
      setLogsError('');

      unsubLogs = subscribeInvoiceLogs(
        nextUser,
        (records) => {
          setLogs(records);
          setLoadingLogs(false);
        },
        (err) => {
          setLogsError(err.message || 'Gagal memuat log dari Firebase.');
          setLoadingLogs(false);
        }
      );

      unsubBanks = subscribeCloudBankAccounts(
        nextUser,
        (banks) => {
          setCloudBanks(banks);
        },
        () => {
          // Non-fatal fallback to local banks
        }
      );

      try {
        const cloudSettings = await loadCloudUserSettings(nextUser);
        if (cloudSettings?.company) {
          setCompany((prev) => ({
            ...prev,
            ...cloudSettings.company,
            logoDataUrl: normalizeLogoUrl(
              cloudSettings.company?.logoDataUrl || prev.logoDataUrl
            ),
          }));
        }
        if (cloudSettings?.footer) {
          setFooter((prev) => ({ ...prev, ...cloudSettings.footer }));
        }
      } catch {
        // Keep local settings if cloud preference fails
      } finally {
        cloudSettingsLoadedRef.current = true;
      }
    });

    return () => {
      unsubAuth();
      if (unsubLogs) unsubLogs();
      if (unsubBanks) unsubBanks();
    };
  }, []);

  // Debounced sync of company & footer preferences to Firestore
  useEffect(() => {
    if (!user || !user.emailVerified || !cloudSettingsLoadedRef.current) return;
    const timer = setTimeout(() => {
      void saveCloudUserSettings(user, company, footer).catch(() => {
        // Silent background preference sync
      });
    }, 1500);
    return () => clearTimeout(timer);
  }, [user, company, footer]);

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

  const handleSignIn = async () => {
    try {
      const cred = await signInWithGoogle();
      showNotice(`Terhubung ke Firebase sebagai ${cred.user.email || 'Admin'}.`);
    } catch {
      showNotice('Login Google dibatalkan atau gagal.');
    }
  };

  const handleSignOut = async () => {
    try {
      await signOutUser();
      showNotice('Keluar dari akun Firebase.');
    } catch {
      showNotice('Gagal keluar dari akun.');
    }
  };

  const handleDownloadPdf = async () => {
    if (isExporting) return;
    setIsExporting(true);
    try {
      const filename = await downloadProformaInvoicePdf(invoice, company, footer);
      if (user && user.emailVerified) {
        try {
          await createInvoiceLog(user, invoice, company, footer, 'pdf_export');
          showNotice(`PDF diunduh & tercatat ke log Firebase: ${filename}`);
        } catch {
          showNotice(`PDF diunduh: ${filename} (gagal mencatat log cloud)`);
        }
      } else {
        showNotice(`PDF diunduh: ${filename}`);
      }
    } catch {
      showNotice('Gagal membuat PDF. Periksa kembali logo atau data invoice.');
    } finally {
      setIsExporting(false);
    }
  };

  const handlePrint = async () => {
    window.print();
    if (user && user.emailVerified) {
      try {
        await createInvoiceLog(user, invoice, company, footer, 'print');
      } catch {
        // Ignore background log failure during print
      }
    }
  };

  const handleSaveToCloudLog = async () => {
    if (!user || !user.emailVerified) {
      showNotice('Silakan masuk dengan Google terlebih dahulu untuk menyimpan log ke Firebase.');
      return;
    }
    try {
      await createInvoiceLog(user, invoice, company, footer, 'manual_save');
      showNotice('Proforma Invoice berhasil dicatat ke Log Firebase.');
    } catch {
      showNotice('Gagal mencatat log ke Firebase.');
    }
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
    setInvoice(DEFAULT_INVOICE_DATA);
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
    if (user && user.emailVerified) {
      void saveCloudBankAccount(user, bank).catch(() => {});
    }
    showNotice(`Rekening ${bank.bankShortName} ditambahkan ke daftar.`);
  };

  const handleUpdateBank = (updated: BankAccount) => {
    setLocalBanks((prev) => prev.map((b) => (b.id === updated.id ? updated : b)));
    if (user && user.emailVerified && cloudBanks.some((b) => b.id === updated.id)) {
      void updateCloudBankAccount(updated).catch(() => {});
    }
    if (invoice.bankAccount.id === updated.id) {
      setInvoice((prev) => ({ ...prev, bankAccount: updated }));
    }
    showNotice('Data rekening diperbarui.');
  };

  const handleDeleteBank = (id: string) => {
    setLocalBanks((prev) => prev.filter((b) => b.id !== id));
    if (user && user.emailVerified && cloudBanks.some((b) => b.id === id)) {
      void deleteCloudBankAccount(id).catch(() => {});
    }
    showNotice('Rekening dihapus dari daftar.');
  };

  const handleUseBank = (bank: BankAccount) => {
    setInvoice((prev) => ({ ...prev, bankAccount: { ...bank } }));
    setActiveTab('editor');
    showNotice(`Rekening aktif diganti ke ${bank.bankShortName} (${bank.accountNumber}).`);
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
            className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer inline-flex items-center gap-1.5 ${
              activeTab === 'logs'
                ? 'border-[#1D4ED8] text-slate-900'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <span>Log Invoice{user ? ` (${logs.filter((l) => l.status !== 'archived').length})` : ''}</span>
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
          {authReady && (
            user ? (
              <div className="hidden md:flex items-center gap-2 pr-2 border-r border-slate-200">
                <Cloud className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span className="text-xs text-slate-700 max-w-[140px] truncate">
                  {user.email}
                </span>
                <button
                  type="button"
                  onClick={handleSignOut}
                  title="Keluar akun Firebase"
                  className="p-1.5 text-slate-500 hover:text-slate-900 rounded hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleSignIn}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Masuk Firebase</span>
              </button>
            )
          )}

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
            user={user}
            authReady={authReady}
            logs={logs}
            loadingLogs={loadingLogs}
            logsError={logsError}
            isAdmin={isAdminUser(user)}
            onSignIn={handleSignIn}
            onSaveCurrentToLog={handleSaveToCloudLog}
            onFetchLogItems={async (logId) => {
              if (!user) return [];
              return fetchInvoiceLogItems(user, logId);
            }}
            onLoadLogToEditor={(restoredInvoice, restoredCompany, restoredFooter) => {
              setInvoice({ ...DEFAULT_INVOICE_DATA, ...restoredInvoice });
              setCompany((prev) => ({
                ...DEFAULT_COMPANY_PROFILE,
                ...restoredCompany,
                logoDataUrl: normalizeLogoUrl(restoredCompany.logoDataUrl || prev.logoDataUrl),
              }));
              setFooter({ ...DEFAULT_DOCUMENT_FOOTER, ...restoredFooter });
              setActiveTab('editor');
              showNotice('Data Proforma Invoice dari log dimuat ke editor.');
            }}
            onDownloadLogPdf={async (log, items: InvoiceItem[]) => {
              const fullInvoice: ProformaInvoiceData = {
                ...DEFAULT_INVOICE_DATA,
                ...log.invoiceSnapshot,
                items,
              };
              const filename = await downloadProformaInvoicePdf(
                fullInvoice,
                log.companySnapshot,
                log.footerSnapshot
              );
              try {
                await updateInvoiceLogAction(log.id, 'pdf_export');
              } catch {
                // Non-fatal if user is viewing read-only
              }
              showNotice(`PDF diunduh dari log: ${filename}`);
            }}
            onArchiveLog={async (logId) => {
              await archiveInvoiceLog(logId);
              showNotice('Log dipindahkan ke arsip.');
            }}
            onDeleteLog={async (logId) => {
              if (!user) return;
              await deleteInvoiceLog(user, logId);
              showNotice('Log dihapus permanen dari Firebase.');
            }}
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
