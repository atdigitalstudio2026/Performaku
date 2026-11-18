import { jsPDF } from 'jspdf';
import { CompanyProfile, DocumentFooter, ProformaInvoiceData } from '../types/invoice';
import {
  calculateInvoiceTotals,
  formatAmount,
  loadImageAsPngDataUrl,
  sanitizeFilename,
} from './formatters';

export async function downloadProformaInvoicePdf(
  invoice: ProformaInvoiceData,
  company: CompanyProfile,
  footer?: DocumentFooter
): Promise<string> {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true,
  });

  const pageWidth = 210;
  const pageHeight = 297;
  const marginX = 18;
  const contentWidth = pageWidth - marginX * 2; // 174mm
  let cursorY = 15;

  // 1. KOPSURAT (Top-Left Logo + Optional Company Letterhead Info)
  let letterheadBottomY = cursorY;
  const hasLogo = Boolean(company.logoDataUrl);

  if (hasLogo) {
    try {
      const raster = await loadImageAsPngDataUrl(company.logoDataUrl);
      const maxLogoW = Math.min(Math.max(company.logoWidthMm || 16, 12), 85);
      const ratio = raster.height / raster.width;
      let drawW = maxLogoW;
      let drawH = drawW * ratio;
      if (drawH > 26) {
        drawH = 26;
        drawW = drawH / ratio;
      }
      doc.addImage(raster.dataUrl, 'PNG', marginX, cursorY, drawW, drawH);
      letterheadBottomY = Math.max(letterheadBottomY, cursorY + drawH);
    } catch {
      // Fallback cleanly if image fails to decode
    }
  }

  if (company.showLetterheadInfo) {
    const textX = hasLogo ? marginX + Math.min(Math.max(company.logoWidthMm || 16, 12), 85) + 6 : marginX;
    const textAlign: 'left' | 'right' = hasLogo ? 'right' : 'left';
    const anchorX = hasLogo ? pageWidth - marginX : textX;

    let infoY = cursorY + 4;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11.5);
    doc.setTextColor(15, 23, 42);
    doc.text(company.name || 'Nama Perusahaan', anchorX, infoY, { align: textAlign });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(71, 85, 105);

    const infoLines = [
      [company.addressLine1, company.addressLine2].filter(Boolean).join(', '),
      [company.phone, company.email].filter(Boolean).join('  |  '),
    ].filter(Boolean);

    for (const line of infoLines) {
      infoY += 4.2;
      doc.text(line, anchorX, infoY, { align: textAlign });
    }

    letterheadBottomY = Math.max(letterheadBottomY, infoY + 2);
  }

  if (hasLogo || company.showLetterheadInfo) {
    cursorY = letterheadBottomY + 4;
    if (company.showLetterheadDivider) {
      doc.setDrawColor(15, 23, 42);
      doc.setLineWidth(0.55);
      doc.line(marginX, cursorY, pageWidth - marginX, cursorY);
      doc.setDrawColor(203, 213, 225);
      doc.setLineWidth(0.2);
      doc.line(marginX, cursorY + 1, pageWidth - marginX, cursorY + 1);
      cursorY += 7.5;
    } else {
      cursorY += 3;
    }
  }

  // 2. DOCUMENT TITLE & DATE
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text((invoice.title || 'PROFORMA INVOICE').toUpperCase(), marginX, cursorY);

  if (invoice.showInvoiceNumber && invoice.invoiceNumber.trim()) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text('NOMOR DOKUMEN', pageWidth - marginX, cursorY - 2, { align: 'right' });
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(15, 23, 42);
    doc.text(invoice.invoiceNumber.trim(), pageWidth - marginX, cursorY + 2.5, { align: 'right' });
  }

  cursorY += 5.5;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(51, 65, 85);
  doc.text(invoice.cityDate || '', marginX, cursorY);

  cursorY += 3.5;
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.25);
  doc.line(marginX, cursorY, pageWidth - marginX, cursorY);
  cursorY += 7;

  // 3. BUYER (PEMBELI) & SELLER (PENJUAL)
  const buyerStartY = cursorY;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text('PEMBELI', marginX, buyerStartY);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  const buyerNameLines = doc.splitTextToSize(invoice.buyerName || '-', 90);
  doc.text(buyerNameLines, marginX, buyerStartY + 5);

  let buyerEndY = buyerStartY + 5 + buyerNameLines.length * 4.5;
  if (invoice.buyerAddress.trim()) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105);
    const addrLines = doc.splitTextToSize(invoice.buyerAddress.trim(), 90);
    doc.text(addrLines, marginX, buyerEndY + 0.5);
    buyerEndY += addrLines.length * 4.2 + 1;
  }

  // Seller on right column
  const sellerX = marginX + 102;
  const sellerMaxW = pageWidth - marginX - sellerX;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text('PENJUAL', sellerX, buyerStartY);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  const sellerNameLines = doc.splitTextToSize(company.name || '-', sellerMaxW);
  doc.text(sellerNameLines, sellerX, buyerStartY + 5);

  let sellerY = buyerStartY + 5 + sellerNameLines.length * 4.5 + 0.5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  const sellerDetails = [company.addressLine1, company.addressLine2, company.phone, company.email]
    .map((s) => s.trim())
    .filter(Boolean);

  for (const detail of sellerDetails) {
    const wrapped = doc.splitTextToSize(detail, sellerMaxW);
    doc.text(wrapped, sellerX, sellerY);
    sellerY += wrapped.length * 4.2;
  }

  cursorY = Math.max(buyerEndY, sellerY) + 7;

  // 4. PROFESSIONAL TABLE GEOMETRY (174mm total width)
  const colW = {
    no: 11,
    nama: 64,
    inner: 18,
    harga: 23,
    qty: 18,
    jumlah: 40,
  };

  const colX = {
    no: marginX,
    nama: marginX + colW.no,
    inner: marginX + colW.no + colW.nama,
    harga: marginX + colW.no + colW.nama + colW.inner,
    qty: marginX + colW.no + colW.nama + colW.inner + colW.harga,
    jumlah: marginX + colW.no + colW.nama + colW.inner + colW.harga + colW.qty,
  };

  const drawTableHeader = (startY: number): number => {
    const hTop = 6.5;
    const hSub = 5.2;
    const totalH = hTop + hSub; // 11.7mm

    // Deep slate #1E293B top fill, #273549 sub-header fill
    doc.setFillColor(30, 41, 59);
    doc.rect(marginX, startY, contentWidth, hTop, 'F');
    doc.setFillColor(39, 53, 73);
    doc.rect(colX.harga, startY + hTop, colW.harga + colW.qty, hSub, 'F');
    // Keep spanning columns solid #1E293B
    doc.setFillColor(30, 41, 59);
    doc.rect(marginX, startY + hTop, colW.no + colW.nama + colW.inner, hSub, 'F');
    doc.rect(colX.jumlah, startY + hTop, colW.jumlah, hSub, 'F');

    // Subtle header dividers (#334155)
    doc.setDrawColor(51, 65, 85);
    doc.setLineWidth(0.25);
    doc.line(colX.nama, startY, colX.nama, startY + totalH);
    doc.line(colX.inner, startY, colX.inner, startY + totalH);
    doc.line(colX.harga, startY, colX.harga, startY + totalH);
    doc.line(colX.qty, startY, colX.qty, startY + totalH);
    doc.line(colX.jumlah, startY, colX.jumlah, startY + totalH);
    doc.line(colX.harga, startY + hTop, colX.jumlah, startY + hTop);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(255, 255, 255);

    doc.text('No', colX.no + colW.no / 2, startY + totalH / 2 + 1, { align: 'center' });
    doc.text('Nama Barang', colX.nama + 3, startY + totalH / 2 + 1);
    doc.text('Inner', colX.inner + colW.inner / 2, startY + totalH / 2 + 1, { align: 'center' });

    doc.text(invoice.priceHeader || 'Harga/kg', colX.harga + colW.harga - 2.5, startY + 4.4, {
      align: 'right',
    });
    doc.text(invoice.qtyHeader || 'Qty Order', colX.qty + colW.qty - 2.5, startY + 4.4, {
      align: 'right',
    });
    doc.text('Jumlah', colX.jumlah + colW.jumlah - 3, startY + totalH / 2 + 1, {
      align: 'right',
    });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.8);
    doc.setTextColor(203, 213, 225);
    doc.text(invoice.taxLabel || 'Inc PPN', colX.harga + colW.harga - 2.5, startY + hTop + 3.6, {
      align: 'right',
    });
    doc.text(invoice.qtyUnit || 'Kg', colX.qty + colW.qty - 2.5, startY + hTop + 3.6, {
      align: 'right',
    });

    return startY + totalH;
  };

  cursorY = drawTableHeader(cursorY);

  // Table rows with subtle zebra fill and clean hairlines
  const items = invoice.items.length > 0 ? invoice.items : [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const lineTotal = (Number(item.harga) || 0) * (Number(item.qty) || 0);

    const nameLines = doc.splitTextToSize(item.namaBarang || '-', colW.nama - 6);
    const rowH = Math.max(8.5, nameLines.length * 4.5 + 4);

    if (cursorY + rowH > pageHeight - 55) {
      doc.addPage();
      cursorY = 18;
      cursorY = drawTableHeader(cursorY);
    }

    if (i % 2 === 1) {
      doc.setFillColor(248, 250, 252);
      doc.rect(marginX, cursorY, contentWidth, rowH, 'F');
    }

    // Subtle outer vertical frame + hairline column & row dividers (#E2E8F0 & #CBD5E1)
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.25);
    doc.line(marginX, cursorY, marginX, cursorY + rowH);
    doc.line(pageWidth - marginX, cursorY, pageWidth - marginX, cursorY + rowH);

    doc.setDrawColor(226, 232, 240);
    doc.line(colX.nama, cursorY, colX.nama, cursorY + rowH);
    doc.line(colX.inner, cursorY, colX.inner, cursorY + rowH);
    doc.line(colX.harga, cursorY, colX.harga, cursorY + rowH);
    doc.line(colX.qty, cursorY, colX.qty, cursorY + rowH);
    doc.line(colX.jumlah, cursorY, colX.jumlah, cursorY + rowH);
    doc.line(marginX, cursorY + rowH, pageWidth - marginX, cursorY + rowH);

    const singleTextY = cursorY + 5.5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105);
    doc.text(String(i + 1), colX.no + colW.no / 2, singleTextY, { align: 'center' });

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(nameLines, colX.nama + 3, singleTextY);

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(51, 65, 85);
    doc.text(item.inner || '-', colX.inner + colW.inner / 2, singleTextY, { align: 'center' });

    doc.setTextColor(30, 41, 59);
    doc.text(formatAmount(item.harga, invoice.numberFormat), colX.harga + colW.harga - 2.5, singleTextY, {
      align: 'right',
    });
    doc.text(formatAmount(item.qty, invoice.numberFormat), colX.qty + colW.qty - 2.5, singleTextY, {
      align: 'right',
    });

    // Jumlah column: subtle currency left, bold amount right
    doc.setTextColor(100, 116, 139);
    doc.text(invoice.currency || 'Rp', colX.jumlah + 3, singleTextY);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(formatAmount(lineTotal, invoice.numberFormat), colX.jumlah + colW.jumlah - 3, singleTextY, {
      align: 'right',
    });

    cursorY += rowH;
  }

  // Totals (Subtotal + PPN when exclude_add, then executive Grand Total)
  const { subtotal, ppnRate, ppnAmount, grandTotal, isExcludeAdd } =
    calculateInvoiceTotals(invoice);

  const drawSummaryRow = (label: string, amount: number, isGrandTotal: boolean) => {
    const rowH = isGrandTotal ? 8.5 : 7.5;
    if (cursorY + rowH > pageHeight - 50) {
      doc.addPage();
      cursorY = 18;
    }

    if (isGrandTotal) {
      doc.setFillColor(241, 245, 249);
      doc.rect(marginX, cursorY, contentWidth, rowH, 'F');
    }

    // Outer left/right border
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.25);
    doc.line(marginX, cursorY, marginX, cursorY + rowH);
    doc.line(pageWidth - marginX, cursorY, pageWidth - marginX, cursorY + rowH);
    doc.line(colX.jumlah, cursorY, colX.jumlah, cursorY + rowH);

    if (isGrandTotal) {
      doc.setDrawColor(30, 41, 59);
      doc.setLineWidth(0.5);
      doc.line(marginX, cursorY, pageWidth - marginX, cursorY);
      doc.setDrawColor(203, 213, 225);
      doc.setLineWidth(0.35);
      doc.line(marginX, cursorY + rowH, pageWidth - marginX, cursorY + rowH);
    } else {
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.25);
      doc.line(marginX, cursorY + rowH, pageWidth - marginX, cursorY + rowH);
    }

    const textY = cursorY + (isGrandTotal ? 5.6 : 5.0);
    doc.setFont('helvetica', isGrandTotal ? 'bold' : 'normal');
    doc.setFontSize(isGrandTotal ? 9.5 : 9);
    doc.setTextColor(isGrandTotal ? 15 : 71, isGrandTotal ? 23 : 85, isGrandTotal ? 42 : 105);
    doc.text(label, colX.jumlah - 3, textY, { align: 'right' });

    doc.setFont('helvetica', isGrandTotal ? 'bold' : 'normal');
    doc.setTextColor(isGrandTotal ? 15 : 100, isGrandTotal ? 23 : 116, isGrandTotal ? 42 : 139);
    doc.text(invoice.currency || 'Rp', colX.jumlah + 3, textY);

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(formatAmount(amount, invoice.numberFormat), colX.jumlah + colW.jumlah - 3, textY, {
      align: 'right',
    });

    cursorY += rowH;
  };

  if (isExcludeAdd) {
    drawSummaryRow('Subtotal', subtotal, false);
    drawSummaryRow(`PPN (${ppnRate}%)`, ppnAmount, false);
  }

  drawSummaryRow('Grand Total', grandTotal, true);

  cursorY += 8;

  // 5. NOTED & PAYMENT BANK DETAILS PANEL
  const extraLines = invoice.additionalNote.trim()
    ? doc.splitTextToSize(invoice.additionalNote.trim(), contentWidth - 10)
    : [];
  const boxH = 34 + (extraLines.length > 0 ? extraLines.length * 4.2 + 3 : 0);

  if (cursorY + boxH > pageHeight - 15) {
    doc.addPage();
    cursorY = 20;
  }

  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.3);
  doc.roundedRect(marginX, cursorY, contentWidth, boxH, 1.5, 1.5, 'FD');

  let boxY = cursorY + 5.5;
  const boxX = marginX + 5;
  const bank = invoice.bankAccount;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.8);
  doc.setTextColor(100, 116, 139);
  doc.text('NOTED & INFORMASI PEMBAYARAN', boxX, boxY);
  boxY += 5.5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(30, 41, 59);
  doc.text(`Transfer ke rek ${bank.bankName || 'BANK'}`, boxX, boxY);
  boxY += 4.6;

  doc.text(`${bank.bankShortName || bank.bankName}   a/n ${bank.accountHolder || '-'}`, boxX, boxY);
  boxY += 4.8;

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(`Bank ${bank.bankShortName || bank.bankName} A/C : ${bank.accountNumber || '-'}`, boxX, boxY);
  boxY += 3.5;

  // Executive highlight bar for Nilai Transfer
  const transferBarW = 108;
  const transferBarH = 7.2;
  if (invoice.highlightTransferTotal) {
    doc.setFillColor(254, 243, 199);
    doc.setDrawColor(245, 158, 11);
  } else {
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(203, 213, 225);
  }
  doc.setLineWidth(0.25);
  doc.roundedRect(boxX, boxY, transferBarW, transferBarH, 1, 1, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.2);
  doc.setTextColor(15, 23, 42);
  doc.text('Nilai Transfer', boxX + 3, boxY + 4.9);
  doc.text(invoice.currency || 'Rp', boxX + 68, boxY + 4.9);
  doc.text(formatAmount(grandTotal, invoice.numberFormat), boxX + transferBarW - 3, boxY + 4.9, {
    align: 'right',
  });

  boxY += transferBarH + 4.5;

  if (extraLines.length > 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(71, 85, 105);
    doc.text(extraLines, boxX, boxY);
  }

  cursorY += boxH + 6;

  // Optional Signature Block
  if (invoice.showSignature) {
    if (cursorY + 32 > pageHeight - 28) {
      doc.addPage();
      cursorY = 24;
    } else {
      cursorY += 4;
    }

    const sigCenterX = pageWidth - marginX - 28;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(15, 23, 42);
    doc.text('Hormat kami,', sigCenterX, cursorY, { align: 'center' });

    cursorY += 20;
    doc.setFont('helvetica', 'bold');
    doc.text(invoice.signatureName || 'Finance', sigCenterX, cursorY, { align: 'center' });
    doc.setDrawColor(15, 23, 42);
    doc.setLineWidth(0.25);
    doc.line(sigCenterX - 22, cursorY + 1, sigCenterX + 22, cursorY + 1);

    if (invoice.signatureTitle.trim()) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(71, 85, 105);
      doc.text(invoice.signatureTitle.trim(), sigCenterX, cursorY + 5, { align: 'center' });
    }
  }

  // 6. DOCUMENT FOOTER (Drawn at bottom of every page)
  if (footer?.enabled) {
    const totalPages = doc.getNumberOfPages();
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    const rightWidth = Math.max(
      doc.getTextWidth(footer.phone || ''),
      doc.getTextWidth(footer.fax || ''),
      38
    );
    const rightColX = pageWidth - marginX - rightWidth;

    for (let p = 1; p <= totalPages; p++) {
      doc.setPage(p);
      const lineY = pageHeight - 23;
      const row1Y = pageHeight - 18;
      const row2Y = pageHeight - 13.5;

      doc.setDrawColor(203, 213, 225);
      doc.setLineWidth(0.3);
      doc.line(marginX, lineY, pageWidth - marginX, lineY);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(15, 23, 42);
      if (footer.companyName) {
        doc.text(footer.companyName, marginX, row1Y);
      }

      doc.setFont('helvetica', 'normal');
      doc.setTextColor(51, 65, 85);
      if (footer.address) {
        doc.text(footer.address, marginX, row2Y);
      }

      if (footer.phone) {
        doc.text(footer.phone, rightColX, row1Y);
      }
      if (footer.fax) {
        doc.text(footer.fax, rightColX, row2Y);
      }
    }
  }

  const buyerSlug = sanitizeFilename(invoice.buyerName || 'Customer');
  const filename = `Proforma_Invoice_${buyerSlug || 'Dokumen'}.pdf`;
  doc.save(filename);
  return filename;
}
