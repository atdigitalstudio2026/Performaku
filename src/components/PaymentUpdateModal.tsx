import React, { useState } from 'react';
import { CalendarCheck2, X } from 'lucide-react';
import { InvoiceLogRecord, InvoicePaymentStatus } from '../types/invoice';
import { formatAmount } from '../utils/formatters';
import { getEffectivePaymentDateIso, toLocalDateIso } from '../utils/paymentHelpers';

interface PaymentUpdateModalProps {
  log: InvoiceLogRecord;
  targetStatus: InvoicePaymentStatus;
  onSave: (payload: {
    paymentStatus: InvoicePaymentStatus;
    paidAtDate: string;
    paymentNote: string;
  }) => Promise<void>;
  onClose: () => void;
}

const STATUS_TITLES: Record<InvoicePaymentStatus, string> = {
  paid: 'Konfirmasi Pelunasan Invoice',
  pending: 'Catatan Status Pending',
  cancelled: 'Konfirmasi Pembatalan (Cancel)',
};

export const PaymentUpdateModal: React.FC<PaymentUpdateModalProps> = ({
  log,
  targetStatus,
  onSave,
  onClose,
}) => {
  const [status, setStatus] = useState<InvoicePaymentStatus>(targetStatus);
  const [paidAtDate, setPaidAtDate] = useState<string>(() => {
    if (targetStatus === 'paid') {
      return log.paidAtDate || getEffectivePaymentDateIso(log) || toLocalDateIso();
    }
    return log.paidAtDate || '';
  });
  const [paymentNote, setPaymentNote] = useState<string>(log.paymentNote || '');
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;
    setIsSaving(true);
    try {
      const effectiveDate = status === 'paid' ? paidAtDate || toLocalDateIso() : '';
      await onSave({
        paymentStatus: status,
        paidAtDate: effectiveDate,
        paymentNote: paymentNote.trim().slice(0, 300),
      });
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSaving) onClose();
      }}
    >
      <form
        onSubmit={handleSubmit}
        className="bg-white border border-slate-200 rounded-lg shadow-xl w-full max-w-md overflow-hidden"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-md bg-emerald-50 border border-emerald-200 flex items-center justify-center shrink-0 mt-0.5">
              <CalendarCheck2 className="w-4 h-4 text-emerald-700" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-slate-900">{STATUS_TITLES[status]}</h2>
              <p className="text-xs text-slate-500 mt-0.5 truncate">
                {log.invoiceSnapshot.buyerName || 'Pembeli'}
                {log.invoiceSnapshot.invoiceNumber
                  ? ` · ${log.invoiceSnapshot.invoiceNumber}`
                  : ''}
              </p>
            </div>
          </div>

          <button
            type="button"
            disabled={isSaving}
            onClick={onClose}
            className="p-1.5 rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          <div className="p-3 rounded-md bg-slate-50 border border-slate-200 flex items-center justify-between gap-3 text-xs">
            <div className="min-w-0">
              <div className="text-slate-500">Sales · Perusahaan</div>
              <div className="font-semibold text-slate-900 truncate">
                {log.salesName || 'Belum Ditentukan'} · {log.sellerName || '-'}
              </div>
            </div>
            <div className="text-right shrink-0 tabular-nums">
              <div className="text-slate-500">Nilai Tagihan</div>
              <div className="font-mono font-bold text-slate-900">
                {log.invoiceSnapshot.currency}{' '}
                {formatAmount(log.grandTotal, log.invoiceSnapshot.numberFormat)}
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">
              Status Pembayaran
            </label>
            <div className="grid grid-cols-3 gap-1.5">
              {(
                [
                  { id: 'paid', label: 'Lunas', active: 'border-emerald-500 bg-emerald-50 text-emerald-800' },
                  { id: 'pending', label: 'Pending', active: 'border-amber-500 bg-amber-50 text-amber-800' },
                  { id: 'cancelled', label: 'Cancel', active: 'border-red-400 bg-red-50 text-red-700' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => {
                    setStatus(opt.id);
                    if (opt.id === 'paid' && !paidAtDate) {
                      setPaidAtDate(toLocalDateIso());
                    }
                  }}
                  className={`py-2 text-xs font-semibold rounded-md border transition-colors cursor-pointer ${
                    status === opt.id
                      ? opt.active
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {status === 'paid' && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="paid-at-date" className="text-xs font-medium text-slate-700">
                  Tanggal Pelunasan
                </label>
                <button
                  type="button"
                  onClick={() => setPaidAtDate(toLocalDateIso())}
                  className="text-[11px] font-medium text-[#1D4ED8] hover:text-blue-800 cursor-pointer"
                >
                  Hari Ini
                </button>
              </div>
              <input
                id="paid-at-date"
                type="date"
                required
                value={paidAtDate}
                onChange={(e) => setPaidAtDate(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono rounded-md border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20 focus:border-[#1D4ED8]"
              />
              <p className="text-[11px] text-slate-500 mt-1">
                Digunakan saat memfilter laporan Performa Sales berdasarkan Tanggal Lunas.
              </p>
            </div>
          )}

          <div>
            <label htmlFor="payment-note-input" className="block text-xs font-medium text-slate-700 mb-1">
              {status === 'paid'
                ? 'Catatan / Referensi Transfer (Opsional)'
                : status === 'cancelled'
                ? 'Alasan Pembatalan (Opsional)'
                : 'Catatan Follow-Up (Opsional)'}
            </label>
            <textarea
              id="payment-note-input"
              rows={3}
              maxLength={300}
              value={paymentNote}
              onChange={(e) => setPaymentNote(e.target.value)}
              placeholder={
                status === 'paid'
                  ? 'Contoh: Transfer BCA a/n PT Ryuu, mutasi 25 Nov jam 14.20'
                  : status === 'cancelled'
                  ? 'Contoh: Pembeli ganti jumlah pesanan, dibuatkan invoice baru'
                  : 'Contoh: Sudah di-follow up via WA, janji transfer besok'
              }
              className="w-full px-3 py-2 text-sm rounded-md border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20 focus:border-[#1D4ED8] resize-none"
            />
            <div className="text-[10px] text-slate-400 text-right mt-0.5 tabular-nums">
              {paymentNote.length}/300
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2">
          <button
            type="button"
            disabled={isSaving}
            onClick={onClose}
            className="px-3.5 py-2 text-xs font-medium rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            Batal
          </button>
          <button
            type="submit"
            disabled={isSaving}
            className={`px-4 py-2 text-xs font-medium rounded-md text-white transition-colors cursor-pointer disabled:opacity-60 ${
              status === 'paid'
                ? 'bg-emerald-600 hover:bg-emerald-700'
                : status === 'cancelled'
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-[#1D4ED8] hover:bg-blue-800'
            }`}
          >
            {isSaving
              ? 'Menyimpan...'
              : status === 'paid'
              ? 'Simpan Status Lunas'
              : 'Simpan Perubahan'}
          </button>
        </div>
      </form>
    </div>
  );
};
