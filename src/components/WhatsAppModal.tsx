import React, { useEffect, useMemo, useState } from 'react';
import { Check, Copy, ExternalLink, MessageCircle, RotateCcw, X } from 'lucide-react';
import { CompanyProfile, ProformaInvoiceData } from '../types/invoice';
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
  initialMode?: WhatsAppTemplateMode;
  onClose: () => void;
  onNotify?: (message: string) => void;
}

const TEMPLATE_TABS: { id: WhatsAppTemplateMode; label: string }[] = [
  { id: 'invoice', label: 'Kirim Tagihan' },
  { id: 'reminder', label: 'Follow-Up Pending' },
  { id: 'paid', label: 'Konfirmasi Lunas' },
];

export const WhatsAppModal: React.FC<WhatsAppModalProps> = ({
  invoice,
  company,
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

  useEffect(() => {
    setMessageText(generateWhatsAppMessage(invoice, company, mode));
    setIsEdited(false);
  }, [invoice, company, mode]);

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

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white border border-slate-200 rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 flex items-start justify-between gap-4">
          <div className="flex items-start gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-md bg-emerald-50 border border-emerald-200 flex items-center justify-center shrink-0 mt-0.5">
              <MessageCircle className="w-4 h-4 text-emerald-700" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-slate-900">
                Template Pesan WhatsApp Siap Kirim
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
          {/* Template Switcher + Phone Input */}
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
            <div className="sm:col-span-7">
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Jenis Pesan
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
              rows={13}
              value={messageText}
              onChange={(e) => {
                setMessageText(e.target.value);
                setIsEdited(true);
              }}
              className="w-full p-3.5 text-xs sm:text-[13px] leading-relaxed font-sans rounded-md border border-slate-300 bg-slate-50/70 text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20 focus:border-[#1D4ED8] resize-y"
            />
            <p className="text-[11px] text-slate-500 mt-1.5">
              Tips: Lampirkan file PDF Proforma Invoice yang sudah diunduh di chat WhatsApp pembeli setelah pesan terbuka.
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
              className={`inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-md border transition-colors cursor-pointer whitespace-nowrap ${
                copied
                  ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                  : 'border-slate-300 bg-white text-slate-800 hover:bg-slate-100'
              }`}
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-700" />
                  Pesan Tersalin
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  Salin Pesan
                </>
              )}
            </button>

            <a
              href={waUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-md bg-emerald-600 text-white hover:bg-emerald-700 transition-colors whitespace-nowrap"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Buka WhatsApp
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};
