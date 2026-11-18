import React, { useState } from 'react';
import { Check, Pencil, Plus, Trash2 } from 'lucide-react';
import { BankAccount } from '../types/invoice';

interface BankAccountsViewProps {
  banks: BankAccount[];
  activeBankId: string;
  onAddBank: (bank: BankAccount) => void;
  onUpdateBank: (bank: BankAccount) => void;
  onDeleteBank: (id: string) => void;
  onUseBank: (bank: BankAccount) => void;
}

export const BankAccountsView: React.FC<BankAccountsViewProps> = ({
  banks,
  activeBankId,
  onAddBank,
  onUpdateBank,
  onDeleteBank,
  onUseBank,
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formState, setFormState] = useState<Omit<BankAccount, 'id'>>({
    bankName: '',
    bankShortName: '',
    accountHolder: '',
    accountNumber: '',
  });

  const resetForm = () => {
    setEditingId(null);
    setFormState({
      bankName: '',
      bankShortName: '',
      accountHolder: '',
      accountNumber: '',
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formState.bankName.trim() || !formState.accountNumber.trim()) return;

    if (editingId) {
      onUpdateBank({ id: editingId, ...formState });
    } else {
      onAddBank({ id: `bank-${Date.now()}`, ...formState });
    }
    resetForm();
  };

  const startEdit = (bank: BankAccount) => {
    setEditingId(bank.id);
    setFormState({
      bankName: bank.bankName,
      bankShortName: bank.bankShortName,
      accountHolder: bank.accountHolder,
      accountNumber: bank.accountNumber,
    });
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-8 py-8">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-900">Daftar Rekening Bank</h1>
        <p className="text-sm text-slate-600 mt-1">
          Kelola data rekening tujuan transfer. Klik &ldquo;Gunakan di Invoice&rdquo; untuk menerapkan ke dokumen aktif.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Form Tambah / Ubah Rekening */}
        <form
          onSubmit={handleSubmit}
          className="lg:col-span-5 bg-white border border-slate-200 rounded-lg p-5 space-y-4"
        >
          <h2 className="text-sm font-semibold text-slate-900">
            {editingId ? 'Ubah Data Rekening' : 'Tambah Rekening Baru'}
          </h2>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Nama Bank Lengkap</label>
            <input
              type="text"
              required
              value={formState.bankName}
              onChange={(e) => setFormState({ ...formState, bankName: e.target.value })}
              placeholder="Contoh: BANK BCA"
              className="w-full px-3 py-2 text-sm rounded-md border border-slate-300 focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20 focus:border-[#1D4ED8]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Singkatan Bank</label>
            <input
              type="text"
              required
              value={formState.bankShortName}
              onChange={(e) => setFormState({ ...formState, bankShortName: e.target.value })}
              placeholder="Contoh: BCA"
              className="w-full px-3 py-2 text-sm rounded-md border border-slate-300 focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20 focus:border-[#1D4ED8]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Atas Nama (a/n)</label>
            <input
              type="text"
              required
              value={formState.accountHolder}
              onChange={(e) => setFormState({ ...formState, accountHolder: e.target.value })}
              placeholder="PT.SUMBER ROSO AGROMAKMUR"
              className="w-full px-3 py-2 text-sm rounded-md border border-slate-300 focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20 focus:border-[#1D4ED8]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Nomor Rekening (A/C)</label>
            <input
              type="text"
              required
              value={formState.accountNumber}
              onChange={(e) => setFormState({ ...formState, accountNumber: e.target.value })}
              placeholder="4967 959 595"
              className="w-full px-3 py-2 text-sm font-mono font-semibold rounded-md border border-slate-300 focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20 focus:border-[#1D4ED8]"
            />
          </div>

          <div className="flex items-center gap-2 pt-2">
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-md bg-[#1D4ED8] text-white hover:bg-blue-800 transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              {editingId ? 'Simpan Perubahan' : 'Tambah Rekening'}
            </button>
            {editingId && (
              <button
                type="button"
                onClick={resetForm}
                className="px-3 py-2 text-xs font-medium rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
              >
                Batal
              </button>
            )}
          </div>
        </form>

        {/* Tabel Rekening Tersimpan */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-lg overflow-hidden">
          {banks.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">
              Belum ada rekening tersimpan. Tambahkan rekening baru melalui formulir di samping.
            </div>
          ) : (
            <div className="divide-y divide-slate-200">
              {banks.map((bank) => {
                const isActive = bank.id === activeBankId;
                return (
                  <div
                    key={bank.id}
                    className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/70 transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                        <span>{bank.bankName}</span>
                        <span className="text-slate-300">·</span>
                        <span className="font-mono tabular-nums">{bank.accountNumber}</span>
                      </div>
                      <div className="text-xs text-slate-600 mt-0.5">
                        {bank.bankShortName} a/n {bank.accountHolder}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => onUseBank(bank)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                          isActive
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        {isActive && <Check className="w-3.5 h-3.5" />}
                        {isActive ? 'Sedang Dipakai' : 'Gunakan di Invoice'}
                      </button>

                      <button
                        type="button"
                        onClick={() => startEdit(bank)}
                        title="Ubah rekening"
                        className="p-1.5 text-slate-500 hover:text-slate-900 rounded hover:bg-slate-100 transition-colors cursor-pointer"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={() => onDeleteBank(bank.id)}
                        disabled={banks.length <= 1}
                        title="Hapus rekening"
                        className="p-1.5 text-slate-400 hover:text-red-600 disabled:opacity-30 disabled:pointer-events-none rounded hover:bg-red-50 transition-colors cursor-pointer"
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
    </div>
  );
};
