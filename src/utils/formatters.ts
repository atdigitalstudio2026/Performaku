import { InvoiceItem, ProformaInvoiceData } from '../types/invoice';

export function formatAmount(value: number, format: 'comma' | 'dot' = 'comma'): string {
  const safeValue = Number.isFinite(value) ? Math.round(value) : 0;
  if (format === 'dot') {
    return new Intl.NumberFormat('id-ID').format(safeValue);
  }
  return new Intl.NumberFormat('en-US').format(safeValue);
}

export function formatWeight(value: number, format: 'comma' | 'dot' = 'comma'): string {
  const safeValue = Number.isFinite(value) ? Math.round(value * 100) / 100 : 0;
  if (format === 'dot') {
    return new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 }).format(safeValue);
  }
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(safeValue);
}

export interface ItemMetrics {
  orderUnit: string;
  weightPerUnit: number;
  totalWeightKg: number;
  priceBasis: 'per_kg' | 'per_unit';
  priceUnitSuffix: string;
  lineTotal: number;
}

export function calculateItemMetrics(item: InvoiceItem): ItemMetrics {
  const orderUnit = (item.orderUnit || 'Kg').trim() || 'Kg';
  const qty = Math.max(0, Number(item.qty) || 0);
  const rawWeight = Number(item.weightPerUnit);
  const isKgOrder = orderUnit.toLowerCase() === 'kg';
  const weightPerUnit = isKgOrder ? 1 : Number.isFinite(rawWeight) ? Math.max(0, rawWeight) : 0;
  const totalWeightKg = isKgOrder ? qty : qty * weightPerUnit;

  const priceBasis = item.priceBasis || 'per_kg';
  const harga = Math.max(0, Number(item.harga) || 0);
  const lineTotal = priceBasis === 'per_kg' ? harga * totalWeightKg : harga * qty;
  const priceUnitSuffix = priceBasis === 'per_kg' ? 'kg' : orderUnit.toLowerCase();

  return {
    orderUnit,
    weightPerUnit,
    totalWeightKg,
    priceBasis,
    priceUnitSuffix,
    lineTotal,
  };
}

export interface InvoiceTotals {
  subtotal: number;
  totalWeightKg: number;
  ppnRate: number;
  ppnAmount: number;
  grandTotal: number;
  isExcludeAdd: boolean;
}

export function calculateInvoiceTotals(invoice: ProformaInvoiceData): InvoiceTotals {
  let subtotal = 0;
  let totalWeightKg = 0;

  for (const item of invoice.items) {
    const m = calculateItemMetrics(item);
    subtotal += m.lineTotal;
    totalWeightKg += m.totalWeightKg;
  }

  const ppnMode = invoice.ppnMode ?? 'include';
  const ppnRate = Number.isFinite(invoice.ppnRate) ? Math.max(0, invoice.ppnRate) : 11;
  const isExcludeAdd = ppnMode === 'exclude_add';
  const ppnAmount = isExcludeAdd ? Math.round((subtotal * ppnRate) / 100) : 0;
  const grandTotal = subtotal + ppnAmount;

  return {
    subtotal,
    totalWeightKg,
    ppnRate,
    ppnAmount,
    grandTotal,
    isExcludeAdd,
  };
}

export function sanitizeFilename(name: string): string {
  return name
    .trim()
    .replace(/[^a-zA-Z0-9\s_-]/g, '')
    .replace(/\s+/g, '_')
    .slice(0, 60);
}

export interface RasterizedImage {
  dataUrl: string;
  width: number;
  height: number;
}

export function loadImageAsPngDataUrl(src: string): Promise<RasterizedImage> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const natW = img.naturalWidth || 320;
      const natH = img.naturalHeight || 120;
      const scale = Math.min(4, 1000 / Math.max(natW, natH));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(natW * scale);
      canvas.height = Math.round(natH * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas context tidak tersedia'));
        return;
      }
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve({
        dataUrl: canvas.toDataURL('image/png'),
        width: natW,
        height: natH,
      });
    };
    img.onerror = () => reject(new Error('Gagal memuat gambar logo'));
    img.src = src;
  });
}

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Gagal membaca file gambar'));
      }
    };
    reader.onerror = () => reject(new Error('Gagal membaca file gambar'));
    reader.readAsDataURL(file);
  });
}
