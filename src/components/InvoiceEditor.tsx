import React, { useRef, useState } from 'react';
import {
  Building2,
  CreditCard,
  FileText,
  ImagePlus,
  Package,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react';
import {
  COMPANY_LOGO_PRESETS,
  CompanyLogoPreset,
  DEFAULT_BANK_ACCOUNTS,
  SALES_REP_OPTIONS,
  TABLE_HEADER_COLOR_PRESETS,
} from '../data/defaultInvoice';
import {
  BankAccount,
  CompanyProfile,
  DocumentFooter,
  InvoiceItem,
  PpnMode,
  PriceBasis,
  ProformaInvoiceData,
} from '../types/invoice';
import {
  calculateInvoiceTotals,
  calculateItemMetrics,
  formatAmount,
  formatTodayCityDate,
  formatWeight,
  readFileAsDataUrl,
} from '../utils/formatters';

interface InvoiceEditorProps {
  invoice: ProformaInvoiceData;
  company: CompanyProfile;
  footer: DocumentFooter;
  savedBanks: BankAccount[];
  activeCompanyCode: string;
  nextInvoiceNumberPreview: string;
  isDuplicateNumber: boolean;
  isCurrentNumberReserved: boolean;
  isGeneratingNumber: boolean;
  onChangeInvoice: (next: ProformaInvoiceData) => void;
  onChangeCompany: (next: CompanyProfile) => void;
  onChangeFooter: (next: DocumentFooter) => void;
  onSaveBankPreset: (bank: BankAccount) => void;
  onSelectCompanyPreset: (preset: CompanyLogoPreset) => void;
  onGenerateNextNumber: () => Promise<void>;
}

export const InvoiceEditor: React.FC<InvoiceEditorProps> = ({
  invoice,
  company,
  footer,
  savedBanks,
  activeCompanyCode,
  nextInvoiceNumberPreview,
  isDuplicateNumber,
  isCurrentNumberReserved,
  isGeneratingNumber,
  onChangeInvoice,
  onChangeCompany,
  onChangeFooter,
  onSaveBankPreset,
  onSelectCompanyPreset,
  onGenerateNextNumber,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showColumnSettings, setShowColumnSettings] = useState(false);
  const [logoError, setLogoError] = useState('');
  const [bankSavedNotice, setBankSavedNotice] = useState(false);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoError('');

    if (!file.type.startsWith('image/')) {
      setLogoError('Pilih file gambar (PNG, JPG, atau SVG).');
      return;
    }

    if (file.size > 3 * 1024 * 1024) {
      setLogoError('Ukuran logo maksimal 3 MB.');
      return;
    }

    try {
      const dataUrl = await readFileAsDataUrl(file);
      onChangeCompany({ ...company, logoDataUrl: dataUrl });
    } catch {
      setLogoError('Gagal membaca file logo. Coba file lain.');
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const updateItem = (id: string, patch: Partial<InvoiceItem>) => {
    onChangeInvoice({
      ...invoice,
      items: invoice.items.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    });
  };

  const addItem = () => {
    const newItem: InvoiceItem = {
      id: `item-${Date.now()}`,
      namaBarang: '',
      orderUnit: 'Sak',
      weightPerUnit: 10,
      harga: 0,
      priceBasis: 'per_kg',
      qty: 1,
    };
    onChangeInvoice({
      ...invoice,
      items: [...invoice.items, newItem],
    });
  };

  const removeItem = (id: string) => {
    onChangeInvoice({
      ...invoice,
      items: invoice.items.filter((item) => item.id !== id),
    });
  };

  const updateBankField = (patch: Partial<BankAccount>) => {
    onChangeInvoice({
      ...invoice,
      bankAccount: { ...invoice.bankAccount, ...patch },
    });
  };

  const handleSelectSavedBank = (bankId: string) => {
    const found = savedBanks.find((b) => b.id === bankId);
    if (found) {
      onChangeInvoice({
        ...invoice,
        bankAccount: { ...found },
      });
    }
  };

  const handleSaveCurrentBank = () => {
    const newPreset: BankAccount = {
      ...invoice.bankAccount,
      id: `bank-${Date.now()}`,
    };
    onSaveBankPreset(newPreset);
    onChangeInvoice({
      ...invoice,
      bankAccount: newPreset,
    });
    setBankSavedNotice(true);
    setTimeout(() => setBankSavedNotice(false), 2200);
  };

  const handlePpnModeChange = (mode: PpnMode) => {
    const nextTaxLabel =
      mode === 'include' ? 'Inc PPN' : mode === 'exclude_add' ? 'Exc PPN' : 'Non PPN';
    onChangeInvoice({
      ...invoice,
      ppnMode: mode,
      taxLabel: nextTaxLabel,
    });
  };

  const {
    subtotal,
    totalWeightKg,
    ppnRate,
    ppnAmount,
    shippingCost,
    grandTotal,
    depositAmount,
    appliedDeposit,
    remainingDeposit,
    netPayable,
    isExcludeAdd,
  } = calculateInvoiceTotals(invoice);
  const activePpnMode: PpnMode = invoice.ppnMode ?? 'include';

  return (
    <div className="divide-y divide-slate-200 bg-white">
      {/* 1. Kop Surat & Logo Perusahaan */}
      <section className="p-5 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2 text-slate-900">
            <Building2 className="w-4 h-4 text-slate-500" />
            <h2 className="text-sm font-semibold tracking-tight">Kop Surat &amp; Identitas Penjual</h2>
          </div>
          {company.logoDataUrl && (
            <button
              type="button"
              onClick={() => onChangeCompany({ ...company, logoDataUrl: '' })}
              className="text-xs font-medium text-slate-500 hover:text-red-600 transition-colors cursor-pointer"
            >
              Hapus Logo
            </button>
          )}
        </div>

        {/* Pilihan Logo Tersimpan (4 Perusahaan) */}
        <div className="mb-3.5">
          <div className="text-xs font-medium text-slate-700 mb-2">Pilih Logo Perusahaan</div>
          <div className="grid grid-cols-2 gap-2">
            {COMPANY_LOGO_PRESETS.map((preset: CompanyLogoPreset) => {
              const isSelected = company.logoDataUrl === preset.logoUrl;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => onSelectCompanyPreset(preset)}
                  className={`p-2 rounded-lg border text-left transition-colors cursor-pointer bg-white ${
                    isSelected
                      ? 'border-[#1D4ED8] ring-2 ring-[#1D4ED8]/20'
                      : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/70'
                  }`}
                >
                  <div className="h-12 w-full flex items-center justify-center bg-white rounded overflow-hidden p-1">
                    <img
                      src={preset.logoUrl}
                      alt={preset.companyName}
                      referrerPolicy="no-referrer"
                      className="max-h-full max-w-full object-contain"
                    />
                  </div>
                  <div className="mt-1.5 text-[11px] font-medium text-slate-800 truncate text-center">
                    {preset.companyName}
                  </div>
                  <div className="text-[10px] font-mono text-slate-500 text-center">
                    Kode: {preset.code}
                  </div>
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-slate-500 mt-1.5">
            Memilih logo perusahaan akan otomatis menyesuaikan nama penjual, rekening BCA, dan kode penomoran invoice PT terkait.
          </p>
        </div>

        {/* Upload Logo Kustom Area */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-4 p-3 rounded-lg border border-slate-200 bg-slate-50/70">
          <div className="w-24 h-14 rounded-md border border-slate-200 bg-white flex items-center justify-center overflow-hidden shrink-0 p-1.5">
            {company.logoDataUrl ? (
              <img
                src={company.logoDataUrl}
                alt="Preview Logo Kop Surat"
                referrerPolicy="no-referrer"
                className="max-w-full max-h-full object-contain"
              />
            ) : (
              <span className="text-[11px] text-slate-400 text-center leading-tight">
                Tanpa Logo
              </span>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              onChange={handleLogoUpload}
              className="hidden"
            />
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer whitespace-nowrap"
              >
                <ImagePlus className="w-3.5 h-3.5" />
                Unggah Logo Lain
              </button>
              {!COMPANY_LOGO_PRESETS.some((p) => p.logoUrl === company.logoDataUrl) && (
                <button
                  type="button"
                  onClick={() =>
                    onChangeCompany({
                      ...company,
                      logoDataUrl: COMPANY_LOGO_PRESETS[0].logoUrl,
                      logoWidthMm: COMPANY_LOGO_PRESETS[0].recommendedWidthMm,
                      name: COMPANY_LOGO_PRESETS[0].companyName,
                    })
                  }
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md text-slate-600 hover:text-slate-900 hover:bg-slate-200/60 transition-colors cursor-pointer whitespace-nowrap"
                >
                  <RotateCcw className="w-3 h-3" />
                  Kembali ke Default
                </button>
              )}
            </div>
            <p className="text-[11px] text-slate-500 mt-1.5">
              Posisi pojok kiri atas sebagai kop surat (PNG, JPG, atau SVG, maks. 3 MB).
            </p>
            {logoError && <p className="text-[11px] text-red-600 mt-1">{logoError}</p>}
          </div>
        </div>

        {company.logoDataUrl && (
          <div className="mb-4 p-3 rounded-lg border border-slate-200 bg-white space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-slate-700">Ukuran Logo di Kop Surat</span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() =>
                    onChangeCompany({
                      ...company,
                      logoWidthMm: Math.max(10, (company.logoWidthMm || 16) - 2),
                    })
                  }
                  title="Perkecil 2 mm"
                  className="w-6 h-6 rounded border border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100 text-xs font-semibold cursor-pointer"
                >
                  -
                </button>
                <div className="flex items-center border border-slate-300 rounded bg-white px-1.5 py-0.5">
                  <input
                    type="number"
                    min={10}
                    max={115}
                    value={company.logoWidthMm}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      if (!Number.isFinite(val)) return;
                      onChangeCompany({
                        ...company,
                        logoWidthMm: Math.min(115, Math.max(10, Math.round(val))),
                      });
                    }}
                    className="w-10 text-xs font-mono tabular-nums text-right text-slate-900 focus:outline-none"
                  />
                  <span className="text-[11px] text-slate-500 ml-1">mm</span>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    onChangeCompany({
                      ...company,
                      logoWidthMm: Math.min(115, (company.logoWidthMm || 16) + 2),
                    })
                  }
                  title="Perbesar 2 mm"
                  className="w-6 h-6 rounded border border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100 text-xs font-semibold cursor-pointer"
                >
                  +
                </button>
              </div>
            </div>

            <input
              type="range"
              min={10}
              max={115}
              value={Math.min(115, Math.max(10, company.logoWidthMm || 16))}
              onChange={(e) => onChangeCompany({ ...company, logoWidthMm: Number(e.target.value) })}
              className="w-full accent-[#1D4ED8] cursor-pointer"
            />

            <div className="flex items-center justify-between gap-1.5 pt-0.5">
              {[
                { label: 'Kecil', width: 20 },
                { label: 'Sedang', width: 32 },
                { label: 'Besar', width: 48 },
                { label: 'Ekstra', width: 70 },
              ].map((opt) => (
                <button
                  key={opt.label}
                  type="button"
                  onClick={() => onChangeCompany({ ...company, logoWidthMm: opt.width })}
                  className={`flex-1 py-1 text-[11px] font-medium rounded border transition-colors cursor-pointer ${
                    company.logoWidthMm === opt.width
                      ? 'border-[#1D4ED8] bg-blue-50 text-[#1D4ED8]'
                      : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {opt.label} ({opt.width}mm)
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Nama Perusahaan (Penjual)
            </label>
            <input
              type="text"
              value={company.name}
              onChange={(e) => onChangeCompany({ ...company, name: e.target.value })}
              placeholder="PT. Sumber Roso Agromakmur"
              className="w-full px-3 py-2 text-sm rounded-md border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20 focus:border-[#1D4ED8]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Alamat Baris 1</label>
            <input
              type="text"
              value={company.addressLine1}
              onChange={(e) => onChangeCompany({ ...company, addressLine1: e.target.value })}
              placeholder="Jl.Raya Bekasi Timur No.136"
              className="w-full px-3 py-2 text-sm rounded-md border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20 focus:border-[#1D4ED8]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Alamat Baris 2</label>
            <input
              type="text"
              value={company.addressLine2}
              onChange={(e) => onChangeCompany({ ...company, addressLine2: e.target.value })}
              placeholder="Jakarta Timur 13410"
              className="w-full px-3 py-2 text-sm rounded-md border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20 focus:border-[#1D4ED8]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Nomor Telepon</label>
            <input
              type="text"
              value={company.phone}
              onChange={(e) => onChangeCompany({ ...company, phone: e.target.value })}
              placeholder="Telp.021-8191908"
              className="w-full px-3 py-2 text-sm rounded-md border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20 focus:border-[#1D4ED8]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Email (Opsional)</label>
            <input
              type="text"
              value={company.email}
              onChange={(e) => onChangeCompany({ ...company, email: e.target.value })}
              placeholder="finance@perusahaan.co.id"
              className="w-full px-3 py-2 text-sm rounded-md border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20 focus:border-[#1D4ED8]"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-x-5 gap-y-2 pt-1">
          <label className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={company.showLetterheadInfo}
              onChange={(e) => onChangeCompany({ ...company, showLetterheadInfo: e.target.checked })}
              className="rounded border-slate-300 text-[#1D4ED8] focus:ring-[#1D4ED8]"
            />
            Tampilkan teks perusahaan di kop surat
          </label>
          <label className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={company.showLetterheadDivider}
              onChange={(e) => onChangeCompany({ ...company, showLetterheadDivider: e.target.checked })}
              className="rounded border-slate-300 text-[#1D4ED8] focus:ring-[#1D4ED8]"
            />
            Garis pemisah kop surat
          </label>
        </div>
      </section>

      {/* 2. Info Dokumen & Pembeli */}
      <section className="p-5 sm:p-6">
        <div className="flex items-center gap-2 text-slate-900 mb-4">
          <FileText className="w-4 h-4 text-slate-500" />
          <h2 className="text-sm font-semibold tracking-tight">Detail Dokumen &amp; Pembeli</h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Judul Dokumen</label>
            <input
              type="text"
              value={invoice.title}
              onChange={(e) => onChangeInvoice({ ...invoice, title: e.target.value })}
              placeholder="PROFORMA INVOICE"
              className="w-full px-3 py-2 text-sm rounded-md border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20 focus:border-[#1D4ED8]"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium text-slate-700">Kota &amp; Tanggal</label>
              <button
                type="button"
                onClick={() =>
                  onChangeInvoice({
                    ...invoice,
                    cityDate: formatTodayCityDate(invoice.cityDate),
                  })
                }
                className="text-[11px] font-medium text-[#1D4ED8] hover:text-blue-800 transition-colors cursor-pointer"
              >
                Hari Ini
              </button>
            </div>
            <input
              type="text"
              value={invoice.cityDate}
              onChange={(e) => onChangeInvoice({ ...invoice, cityDate: e.target.value })}
              placeholder={formatTodayCityDate()}
              className="w-full px-3 py-2 text-sm rounded-md border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20 focus:border-[#1D4ED8]"
            />
          </div>

          <div className="sm:col-span-2">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
              <div className="flex items-center gap-2">
                <label className="text-xs font-medium text-slate-700">
                  Nomor Proforma Invoice
                </label>
                <span className="text-[10px] font-mono font-semibold text-slate-600 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded">
                  PT: {activeCompanyCode}
                </span>
              </div>
              <label className="inline-flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={invoice.showInvoiceNumber}
                  onChange={(e) => onChangeInvoice({ ...invoice, showInvoiceNumber: e.target.checked })}
                  className="rounded border-slate-300 text-[#1D4ED8] focus:ring-[#1D4ED8]"
                />
                Tampilkan nomor
              </label>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={invoice.invoiceNumber}
                disabled={!invoice.showInvoiceNumber}
                onChange={(e) => onChangeInvoice({ ...invoice, invoiceNumber: e.target.value })}
                placeholder={nextInvoiceNumberPreview}
                className="flex-1 min-w-0 px-3 py-2 text-sm font-mono rounded-md border border-slate-300 bg-white disabled:bg-slate-100 disabled:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20 focus:border-[#1D4ED8]"
              />
              <button
                type="button"
                onClick={() => void onGenerateNextNumber()}
                disabled={isGeneratingNumber}
                title="Ambil nomor urut otomatis berikutnya dari database bersama untuk PT aktif"
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isGeneratingNumber ? 'animate-spin' : ''}`} />
                {isGeneratingNumber ? 'Mengambil...' : 'Nomor Berikutnya'}
              </button>
            </div>
            {invoice.showInvoiceNumber && isDuplicateNumber ? (
              <p className="text-[11px] text-amber-700 mt-1">
                Nomor ini sudah tercatat di log. Saat Unduh PDF atau Simpan ke Log akan otomatis dibuatkan nomor baru ({nextInvoiceNumberPreview}) agar tidak ganda.
              </p>
            ) : invoice.showInvoiceNumber && isCurrentNumberReserved ? (
              <p className="text-[11px] text-emerald-700 mt-1">
                Nomor unik sudah diamankan di database bersama Firebase untuk kode {activeCompanyCode}.
              </p>
            ) : (
              <p className="text-[11px] text-slate-500 mt-1">
                Otomatis berurutan per PT &amp; bulan · Urutan berikutnya:{' '}
                <span className="font-mono font-semibold text-slate-700">
                  {nextInvoiceNumberPreview}
                </span>
              </p>
            )}
          </div>

          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-slate-700 mb-1">Nama Pembeli</label>
            <input
              type="text"
              value={invoice.buyerName}
              onChange={(e) => onChangeInvoice({ ...invoice, buyerName: e.target.value })}
              placeholder="Ryuu Industry Indonesia"
              className="w-full px-3 py-2 text-sm rounded-md border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20 focus:border-[#1D4ED8]"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Alamat / Keterangan Pembeli (Opsional)
            </label>
            <textarea
              rows={2}
              value={invoice.buyerAddress}
              onChange={(e) => onChangeInvoice({ ...invoice, buyerAddress: e.target.value })}
              placeholder="Kosongkan jika hanya ingin menampilkan nama pembeli"
              className="w-full px-3 py-2 text-sm rounded-md border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20 focus:border-[#1D4ED8] resize-none"
            />
          </div>

          <div className="sm:col-span-2 pt-1">
            <div className="flex items-center justify-between gap-2 mb-1">
              <label className="text-xs font-medium text-slate-700">
                Nama Sales (Best regards,)
              </label>
              <label className="inline-flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={invoice.showBestRegards !== false}
                  onChange={(e) =>
                    onChangeInvoice({ ...invoice, showBestRegards: e.target.checked })
                  }
                  className="rounded border-slate-300 text-[#1D4ED8] focus:ring-[#1D4ED8]"
                />
                Tampilkan di kiri bawah invoice
              </label>
            </div>
            <select
              value={invoice.salesName || ''}
              onChange={(e) =>
                onChangeInvoice({
                  ...invoice,
                  salesName: e.target.value,
                  showBestRegards: e.target.value ? invoice.showBestRegards !== false : false,
                })
              }
              className="w-full px-3 py-2 text-sm font-medium rounded-md border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20 focus:border-[#1D4ED8]"
            >
              <option value="">-- Pilih Nama Sales --</option>
              {SALES_REP_OPTIONS.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-slate-500 mt-1">
              Otomatis tercetak di kiri bawah invoice (&ldquo;Best regards,&rdquo;) dan tercatat ke database performa penjualan sales tersebut saat invoice berstatus Lunas.
            </p>
          </div>
        </div>
      </section>

      {/* 3. Daftar Barang */}
      <section className="p-5 sm:p-6">
        <div className="flex items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-2 text-slate-900">
            <Package className="w-4 h-4 text-slate-500" />
            <h2 className="text-sm font-semibold tracking-tight">Daftar Barang</h2>
          </div>

          <button
            type="button"
            onClick={() => setShowColumnSettings((v) => !v)}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            {showColumnSettings ? 'Tutup Pengaturan Kolom' : 'Atur Kolom & Format'}
          </button>
        </div>

        {/* Pengaturan PPN / Non-PPN */}
        <div className="mb-4 p-3 rounded-lg border border-slate-200 bg-slate-50/70 space-y-2.5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <span className="text-xs font-medium text-slate-700">Status Pajak (PPN)</span>
            <div className="grid grid-cols-3 gap-1 p-1 bg-slate-200/70 rounded-md">
              <button
                type="button"
                onClick={() => handlePpnModeChange('include')}
                className={`px-2.5 py-1 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
                  activePpnMode === 'include'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Include PPN
              </button>
              <button
                type="button"
                onClick={() => handlePpnModeChange('exclude_add')}
                className={`px-2.5 py-1 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
                  activePpnMode === 'exclude_add'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                + Tambah PPN
              </button>
              <button
                type="button"
                onClick={() => handlePpnModeChange('non_ppn')}
                className={`px-2.5 py-1 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
                  activePpnMode === 'non_ppn'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Non PPN
              </button>
            </div>
          </div>

          {activePpnMode === 'exclude_add' && (
            <div className="flex items-center justify-between gap-3 pt-1 border-t border-slate-200">
              <span className="text-xs text-slate-600">
                Tarif PPN ditambahkan otomatis di bawah Subtotal
              </span>
              <div className="flex items-center gap-1.5 shrink-0">
                <input
                  type="number"
                  min={0}
                  max={100}
                  step="any"
                  value={ppnRate}
                  onChange={(e) =>
                    onChangeInvoice({
                      ...invoice,
                      ppnRate: Math.max(0, Number(e.target.value) || 0),
                    })
                  }
                  className="w-16 px-2 py-1 text-xs font-mono text-right rounded border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20 focus:border-[#1D4ED8]"
                />
                <span className="text-xs font-medium text-slate-700">%</span>
              </div>
            </div>
          )}

          {/* Warna Header Tabel */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200">
            <span className="text-xs font-medium text-slate-700">Warna Header Tabel</span>
            <div className="flex items-center gap-1.5">
              {TABLE_HEADER_COLOR_PRESETS.map((preset) => {
                const activeHex = (invoice.tableHeaderColor || '#1E293B').toUpperCase();
                const isSelected = activeHex === preset.hex.toUpperCase();
                return (
                  <button
                    key={preset.hex}
                    type="button"
                    title={preset.label}
                    aria-label={`Pilih warna header ${preset.label}`}
                    onClick={() => onChangeInvoice({ ...invoice, tableHeaderColor: preset.hex })}
                    className={`w-6 h-6 rounded border transition-transform cursor-pointer ${
                      isSelected
                        ? 'ring-2 ring-[#1D4ED8] ring-offset-1 scale-105 border-slate-400'
                        : 'border-slate-300 hover:scale-105'
                    }`}
                    style={{ backgroundColor: preset.hex }}
                  />
                );
              })}

              <label
                title="Pilih warna kustom"
                className="inline-flex items-center gap-1.5 pl-1.5 pr-2 py-1 rounded border border-slate-300 bg-white text-[11px] font-mono text-slate-700 cursor-pointer hover:bg-slate-50"
              >
                <input
                  type="color"
                  value={invoice.tableHeaderColor || '#1E293B'}
                  onChange={(e) =>
                    onChangeInvoice({ ...invoice, tableHeaderColor: e.target.value })
                  }
                  className="w-4 h-4 p-0 border-0 bg-transparent cursor-pointer"
                />
                <span>{(invoice.tableHeaderColor || '#1E293B').toUpperCase()}</span>
              </label>
            </div>
          </div>
        </div>

        {showColumnSettings && (
          <div className="mb-4 p-3.5 rounded-lg border border-slate-200 bg-slate-50 grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">Header Harga</label>
              <input
                type="text"
                value={invoice.priceHeader}
                onChange={(e) => onChangeInvoice({ ...invoice, priceHeader: e.target.value })}
                className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-300 bg-white"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">Sub-Label Pajak</label>
              <input
                type="text"
                value={invoice.taxLabel}
                onChange={(e) => onChangeInvoice({ ...invoice, taxLabel: e.target.value })}
                className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-300 bg-white"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">Satuan Qty</label>
              <input
                type="text"
                value={invoice.qtyUnit}
                onChange={(e) => onChangeInvoice({ ...invoice, qtyUnit: e.target.value })}
                className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-300 bg-white"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">Mata Uang</label>
              <input
                type="text"
                value={invoice.currency}
                onChange={(e) => onChangeInvoice({ ...invoice, currency: e.target.value })}
                className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-300 bg-white"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-[11px] font-medium text-slate-600 mb-1">Format Pemisah Ribuan</label>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => onChangeInvoice({ ...invoice, numberFormat: 'comma' })}
                  className={`px-2.5 py-1.5 text-xs font-mono rounded border transition-colors cursor-pointer ${
                    invoice.numberFormat === 'comma'
                      ? 'bg-[#1D4ED8] text-white border-[#1D4ED8]'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  1,180,000
                </button>
                <button
                  type="button"
                  onClick={() => onChangeInvoice({ ...invoice, numberFormat: 'dot' })}
                  className={`px-2.5 py-1.5 text-xs font-mono rounded border transition-colors cursor-pointer ${
                    invoice.numberFormat === 'dot'
                      ? 'bg-[#1D4ED8] text-white border-[#1D4ED8]'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  1.180.000
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-3">
          {invoice.items.map((item, idx) => {
            const m = calculateItemMetrics(item);
            const isKgOrder = m.orderUnit.toLowerCase() === 'kg';
            return (
              <div
                key={item.id}
                className="p-3 rounded-lg border border-slate-200 bg-slate-50/50 space-y-2.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-slate-600 tabular-nums">
                    Barang #{idx + 1} · Total Berat:{' '}
                    <span className="font-mono font-semibold text-slate-800">
                      {formatWeight(m.totalWeightKg, invoice.numberFormat)} kg
                    </span>
                  </span>
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-semibold text-slate-900 tabular-nums font-mono">
                      {invoice.currency} {formatAmount(m.lineTotal, invoice.numberFormat)}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeItem(item.id)}
                      disabled={invoice.items.length <= 1}
                      title="Hapus barang"
                      className="p-1 text-slate-400 hover:text-red-600 disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-12 gap-2">
                  <div className="col-span-12">
                    <label className="block text-[11px] font-medium text-slate-600 mb-1">
                      Nama Barang
                    </label>
                    <input
                      type="text"
                      value={item.namaBarang}
                      onChange={(e) => updateItem(item.id, { namaBarang: e.target.value })}
                      placeholder="Contoh: Wijen Hitam Akram 10kg"
                      className="w-full px-2.5 py-1.5 text-sm rounded border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20 focus:border-[#1D4ED8]"
                    />
                  </div>

                  <div className="col-span-4">
                    <label className="block text-[11px] font-medium text-slate-600 mb-1">
                      Qty Order
                    </label>
                    <input
                      type="number"
                      min={0}
                      step="any"
                      value={item.qty === 0 ? '' : item.qty}
                      onChange={(e) => updateItem(item.id, { qty: Number(e.target.value) || 0 })}
                      placeholder="2"
                      className="w-full px-2.5 py-1.5 text-sm font-mono tabular-nums rounded border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20 focus:border-[#1D4ED8]"
                    />
                  </div>

                  <div className="col-span-4">
                    <label className="block text-[11px] font-medium text-slate-600 mb-1">
                      Satuan Order
                    </label>
                    <select
                      value={m.orderUnit}
                      onChange={(e) => {
                        const nextUnit = e.target.value;
                        const nextIsKg = nextUnit.toLowerCase() === 'kg';
                        updateItem(item.id, {
                          orderUnit: nextUnit,
                          weightPerUnit: nextIsKg
                            ? 1
                            : m.weightPerUnit <= 1
                            ? 10
                            : m.weightPerUnit,
                          priceBasis: nextIsKg ? 'per_kg' : m.priceBasis,
                        });
                      }}
                      className="w-full px-2 py-1.5 text-sm rounded border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20 focus:border-[#1D4ED8]"
                    >
                      <option value="Kg">Kg</option>
                      <option value="Dus">Dus</option>
                      <option value="Sak">Sak</option>
                      <option value="Bal">Bal</option>
                      <option value="Karton">Karton</option>
                      <option value="Pail">Pail</option>
                      <option value="Pcs">Pcs</option>
                    </select>
                  </div>

                  <div className="col-span-4">
                    <label className="block text-[11px] font-medium text-slate-600 mb-1">
                      Berat / {m.orderUnit} (Kg)
                    </label>
                    <input
                      type="number"
                      min={0}
                      step="any"
                      disabled={isKgOrder}
                      value={isKgOrder ? 1 : item.weightPerUnit === 0 ? '' : item.weightPerUnit}
                      onChange={(e) =>
                        updateItem(item.id, { weightPerUnit: Number(e.target.value) || 0 })
                      }
                      placeholder="10"
                      className="w-full px-2.5 py-1.5 text-sm font-mono tabular-nums rounded border border-slate-300 bg-white disabled:bg-slate-100 disabled:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20 focus:border-[#1D4ED8]"
                    />
                  </div>

                  <div className="col-span-7">
                    <label className="block text-[11px] font-medium text-slate-600 mb-1">
                      Harga ({invoice.currency} / {m.priceUnitSuffix})
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={item.harga === 0 ? '' : item.harga}
                      onChange={(e) => updateItem(item.id, { harga: Number(e.target.value) || 0 })}
                      placeholder="59000"
                      className="w-full px-2.5 py-1.5 text-sm font-mono tabular-nums rounded border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20 focus:border-[#1D4ED8]"
                    />
                  </div>

                  <div className="col-span-5">
                    <label className="block text-[11px] font-medium text-slate-600 mb-1">
                      Basis Harga
                    </label>
                    <select
                      value={m.priceBasis}
                      disabled={isKgOrder}
                      onChange={(e) =>
                        updateItem(item.id, { priceBasis: e.target.value as PriceBasis })
                      }
                      className="w-full px-2 py-1.5 text-sm rounded border border-slate-300 bg-white disabled:bg-slate-100 disabled:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20 focus:border-[#1D4ED8]"
                    >
                      <option value="per_kg">Per Kg</option>
                      {!isKgOrder && <option value="per_unit">Per {m.orderUnit}</option>}
                    </select>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={addItem}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            Tambah Barang
          </button>

          <div className="text-[11px] text-slate-500 font-mono tabular-nums">
            Total Berat: {formatWeight(totalWeightKg, invoice.numberFormat)} kg
          </div>
        </div>

        {/* Biaya Ongkir (Pengiriman) */}
        <div className="mt-4 p-3 rounded-lg border border-slate-200 bg-slate-50/70 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-xs font-semibold text-slate-800">Biaya Ongkir (Pengiriman)</div>
              <div className="text-[11px] text-slate-500">
                Opsional: tambahkan ongkos kirim jika pengiriman ditagihkan di invoice ini.
              </div>
            </div>
            {shippingCost > 0 && (
              <button
                type="button"
                onClick={() => onChangeInvoice({ ...invoice, shippingCost: 0 })}
                className="text-[11px] font-medium text-slate-500 hover:text-red-600 transition-colors cursor-pointer shrink-0"
              >
                Reset
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
            <div className="sm:col-span-5">
              <label className="block text-[11px] font-medium text-slate-600 mb-1">
                Biaya Ongkir ({invoice.currency || 'Rp'})
              </label>
              <input
                type="number"
                min={0}
                value={shippingCost === 0 ? '' : shippingCost}
                onChange={(e) =>
                  onChangeInvoice({
                    ...invoice,
                    shippingCost: Math.max(0, Math.round(Number(e.target.value) || 0)),
                  })
                }
                placeholder="0"
                className="w-full px-2.5 py-1.5 text-sm font-mono tabular-nums rounded border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20 focus:border-[#1D4ED8]"
              />
            </div>

            <div className="sm:col-span-7">
              <label className="block text-[11px] font-medium text-slate-600 mb-1">
                Keterangan Baris Ongkir di Invoice
              </label>
              <input
                type="text"
                value={invoice.shippingLabel ?? 'Biaya Ongkir'}
                onChange={(e) => onChangeInvoice({ ...invoice, shippingLabel: e.target.value })}
                placeholder="Biaya Ongkir"
                className="w-full px-2.5 py-1.5 text-sm rounded border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20 focus:border-[#1D4ED8]"
              />
            </div>
          </div>
        </div>

        {/* Potongan Deposit Customer (Kelebihan Bayar Sebelumnya) */}
        <div className="mt-3 p-3 rounded-lg border border-slate-200 bg-slate-50/70 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-xs font-semibold text-slate-800">
                Deposit Customer (Kelebihan Bayar)
              </div>
              <div className="text-[11px] text-slate-500">
                Masukkan saldo deposit dari kelebihan bayar sebelumnya untuk mengurangi tagihan otomatis.
              </div>
            </div>
            {depositAmount > 0 && (
              <button
                type="button"
                onClick={() => onChangeInvoice({ ...invoice, depositAmount: 0 })}
                className="text-[11px] font-medium text-slate-500 hover:text-red-600 transition-colors cursor-pointer shrink-0"
              >
                Reset
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
            <div className="sm:col-span-5">
              <label className="block text-[11px] font-medium text-slate-600 mb-1">
                Nilai Deposit ({invoice.currency || 'Rp'})
              </label>
              <input
                type="number"
                min={0}
                value={depositAmount === 0 ? '' : depositAmount}
                onChange={(e) =>
                  onChangeInvoice({
                    ...invoice,
                    depositAmount: Math.max(0, Math.round(Number(e.target.value) || 0)),
                  })
                }
                placeholder="0"
                className="w-full px-2.5 py-1.5 text-sm font-mono tabular-nums rounded border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20 focus:border-[#1D4ED8]"
              />
            </div>

            <div className="sm:col-span-7">
              <label className="block text-[11px] font-medium text-slate-600 mb-1">
                Keterangan Baris Deposit di Invoice
              </label>
              <input
                type="text"
                value={invoice.depositLabel ?? 'Deposit Kelebihan Bayar'}
                onChange={(e) => onChangeInvoice({ ...invoice, depositLabel: e.target.value })}
                placeholder="Deposit Kelebihan Bayar"
                className="w-full px-2.5 py-1.5 text-sm rounded border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20 focus:border-[#1D4ED8]"
              />
            </div>
          </div>

          {remainingDeposit > 0 && (
            <div className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-2.5 py-1.5 font-medium tabular-nums">
              Deposit melebihi tagihan. Sisa deposit customer setelah transaksi ini:{' '}
              <span className="font-mono font-semibold">
                {invoice.currency} {formatAmount(remainingDeposit, invoice.numberFormat)}
              </span>
            </div>
          )}
        </div>

        {/* Ringkasan Perhitungan Akhir */}
        <div className="mt-3 pt-3 border-t border-slate-200 flex justify-end">
          <div className="text-right space-y-1 min-w-[240px]">
            {(isExcludeAdd || shippingCost > 0) && (
              <div className="flex items-center justify-between gap-6 text-[11px] text-slate-500 font-mono tabular-nums">
                <span className="font-sans">Subtotal</span>
                <span>
                  {invoice.currency} {formatAmount(subtotal, invoice.numberFormat)}
                </span>
              </div>
            )}

            {isExcludeAdd && (
              <div className="flex items-center justify-between gap-6 text-[11px] text-slate-600 font-mono tabular-nums">
                <span className="font-sans">PPN ({ppnRate}%)</span>
                <span>
                  {invoice.currency} {formatAmount(ppnAmount, invoice.numberFormat)}
                </span>
              </div>
            )}

            {shippingCost > 0 && (
              <div className="flex items-center justify-between gap-6 text-[11px] text-slate-600 font-mono tabular-nums">
                <span className="font-sans truncate max-w-[160px]">
                  {invoice.shippingLabel?.trim() || 'Biaya Ongkir'}
                </span>
                <span>
                  {invoice.currency} {formatAmount(shippingCost, invoice.numberFormat)}
                </span>
              </div>
            )}

            <div
              className={`flex items-center justify-between gap-6 font-mono tabular-nums ${
                depositAmount > 0
                  ? 'text-xs text-slate-700 font-medium'
                  : 'text-base font-bold text-slate-900'
              }`}
            >
              <span className="font-sans">Grand Total</span>
              <span>
                {invoice.currency} {formatAmount(grandTotal, invoice.numberFormat)}
              </span>
            </div>

            {depositAmount > 0 && (
              <>
                <div className="flex items-center justify-between gap-6 text-xs text-emerald-700 font-mono tabular-nums">
                  <span className="font-sans truncate max-w-[160px]">
                    {invoice.depositLabel?.trim() || 'Deposit Kelebihan Bayar'}
                  </span>
                  <span>
                    - {invoice.currency} {formatAmount(appliedDeposit, invoice.numberFormat)}
                  </span>
                </div>
                <div className="pt-1 border-t border-slate-200 flex items-center justify-between gap-6 text-base font-bold text-slate-900 font-mono tabular-nums">
                  <span className="font-sans">Sisa Pembayaran</span>
                  <span>
                    {invoice.currency} {formatAmount(netPayable, invoice.numberFormat)}
                  </span>
                </div>
              </>
            )}
          </div>
        </div>
      </section>

      {/* 4. Rekening Bank & Catatan Pembayaran */}
      <section className="p-5 sm:p-6">
        <div className="flex items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-2 text-slate-900">
            <CreditCard className="w-4 h-4 text-slate-500" />
            <h2 className="text-sm font-semibold tracking-tight">Nomor Rekening &amp; Catatan</h2>
          </div>

          <button
            type="button"
            onClick={handleSaveCurrentBank}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-[#1D4ED8] hover:text-blue-800 transition-colors cursor-pointer"
          >
            <Save className="w-3.5 h-3.5" />
            {bankSavedNotice ? 'Tersimpan ke Daftar' : 'Simpan Rekening Ini'}
          </button>
        </div>

        {savedBanks.length > 0 && (
          <div className="mb-3">
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Pilih dari Rekening Tersimpan
            </label>
            <select
              value={savedBanks.some((b) => b.id === invoice.bankAccount.id) ? invoice.bankAccount.id : ''}
              onChange={(e) => handleSelectSavedBank(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-md border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20 focus:border-[#1D4ED8]"
            >
              <option value="" disabled>
                -- Pilih rekening tersimpan atau ubah manual di bawah --
              </option>
              {savedBanks.map((bank) => (
                <option key={bank.id} value={bank.id}>
                  {bank.bankShortName} - {bank.accountNumber} ({bank.accountHolder})
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Nama Bank Lengkap</label>
            <input
              type="text"
              value={invoice.bankAccount.bankName}
              onChange={(e) => updateBankField({ bankName: e.target.value })}
              placeholder="BANK BCA"
              className="w-full px-3 py-2 text-sm rounded-md border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20 focus:border-[#1D4ED8]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Singkatan Bank</label>
            <input
              type="text"
              value={invoice.bankAccount.bankShortName}
              onChange={(e) => updateBankField({ bankShortName: e.target.value })}
              placeholder="BCA"
              className="w-full px-3 py-2 text-sm rounded-md border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20 focus:border-[#1D4ED8]"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-slate-700 mb-1">Atas Nama (a/n)</label>
            <input
              type="text"
              value={invoice.bankAccount.accountHolder}
              onChange={(e) => updateBankField({ accountHolder: e.target.value })}
              placeholder="PT.SUMBER ROSO AGROMAKMUR"
              className="w-full px-3 py-2 text-sm rounded-md border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20 focus:border-[#1D4ED8]"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-slate-700 mb-1">Nomor Rekening (A/C)</label>
            <input
              type="text"
              value={invoice.bankAccount.accountNumber}
              onChange={(e) => updateBankField({ accountNumber: e.target.value })}
              placeholder="4967 959 595"
              className="w-full px-3 py-2 text-sm font-mono font-semibold rounded-md border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20 focus:border-[#1D4ED8]"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Catatan Tambahan (Opsional)
            </label>
            <textarea
              rows={2}
              value={invoice.additionalNote}
              onChange={(e) => onChangeInvoice({ ...invoice, additionalNote: e.target.value })}
              placeholder="Contoh: Mohon cantumkan nomor invoice pada berita transfer."
              className="w-full px-3 py-2 text-sm rounded-md border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20 focus:border-[#1D4ED8] resize-none"
            />
          </div>
        </div>

        <div className="space-y-2.5 pt-1">
          <label className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={invoice.highlightTransferTotal}
              onChange={(e) =>
                onChangeInvoice({ ...invoice, highlightTransferTotal: e.target.checked })
              }
              className="rounded border-slate-300 text-[#1D4ED8] focus:ring-[#1D4ED8]"
            />
            Sorot kuning baris &ldquo;Nilai Transfer&rdquo;
          </label>

          <div>
            <label className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={invoice.showSignature}
                onChange={(e) => onChangeInvoice({ ...invoice, showSignature: e.target.checked })}
                className="rounded border-slate-300 text-[#1D4ED8] focus:ring-[#1D4ED8]"
              />
              Tambahkan kolom tanda tangan di bagian bawah
            </label>
          </div>

          {invoice.showSignature && (
            <div className="grid grid-cols-2 gap-2.5 pt-1">
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  Nama Penandatangan
                </label>
                <input
                  type="text"
                  value={invoice.signatureName}
                  onChange={(e) => onChangeInvoice({ ...invoice, signatureName: e.target.value })}
                  className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-300 bg-white"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  Jabatan / Perusahaan
                </label>
                <input
                  type="text"
                  value={invoice.signatureTitle}
                  onChange={(e) => onChangeInvoice({ ...invoice, signatureTitle: e.target.value })}
                  className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-300 bg-white"
                />
              </div>
            </div>
          )}
        </div>
      </section>

      {/* 5. Footer Dokumen (Bagian Bawah Halaman) */}
      <section className="p-5 sm:p-6">
        <div className="flex items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-2 text-slate-900">
            <FileText className="w-4 h-4 text-slate-500" />
            <h2 className="text-sm font-semibold tracking-tight">Footer Dokumen</h2>
          </div>

          <label className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={footer.enabled}
              onChange={(e) => onChangeFooter({ ...footer, enabled: e.target.checked })}
              className="rounded border-slate-300 text-[#1D4ED8] focus:ring-[#1D4ED8]"
            />
            Tampilkan footer
          </label>
        </div>

        <div className="mb-3">
          <label className="block text-xs font-medium text-slate-700 mb-1">
            Pilih Nama Perusahaan (4 PT)
          </label>
          <select
            disabled={!footer.enabled}
            value={
              COMPANY_LOGO_PRESETS.some((p) => p.companyName === footer.companyName)
                ? footer.companyName
                : ''
            }
            onChange={(e) => {
              if (e.target.value) {
                onChangeFooter({ ...footer, companyName: e.target.value });
              }
            }}
            className="w-full px-3 py-2 text-sm rounded-md border border-slate-300 bg-white disabled:bg-slate-100 disabled:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20 focus:border-[#1D4ED8]"
          >
            <option value="" disabled>
              -- Pilih dari 4 PT atau isi manual di bawah --
            </option>
            {COMPANY_LOGO_PRESETS.map((preset) => (
              <option key={preset.id} value={preset.companyName}>
                {preset.companyName}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Nama Perusahaan (Kiri Baris 1)
            </label>
            <input
              type="text"
              disabled={!footer.enabled}
              value={footer.companyName}
              onChange={(e) => onChangeFooter({ ...footer, companyName: e.target.value })}
              placeholder="PT Exindokarsa Agung"
              className="w-full px-3 py-2 text-sm rounded-md border border-slate-300 bg-white disabled:bg-slate-100 disabled:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20 focus:border-[#1D4ED8]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Telepon (Kanan Baris 1)
            </label>
            <input
              type="text"
              disabled={!footer.enabled}
              value={footer.phone}
              onChange={(e) => onChangeFooter({ ...footer, phone: e.target.value })}
              placeholder="P +62 21 819 1908"
              className="w-full px-3 py-2 text-sm rounded-md border border-slate-300 bg-white disabled:bg-slate-100 disabled:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20 focus:border-[#1D4ED8]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Alamat (Kiri Baris 2)
            </label>
            <input
              type="text"
              disabled={!footer.enabled}
              value={footer.address}
              onChange={(e) => onChangeFooter({ ...footer, address: e.target.value })}
              placeholder="Jl Raya Bekasi Timur No. 136"
              className="w-full px-3 py-2 text-sm rounded-md border border-slate-300 bg-white disabled:bg-slate-100 disabled:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20 focus:border-[#1D4ED8]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Fax (Kanan Baris 2)
            </label>
            <input
              type="text"
              disabled={!footer.enabled}
              value={footer.fax}
              onChange={(e) => onChangeFooter({ ...footer, fax: e.target.value })}
              placeholder="F +62 21 851 7193"
              className="w-full px-3 py-2 text-sm rounded-md border border-slate-300 bg-white disabled:bg-slate-100 disabled:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20 focus:border-[#1D4ED8]"
            />
          </div>
        </div>
      </section>
    </div>
  );
};
