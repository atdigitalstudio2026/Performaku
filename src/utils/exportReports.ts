import type ExcelJS from 'exceljs';
import { jsPDF } from 'jspdf';
import { SALES_REP_OPTIONS } from '../data/defaultInvoice';
import {
  InvoiceLogAction,
  InvoiceLogRecord,
  InvoicePaymentStatus,
  PpnMode,
} from '../types/invoice';
import { formatAmount, formatWeight, sanitizeFilename } from './formatters';

export interface SalesReportRow {
  salesName: string;
  label: string;
  paidCount: number;
  paidRevenue: number;
  paidWeightKg: number;
  pendingCount: number;
  pendingAmount: number;
  cancelledCount: number;
  totalCount: number;
}

export interface SalesPerformanceExportOptions {
  periodLabel: string;
  selectedSalesLabel: string;
  salesBreakdown: SalesReportRow[];
  scopedLogs: InvoiceLogRecord[];
}

const PAYMENT_LABELS: Record<InvoicePaymentStatus, string> = {
  paid: 'Lunas',
  pending: 'Pending',
  cancelled: 'Cancel',
};

const ACTION_LABELS: Record<InvoiceLogAction, string> = {
  pdf_export: 'Unduh PDF',
  manual_save: 'Simpan Log',
  print: 'Cetak',
  restored: 'Dibuka Ulang',
};

const PPN_LABELS: Record<PpnMode, string> = {
  include: 'Include PPN',
  exclude_add: '+ Tambah PPN',
  non_ppn: 'Non PPN',
};

const CURRENCY_FMT = '"Rp "#,##0;-"Rp "#,##0;"Rp "0';
const WEIGHT_FMT = '#,##0.##';
const INT_FMT = '#,##0';
const PCT_FMT = '0.0%';

const THIN_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
  left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
  bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
  right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
};

const HEADER_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FF1E293B' },
};

const TITLE_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FF0F172A' },
};

const SUBTITLE_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFF1F5F9' },
};

const ZEBRA_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFF8FAFC' },
};

const TOTAL_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFE2E8F0' },
};

function formatDateTimeId(ms: number): string {
  return new Date(ms).toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDateShortId(ms: number): string {
  return new Date(ms).toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function todayFileStamp(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function styleStatusCell(cell: ExcelJS.Cell, status: InvoicePaymentStatus) {
  cell.alignment = { horizontal: 'center', vertical: 'middle' };
  if (status === 'paid') {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCFCE7' } };
    cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF166534' } };
  } else if (status === 'pending') {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } };
    cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF92400E' } };
  } else {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
    cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF991B1B' } };
  }
}

function applyBannerHeader(
  ws: ExcelJS.Worksheet,
  lastColLetter: string,
  title: string,
  subtitle: string
) {
  ws.mergeCells(`A1:${lastColLetter}1`);
  const titleCell = ws.getCell('A1');
  titleCell.value = title;
  titleCell.fill = TITLE_FILL;
  titleCell.font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
  titleCell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
  ws.getRow(1).height = 30;

  ws.mergeCells(`A2:${lastColLetter}2`);
  const subCell = ws.getCell('A2');
  subCell.value = subtitle;
  subCell.fill = SUBTITLE_FILL;
  subCell.font = { name: 'Calibri', size: 9.5, italic: true, color: { argb: 'FF475569' } };
  subCell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
  ws.getRow(2).height = 22;

  ws.getRow(3).height = 10;
}

function applyTableHeaderStyle(
  row: ExcelJS.Row,
  alignments: ('left' | 'center' | 'right')[]
) {
  row.height = 28;
  row.eachCell((cell, colNumber) => {
    cell.fill = HEADER_FILL;
    cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.alignment = {
      horizontal: alignments[colNumber - 1] || 'left',
      vertical: 'middle',
      wrapText: true,
    };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF0F172A' } },
      bottom: { style: 'medium', color: { argb: 'FF0F172A' } },
      left: { style: 'thin', color: { argb: 'FF334155' } },
      right: { style: 'thin', color: { argb: 'FF334155' } },
    };
  });
}

function applyTotalRowStyle(
  row: ExcelJS.Row,
  colCount: number,
  alignments: ('left' | 'center' | 'right')[]
) {
  row.height = 24;
  for (let c = 1; c <= colCount; c++) {
    const cell = row.getCell(c);
    cell.fill = TOTAL_FILL;
    cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF0F172A' } };
    cell.alignment = { horizontal: alignments[c - 1] || 'left', vertical: 'middle' };
    cell.border = {
      top: { style: 'medium', color: { argb: 'FF1E293B' } },
      bottom: { style: 'double', color: { argb: 'FF1E293B' } },
      left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    };
  }
}

function buildSalesBreakdownFromLogs(logs: InvoiceLogRecord[]): SalesReportRow[] {
  const map = new Map<string, SalesReportRow>();

  for (const rep of SALES_REP_OPTIONS) {
    map.set(rep, {
      salesName: rep,
      label: rep,
      paidCount: 0,
      paidRevenue: 0,
      paidWeightKg: 0,
      pendingCount: 0,
      pendingAmount: 0,
      cancelledCount: 0,
      totalCount: 0,
    });
  }

  for (const log of logs) {
    if (log.status === 'archived') continue;
    const key = log.salesName?.trim() || '__unassigned__';
    if (!map.has(key)) {
      map.set(key, {
        salesName: key,
        label: key === '__unassigned__' ? 'Belum Ditentukan' : key,
        paidCount: 0,
        paidRevenue: 0,
        paidWeightKg: 0,
        pendingCount: 0,
        pendingAmount: 0,
        cancelledCount: 0,
        totalCount: 0,
      });
    }
    const row = map.get(key)!;
    row.totalCount += 1;
    if (log.paymentStatus === 'paid') {
      row.paidCount += 1;
      row.paidRevenue += log.grandTotal;
      row.paidWeightKg += log.totalWeightKg;
    } else if (log.paymentStatus === 'cancelled') {
      row.cancelledCount += 1;
    } else {
      row.pendingCount += 1;
      row.pendingAmount += log.grandTotal;
    }
  }

  const canonical = new Map<string, number>(SALES_REP_OPTIONS.map((n, i) => [n, i]));
  return Array.from(map.values()).sort((a, b) => {
    if (b.paidRevenue !== a.paidRevenue) return b.paidRevenue - a.paidRevenue;
    return (canonical.get(a.salesName) ?? 99) - (canonical.get(b.salesName) ?? 99);
  });
}

