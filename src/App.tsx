import { useEffect, useState } from 'react';
import { Download, Eye, PenLine, Printer, RotateCcw, Save } from 'lucide-react';
import { BankAccountsView } from './components/BankAccountsView';
import { InvoiceEditor } from './components/InvoiceEditor';
import { InvoicePreview } from './components/InvoicePreview';
import { SavedDraftsView } from './components/SavedDraftsView';
import {
  DEFAULT_BANK_ACCOUNTS,
  DEFAULT_COMPANY_PROFILE,
  DEFAULT_DOCUMENT_FOOTER,
  DEFAULT_INVOICE_DATA,
} from './data/defaultInvoice';
import {
  BankAccount,
  CompanyProfile,
  DocumentFooter,
  ProformaInvoiceData,
  SavedInvoiceDraft,
} from './types/invoice';
import { downloadProformaInvoicePdf } from './utils/generatePdf';

type ActiveTab = 'editor' | 'banks' | 'drafts';
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

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('editor');
  const [mobilePane, setMobilePane] = useState<MobilePane>('edit');
  const [previewScale, setPreviewScale] = useState<number>(0.85);
  const [isExporting, setIsExporting] = useState(false);
  const [notice, setNotice] = useState<string>('');

  const [company, setCompany] = useState<CompanyProfile>(() => ({
    ...DEFAULT_COMPANY_PROFILE,
    ...loadFromStorage(STORAGE_KEYS.company, DEFAULT_COMPANY_PROFILE),
  }));
  const [footer, setFooter] = useState<DocumentFooter>(() => ({
    ...DEFAULT_DOCUMENT_FOOTER,
    ...loadFromStorage(STORAGE_KEYS.footer, DEFAULT_DOCUMENT_FOOTER),
  }));
  const [invoice, setInvoice] = useState<ProformaInvoiceData>(() => ({
    ...DEFAULT_INVOICE_DATA,
    ...loadFromStorage(STORAGE_KEYS.invoice, DEFAULT_INVOICE_DATA),
  }));
  const [savedBanks, setSavedBanks] = useState<BankAccount[]>(() =>
    loadFromStorage(STORAGE_KEYS.banks, DEFAULT_BANK_ACCOUNTS)
  );
  const [savedDrafts, setSavedDrafts] = useState<SavedInvoiceDraft[]>(() =>
    loadFromStorage(STORAGE_KEYS.drafts, [])
  );

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.company, JSON.stringify(company));
    } catch {
      // Ignore storage quota errors cleanly
    }
  }, [company]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.footer, JSON.stringify(footer));
    } catch {
      // Ignore storage quota errors cleanly
    }
  }, [footer]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.invoice, JSON.stringify(invoice));
    } catch {
      // Ignore storage quota errors cleanly
    }
  }, [invoice]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.banks, JSON.stringify(savedBanks));
    } catch {
      // Ignore storage quota errors cleanly
    }
  }, [savedBanks]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.drafts, JSON.stringify(savedDrafts));
    } catch {
      // Ignore storage quota errors cleanly
    }
  }, [savedDrafts]);

  const showNotice = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(''), 3200);
  };

  const handleDownloadPdf = async () => {
    if (isExporting) return;
    setIsExporting(true);
    try {
      const filename = await downloadProformaInvoicePdf(invoice, company, footer);
      showNotice(`PDF diunduh: ${filename}`);
    } catch {
      showNotice('Gagal membuat PDF. Periksa kembali logo atau data invoice.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleSaveDraft = () => {
    const draft: SavedInvoiceDraft = {
      id: `draft-${Date.now()}`,
      savedAt: new Date().toISOString(),
      data: JSON.parse(JSON.stringify(invoice)) as ProformaInvoiceData,
    };
    setSavedDrafts((prev) => [draft, ...prev]);
    showNotice('Draft invoice berhasil disimpan.');
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
    setSavedBanks((prev) => {
      const exists = prev.some(
        (b) =>
          b.accountNumber.trim() === bank.accountNumber.trim() &&
          b.bankShortName.trim().toLowerCase() === bank.bankShortName.trim().toLowerCase()
      );
      if (exists) return prev;
      return [...prev, bank];
    });
    showNotice(`Rekening ${bank.bankShortName} ditambahkan ke daftar.`);
  };

  const handleUpdateBank = (updated: BankAccount) => {
    setSavedBanks((prev) => prev.map((b) => (b.id === updated.id ? updated : b)));
    if (invoice.bankAccount.id === updated.id) {
      setInvoice((prev) => ({ ...prev, bankAccount: updated }));
    }
    showNotice('Data rekening diperbarui.');
  };

  const handleDeleteBank = (id: string) => {
    setSavedBanks((prev) => prev.filter((b) => b.id !== id));
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
      <header className="no-print sticky top-0 z-30 bg-white border-b border-slate-200 px-4 sm:px-6 h-[60px] flex items-center justify-between gap-4 sm:gap-8">
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

        <nav className="flex items-center gap-5 sm:gap-7 text-sm font-medium overflow-x-auto">
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
            Riwayat Draft ({savedDrafts.length})
          </button>
        </nav>

        <div className="shrink-0">
          <button
            type="button"
            onClick={handleDownloadPdf}
            disabled={isExporting}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs sm:text-sm font-medium rounded-md bg-[#1D4ED8] text-white hover:bg-blue-800 disabled:opacity-60 transition-colors cursor-pointer whitespace-nowrap shrink-0"
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

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSaveDraft}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer whitespace-nowrap"
                >
                  <Save className="w-3.5 h-3.5" />
                  Simpan Draft
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
                  onClick={() => window.print()}
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
              setInvoice(JSON.parse(JSON.stringify(draft.data)) as ProformaInvoiceData);
              setActiveTab('editor');
              showNotice('Draft dimuat ke editor.');
            }}
            onDeleteDraft={(id) => {
              setSavedDrafts((prev) => prev.filter((d) => d.id !== id));
              showNotice('Draft dihapus.');
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
