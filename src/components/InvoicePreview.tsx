import React from 'react';
import { CompanyProfile, DocumentFooter, ProformaInvoiceData } from '../types/invoice';
import {
  calculateInvoiceTotals,
  calculateItemMetrics,
  formatAmount,
  formatWeight,
  getTableHeaderPalette,
} from '../utils/formatters';

interface InvoicePreviewProps {
  invoice: ProformaInvoiceData;
  company: CompanyProfile;
  footer: DocumentFooter;
  scale?: number;
}

export const InvoicePreview: React.FC<InvoicePreviewProps> = ({
  invoice,
  company,
  footer,
  scale = 1,
}) => {
  const {
    subtotal,
    totalWeightKg,
    ppnRate,
    ppnAmount,
    shippingCost,
    grandTotal,
    depositAmount,
    appliedDeposit,
    netPayable,
    isExcludeAdd,
  } = calculateInvoiceTotals(invoice);
  const hasDeposit = depositAmount > 0;
  const hasShipping = shippingCost > 0;
  const showSubtotalBreakdown = isExcludeAdd || hasShipping;
  const headerPalette = getTableHeaderPalette(invoice.tableHeaderColor);

  const hasLogo = Boolean(company.logoDataUrl);
  const logoWidthPx = Math.min(Math.max(company.logoWidthMm || 16, 10), 115) * 3.7795;

  return (
    <div
      className="origin-top transition-transform duration-150 ease-out"
      style={{
        transform: `scale(${scale})`,
        width: '210mm',
        marginBottom: scale < 1 ? `calc(-297mm * ${1 - scale})` : undefined,
      }}
    >
      <div
        className="print-only-sheet bg-white text-slate-900 shadow-[0_10px_35px_-10px_rgba(15,23,42,0.18)] border border-slate-200 flex flex-col justify-between"
        style={{
          width: '210mm',
          minHeight: '297mm',
          padding: '15mm 18mm 14mm 18mm',
          fontFamily: '"DM Sans", Arial, Helvetica, sans-serif',
          fontSize: '12.5px',
          lineHeight: 1.45,
        }}
      >
        <div>
        {/* Kopsurat: Logo di pojok kiri atas + info perusahaan */}
        {(hasLogo || company.showLetterheadInfo) && (
          <div className="mb-6">
            <div className="flex items-start justify-between gap-6">
              <div className="shrink-0 flex items-start">
                {hasLogo && (
                  <img
                    src={company.logoDataUrl}
                    alt={company.name || 'Logo Perusahaan'}
                    referrerPolicy="no-referrer"
                    style={{
                      width: `${logoWidthPx}px`,
                      maxHeight: '55mm',
                      objectFit: 'contain',
                      objectPosition: 'left top',
                    }}
                  />
                )}
              </div>

              {company.showLetterheadInfo && (
                <div className={hasLogo ? 'text-right' : 'text-left flex-1'}>
                  <div className="font-bold text-[15px] text-slate-900 leading-snug">
                    {company.name || 'Nama Perusahaan'}
                  </div>
                  {(company.addressLine1 || company.addressLine2) && (
                    <div className="text-[11px] text-slate-600 mt-0.5">
                      {[company.addressLine1, company.addressLine2].filter(Boolean).join(', ')}
                    </div>
                  )}
                  {(company.phone || company.email) && (
                    <div className="text-[11px] text-slate-600">
                      {[company.phone, company.email].filter(Boolean).join('  |  ')}
                    </div>
                  )}
                </div>
              )}
            </div>

            {company.showLetterheadDivider && (
              <div className="mt-3.5 border-t-2 border-slate-900 pt-[2px]">
                <div className="border-t border-slate-300" />
              </div>
            )}
          </div>
        )}

        {/* Judul Dokumen & Tanggal */}
        <div className="mb-6 flex items-baseline justify-between gap-4 border-b border-slate-200 pb-3.5">
          <div>
            <h1 className="font-bold text-[17px] tracking-tight text-slate-900 uppercase">
              {invoice.title || 'PROFORMA INVOICE'}
            </h1>
            <div className="font-semibold text-[12.5px] text-slate-700 mt-1">
              {invoice.cityDate}
            </div>
          </div>

          {invoice.showInvoiceNumber && invoice.invoiceNumber.trim() && (
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-wider text-slate-500 font-medium">
                Nomor Dokumen
              </div>
              <div className="text-[12.5px] font-semibold text-slate-900 tabular-nums font-mono">
                {invoice.invoiceNumber}
              </div>
            </div>
          )}
        </div>

        {/* Pembeli & Penjual */}
        <div className="grid grid-cols-12 gap-6 mb-6 text-[12.5px]">
          <div className="col-span-7">
            <div className="text-[10.5px] uppercase tracking-wider font-semibold text-slate-500 mb-1">
              Pembeli
            </div>
            <div className="font-bold text-[13.5px] text-slate-900">
              {invoice.buyerName || '-'}
            </div>
            {invoice.buyerAddress.trim() && (
              <div className="text-slate-600 whitespace-pre-line mt-1 text-[12px] leading-relaxed">
                {invoice.buyerAddress}
              </div>
            )}
          </div>

          <div className="col-span-5">
            <div className="text-[10.5px] uppercase tracking-wider font-semibold text-slate-500 mb-1">
              Penjual
            </div>
            <div className="font-bold text-[13.5px] text-slate-900">
              {company.name || '-'}
            </div>
            <div className="text-slate-600 mt-1 text-[12px] leading-relaxed">
              {company.addressLine1 && <div>{company.addressLine1}</div>}
              {company.addressLine2 && <div>{company.addressLine2}</div>}
              {company.phone && <div>{company.phone}</div>}
              {company.email && <div className="text-[11.5px]">{company.email}</div>}
            </div>
          </div>
        </div>

        {/* Tabel Item Fleksibel (Dus/Kg/Bal/Sak + Berat Otomatis) */}
        <div className="mb-7 overflow-hidden rounded-md border border-slate-300">
          <table className="w-full table-fixed border-collapse text-[11.5px] tabular-nums">
            <thead>
              <tr
                className="font-semibold"
                style={{
                  backgroundColor: headerPalette.mainHex,
                  color: headerPalette.textHex,
                }}
              >
                <th
                  rowSpan={2}
                  className="px-1.5 py-2 text-center w-[8mm] text-[11px]"
                  style={{ borderRight: `1px solid ${headerPalette.borderHex}` }}
                >
                  No
                </th>
                <th
                  rowSpan={2}
                  className="px-2.5 py-2 text-left w-[54mm] text-[11px]"
                  style={{ borderRight: `1px solid ${headerPalette.borderHex}` }}
                >
                  Nama Barang
                </th>
                <th
                  rowSpan={2}
                  className="px-1.5 py-2 text-center w-[19mm] text-[11px]"
                  style={{ borderRight: `1px solid ${headerPalette.borderHex}` }}
                >
                  {invoice.qtyHeader || 'Qty Order'}
                </th>
                <th
                  colSpan={2}
                  className="px-2 py-1.5 text-center w-[32mm] text-[11px]"
                  style={{
                    borderRight: `1px solid ${headerPalette.borderHex}`,
                    borderBottom: `1px solid ${headerPalette.borderHex}`,
                  }}
                >
                  Berat (Kg)
                </th>
                <th
                  className="px-2 py-1.5 text-right w-[27mm] text-[11px]"
                  style={{
                    borderRight: `1px solid ${headerPalette.borderHex}`,
                    borderBottom: `1px solid ${headerPalette.borderHex}`,
                  }}
                >
                  {invoice.priceHeader || 'Harga Satuan'}
                </th>
                <th
                  rowSpan={2}
                  className="px-2.5 py-2 text-right w-[34mm] text-[11px]"
                >
                  Jumlah
                </th>
              </tr>
              <tr
                className="font-medium text-[10px]"
                style={{
                  backgroundColor: headerPalette.subHex,
                  color: headerPalette.subTextHex,
                }}
              >
                <th
                  className="px-1 py-1 text-center w-[15mm]"
                  style={{ borderRight: `1px solid ${headerPalette.borderHex}` }}
                >
                  Isi / Unit
                </th>
                <th
                  className="px-1.5 py-1 text-right w-[17mm]"
                  style={{ borderRight: `1px solid ${headerPalette.borderHex}` }}
                >
                  Total
                </th>
                <th
                  className="px-2 py-1 text-right"
                  style={{ borderRight: `1px solid ${headerPalette.borderHex}` }}
                >
                  {invoice.taxLabel || 'Inc PPN'}
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-200">
              {invoice.items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-slate-400 italic">
                    Belum ada barang ditambahkan
                  </td>
                </tr>
              ) : (
                invoice.items.map((item, idx) => {
                  const m = calculateItemMetrics(item);
                  const isEven = idx % 2 === 1;
                  const isKgOrder = m.orderUnit.toLowerCase() === 'kg';
                  return (
                    <tr
                      key={item.id}
                      className={isEven ? 'bg-slate-50/80 text-slate-900' : 'bg-white text-slate-900'}
                    >
                      <td className="border-r border-slate-200 px-2 py-2.5 text-center align-top text-slate-600">
                        {idx + 1}
                      </td>
                      <td className="border-r border-slate-200 px-2.5 py-2.5 text-left align-top font-medium text-slate-900 break-words">
                        <div>{item.namaBarang || '-'}</div>
                        {item.itemNote?.trim() && (
                          <div className="mt-0.5 text-[10px] font-normal italic text-slate-500 leading-snug break-words whitespace-pre-line">
                            Catatan: {item.itemNote.trim()}
                          </div>
                        )}
                      </td>
                      <td className="border-r border-slate-200 px-2 py-2.5 text-center align-top text-slate-800 whitespace-nowrap">
                        <span className="font-semibold">{formatWeight(Number(item.qty) || 0, invoice.numberFormat)}</span>{' '}
                        <span className="text-slate-600">{m.orderUnit}</span>
                      </td>
                      <td className="border-r border-slate-200 px-1.5 py-2.5 text-center align-top text-slate-700 whitespace-nowrap">
                        {isKgOrder ? '-' : `${formatWeight(m.weightPerUnit, invoice.numberFormat)} kg`}
                      </td>
                      <td className="border-r border-slate-200 px-2 py-2.5 text-right align-top text-slate-800 whitespace-nowrap">
                        {formatWeight(m.totalWeightKg, invoice.numberFormat)} kg
                      </td>
                      <td className="border-r border-slate-200 px-2.5 py-2.5 text-right align-top text-slate-800 whitespace-nowrap">
                        <span>{formatAmount(item.harga, invoice.numberFormat)}</span>{' '}
                        <span className="text-[10px] text-slate-500">/{m.priceUnitSuffix}</span>
                      </td>
                      <td className="px-2.5 py-2.5 align-top font-medium text-slate-900">
                        <div className="flex items-center justify-between gap-1.5">
                          <span className="text-slate-500 font-normal">{invoice.currency || 'Rp'}</span>
                          <span className="text-right">
                            {formatAmount(m.lineTotal, invoice.numberFormat)}
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>

            <tfoot>
              {showSubtotalBreakdown && (
                <tr className="border-t border-slate-300 bg-white text-slate-700 font-medium">
                  <td colSpan={4} className="px-2.5 py-2 text-right text-[11px] font-semibold text-slate-600">
                    Total Berat
                  </td>
                  <td className="border-r border-slate-200 px-2 py-2 text-right text-[11px] font-semibold text-slate-700 whitespace-nowrap">
                    {formatWeight(totalWeightKg, invoice.numberFormat)} kg
                  </td>
                  <td className="border-r border-slate-200 px-2.5 py-2 text-right text-[11.5px]">
                    Subtotal
                  </td>
                  <td className="px-2.5 py-2">
                    <div className="flex items-center justify-between gap-1.5">
                      <span className="text-slate-500 font-normal">{invoice.currency || 'Rp'}</span>
                      <span className="text-right font-semibold text-slate-900">
                        {formatAmount(subtotal, invoice.numberFormat)}
                      </span>
                    </div>
                  </td>
                </tr>
              )}
              {isExcludeAdd && (
                <tr className="border-t border-slate-200 bg-white text-slate-700 font-medium">
                  <td colSpan={5} className="border-r border-slate-200 px-2.5 py-2" />
                  <td className="border-r border-slate-200 px-2.5 py-2 text-right text-[11.5px]">
                    PPN ({ppnRate}%)
                  </td>
                  <td className="px-2.5 py-2">
                    <div className="flex items-center justify-between gap-1.5">
                      <span className="text-slate-500 font-normal">{invoice.currency || 'Rp'}</span>
                      <span className="text-right font-semibold text-slate-900">
                        {formatAmount(ppnAmount, invoice.numberFormat)}
                      </span>
                    </div>
                  </td>
                </tr>
              )}
              {hasShipping && (
                <tr className="border-t border-slate-200 bg-white text-slate-700 font-medium">
                  <td colSpan={5} className="border-r border-slate-200 px-2.5 py-2" />
                  <td className="border-r border-slate-200 px-2.5 py-2 text-right text-[11.5px]">
                    {invoice.shippingLabel?.trim() || 'Biaya Ongkir'}
                  </td>
                  <td className="px-2.5 py-2">
                    <div className="flex items-center justify-between gap-1.5">
                      <span className="text-slate-500 font-normal">{invoice.currency || 'Rp'}</span>
                      <span className="text-right font-semibold text-slate-900">
                        {formatAmount(shippingCost, invoice.numberFormat)}
                      </span>
                    </div>
                  </td>
                </tr>
              )}
              <tr
                className={
                  hasDeposit
                    ? 'border-t border-slate-300 bg-white text-slate-800 font-semibold'
                    : 'border-t-2 border-slate-800 bg-slate-100 text-slate-900 font-bold'
                }
              >
                <td colSpan={4} className="px-2.5 py-2.5 text-right text-[11px] font-semibold text-slate-600">
                  {!showSubtotalBreakdown ? 'Total Berat' : ''}
                </td>
                <td className="border-r border-slate-300 px-2 py-2.5 text-right text-[11.5px] font-semibold text-slate-800 whitespace-nowrap">
                  {!showSubtotalBreakdown ? `${formatWeight(totalWeightKg, invoice.numberFormat)} kg` : ''}
                </td>
                <td className="border-r border-slate-300 px-2.5 py-2.5 text-right text-[12px]">
                  Grand Total
                </td>
                <td className="px-2.5 py-2.5 text-[12px]">
                  <div className="flex items-center justify-between gap-1.5">
                    <span className={hasDeposit ? 'text-slate-500 font-normal' : ''}>
                      {invoice.currency || 'Rp'}
                    </span>
                    <span className="text-right">
                      {formatAmount(grandTotal, invoice.numberFormat)}
                    </span>
                  </div>
                </td>
              </tr>

              {hasDeposit && (
                <>
                  <tr className="border-t border-slate-200 bg-white text-emerald-700 font-medium">
                    <td colSpan={5} className="border-r border-slate-200 px-2.5 py-2" />
                    <td className="border-r border-slate-200 px-2.5 py-2 text-right text-[11.5px]">
                      {invoice.depositLabel?.trim() || 'Deposit Kelebihan Bayar'}
                    </td>
                    <td className="px-2.5 py-2 text-[11.5px]">
                      <div className="flex items-center justify-between gap-1.5">
                        <span className="font-normal">{invoice.currency || 'Rp'}</span>
                        <span className="text-right font-semibold">
                          - {formatAmount(appliedDeposit, invoice.numberFormat)}
                        </span>
                      </div>
                    </td>
                  </tr>
                  <tr className="border-t-2 border-slate-800 bg-slate-100 text-slate-900 font-bold">
                    <td colSpan={5} className="border-r border-slate-300 px-2.5 py-2.5" />
                    <td className="border-r border-slate-300 px-2.5 py-2.5 text-right text-[12px]">
                      Sisa Pembayaran
                    </td>
                    <td className="px-2.5 py-2.5 text-[12px]">
                      <div className="flex items-center justify-between gap-1.5">
                        <span>{invoice.currency || 'Rp'}</span>
                        <span className="text-right">
                          {formatAmount(netPayable, invoice.numberFormat)}
                        </span>
                      </div>
                    </td>
                  </tr>
                </>
              )}
            </tfoot>
          </table>
        </div>

        {/* Noted & Info Rekening */}
        <div className="rounded-md border border-slate-200 bg-slate-50/70 p-4 text-[12px] text-slate-800">
          <div className="text-[10.5px] uppercase tracking-wider font-semibold text-slate-500 mb-2">
            Noted &amp; Informasi Pembayaran
          </div>

          <div className="space-y-1">
            <div>Transfer ke rek {invoice.bankAccount.bankName || 'BANK'}</div>
            <div>
              {invoice.bankAccount.bankShortName || invoice.bankAccount.bankName}
              {'   '}
              a/n {invoice.bankAccount.accountHolder || '-'}
            </div>
            <div className="font-bold text-slate-900">
              Bank {invoice.bankAccount.bankShortName || invoice.bankAccount.bankName} A/C :{' '}
              <span className="font-mono">{invoice.bankAccount.accountNumber || '-'}</span>
            </div>

            <div
              className={`mt-2.5 flex items-center font-bold px-3 py-2 rounded border tabular-nums ${
                invoice.highlightTransferTotal
                  ? 'bg-[#FEF3C7] border-[#F59E0B]/40 text-slate-900'
                  : 'bg-white border-slate-200 text-slate-900'
              }`}
              style={{ width: '108mm' }}
            >
              <span className="flex-1">Nilai Transfer</span>
              <span className="w-8">{invoice.currency || 'Rp'}</span>
              <span className="w-28 text-right">
                {formatAmount(netPayable, invoice.numberFormat)}
              </span>
            </div>

            {invoice.additionalNote.trim() && (
              <div className="pt-2.5 text-[11.5px] text-slate-600 whitespace-pre-line">
                {invoice.additionalNote}
              </div>
            )}
          </div>
        </div>

        {/* Best regards (kiri bawah) & Tanda tangan opsional (kanan bawah) */}
        {((invoice.showBestRegards !== false && Boolean(invoice.salesName?.trim())) ||
          invoice.showSignature) && (
          <div className="mt-10 flex items-start justify-between gap-8 text-[12px] text-slate-900">
            {invoice.showBestRegards !== false && invoice.salesName?.trim() ? (
              <div className="text-left min-w-[160px]">
                <div className="text-slate-700">Best regards,</div>
                <div className="h-14" />
                <div className="font-bold text-slate-900">{invoice.salesName.trim()}</div>
              </div>
            ) : (
              <div />
            )}

            {invoice.showSignature && (
              <div className="w-48 text-center pr-2">
                <div>Hormat kami,</div>
                <div className="h-14" />
                <div className="font-bold border-b border-slate-900 pb-0.5 inline-block min-w-[140px]">
                  {invoice.signatureName || 'Bagian Keuangan'}
                </div>
                {invoice.signatureTitle.trim() && (
                  <div className="text-[11px] text-slate-600 mt-1">{invoice.signatureTitle}</div>
                )}
              </div>
            )}
          </div>
        )}
        </div>

        {/* Footer Dokumen */}
        {footer.enabled && (
          <footer className="mt-10 pt-3 border-t border-slate-300 flex items-start justify-between gap-8 text-[11px] text-slate-700 leading-relaxed">
            <div className="text-left">
              <div className="font-bold text-slate-900">
                {(company.name || '').trim() || footer.companyName}
              </div>
              {footer.address && <div>{footer.address}</div>}
            </div>

            <div className="text-left shrink-0 tabular-nums">
              {footer.phone && <div>{footer.phone}</div>}
              {footer.fax && <div>{footer.fax}</div>}
            </div>
          </footer>
        )}
      </div>
    </div>
  );
};