function addDetailedInvoiceSheet(
  wb: ExcelJS.Workbook,
  sheetName: string,
  title: string,
  subtitle: string,
  records: InvoiceLogRecord[],
  includeArchiveAndAction: boolean
) {
  const ws = wb.addWorksheet(sheetName, {
    pageSetup: {
      orientation: 'landscape',
      paperSize: 9, // A4
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
    },
  });

  const columns: {
    header: string;
    width: number;
    align: 'left' | 'center' | 'right';
    numFmt?: string;
  }[] = includeArchiveAndAction
    ? [
        { header: 'No', width: 6, align: 'center', numFmt: INT_FMT },
        { header: 'Tanggal Log', width: 18, align: 'left' },
        { header: 'Tanggal Dokumen', width: 20, align: 'left' },
        { header: 'No. Invoice', width: 18, align: 'left' },
        { header: 'Status Bayar', width: 13, align: 'center' },
        { header: 'Arsip', width: 10, align: 'center' },
        { header: 'Nama Sales', width: 18, align: 'left' },
        { header: 'Perusahaan (Penjual)', width: 26, align: 'left' },
        { header: 'Nama Pembeli', width: 26, align: 'left' },
        { header: 'Alamat Pembeli', width: 28, align: 'left' },
        { header: 'Jml Item', width: 10, align: 'center', numFmt: INT_FMT },
        { header: 'Total Berat (Kg)', width: 15, align: 'right', numFmt: WEIGHT_FMT },
        { header: 'Mode PPN', width: 14, align: 'center' },
        { header: 'Subtotal (Rp)', width: 18, align: 'right', numFmt: CURRENCY_FMT },
        { header: 'PPN (Rp)', width: 16, align: 'right', numFmt: CURRENCY_FMT },
        { header: 'Ongkir (Rp)', width: 16, align: 'right', numFmt: CURRENCY_FMT },
        { header: 'Grand Total (Rp)', width: 19, align: 'right', numFmt: CURRENCY_FMT },
        { header: 'Deposit (Rp)', width: 16, align: 'right', numFmt: CURRENCY_FMT },
        { header: 'Nilai Transfer (Rp)', width: 19, align: 'right', numFmt: CURRENCY_FMT },
        { header: 'Bank Tujuan', width: 14, align: 'left' },
        { header: 'No. Rekening', width: 18, align: 'left' },
        { header: 'Aktivitas', width: 13, align: 'center' },
        { header: 'Admin Pembuat', width: 16, align: 'left' },
      ]
    : [
        { header: 'No', width: 6, align: 'center', numFmt: INT_FMT },
        { header: 'Tanggal Log', width: 15, align: 'left' },
        { header: 'Tgl Dokumen', width: 19, align: 'left' },
        { header: 'No. Invoice', width: 18, align: 'left' },
        { header: 'Status Bayar', width: 13, align: 'center' },
        { header: 'Nama Sales', width: 18, align: 'left' },
        { header: 'Perusahaan (Penjual)', width: 26, align: 'left' },
        { header: 'Nama Pembeli', width: 26, align: 'left' },
        { header: 'Jml Item', width: 10, align: 'center', numFmt: INT_FMT },
        { header: 'Total Berat (Kg)', width: 15, align: 'right', numFmt: WEIGHT_FMT },
        { header: 'Subtotal (Rp)', width: 17, align: 'right', numFmt: CURRENCY_FMT },
        { header: 'PPN (Rp)', width: 15, align: 'right', numFmt: CURRENCY_FMT },
        { header: 'Ongkir (Rp)', width: 15, align: 'right', numFmt: CURRENCY_FMT },
        { header: 'Grand Total / Omzet (Rp)', width: 20, align: 'right', numFmt: CURRENCY_FMT },
        { header: 'Deposit (Rp)', width: 16, align: 'right', numFmt: CURRENCY_FMT },
        { header: 'Sisa Transfer (Rp)', width: 19, align: 'right', numFmt: CURRENCY_FMT },
        { header: 'Rekening Bank', width: 20, align: 'left' },
        { header: 'Admin', width: 15, align: 'left' },
      ];

  columns.forEach((col, i) => {
    ws.getColumn(i + 1).width = col.width;
  });

  const lastColLetter = ws.getColumn(columns.length).letter;
  applyBannerHeader(ws, lastColLetter, title, subtitle);

  const headerRowIdx = 4;
  const headerRow = ws.getRow(headerRowIdx);
  columns.forEach((col, idx) => {
    headerRow.getCell(idx + 1).value = col.header;
  });
  applyTableHeaderStyle(
    headerRow,
    columns.map((c) => c.align)
  );

  ws.views = [{ state: 'frozen', ySplit: headerRowIdx }];
  ws.autoFilter = {
    from: { row: headerRowIdx, column: 1 },
    to: { row: headerRowIdx, column: columns.length },
  };

  let totalWeight = 0;
  let totalSubtotal = 0;
  let totalPpn = 0;
  let totalShipping = 0;
  let totalGrand = 0;
  let totalDeposit = 0;
  let totalNet = 0;

  records.forEach((log, idx) => {
    const rowNum = headerRowIdx + 1 + idx;
    const row = ws.getRow(rowNum);
    row.height = 21;

    totalWeight += log.totalWeightKg;
    totalSubtotal += log.subtotal;
    totalPpn += log.ppnAmount;
    totalShipping += log.shippingCost;
    totalGrand += log.grandTotal;
    totalDeposit += log.appliedDeposit;
    totalNet += log.netPayable;

    const values: (string | number)[] = includeArchiveAndAction
      ? [
          idx + 1,
          formatDateTimeId(log.createdAtMs),
          log.invoiceSnapshot.cityDate || '-',
          log.invoiceSnapshot.invoiceNumber || '-',
          PAYMENT_LABELS[log.paymentStatus],
          log.status === 'archived' ? 'Arsip' : 'Aktif',
          log.salesName || 'Belum Ditentukan',
          log.sellerName || '-',
          log.invoiceSnapshot.buyerName || '-',
          log.invoiceSnapshot.buyerAddress || '-',
          log.itemCount,
          log.totalWeightKg,
          PPN_LABELS[log.invoiceSnapshot.ppnMode] || 'Include PPN',
          log.subtotal,
          log.ppnAmount,
          log.shippingCost,
          log.grandTotal,
          log.appliedDeposit,
          log.netPayable,
          log.invoiceSnapshot.bankAccount.bankShortName ||
            log.invoiceSnapshot.bankAccount.bankName ||
            '-',
          log.invoiceSnapshot.bankAccount.accountNumber || '-',
          ACTION_LABELS[log.actionType] || log.actionType,
          log.ownerName || 'Tim Admin',
        ]
      : [
          idx + 1,
          formatDateShortId(log.createdAtMs),
          log.invoiceSnapshot.cityDate || '-',
          log.invoiceSnapshot.invoiceNumber || '-',
          PAYMENT_LABELS[log.paymentStatus],
          log.salesName || 'Belum Ditentukan',
          log.sellerName || '-',
          log.invoiceSnapshot.buyerName || '-',
          log.itemCount,
          log.totalWeightKg,
          log.subtotal,
          log.ppnAmount,
          log.shippingCost,
          log.grandTotal,
          log.appliedDeposit,
          log.netPayable,
          `${log.invoiceSnapshot.bankAccount.bankShortName || ''} ${log.invoiceSnapshot.bankAccount.accountNumber || ''}`.trim() ||
            '-',
          log.ownerName || 'Tim Admin',
        ];

    values.forEach((v, cIdx) => {
      const cell = row.getCell(cIdx + 1);
      cell.value = v;
      cell.font = { name: 'Calibri', size: 10, color: { argb: 'FF0F172A' } };
      cell.alignment = {
        horizontal: columns[cIdx].align,
        vertical: 'middle',
        wrapText: cIdx === 8 || cIdx === 9,
      };
      cell.border = THIN_BORDER;
      if (idx % 2 === 1) {
        cell.fill = ZEBRA_FILL;
      }
      if (columns[cIdx].numFmt) {
        cell.numFmt = columns[cIdx].numFmt!;
      }
    });

    // Status column is always column 5
    styleStatusCell(row.getCell(5), log.paymentStatus);
  });

  // Grand Total row
  const totalRowNum = headerRowIdx + 1 + records.length;
  const totalRow = ws.getRow(totalRowNum);
  const labelCol = includeArchiveAndAction ? 9 : 8;
  totalRow.getCell(1).value = '';
  totalRow.getCell(labelCol).value = `TOTAL (${records.length} INVOICE)`;

  if (includeArchiveAndAction) {
    totalRow.getCell(12).value = totalWeight;
    totalRow.getCell(12).numFmt = WEIGHT_FMT;
    totalRow.getCell(14).value = totalSubtotal;
    totalRow.getCell(14).numFmt = CURRENCY_FMT;
    totalRow.getCell(15).value = totalPpn;
    totalRow.getCell(15).numFmt = CURRENCY_FMT;
    totalRow.getCell(16).value = totalShipping;
    totalRow.getCell(16).numFmt = CURRENCY_FMT;
    totalRow.getCell(17).value = totalGrand;
    totalRow.getCell(17).numFmt = CURRENCY_FMT;
    totalRow.getCell(18).value = totalDeposit;
    totalRow.getCell(18).numFmt = CURRENCY_FMT;
    totalRow.getCell(19).value = totalNet;
    totalRow.getCell(19).numFmt = CURRENCY_FMT;
  } else {
    totalRow.getCell(10).value = totalWeight;
    totalRow.getCell(10).numFmt = WEIGHT_FMT;
    totalRow.getCell(11).value = totalSubtotal;
    totalRow.getCell(11).numFmt = CURRENCY_FMT;
    totalRow.getCell(12).value = totalPpn;
    totalRow.getCell(12).numFmt = CURRENCY_FMT;
    totalRow.getCell(13).value = totalShipping;
    totalRow.getCell(13).numFmt = CURRENCY_FMT;
    totalRow.getCell(14).value = totalGrand;
    totalRow.getCell(14).numFmt = CURRENCY_FMT;
    totalRow.getCell(15).value = totalDeposit;
    totalRow.getCell(15).numFmt = CURRENCY_FMT;
    totalRow.getCell(16).value = totalNet;
    totalRow.getCell(16).numFmt = CURRENCY_FMT;
  }

  applyTotalRowStyle(
    totalRow,
    columns.length,
    columns.map((c) => c.align)
  );
}

