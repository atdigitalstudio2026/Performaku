import React, { useEffect, useMemo, useState } from 'react';
import {
  Check,
  Copy,
  Download,
  ExternalLink,
  FileText,
  Loader2,
  MessageCircle,
  RotateCcw,
  Share2,
  X,
} from 'lucide-react';
import { CompanyProfile, DocumentFooter, ProformaInvoiceData } from '../types/invoice';
import { buildProformaInvoicePdf, GeneratedPdfAsset } from '../utils/generatePdf';
import {
  buildWhatsAppUrl,
  copyTextToClipboard,
  generateWhatsAppMessage,
  normalizeIndonesianPhone,
  WhatsAppTemplateMode,
} from '../utils/whatsappMessage';

interface WhatsAppModalProps {
  invoice: ProformaInvoiceData;
  company: CompanyProfile;
  footer?: DocumentFooter;
  initialMode?: WhatsAppTemplateMode;
  onClose: () => void;
  onNotify?: (message: string) => void;
}

const TEMPLATE_TABS: { id: WhatsAppTemplateMode; label: string }[] = [
  { id: 'invoice', label: 'Kirim Tagihan' },
  { id: 'reminder', label: 'Follow-Up Pending' },
  { id: 'paid', label: 'Konfirmasi Lunas' },
];

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function openExternalLink(url: string) {
  const link = document.createElement('a');
  link.href = url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export const WhatsAppModal: React.FC<WhatsAppModalProps> = ({
  invoice,
  company,
  footer,
  initialMode = 'invoice',
  onClose,
  onNotify,
}) => {
  const [mode, setMode] = useState<WhatsAppTemplateMode>(initialMode);
  const [phoneInput, setPhoneInput] = useState('');
  const [messageText, setMessageText] = useState(() =>
    generateWhatsAppMessage(invoice, company, initialMode)
  );
  const [isEdited, setIsEdited] = useState(false);
  const [copied, setCopied] = useState(false);

  // Ready-to-share PDF state
  const [pdfAsset, setPdfAsset] = useState<GeneratedPdfAsset | null>(null);
  const [isPreparingPdf, setIsPreparingPdf] = useState(true);
  const [pdfError, setPdfError] = useState('');
  const [isSharing, setIsSharing] = useState(false);
  const [shareFeedback, setShareFeedback] = useState('');

  useEffect(() => {
    setMessageText(generateWhatsAppMessage(invoice, company, mode));
    setIsEdited(false);
  }, [invoice, company, mode]);

  useEffect(() => {
    let cancelled = false;
    setIsPreparingPdf(true);
    setPdfError('');
    setShareFeedback('');

    buildProformaInvoicePdf(invoice, company, footer)
      .then((asset) => {
        if (!cancelled) {
          setPdfAsset(asset);
          setIsPreparingPdf(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPdfAsset(null);
          setPdfError('Gagal menyiapkan file PDF otomatis.');
          setIsPreparingPdf(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [invoice, company, footer]);

  const canNativeShareFile = useMemo(() => {
    if (!pdfAsset) return false;
    try {
      const nav = navigator as Navigator & {
        canShare?: (data?: ShareData) => boolean;
      };
      return (
        typeof nav.share === 'function' &&
        typeof nav.canShare === 'function' &&
        nav.canShare({ files: [pdfAsset.file] })
      );
    } catch {
      return false;
    }
  }, [pdfAsset]);

  const normalizedPhone = useMemo(
    () => normalizeIndonesianPhone(phoneInput),
    [phoneInput]
  );

  const waUrl = useMemo(
    () => buildWhatsAppUrl(phoneInput, messageText),
    [phoneInput, messageText]
  );

  const handleCopy = async () => {
    const ok = await copyTextToClipboard(messageText);
    if (ok) {
      setCopied(true);
      onNotify?.('Pesan WhatsApp berhasil disalin ke clipboard.');
      setTimeout(() => setCopied(false), 2200);
    } else {
      onNotify?.('Gagal menyalin otomatis. Silakan blok teks lalu tekan Ctrl+C.');
    }
  };

  const handleDownloadPdfOnly = async () => {
    const asset =
      pdfAsset || (await buildProformaInvoicePdf(invoice, company, footer));
    if (!pdfAsset) setPdfAsset(asset);
    triggerBlobDownload(asset.blob, asset.filename);
    onNotify?.(`PDF "${asset.filename}" berhasil diunduh.`);
  };

  const handleDownloadAndOpenWhatsApp = async () => {
    if (isSharing) return;
    setIsSharing(true);
    try {
      const asset =
        pdfAsset || (await buildProformaInvoicePdf(invoice, company, footer));
      if (!pdfAsset) setPdfAsset(asset);
      triggerBlobDownload(asset.blob, asset.filename);
      await copyTextToClipboard(messageText);
      openExternalLink(waUrl);
      const hint = `PDF "${asset.filename}" sudah diunduh & chat WhatsApp dibuka. Tinggal lampirkan / drag file PDF tersebut ke chat.`;
      setShareFeedback(hint);
      onNotify?.(`PDF diunduh & WhatsApp dibuka (${asset.filename}).`);
    } catch {
      onNotify?.('Gagal menyiapkan file PDF. Coba klik Unduh PDF di halaman utama.');
    } finally {
      setIsSharing(false);
    }
  };

  const handleNativeSharePdf = async () => {
    if (isSharing) return;
    setIsSharing(true);
    setShareFeedback('');
    try {
      const asset =
        pdfAsset || (await buildProformaInvoicePdf(invoice, company, footer));
      if (!pdfAsset) setPdfAsset(asset);

      // Copy message beforehand so user can also paste caption if a target app drops text with files
      await copyTextToClipboard(messageText);

      const nav = navigator as Navigator & {
        canShare?: (data?: ShareData) => boolean;
      };

      if (
        typeof nav.share === 'function' &&
        typeof nav.canShare === 'function' &&
        nav.canShare({ files: [asset.file] })
      ) {
        await nav.share({
          title: asset.filename,
          text: messageText,
          files: [asset.file],
        });
        setShareFeedback(
          `File PDF "${asset.filename}" berhasil dibagikan! Pesan teks juga sudah disalin ke clipboard.`
        );
        onNotify?.(`File PDF "${asset.filename}" berhasil dibagikan.`);
        return;
      }

      // Fallback when browser doesn't allow file share
      triggerBlobDownload(asset.blob, asset.filename);
      openExternalLink(waUrl);
      setShareFeedback(
        `Perangkat ini tidak mendukung lampirkan file otomatis. PDF "${asset.filename}" sudah diunduh & WhatsApp dibuka — tinggal seret file ke chat.`
      );
      onNotify?.(`PDF diunduh & WhatsApp dibuka (${asset.filename}).`);
    } catch (err) {
      // User explicitly cancelled the native share sheet
      if (err instanceof Error && err.name === 'AbortError') {
        return;
      }
      // Permission / iframe restriction fallback: download PDF + open WhatsApp seamlessly
      try {
        const asset =
          pdfAsset || (await buildProformaInvoicePdf(invoice, company, footer));
        triggerBlobDownload(asset.blob, asset.filename);
        openExternalLink(waUrl);
        setShareFeedback(
          `Browser membatasi share langsung dari jendela ini. PDF "${asset.filename}" sudah otomatis diunduh & WhatsApp dibuka — tinggal lampirkan file ke chat.`
        );
        onNotify?.(`PDF diunduh & WhatsApp dibuka (${asset.filename}).`);
      } catch {
        onNotify?.('Gagal membagikan PDF. Silakan gunakan tombol Unduh PDF.');
      }
    } finally {
      setIsSharing(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white border border-slate-200 rounded-lg shadow-xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 flex items-start justify-between gap-4">
          <div className="flex items-start gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-md bg-emerald-50 border border-emerald-200 flex items-center justify-center shrink-0 mt-0.5">
              <MessageCircle className="w-4 h-4 text-emerald-700" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-slate-900">
                Bagikan PDF Invoice &amp; Pesan ke WhatsApp
              </h2>
              <p className="text-xs text-slate-500 mt-0.5 truncate">
                {invoice.buyerName || 'Pembeli'}
                {invoice.showInvoiceNumber && invoice.invoiceNumber.trim()
                  ? ` · ${invoice.invoiceNumber.trim()}`
                  : ''}
                {company.name ? ` · ${company.name}` : ''}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            title="Tutup"
            className="p-1.5 rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto space-y-4">
          {/* Ready PDF Attachment Card */}
          <div className="p-3.5 rounded-lg border border-emerald-200 bg-emerald-50/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-md bg-white border border-emerald-200 flex items-center justify-center shrink-0">
                {isPreparingPdf ? (
                  <Loader2 className="w-4 h-4 text-emerald-700 animate-spin" />
                ) : (
                  <FileText className="w-4 h-4 text-emerald-700" />
                )}
              </div>
              <div className="min-w-0">
                <div className="text-xs font-semibold text-slate-900 truncate">
                  {isPreparingPdf
                    ? 'Menyiapkan file PDF Proforma Invoice...'
                    : pdfAsset?.filename || 'File PDF Invoice'}
                </div>
                <div className="text-[11px] text-slate-600 mt-0.5">
                  {pdfError ? (
                    <span className="text-red-600">{pdfError}</span>
                  ) : isPreparingPdf ? (
                    'Membuat dokumen A4 lengkap dengan kop surat & rincian...'
                  ) : pdfAsset ? (
                    <>
                      Lampiran PDF siap kirim ·{' '}
                      <span className="font-mono font-medium text-emerald-800">
                        {formatFileSize(pdfAsset.file.size)}
                      </span>
                      {canNativeShareFile
                        ? ' · Mendukung bagikan file langsung ke WhatsApp'
                        : ' · Siap unduh otomatis + buka chat WhatsApp'}
                    </>
                  ) : null}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => void handleDownloadPdfOnly()}
              disabled={isPreparingPdf}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-emerald-300 bg-white text-emerald-800 hover:bg-emerald-50 disabled:opacity-50 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <Download className="w-3.5 h-3.5" />
              Unduh PDF
            </button>
          </div>

          {shareFeedback && (
            <div className="p-3 rounded-md border border-blue-200 bg-blue-50 text-xs text-blue-900 leading-relaxed">
              {shareFeedback}
            </div>
          )}

          {/* Template Switcher + Phone Input */}
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
            <div className="sm:col-span-7">
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Jenis Pesan Pengantar
              </label>
              <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-md">
                {TEMPLATE_TABS.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setMode(tab.id)}
                    className={`px-2 py-1.5 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
                      mode === tab.id
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="sm:col-span-5">
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                No. WhatsApp Pembeli (Opsional)
              </label>
              <input
                type="tel"
                value={phoneInput}
                onChange={(e) => setPhoneInput(e.target.value)}
                placeholder="0812-3456-7890"
                className="w-full px-3 py-1.5 text-sm font-mono rounded-md border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20 focus:border-[#1D4ED8]"
              />
            </div>
          </div>

          {normalizedPhone && (
            <div className="text-[11px] text-slate-500 -mt-2">
              Tujuan langsung WhatsApp:{' '}
              <span className="font-mono font-semibold text-emerald-700">
                +{normalizedPhone}
              </span>
            </div>
          )}

          {/* Editable Message Area */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-slate-700">
                Isi Pesan (Bisa Diedit Sebelum Dikirim)
              </label>
              {isEdited && (
                <button
                  type="button"
                  onClick={() => {
                    setMessageText(generateWhatsAppMessage(invoice, company, mode));
                    setIsEdited(false);
                  }}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 hover:text-slate-900 cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                  Reset Template
                </button>
              )}
            </div>

            <textarea
              rows={11}
              value={messageText}
              onChange={(e) => {
                setMessageText(e.target.value);
                setIsEdited(true);
              }}
              className="w-full p-3.5 text-xs sm:text-[13px] leading-relaxed font-sans rounded-md border border-slate-300 bg-slate-50/70 text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20 focus:border-[#1D4ED8] resize-y"
            />
            <p className="text-[11px] text-slate-500 mt-1.5">
              {canNativeShareFile
                ? 'Di HP/perangkat yang mendukung, klik "Bagikan File PDF" untuk langsung melampirkan PDF ke aplikasi WhatsApp. Atau klik "Unduh PDF & Buka WA" untuk langsung membuka chat ke nomor tujuan.'
                : 'Klik "Unduh PDF & Buka WhatsApp" untuk mengunduh file PDF sekaligus membuka chat WhatsApp dengan pesan terisi otomatis — lalu tinggal drag/lampirkan file PDF ke chat.'}
            </p>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3.5 border-t border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-2 text-xs font-medium rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            Tutup
          </button>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void handleCopy()}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-md border transition-colors cursor-pointer whitespace-nowrap ${
                copied
                  ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                  : 'border-slate-300 bg-white text-slate-800 hover:bg-slate-100'
              }`}
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-700" />
                  Tersalin
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  Salin Pesan
                </>
              )}
            </button>

            {canNativeShareFile ? (
              <>
                <button
                  type="button"
                  onClick={() => void handleDownloadAndOpenWhatsApp()}
                  disabled={isPreparingPdf || isSharing}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-md border border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 disabled:opacity-50 transition-colors cursor-pointer whitespace-nowrap"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Unduh PDF &amp; Buka WA
                </button>
                <button
                  type="button"
                  onClick={() => void handleNativeSharePdf()}
                  disabled={isPreparingPdf || isSharing}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors cursor-pointer whitespace-nowrap"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  {isSharing ? 'Menyiapkan...' : 'Bagikan File PDF'}
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => void handleDownloadAndOpenWhatsApp()}
                disabled={isPreparingPdf || isSharing}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors cursor-pointer whitespace-nowrap"
              >
                <Share2 className="w-3.5 h-3.5" />
                {isSharing ? 'Menyiapkan PDF...' : 'Unduh PDF & Buka WhatsApp'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
