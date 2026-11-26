import { CompanyProfile, InvoicePaymentStatus, ProformaInvoiceData } from '../types/invoice';
import { calculateInvoiceTotals, calculateItemMetrics, formatAmount, formatWeight } from './formatters';

export type WhatsAppTemplateMode = 'invoice' | 'reminder' | 'paid';

export function normalizeIndonesianPhone(rawPhone: string): string {
  const digits = (rawPhone || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('0')) {
    return `62${digits.slice(1)}`;
  }
  if (digits.startsWith('8')) {
    return `62${digits}`;
  }
  return digits;
}

export function buildWhatsAppUrl(phone: string, message: string): string {
  const normalized = normalizeIndonesianPhone(phone);
  const encoded = encodeURIComponent(message);
  if (normalized) {
    return `https://wa.me/${normalized}?text=${encoded}`;
  }
  return `https://wa.me/?text=${encoded}`;
}

export function getDefaultTemplateForStatus(status?: InvoicePaymentStatus): WhatsAppTemplateMode {
  if (status === 'paid') return 'paid';
  if (status === 'pending') return 'reminder';
  return 'invoice';
}

export function generateWhatsAppMessage(
  invoice: ProformaInvoiceData,
  company: CompanyProfile,
  mode: WhatsAppTemplateMode = 'invoice'
): string {
  const totals = calculateInvoiceTotals(invoice);
  const fmt = invoice.numberFormat || 'dot';
  const curr = invoice.currency || 'Rp';
  const buyer = (invoice.buyerName || '').trim() || 'Bapak/Ibu';
  const seller = (company.name || '').trim() || 'Perusahaan Kami';
  const docTitle = (invoice.title || 'Proforma Invoice').trim();

  const lines: string[] = [];

  lines.push(`Halo Bapak/Ibu *${buyer}*,`);
  lines.push('');

  if (mode === 'reminder') {
    lines.push(
      `Mohon izin mengingatkan terkait pembayaran *${docTitle}* dari *${seller}* yang saat ini masih menunggu pelunasan:`
    );
  } else if (mode === 'paid') {
    lines.push(
      `Terima kasih, pembayaran untuk *${docTitle}* dari *${seller}* berikut telah kami terima dengan status *LUNAS*:`
    );
  } else {
    lines.push(
      `Berikut kami sampaikan ringkasan *${docTitle}* dari *${seller}*:`
    );
  }

  lines.push('');

  if (invoice.showInvoiceNumber && invoice.invoiceNumber.trim()) {
    lines.push(`• No. Invoice: *${invoice.invoiceNumber.trim()}*`);
  }
  if (invoice.cityDate.trim()) {
    lines.push(`• Tanggal: ${invoice.cityDate.trim()}`);
  }

  const validItems = (invoice.items || []).filter(
    (item) => item.namaBarang.trim() !== '' || item.qty > 0 || item.harga > 0
  );

  if (validItems.length > 0) {
    lines.push('');
    lines.push('*Rincian Pesanan:*');
    validItems.forEach((item, idx) => {
      const m = calculateItemMetrics(item);
      const name = item.namaBarang.trim() || `Barang #${idx + 1}`;
      const isKg = m.orderUnit.toLowerCase() === 'kg';
      const safeQty = Math.max(0, Number(item.qty) || 0);
      const qtyText = isKg
        ? `${formatWeight(safeQty, fmt)} kg`
        : `${formatWeight(safeQty, fmt)} ${m.orderUnit} (${formatWeight(m.totalWeightKg, fmt)} kg)`;
      lines.push(
        `${idx + 1}. ${name} — ${qtyText} = ${curr} ${formatAmount(m.lineTotal, fmt)}`
      );
    });
  }

  lines.push('');
  lines.push(`• Total Berat: ${formatWeight(totals.totalWeightKg, fmt)} kg`);

  if (totals.isExcludeAdd && totals.ppnAmount > 0) {
    lines.push(
      `• Subtotal: ${curr} ${formatAmount(totals.subtotal, fmt)}`
    );
    lines.push(
      `• PPN (${totals.ppnRate}%): ${curr} ${formatAmount(totals.ppnAmount, fmt)}`
    );
  }

  if (totals.shippingCost > 0) {
    lines.push(
      `• ${invoice.shippingLabel || 'Biaya Ongkir'}: ${curr} ${formatAmount(totals.shippingCost, fmt)}`
    );
  }

  if (totals.appliedDeposit > 0) {
    lines.push(`• Total Tagihan: ${curr} ${formatAmount(totals.grandTotal, fmt)}`);
    lines.push(
      `• ${invoice.depositLabel || 'Deposit Kelebihan Bayar'}: -${curr} ${formatAmount(totals.appliedDeposit, fmt)}`
    );
    lines.push(
      `• *Sisa yang Harus Ditransfer: ${curr} ${formatAmount(totals.netPayable, fmt)}*`
    );
  } else {
    lines.push(
      `• *Total Transfer: ${curr} ${formatAmount(totals.netPayable, fmt)}*`
    );
  }

  if (mode !== 'paid') {
    const bank = invoice.bankAccount;
    lines.push('');
    lines.push('*Rekening Pembayaran:*');
    if (bank.bankName || bank.bankShortName) {
      lines.push(`${bank.bankName || bank.bankShortName}`);
    }
    if (bank.accountHolder) {
      lines.push(`A/N: ${bank.accountHolder}`);
    }
    if (bank.accountNumber) {
      lines.push(`No. Rek: *${bank.accountNumber}*`);
    }
  }

  if (invoice.additionalNote.trim()) {
    lines.push('');
    lines.push(`Catatan: ${invoice.additionalNote.trim()}`);
  }

  lines.push('');
  if (mode === 'paid') {
    lines.push(
      'Terima kasih atas kerja samanya. Pesanan Anda segera kami proses sesuai jadwal.'
    );
  } else if (mode === 'reminder') {
    lines.push(
      'Mohon kesediaannya mengirimkan bukti transfer setelah pembayaran dilakukan agar pesanan dapat segera kami proses. Terima kasih.'
    );
  } else {
    lines.push(
      'File PDF Proforma Invoice kami lampirkan bersama pesan ini. Mohon kirimkan bukti transfer setelah pembayaran dilakukan. Terima kasih.'
    );
  }

  const salesName = (invoice.salesName || '').trim();
  if (salesName) {
    lines.push('');
    lines.push('Best regards,');
    lines.push(`*${salesName}*`);
    lines.push(seller);
  } else {
    lines.push('');
    lines.push(`Salam hangat,`);
    lines.push(`*${seller}*`);
  }

  return lines.join('\n');
}

export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fallback below
    }
  }

  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    textarea.style.top = '0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}