function addSalesSummarySheet(
  wb: ExcelJS.Workbook,
  sheetName: string,
  title: string,
  subtitle: string,
  salesBreakdown: SalesReportRow[],
  scopedLogs: InvoiceLogRecord[]
) {
  const ws = wb.addWorksheet(sheetName, {
    pageSetup: {
      orientation: 'landscape',
      paperSize: 9,
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
    },
  });

  const cols: {
    header: string;
    width: number;
    align: 'left' | 'center' | 'right';
    numFmt?: string;
  }[] = [
    { header: 'No', width: 6, align: 'center', numFmt: INT_FMT },
    { header: 'Nama Sales', width: 24, align: 'left' },
    { header: 'Invoice Lunas', width: 14, align: 'center', numFmt: INT_FMT },
    { header: 'Total Berat Lunas (Kg)', width: 20, align: 'right', numFmt: WEIGHT_FMT },
    { header: 'Total Omzet Lunas (Rp)', width: 22, align: 'right', numFmt: CURRENCY_FMT },
    { header: 'Kontribusi Omzet', width: 16, align: 'right', numFmt: PCT_FMT },
    { header: 'Rata-rata / Invoice (Rp)', width: 21, align: 'right', numFmt: CURRENCY_FMT },
    { header: 'Pending (Inv)', width: 14, align: 'center', numFmt: INT_FMT },
    { header: 'Nominal Pending (Rp)', width: 21, align: 'right', numFmt: CURRENCY_FMT },
    { header: 'Cancel (Inv)', width: 13, align: 'center', numFmt: INT_FMT },
  ];

  cols.forEach((c, idx) => {
    ws.getColumn(idx + 1).width = c.width;
  });

  applyBannerHeader(ws, 'J', title, subtitle);

  // Executive KPI Strip (Rows 4-5)
  const paidLogs = scopedLogs.filter((l) => l.paymentStatus === 'paid');
  const pendingLogs = scopedLogs.filter((l) => l.paymentStatus === 'pending');
  const cancelledLogs = scopedLogs.filter((l) => l.paymentStatus === 'cancelled');

  const kpiPaidRevenue = paidLogs.reduce((s, l) => s + l.grandTotal, 0);
  const kpiPaidWeight = paidLogs.reduce((s, l) => s + l.totalWeightKg, 0);
  const kpiPendingAmount = pendingLogs.reduce((s, l) => s + l.grandTotal, 0);
  const kpiPaidRate = scopedLogs.length > 0 ? paidLogs.length / scopedLogs.length : 0;

  const kpiBlocks = [
    {
      rangeLabel: 'A4:C4',
      rangeVal: 'A5:C5',
      label: 'TOTAL PENJUALAN (LUNAS)',
      value: kpiPaidRevenue,
      numFmt: CURRENCY_FMT,
      bg: 'FFECFDF5',
      fg: 'FF065F46',
    },
    {
      rangeLabel: 'D4:E4',
      rangeVal: 'D5:E5',
      label: 'VOLUME BERAT TERJUAL (LUNAS)',
      value: kpiPaidWeight,
      numFmt: '#,##0.## "kg"',
      bg: 'FFEFF6FF',
      fg: 'FF1E3A8A',
    },
    {
      rangeLabel: 'F4:H4',
      rangeVal: 'F5:H5',
      label: `MENUNGGU BAYAR (${pendingLogs.length} PENDING)`,
      value: kpiPendingAmount,
      numFmt: CURRENCY_FMT,
      bg: 'FFFFFBEB',
      fg: 'FF92400E',
    },
    {
      rangeLabel: 'I4:J4',
      rangeVal: 'I5:J5',
      label: `RASIO LUNAS (${paidLogs.length}/${scopedLogs.length} · ${cancelledLogs.length} CANCEL)`,
      value: kpiPaidRate,
      numFmt: PCT_FMT,
      bg: 'FFF8FAFC',
      fg: 'FF0F172A',
    },
  ];

  ws.getRow(4).height = 18;
  ws.getRow(5).height = 26;

  kpiBlocks.forEach((b) => {
    ws.mergeCells(b.rangeLabel);
    ws.mergeCells(b.rangeVal);
    const lCell = ws.getCell(b.rangeLabel.split(':')[0]);
    const vCell = ws.getCell(b.rangeVal.split(':')[0]);

    lCell.value = b.label;
    lCell.font = { name: 'Calibri', size: 8.5, bold: true, color: { argb: 'FF475569' } };
    lCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: b.bg } };
    lCell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
    lCell.border = {
      top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    };

    vCell.value = b.value;
    vCell.numFmt = b.numFmt;
    vCell.font = { name: 'Calibri', size: 13, bold: true, color: { argb: b.fg } };
    vCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: b.bg } };
    vCell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
    vCell.border = {
      bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    };
  });

  ws.getRow(6).height = 12;

  // Section header
  ws.mergeCells('A7:J7');
  const secCell = ws.getCell('A7');
  secCell.value = 'PERBANDINGAN PERFORMA PER SALES (BERDASARKAN INVOICE LUNAS)';
  secCell.font = { name: 'Calibri', size: 10.5, bold: true, color: { argb: 'FF0F172A' } };
  secCell.alignment = { horizontal: 'left', vertical: 'middle' };
  ws.getRow(7).height = 22;

  // Table Header Row 8
  const headerRowIdx = 8;
  const headerRow = ws.getRow(headerRowIdx);
  cols.forEach((c, i) => {
    headerRow.getCell(i + 1).value = c.header;
  });
  applyTableHeaderStyle(
    headerRow,
    cols.map((c) => c.align)
  );

  ws.views = [{ state: 'frozen', ySplit: headerRowIdx }];

  const totalAllPaidRevenue = salesBreakdown.reduce((s, r) => s + r.paidRevenue, 0);
  let sumPaidCount = 0;
  let sumPaidWeight = 0;
  let sumPendingCount = 0;
  let sumPendingAmount = 0;
  let sumCancelCount = 0;

  salesBreakdown.forEach((r, idx) => {
    const row = ws.getRow(headerRowIdx + 1 + idx);
    row.height = 23;

    sumPaidCount += r.paidCount;
    sumPaidWeight += r.paidWeightKg;
    sumPendingCount += r.pendingCount;
    sumPendingAmount += r.pendingAmount;
    sumCancelCount += r.cancelledCount;

    const share = totalAllPaidRevenue > 0 ? r.paidRevenue / totalAllPaidRevenue : 0;
    const avg = r.paidCount > 0 ? Math.round(r.paidRevenue / r.paidCount) : 0;

    const rowValues: (string | number)[] = [
      idx + 1,
      r.label,
      r.paidCount,
      r.paidWeightKg,
      r.paidRevenue,
      share,
      avg,
      r.pendingCount,
      r.pendingAmount,
      r.cancelledCount,
    ];

    rowValues.forEach((val, cIdx) => {
      const cell = row.getCell(cIdx + 1);
      cell.value = val;
      cell.font = {
        name: 'Calibri',
        size: 10,
        bold: cIdx === 1 || cIdx === 4,
        color: { argb: cIdx === 2 && r.paidCount > 0 ? 'FF166534' : 'FF0F172A' },
      };
      cell.alignment = { horizontal: cols[cIdx].align, vertical: 'middle' };
      cell.border = THIN_BORDER;
      if (idx % 2 === 1) {
        cell.fill = ZEBRA_FILL;
      }
      if (cols[cIdx].numFmt) {
        cell.numFmt = cols[cIdx].numFmt!;
      }
    });
  });

  // Grand Total row
  const totalRow = ws.getRow(headerRowIdx + 1 + salesBreakdown.length);
  const overallAvg = sumPaidCount > 0 ? Math.round(totalAllPaidRevenue / sumPaidCount) : 0;
  const totalVals: (string | number)[] = [
    '',
    'TOTAL SEMUA SALES',
    sumPaidCount,
    sumPaidWeight,
    totalAllPaidRevenue,
    totalAllPaidRevenue > 0 ? 1 : 0,
    overallAvg,
    sumPendingCount,
    sumPendingAmount,
    sumCancelCount,
  ];
  totalVals.forEach((val, cIdx) => {
    const cell = totalRow.getCell(cIdx + 1);
    cell.value = val;
    if (cols[cIdx].numFmt) {
      cell.numFmt = cols[cIdx].numFmt!;
    }
  });
  applyTotalRowStyle(
    totalRow,
    cols.length,
    cols.map((c) => c.align)
  );
}

