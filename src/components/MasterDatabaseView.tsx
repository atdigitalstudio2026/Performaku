import React, { useMemo, useState } from 'react';
import {
  ArrowRight,
  Download,
  Package,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Users,
} from 'lucide-react';
import { SALES_REP_OPTIONS } from '../data/defaultInvoice';
import { CustomerRecord, PriceBasis, ProductRecord } from '../types/invoice';
import { formatAmount, formatWeight } from '../utils/formatters';

interface MasterDatabaseViewProps {
  customers: CustomerRecord[];
  products: ProductRecord[];
  loadingMaster: boolean;
  totalLogsAvailable: number;
  isSyncingFromLogs: boolean;
  onSyncFromLogs: () => Promise<void>;
  onSaveCustomer: (
    input: { name: string; address: string; defaultSalesName: string },
    editingId?: string | null
  ) => Promise<void>;
  onDeleteCustomer: (customer: CustomerRecord) => Promise<void>;
  onUseCustomer: (customer: CustomerRecord) => void;
  onSaveProduct: (
    input: {
      name: string;
      orderUnit: string;
      weightPerUnit: number;
      harga: number;
      priceBasis: PriceBasis;
    },
    editingId?: string | null
  ) => Promise<void>;
  onDeleteProduct: (product: ProductRecord) => Promise<void>;
  onAddProductToInvoice: (product: ProductRecord) => void;
  onNotify: (msg: string) => void;
}

type SubTab = 'customers' | 'products';
type SortMode = 'usage' | 'recent' | 'alpha';

