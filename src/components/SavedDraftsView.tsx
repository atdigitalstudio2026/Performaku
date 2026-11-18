import React from 'react';
import { Download, FileUp, Save, Trash2 } from 'lucide-react';
import { CompanyProfile, SavedInvoiceDraft } from '../types/invoice';
import { calculateInvoiceTotals, formatAmount } from '../utils/formatters';

interface SavedDraftsViewProps {
  drafts: SavedInvoiceDraft[];
  company: CompanyProfile;
  onSaveCurrentDraft: () => void;
  onLoadDraft: (draft: SavedInvoiceDraft) => void;
  onDeleteDraft: (id: string) => void;
  onDownloadDraftPdf: (draft: SavedInvoiceDraft) => void;
}

export const SavedDraftsView: React.FC<SavedDraftsViewProps> = ({
  drafts,
  onSaveCurrentDraft,
  onLoadDraft,
  onDeleteDraft,
  onDownloadDraftPdf,
}) => {
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-8 py-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Riwayat Draft Invoice</h1>
          <p className="text-sm text-slate-600 mt-1">
            Simpan template atau riwayat Proforma Invoice di browser Anda untuk digunakan kembali.
          </p>
        </div>

        <button
          type="button"
          onClick={onSaveCurrentDraft}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-md bg-[#1D4ED8] text-white hover:bg-blue-800 transition-colors cursor-pointer whitespace-nowrap shrink-0"
        >
          <Save className="w-3.5 h-3.5" />
          Simpan Invoice Aktif ke Riwayat
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        {drafts.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-sm font-medium text-slate-800">Belum ada draft tersimpan</p>
            <p className="text-xs text-slate-500 mt-1 mb-4">
              Simpan Proforma Invoice yang sedang Anda kerjakan agar mudah dibuka atau diunduh kembali nanti.
            </p>
            <button
              type="button"
              onClick={onSaveCurrentDraft}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              Simpan Draft Pertama
            </button>
          </div>
        ) : (
          <div className="divide-y divide-slate-200">
            {drafts.map((draft) => {
              const { grandTotal: total } = calculateInvoiceTotals(draft.data);
              const savedDate = new Date(draft.savedAt).toLocaleString('id-ID', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              });

              return (
                <div
                  key={draft.id}
                  className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/70 transition-colors"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-900">
                      <span>{draft.data.buyerName || 'Tanpa Nama Pembeli'}</span>
                      <span className="text-slate-300">·</span>
                      <span className="font-mono tabular-nums">
                        {draft.data.currency} {formatAmount(total, draft.data.numberFormat)}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 mt-1 flex flex-wrap items-center gap-2">
                      <span>{draft.data.cityDate}</span>
                      <span>·</span>
                      <span>{draft.data.items.length} barang</span>
                      <span>·</span>
                      <span>Rek. {draft.data.bankAccount.bankShortName} {draft.data.bankAccount.accountNumber}</span>
                      <span>·</span>
                      <span>Disimpan {savedDate}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => onLoadDraft(draft)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer whitespace-nowrap"
                    >
                      <FileUp className="w-3.5 h-3.5" />
                      Buka di Editor
                    </button>

                    <button
                      type="button"
                      onClick={() => onDownloadDraftPdf(draft)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-slate-900 text-white hover:bg-slate-800 transition-colors cursor-pointer whitespace-nowrap"
                    >
                      <Download className="w-3.5 h-3.5" />
                      PDF
                    </button>

                    <button
                      type="button"
                      onClick={() => onDeleteDraft(draft.id)}
                      title="Hapus draft"
                      className="p-1.5 text-slate-400 hover:text-red-600 rounded hover:bg-red-50 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