async function createWorkbook(): Promise<ExcelJS.Workbook> {
  const mod = (await import('exceljs')) as unknown as {
    Workbook?: new () => ExcelJS.Workbook;
    default?: {
      Workbook?: new () => ExcelJS.Workbook;
      default?: { Workbook?: new () => ExcelJS.Workbook };
    };
  };
  const globalExcel = (
    globalThis as unknown as { ExcelJS?: { Workbook?: new () => ExcelJS.Workbook } }
  ).ExcelJS;

  const WorkbookCtor =
    mod.Workbook ??
    mod.default?.Workbook ??
    mod.default?.default?.Workbook ??
    globalExcel?.Workbook;

  if (!WorkbookCtor) {
    throw new Error('ExcelJS Workbook tidak tersedia di browser.');
  }

  const wb = new WorkbookCtor();
  wb.creator = 'ProformaKu';
  wb.created = new Date();
  return wb;
}

// =========================================================================
// 1. Export Laporan Performa Sales -> Excel (.xlsx) Multi-Sheet
// =========================================================================
export async function exportSalesPerformanceExcel(
  options: SalesPerformanceExportOptions
): Promise<string> {
  const wb = await createWorkbook();

  const printedAt = formatDateTimeId(Date.now());
  const subtitle = `Periode: ${options.periodLabel}  |  Filter Sales: ${options.selectedSalesLabel}  |  Dicetak: ${printedAt}  |  *Hanya invoice berstatus LUNAS yang masuk pencapaian omzet`;

  // Sheet 1: Ringkasan Performa Sales
  addSalesSummarySheet(
    wb,
    'Ringkasan Performa Sales',
    'LAPORAN PERFORMA PENJUALAN SALES',
    subtitle,
    options.salesBreakdown,
    options.scopedLogs
  );

  // Sheet 2: Rincian Invoice Lunas (Realized Sales)
  const paidLogs = options.scopedLogs.filter((l) => l.paymentStatus === 'paid');
  addDetailedInvoiceSheet(
    wb,
    'Rincian Invoice Lunas',
    'RINCIAN INVOICE PENJUALAN LUNAS',
    `Periode: ${options.periodLabel}  |  Filter Sales: ${options.selectedSalesLabel}  |  Total ${paidLogs.length} invoice lunas  |  Dicetak: ${printedAt}`,
    paidLogs,
    false
  );

  // Sheet 3: Semua Transaksi Periode (Lunas, Pending, Cancel)
  addDetailedInvoiceSheet(
    wb,
    'Semua Transaksi Periode',
    'DAFTAR SEMUA PROFORMA INVOICE (LUNAS, PENDING, CANCEL)',
    `Periode: ${options.periodLabel}  |  Filter Sales: ${options.selectedSalesLabel}  |  Total ${options.scopedLogs.length} invoice  |  Dicetak: ${printedAt}`,
    options.scopedLogs,
    false
  );

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const salesSlug = sanitizeFilename(options.selectedSalesLabel) || 'Semua_Sales';
  const filename = `Laporan_Performa_Sales_${salesSlug}_${todayFileStamp()}.xlsx`;
  triggerBlobDownload(blob, filename);
  return filename;
}