function escapeCsvCell(val: string | number): string {
  const s = String(val ?? '');
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function downloadCsvFile(filename: string, headers: string[], rows: (string | number)[][]) {
  const lines = [
    headers.map(escapeCsvCell).join(','),
    ...rows.map((r) => r.map(escapeCsvCell).join(',')),
  ];
  const blob = new Blob(['\uFEFF' + lines.join('\r\n')], {
    type: 'text/csv;charset=utf-8;',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export const MasterDatabaseView: React.FC<MasterDatabaseViewProps> = ({
  customers,
  products,
  loadingMaster,
  totalLogsAvailable,
  isSyncingFromLogs,
  onSyncFromLogs,
  onSaveCustomer,
  onDeleteCustomer,
  onUseCustomer,
  onSaveProduct,
  onDeleteProduct,
  onAddProductToInvoice,
  onNotify,
}) => {
  const [subTab, setSubTab] = useState<SubTab>('customers');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('usage');
  const [isSaving, setIsSaving] = useState(false);

  // Customer form state
  const [editingCustomerId, setEditingCustomerId] = useState<string | null>(null);
  const [custName, setCustName] = useState('');
  const [custAddress, setCustAddress] = useState('');
  const [custSales, setCustSales] = useState('');

  // Product form state
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [prodName, setProdName] = useState('');
  const [prodUnit, setProdUnit] = useState('Sak');
  const [prodWeight, setProdWeight] = useState<number>(10);
  const [prodHarga, setProdHarga] = useState<number>(0);
  const [prodBasis, setProdBasis] = useState<PriceBasis>('per_kg');

  const resetCustomerForm = () => {
    setEditingCustomerId(null);
    setCustName('');
    setCustAddress('');
    setCustSales('');
  };

  const resetProductForm = () => {
    setEditingProductId(null);
    setProdName('');
    setProdUnit('Sak');
    setProdWeight(10);
    setProdHarga(0);
    setProdBasis('per_kg');
  };

  const filteredCustomers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = q
      ? customers.filter(
          (c) =>
            c.name.toLowerCase().includes(q) ||
            c.address.toLowerCase().includes(q) ||
            c.defaultSalesName.toLowerCase().includes(q)
        )
      : [...customers];

    list.sort((a, b) => {
      if (sortMode === 'alpha') return a.name.localeCompare(b.name, 'id');
      if (sortMode === 'recent') return b.updatedAtMs - a.updatedAtMs;
      return b.usageCount - a.usageCount || b.updatedAtMs - a.updatedAtMs;
    });
    return list;
  }, [customers, searchQuery, sortMode]);

  const filteredProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = q
      ? products.filter(
          (p) =>
            p.name.toLowerCase().includes(q) ||
            p.orderUnit.toLowerCase().includes(q)
        )
      : [...products];

    list.sort((a, b) => {
      if (sortMode === 'alpha') return a.name.localeCompare(b.name, 'id');
      if (sortMode === 'recent') return b.updatedAtMs - a.updatedAtMs;
      return b.usageCount - a.usageCount || b.updatedAtMs - a.updatedAtMs;
    });
    return list;
  }, [products, searchQuery, sortMode]);

  const handleSubmitCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!custName.trim() || isSaving) return;
    setIsSaving(true);
    try {
      await onSaveCustomer(
        {
          name: custName.trim(),
          address: custAddress.trim(),
          defaultSalesName: custSales.trim(),
        },
        editingCustomerId
      );
      resetCustomerForm();
    } finally {
      setIsSaving(false);
    }
  };

  const handleSubmitProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prodName.trim() || isSaving) return;
    setIsSaving(true);
    try {
      const isKg = prodUnit.toLowerCase() === 'kg';
      await onSaveProduct(
        {
          name: prodName.trim(),
          orderUnit: prodUnit,
          weightPerUnit: isKg ? 1 : Math.max(0, Number(prodWeight) || 0),
          harga: Math.max(0, Number(prodHarga) || 0),
          priceBasis: isKg ? 'per_kg' : prodBasis,
        },
        editingProductId
      );
      resetProductForm();
    } finally {
      setIsSaving(false);
    }
  };

  const handleExportCsv = () => {
    const today = new Date().toISOString().slice(0, 10);
    if (subTab === 'customers') {
      if (filteredCustomers.length === 0) {
        onNotify('Belum ada data customer untuk diunduh.');
        return;
      }
      downloadCsvFile(
        `Database_Customer_${today}.csv`,
        ['No', 'Nama Customer', 'Alamat / Keterangan', 'Sales Terakhir', 'Frekuensi Pakai'],
        filteredCustomers.map((c, idx) => [
          idx + 1,
          c.name,
          c.address,
          c.defaultSalesName || '-',
          c.usageCount,
        ])
      );
      onNotify(`Database Customer (${filteredCustomers.length} data) diunduh ke CSV.`);
    } else {
      if (filteredProducts.length === 0) {
        onNotify('Belum ada data barang untuk diunduh.');
        return;
      }
      downloadCsvFile(
        `Database_Barang_${today}.csv`,
        [
          'No',
          'Nama Barang',
          'Satuan Order',
          'Berat per Satuan (Kg)',
          'Harga Terakhir',
          'Basis Harga',
          'Frekuensi Pakai',
        ],
        filteredProducts.map((p, idx) => [
          idx + 1,
          p.name,
          p.orderUnit,
          p.weightPerUnit,
          p.harga,
          p.priceBasis === 'per_unit' ? `Per ${p.orderUnit}` : 'Per Kg',
          p.usageCount,
        ])
      );
      onNotify(`Database Barang (${filteredProducts.length} data) diunduh ke CSV.`);
    }
  };

  const isProdKg = prodUnit.toLowerCase() === 'kg';

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-8 py-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900">
            Database Customer &amp; Barang
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Setiap nama customer dan nama barang yang diketik di Editor Invoice otomatis tersimpan sebagai memori bersama dan muncul sebagai saran saat mengetik.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => void onSyncFromLogs()}
            disabled={isSyncingFromLogs || totalLogsAvailable === 0}
            title="Impor customer & barang dari riwayat Log Invoice yang sudah ada"
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors cursor-pointer whitespace-nowrap"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncingFromLogs ? 'animate-spin' : ''}`} />
            {isSyncingFromLogs ? 'Mengimpor...' : 'Tarik dari Log Invoice'}
          </button>

          <button
            type="button"
            onClick={handleExportCsv}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md border border-blue-200 bg-blue-50 text-[#1D4ED8] hover:bg-blue-100 transition-colors cursor-pointer whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            Unduh CSV ({subTab === 'customers' ? 'Customer' : 'Barang'})
          </button>
        </div>
      </div>

      {/* Sub-tab & Filter Toolbar */}
      <div className="bg-white border border-slate-200 rounded-lg p-3.5 mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="inline-flex items-center p-1 bg-slate-100 rounded-md self-start">
          <button
            type="button"
            onClick={() => {
              setSubTab('customers');
              setSearchQuery('');
            }}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded transition-colors cursor-pointer whitespace-nowrap ${
              subTab === 'customers'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            Customer ({customers.length})
          </button>
          <button
            type="button"
            onClick={() => {
              setSubTab('products');
              setSearchQuery('');
            }}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded transition-colors cursor-pointer whitespace-nowrap ${
              subTab === 'products'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Package className="w-3.5 h-3.5" />
            Barang / Produk ({products.length})
          </button>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 flex-1 sm:max-w-md">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={
                subTab === 'customers'
                  ? 'Cari nama customer, alamat, sales...'
                  : 'Cari nama barang atau satuan...'
              }
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-md border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20 focus:border-[#1D4ED8]"
            />
          </div>

          <select
            value={sortMode}
            onChange={(e) => setSortMode(e.target.value as SortMode)}
            className="px-2.5 py-1.5 text-xs rounded-md border border-slate-300 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20 focus:border-[#1D4ED8]"
          >
            <option value="usage">Paling Sering</option>
            <option value="recent">Terbaru</option>
            <option value="alpha">Urut A–Z</option>
          </select>
        </div>
      </div>

      {/* Main 12-Col Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Add/Edit Form */}
        {subTab === 'customers' ? (
          <form
            onSubmit={(e) => void handleSubmitCustomer(e)}
            className="lg:col-span-4 bg-white border border-slate-200 rounded-lg p-5 space-y-3.5"
          >
            <h2 className="text-sm font-semibold text-slate-900">
              {editingCustomerId ? 'Ubah Data Customer' : 'Tambah Customer Manual'}
            </h2>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Nama Customer / Pembeli
              </label>
              <input
                type="text"
                required
                value={custName}
                onChange={(e) => setCustName(e.target.value)}
                placeholder="Contoh: PT Ryuu Industry Indonesia"
                className="w-full px-3 py-2 text-sm rounded-md border border-slate-300 focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20 focus:border-[#1D4ED8]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Alamat / Keterangan (Opsional)
              </label>
              <textarea
                rows={3}
                value={custAddress}
                onChange={(e) => setCustAddress(e.target.value)}
                placeholder="Alamat pengiriman atau catatan pembeli"
                className="w-full px-3 py-2 text-sm rounded-md border border-slate-300 focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20 focus:border-[#1D4ED8] resize-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Sales Penanggung Jawab (Opsional)
              </label>
              <select
                value={custSales}
                onChange={(e) => setCustSales(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-md border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20 focus:border-[#1D4ED8]"
              >
                <option value="">-- Tidak ditetapkan --</option>
                {SALES_REP_OPTIONS.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button
                type="submit"
                disabled={isSaving || !custName.trim()}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-md bg-[#1D4ED8] text-white hover:bg-blue-800 disabled:opacity-50 transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                {editingCustomerId ? 'Simpan Perubahan' : 'Simpan Customer'}
              </button>
              {editingCustomerId && (
                <button
                  type="button"
                  onClick={resetCustomerForm}
                  className="px-3 py-2 text-xs font-medium rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Batal
                </button>
              )}
            </div>
          </form>
        ) : (
          <form
            onSubmit={(e) => void handleSubmitProduct(e)}
            className="lg:col-span-4 bg-white border border-slate-200 rounded-lg p-5 space-y-3.5"
          >
            <h2 className="text-sm font-semibold text-slate-900">
              {editingProductId ? 'Ubah Data Barang' : 'Tambah Barang Manual'}
            </h2>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Nama Barang
              </label>
              <input
                type="text"
                required
                value={prodName}
                onChange={(e) => setProdName(e.target.value)}
                placeholder="Contoh: Wijen Hitam Akram 10kg"
                className="w-full px-3 py-2 text-sm rounded-md border border-slate-300 focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20 focus:border-[#1D4ED8]"
              />
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Satuan Order
                </label>
                <select
                  value={prodUnit}
                  onChange={(e) => {
                    const nextUnit = e.target.value;
                    setProdUnit(nextUnit);
                    if (nextUnit.toLowerCase() === 'kg') {
                      setProdWeight(1);
                      setProdBasis('per_kg');
                    } else if (prodWeight <= 1) {
                      setProdWeight(10);
                    }
                  }}
                  className="w-full px-2.5 py-2 text-sm rounded-md border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20 focus:border-[#1D4ED8]"
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

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Berat / {prodUnit} (Kg)
                </label>
                <input
                  type="number"
                  min={0}
                  step="any"
                  disabled={isProdKg}
                  value={isProdKg ? 1 : prodWeight === 0 ? '' : prodWeight}
                  onChange={(e) => setProdWeight(Number(e.target.value) || 0)}
                  className="w-full px-2.5 py-2 text-sm font-mono tabular-nums rounded-md border border-slate-300 disabled:bg-slate-100 disabled:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20 focus:border-[#1D4ED8]"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Harga Default (Rp)
                </label>
                <input
                  type="number"
                  min={0}
                  value={prodHarga === 0 ? '' : prodHarga}
                  onChange={(e) => setProdHarga(Number(e.target.value) || 0)}
                  placeholder="59000"
                  className="w-full px-2.5 py-2 text-sm font-mono tabular-nums rounded-md border border-slate-300 focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20 focus:border-[#1D4ED8]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Basis Harga
                </label>
                <select
                  value={isProdKg ? 'per_kg' : prodBasis}
                  disabled={isProdKg}
                  onChange={(e) => setProdBasis(e.target.value as PriceBasis)}
                  className="w-full px-2.5 py-2 text-sm rounded-md border border-slate-300 bg-white disabled:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20 focus:border-[#1D4ED8]"
                >
                  <option value="per_kg">Per Kg</option>
                  {!isProdKg && <option value="per_unit">Per {prodUnit}</option>}
                </select>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button
                type="submit"
                disabled={isSaving || !prodName.trim()}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-md bg-[#1D4ED8] text-white hover:bg-blue-800 disabled:opacity-50 transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                {editingProductId ? 'Simpan Perubahan' : 'Simpan Barang'}
              </button>
              {editingProductId && (
                <button
                  type="button"
                  onClick={resetProductForm}
                  className="px-3 py-2 text-xs font-medium rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Batal
                </button>
              )}
            </div>
          </form>
        )}

        {/* Right: Records Table */}
        <div className="lg:col-span-8 bg-white border border-slate-200 rounded-lg overflow-hidden">
          {loadingMaster ? (
            <div className="p-8 text-center text-sm text-slate-500">
              Memuat database bersama...
            </div>
          ) : subTab === 'customers' ? (
            filteredCustomers.length === 0 ? (
              <div className="p-8 text-center">
                <p className="text-sm font-medium text-slate-700">
                  {searchQuery
                    ? 'Tidak ada customer yang cocok dengan pencarian.'
                    : 'Database customer masih kosong.'}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Ketik nama pembeli di Editor Invoice maka data otomatis tersimpan di sini, atau klik &ldquo;Tarik dari Log Invoice&rdquo;.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-200">
                {filteredCustomers.map((c) => (
                  <div
                    key={c.id}
                    className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/70 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-slate-900 break-words">
                          {c.name}
                        </span>
                        <span className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                          {c.usageCount}x dipakai
                        </span>
                        {c.defaultSalesName && (
                          <span className="text-[11px] px-1.5 py-0.5 rounded bg-blue-50 text-[#1D4ED8] border border-blue-200">
                            Sales: {c.defaultSalesName}
                          </span>
                        )}
                      </div>
                      {c.address ? (
                        <p className="text-xs text-slate-600 mt-1 whitespace-pre-line">
                          {c.address}
                        </p>
                      ) : (
                        <p className="text-xs text-slate-400 italic mt-1">Belum ada alamat tersimpan</p>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => onUseCustomer(c)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded border border-blue-200 bg-blue-50 text-[#1D4ED8] hover:bg-blue-100 transition-colors cursor-pointer whitespace-nowrap"
                      >
                        Pakai di Invoice
                        <ArrowRight className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        title="Ubah"
                        onClick={() => {
                          setEditingCustomerId(c.id);
                          setCustName(c.name);
                          setCustAddress(c.address);
                          setCustSales(c.defaultSalesName);
                        }}
                        className="p-1.5 rounded border border-slate-200 text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        title="Hapus"
                        onClick={() => void onDeleteCustomer(c)}
                        className="p-1.5 rounded border border-slate-200 text-slate-500 hover:text-red-600 hover:border-red-200 hover:bg-red-50 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : filteredProducts.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-sm font-medium text-slate-700">
                {searchQuery
                  ? 'Tidak ada barang yang cocok dengan pencarian.'
                  : 'Database barang masih kosong.'}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Ketik nama barang dan harga di Editor Invoice maka otomatis terekam sebagai memori, atau klik &ldquo;Tarik dari Log Invoice&rdquo;.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-200">
              {filteredProducts.map((p) => {
                const isKg = p.orderUnit.toLowerCase() === 'kg';
                const priceSuffix = isKg
                  ? 'kg'
                  : p.priceBasis === 'per_unit'
                  ? p.orderUnit
                  : 'kg';
                return (
                  <div
                    key={p.id}
                    className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/70 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-slate-900 break-words">
                          {p.name}
                        </span>
                        <span className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                          {p.usageCount}x dipakai
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600 mt-1 font-mono tabular-nums">
                        <span>
                          Satuan: <strong className="font-sans text-slate-800">{p.orderUnit}</strong>
                          {!isKg && ` (${formatWeight(p.weightPerUnit, 'comma')} kg/${p.orderUnit})`}
                        </span>
                        <span>·</span>
                        <span className="font-semibold text-slate-900">
                          Rp {formatAmount(p.harga, 'comma')} / {priceSuffix}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => onAddProductToInvoice(p)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded border border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 transition-colors cursor-pointer whitespace-nowrap"
                      >
                        <Plus className="w-3 h-3" />
                        Masukkan ke Invoice
                      </button>
                      <button
                        type="button"
                        title="Ubah"
                        onClick={() => {
                          setEditingProductId(p.id);
                          setProdName(p.name);
                          setProdUnit(p.orderUnit);
                          setProdWeight(p.weightPerUnit);
                          setProdHarga(p.harga);
                          setProdBasis(p.priceBasis);
                        }}
                        className="p-1.5 rounded border border-slate-200 text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        title="Hapus"
                        onClick={() => void onDeleteProduct(p)}
                        className="p-1.5 rounded border border-slate-200 text-slate-500 hover:text-red-600 hover:border-red-200 hover:bg-red-50 transition-colors cursor-pointer"
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