// =========================================================================
// 2. Export Laporan Seluruh Data Invoice -> Excel (.xlsx) Multi-Sheet
// =========================================================================
export async function exportAllInvoicesExcel(
  logs: InvoiceLogRecord[],
  filterSummary = 'Seluruh Data Proforma Invoice'
): Promise<string> {
  const wb = await createWorkbook();

  const printedAt = formatDateTimeId(Date.now());
  const paidCount = logs.filter((l) => l.paymentStatus === 'paid').length;
  const pendingCount = logs.filter((l) => l.paymentStatus === 'pending').length;
  const cancelCount = logs.filter((l) => l.paymentStatus === 'cancelled').length;

  const subtitle = `${filterSummary}  |  Total: ${logs.length} invoice (${paidCount} Lunas, ${pendingCount} Pending, ${cancelCount} Cancel)  |  Dicetak: ${printedAt}`;

  // Sheet 1: Master Ledger of All Invoices
  addDetailedInvoiceSheet(
    wb,
    'Seluruh Data Invoice',
    'LAPORAN SELURUH DATA PROFORMA INVOICE',
    subtitle,
    logs,
    true
  );

  // Sheet 2: Automatic Per-Sales Summary
  const breakdown = buildSalesBreakdownFromLogs(logs);
  addSalesSummarySheet(
    wb,
    'Rekap per Sales',
    'REKAP PENJUALAN PER SALES',
    `Berdasarkan data yang diekspor (${filterSummary})  |  Dicetak: ${printedAt}`,
    breakdown,
    logs.filter((l) => l.status !== 'archived')
  );

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const filename = `Laporan_Seluruh_Data_Invoice_${todayFileStamp()}.xlsx`;
  triggerBlobDownload(blob, filename);
  return filename;
}

// =========================================================================
// Shared Landscape A4 Executive PDF Report Helpers
// =========================================================================
function drawPdfReportBanner(
  doc: jsPDF,
  title: string,
  subtitle: string,
  printedAt: string
): number {
  const pageW = 297;
  const marginX = 14;

  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageW, 24, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13.5);
  doc.setTextColor(255, 255, 255);
  doc.text(title, marginX, 11);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.2);
  doc.setTextColor(203, 213, 225);
  doc.text(subtitle, marginX, 17.5);

  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  doc.text(`Dicetak: ${printedAt}`, pageW - marginX, 11, { align: 'right' });

  return 30;
}

function drawPdfKpiRow(
  doc: jsPDF,
  startY: number,
  cards: { label: string; value: string; sub: string; accentRgb?: [number, number, number] }[]
): number {
  const marginX = 14;
  const totalW = 297 - marginX * 2; // 269mm
  const gap = 4;
  const cardW = (totalW - gap * (cards.length - 1)) / cards.length;
  const cardH = 19;

  cards.forEach((c, idx) => {
    const x = marginX + idx * (cardW + gap);
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.25);
    doc.roundedRect(x, startY, cardW, cardH, 1.5, 1.5, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.2);
    doc.setTextColor(100, 116, 139);
    doc.text(c.label, x + 3.5, startY + 5.2);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    const [r, g, b] = c.accentRgb || [15, 23, 42];
    doc.setTextColor(r, g, b);
    doc.text(c.value, x + 3.5, startY + 11.8);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text(c.sub, x + 3.5, startY + 16.5);
  });

  return startY + cardH + 7;
}

function stampPdfFooters(doc: jsPDF, leftFooterText: string) {
  const totalPages = doc.getNumberOfPages();
  const pageW = 297;
  const pageH = 210;
  const marginX = 14;

  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.25);
    doc.line(marginX, pageH - 12, pageW - marginX, pageH - 12);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(leftFooterText, marginX, pageH - 7.5);
    doc.text(`Halaman ${p} dari ${totalPages}`, pageW - marginX, pageH - 7.5, {
      align: 'right',
    });
  }
}

interface PdfColDef {
  label: string;
  width: number;
  align: 'left' | 'center' | 'right';
}

function drawPdfTableHeader(doc: jsPDF, cols: PdfColDef[], startX: number, y: number): number {
  const h = 8;
  const totalW = cols.reduce((s, c) => s + c.width, 0);

  doc.setFillColor(30, 41, 59);
  doc.rect(startX, y, totalW, h, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.6);
  doc.setTextColor(255, 255, 255);

  let x = startX;
  cols.forEach((col, i) => {
    if (i > 0) {
      doc.setDrawColor(51, 65, 85);
      doc.setLineWidth(0.2);
      doc.line(x, y, x, y + h);
    }
    const textX =
      col.align === 'right'
        ? x + col.width - 2
        : col.align === 'center'
        ? x + col.width / 2
        : x + 2;
    doc.text(col.label, textX, y + 5.2, { align: col.align });
    x += col.width;
  });

  return y + h;
}

function truncatePdfText(doc: jsPDF, text: string, maxWidth: number): string {
  if (!text) return '-';
  if (doc.getTextWidth(text) <= maxWidth) return text;
  let trimmed = text;
  while (trimmed.length > 1 && doc.getTextWidth(`${trimmed}...`) > maxWidth) {
    trimmed = trimmed.slice(0, -1);
  }
  return `${trimmed}...`;
}

// =========================================================================
// 3. Export Laporan Performa Sales -> Landscape A4 Executive PDF
// =========================================================================
export function exportSalesPerformancePdf(options: SalesPerformanceExportOptions): string {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
    compress: true,
  });

  const marginX = 14;
  const pageH = 210;
  const printedAt = formatDateTimeId(Date.now());

  let y = drawPdfReportBanner(
    doc,
    'LAPORAN PERFORMA PENJUALAN SALES',
    `Periode: ${options.periodLabel}   |   Filter Sales: ${options.selectedSalesLabel}   |   Hanya invoice LUNAS yang dihitung ke omzet`,
    printedAt
  );

  const paidLogs = options.scopedLogs.filter((l) => l.paymentStatus === 'paid');
  const pendingLogs = options.scopedLogs.filter((l) => l.paymentStatus === 'pending');
  const cancelledLogs = options.scopedLogs.filter((l) => l.paymentStatus === 'cancelled');

  const paidRev = paidLogs.reduce((s, l) => s + l.grandTotal, 0);
  const paidWeight = paidLogs.reduce((s, l) => s + l.totalWeightKg, 0);
  const pendingAmt = pendingLogs.reduce((s, l) => s + l.grandTotal, 0);
  const paidRate =
    options.scopedLogs.length > 0
      ? Math.round((paidLogs.length / options.scopedLogs.length) * 100)
      : 0;

  y = drawPdfKpiRow(doc, y, [
    {
      label: 'TOTAL PENJUALAN (LUNAS)',
      value: `Rp ${formatAmount(paidRev, 'dot')}`,
      sub: `${paidLogs.length} invoice lunas`,
      accentRgb: [6, 95, 70],
    },
    {
      label: 'VOLUME BERAT TERJUAL',
      value: `${formatWeight(paidWeight, 'dot')} kg`,
      sub: 'Khusus invoice berstatus Lunas',
      accentRgb: [30, 58, 138],
    },
    {
      label: 'MENUNGGU BAYAR (PENDING)',
      value: `Rp ${formatAmount(pendingAmt, 'dot')}`,
      sub: `${pendingLogs.length} invoice pending (belum masuk omzet)`,
      accentRgb: [146, 64, 14],
    },
    {
      label: 'RASIO LUNAS & PEMBATALAN',
      value: `${paidRate}%`,
      sub: `${options.scopedLogs.length} total invoice · ${cancelledLogs.length} cancel`,
      accentRgb: [15, 23, 42],
    },
  ]);

  // Section 1: Ringkasan per Sales
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  doc.text('1. RINGKASAN PERFORMA PER SALES', marginX, y);
  y += 3.5;

  // Total width = 269mm
  const salesCols: PdfColDef[] = [
    { label: 'No', width: 10, align: 'center' },
    { label: 'Nama Sales', width: 46, align: 'left' },
    { label: 'Omzet Lunas (Rp)', width: 52, align: 'right' },
    { label: 'Porsi', width: 18, align: 'right' },
    { label: 'Lunas', width: 18, align: 'center' },
    { label: 'Berat Lunas (Kg)', width: 32, align: 'right' },
    { label: 'Rata-rata / Inv', width: 36, align: 'right' },
    { label: 'Pending', width: 39, align: 'right' },
    { label: 'Cancel', width: 18, align: 'center' },
  ];

  y = drawPdfTableHeader(doc, salesCols, marginX, y);

  const totalAllPaidRev = options.salesBreakdown.reduce((s, r) => s + r.paidRevenue, 0);
  const maxPaidRev = options.salesBreakdown.reduce((m, r) => Math.max(m, r.paidRevenue), 0);

  options.salesBreakdown.forEach((r, idx) => {
    const rowH = 8.2;
    if (idx % 2 === 1) {
      doc.setFillColor(248, 250, 252);
      doc.rect(marginX, y, 269, rowH, 'F');
    }
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.2);
    doc.rect(marginX, y, 269, rowH, 'S');

    const sharePct =
      totalAllPaidRev > 0 ? `${((r.paidRevenue / totalAllPaidRev) * 100).toFixed(1)}%` : '0.0%';
    const avg = r.paidCount > 0 ? Math.round(r.paidRevenue / r.paidCount) : 0;

    const cells = [
      String(idx + 1),
      r.label,
      `Rp ${formatAmount(r.paidRevenue, 'dot')}`,
      sharePct,
      `${r.paidCount} inv`,
      `${formatWeight(r.paidWeightKg, 'dot')} kg`,
      `Rp ${formatAmount(avg, 'dot')}`,
      `${r.pendingCount} inv (Rp ${formatAmount(r.pendingAmount, 'dot')})`,
      `${r.cancelledCount} inv`,
    ];

    let x = marginX;
    cells.forEach((text, cIdx) => {
      const col = salesCols[cIdx];
      doc.setFont('helvetica', cIdx === 1 || cIdx === 2 ? 'bold' : 'normal');
      doc.setFontSize(7.8);
      if (cIdx === 4 && r.paidCount > 0) {
        doc.setTextColor(6, 95, 70);
      } else if (cIdx === 7 && r.pendingCount > 0) {
        doc.setTextColor(146, 64, 14);
      } else {
        doc.setTextColor(15, 23, 42);
      }
      const tx =
        col.align === 'right'
          ? x + col.width - 2
          : col.align === 'center'
          ? x + col.width / 2
          : x + 2;
      doc.text(truncatePdfText(doc, text, col.width - 4), tx, y + 5.1, { align: col.align });

      // Mini contribution bar inside Omzet column
      if (cIdx === 2 && maxPaidRev > 0 && r.paidRevenue > 0) {
        const barMaxW = col.width - 4;
        const barW = Math.max(2, (r.paidRevenue / maxPaidRev) * barMaxW);
        doc.setFillColor(29, 78, 216);
        doc.rect(x + 2, y + rowH - 1.7, barW, 1.0, 'F');
      }

      x += col.width;
    });
    y += rowH;
  });

  // Total row for sales summary
  const sumPaidCnt = options.salesBreakdown.reduce((s, r) => s + r.paidCount, 0);
  const sumPaidW = options.salesBreakdown.reduce((s, r) => s + r.paidWeightKg, 0);
  const sumPendCnt = options.salesBreakdown.reduce((s, r) => s + r.pendingCount, 0);
  const sumPendAmt = options.salesBreakdown.reduce((s, r) => s + r.pendingAmount, 0);
  const sumCancCnt = options.salesBreakdown.reduce((s, r) => s + r.cancelledCount, 0);
  const overallAvg = sumPaidCnt > 0 ? Math.round(totalAllPaidRev / sumPaidCnt) : 0;

  doc.setFillColor(226, 232, 240);
  doc.rect(marginX, y, 269, 7.5, 'F');
  doc.setDrawColor(30, 41, 59);
  doc.setLineWidth(0.35);
  doc.line(marginX, y, marginX + 269, y);
  doc.line(marginX, y + 7.5, marginX + 269, y + 7.5);

  const totalCells = [
    '',
    'TOTAL SEMUA SALES',
    `Rp ${formatAmount(totalAllPaidRev, 'dot')}`,
    totalAllPaidRev > 0 ? '100.0%' : '0.0%',
    `${sumPaidCnt} inv`,
    `${formatWeight(sumPaidW, 'dot')} kg`,
    `Rp ${formatAmount(overallAvg, 'dot')}`,
    `${sumPendCnt} inv (Rp ${formatAmount(sumPendAmt, 'dot')})`,
    `${sumCancCnt} inv`,
  ];

  let txCursor = marginX;
  totalCells.forEach((text, cIdx) => {
    const col = salesCols[cIdx];
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.8);
    doc.setTextColor(15, 23, 42);
    const tx =
      col.align === 'right'
        ? txCursor + col.width - 2
        : col.align === 'center'
        ? txCursor + col.width / 2
        : txCursor + 2;
    doc.text(truncatePdfText(doc, text, col.width - 4), tx, y + 5, { align: col.align });
    txCursor += col.width;
  });

  y += 14;

  // Section 2: Rincian Transaksi Invoice
  if (y > pageH - 42) {
    doc.addPage();
    y = 18;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  doc.text(`2. RINCIAN PROFORMA INVOICE (${options.scopedLogs.length} CATATAN)`, marginX, y);
  y += 3.5;

  // Total width = 269mm
  const detailCols: PdfColDef[] = [
    { label: 'No', width: 9, align: 'center' },
    { label: 'Tanggal', width: 21, align: 'left' },
    { label: 'No. Invoice', width: 28, align: 'left' },
    { label: 'Nama Sales', width: 29, align: 'left' },
    { label: 'Penjual (PT)', width: 38, align: 'left' },
    { label: 'Pembeli', width: 42, align: 'left' },
    { label: 'Berat', width: 18, align: 'right' },
    { label: 'Grand Total', width: 29, align: 'right' },
    { label: 'Deposit', width: 21, align: 'right' },
    { label: 'Transfer', width: 18, align: 'right' },
    { label: 'Status', width: 16, align: 'center' },
  ];

  y = drawPdfTableHeader(doc, detailCols, marginX, y);

  options.scopedLogs.forEach((log, idx) => {
    const rowH = 7;
    if (y + rowH > pageH - 18) {
      doc.addPage();
      y = 16;
      y = drawPdfTableHeader(doc, detailCols, marginX, y);
    }

    if (idx % 2 === 1) {
      doc.setFillColor(248, 250, 252);
      doc.rect(marginX, y, 269, rowH, 'F');
    }
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.2);
    doc.line(marginX, y + rowH, marginX + 269, y + rowH);

    const rowData = [
      String(idx + 1),
      formatDateShortId(log.createdAtMs),
      log.invoiceSnapshot.invoiceNumber || '-',
      log.salesName || '-',
      log.sellerName || '-',
      log.invoiceSnapshot.buyerName || '-',
      `${formatWeight(log.totalWeightKg, 'dot')} kg`,
      `Rp ${formatAmount(log.grandTotal, 'dot')}`,
      log.appliedDeposit > 0 ? `- ${formatAmount(log.appliedDeposit, 'dot')}` : '-',
      formatAmount(log.netPayable, 'dot'),
      PAYMENT_LABELS[log.paymentStatus],
    ];

    let x = marginX;
    rowData.forEach((text, cIdx) => {
      const col = detailCols[cIdx];
      doc.setFont('helvetica', cIdx === 10 || cIdx === 7 ? 'bold' : 'normal');
      doc.setFontSize(7.3);

      if (cIdx === 10) {
        if (log.paymentStatus === 'paid') doc.setTextColor(6, 95, 70);
        else if (log.paymentStatus === 'pending') doc.setTextColor(146, 64, 14);
        else doc.setTextColor(185, 28, 28);
      } else {
        doc.setTextColor(15, 23, 42);
      }

      const tx =
        col.align === 'right'
          ? x + col.width - 1.5
          : col.align === 'center'
          ? x + col.width / 2
          : x + 1.5;
      doc.text(truncatePdfText(doc, text, col.width - 3), tx, y + 4.6, { align: col.align });
      x += col.width;
    });

    y += rowH;
  });

  stampPdfFooters(
    doc,
    `ProformaKu — Laporan Performa Penjualan Sales (${options.periodLabel})`
  );

  const salesSlug = sanitizeFilename(options.selectedSalesLabel) || 'Semua_Sales';
  const filename = `Laporan_Performa_Sales_${salesSlug}_${todayFileStamp()}.pdf`;
  doc.save(filename);
  return filename;
}

// =========================================================================
// 4. Export Laporan Seluruh Data Invoice -> Landscape A4 Executive PDF
// =========================================================================
export function exportAllInvoicesPdf(
  logs: InvoiceLogRecord[],
  filterSummary = 'Seluruh Data Proforma Invoice'
): string {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
    compress: true,
  });

  const marginX = 14;
  const pageH = 210;
  const printedAt = formatDateTimeId(Date.now());

  let y = drawPdfReportBanner(
    doc,
    'LAPORAN SELURUH DATA PROFORMA INVOICE',
    `${filterSummary}   |   Total ${logs.length} catatan invoice`,
    printedAt
  );

  const paidLogs = logs.filter((l) => l.paymentStatus === 'paid');
  const pendingLogs = logs.filter((l) => l.paymentStatus === 'pending');
  const cancelLogs = logs.filter((l) => l.paymentStatus === 'cancelled');

  const sumPaid = paidLogs.reduce((s, l) => s + l.grandTotal, 0);
  const sumPending = pendingLogs.reduce((s, l) => s + l.grandTotal, 0);
  const sumAllGrand = logs.reduce((s, l) => s + l.grandTotal, 0);
  const sumAllWeight = logs.reduce((s, l) => s + l.totalWeightKg, 0);

  y = drawPdfKpiRow(doc, y, [
    {
      label: 'TOTAL CATATAN INVOICE',
      value: `${logs.length} Invoice`,
      sub: `${paidLogs.length} Lunas · ${pendingLogs.length} Pending · ${cancelLogs.length} Cancel`,
      accentRgb: [15, 23, 42],
    },
    {
      label: 'OMZET LUNAS',
      value: `Rp ${formatAmount(sumPaid, 'dot')}`,
      sub: `${paidLogs.length} invoice sudah dibayar`,
      accentRgb: [6, 95, 70],
    },
    {
      label: 'TAGIHAN PENDING',
      value: `Rp ${formatAmount(sumPending, 'dot')}`,
      sub: `${pendingLogs.length} invoice menunggu pembayaran`,
      accentRgb: [146, 64, 14],
    },
    {
      label: 'TOTAL BERAT SELURUH DATA',
      value: `${formatWeight(sumAllWeight, 'dot')} kg`,
      sub: `Akumulasi nilai: Rp ${formatAmount(sumAllGrand, 'dot')}`,
      accentRgb: [30, 58, 138],
    },
  ]);

  // Total width = 269mm
  const cols: PdfColDef[] = [
    { label: 'No', width: 9, align: 'center' },
    { label: 'Tanggal', width: 20, align: 'left' },
    { label: 'No. Invoice', width: 26, align: 'left' },
    { label: 'Sales', width: 27, align: 'left' },
    { label: 'Penjual (PT)', width: 35, align: 'left' },
    { label: 'Pembeli', width: 39, align: 'left' },
    { label: 'Berat', width: 17, align: 'right' },
    { label: 'Ongkir', width: 20, align: 'right' },
    { label: 'Grand Total', width: 27, align: 'right' },
    { label: 'Deposit', width: 17, align: 'right' },
    { label: 'Transfer', width: 17, align: 'right' },
    { label: 'Status', width: 15, align: 'center' },
  ];

  y = drawPdfTableHeader(doc, cols, marginX, y);

  logs.forEach((log, idx) => {
    const rowH = 7;
    if (y + rowH > pageH - 18) {
      doc.addPage();
      y = 16;
      y = drawPdfTableHeader(doc, cols, marginX, y);
    }

    if (idx % 2 === 1) {
      doc.setFillColor(248, 250, 252);
      doc.rect(marginX, y, 269, rowH, 'F');
    }
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.2);
    doc.line(marginX, y + rowH, marginX + 269, y + rowH);

    const rowData = [
      String(idx + 1),
      formatDateShortId(log.createdAtMs),
      log.invoiceSnapshot.invoiceNumber || '-',
      log.salesName || '-',
      log.sellerName || '-',
      log.invoiceSnapshot.buyerName || '-',
      `${formatWeight(log.totalWeightKg, 'dot')}`,
      log.shippingCost > 0 ? formatAmount(log.shippingCost, 'dot') : '-',
      formatAmount(log.grandTotal, 'dot'),
      log.appliedDeposit > 0 ? formatAmount(log.appliedDeposit, 'dot') : '-',
      formatAmount(log.netPayable, 'dot'),
      PAYMENT_LABELS[log.paymentStatus],
    ];

    let x = marginX;
    rowData.forEach((text, cIdx) => {
      const col = cols[cIdx];
      doc.setFont('helvetica', cIdx === 8 || cIdx === 11 ? 'bold' : 'normal');
      doc.setFontSize(7.1);

      if (cIdx === 11) {
        if (log.paymentStatus === 'paid') doc.setTextColor(6, 95, 70);
        else if (log.paymentStatus === 'pending') doc.setTextColor(146, 64, 14);
        else doc.setTextColor(185, 28, 28);
      } else {
        doc.setTextColor(15, 23, 42);
      }

      const tx =
        col.align === 'right'
          ? x + col.width - 1.4
          : col.align === 'center'
          ? x + col.width / 2
          : x + 1.4;
      doc.text(truncatePdfText(doc, text, col.width - 2.8), tx, y + 4.6, { align: col.align });
      x += col.width;
    });

    y += rowH;
  });

  // Grand total footer row
  if (y + 8 > pageH - 16) {
    doc.addPage();
    y = 16;
  }
  doc.setFillColor(226, 232, 240);
  doc.rect(marginX, y, 269, 7.5, 'F');
  doc.setDrawColor(30, 41, 59);
  doc.setLineWidth(0.35);
  doc.line(marginX, y, marginX + 269, y);
  doc.line(marginX, y + 7.5, marginX + 269, y + 7.5);

  const sumShipping = logs.reduce((s, l) => s + l.shippingCost, 0);
  const sumDeposit = logs.reduce((s, l) => s + l.appliedDeposit, 0);
  const sumNet = logs.reduce((s, l) => s + l.netPayable, 0);

  const totalsRow = [
    '',
    '',
    '',
    '',
    '',
    `TOTAL (${logs.length} INVOICE)`,
    `${formatWeight(sumAllWeight, 'dot')}`,
    formatAmount(sumShipping, 'dot'),
    formatAmount(sumAllGrand, 'dot'),
    formatAmount(sumDeposit, 'dot'),
    formatAmount(sumNet, 'dot'),
    '',
  ];

  let x = marginX;
  totalsRow.forEach((text, cIdx) => {
    const col = cols[cIdx];
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.2);
    doc.setTextColor(15, 23, 42);
    const tx =
      col.align === 'right'
        ? x + col.width - 1.4
        : col.align === 'center'
        ? x + col.width / 2
        : x + 1.4;
    doc.text(truncatePdfText(doc, text, col.width - 2.8), tx, y + 4.9, { align: col.align });
    x += col.width;
  });

  stampPdfFooters(doc, `ProformaKu — ${filterSummary}`);

  const filename = `Laporan_Seluruh_Data_Invoice_${todayFileStamp()}.pdf`;
  doc.save(filename);
  return filename;
}
