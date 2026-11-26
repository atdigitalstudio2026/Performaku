import {
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  Unsubscribe,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import {
  BankAccount,
  CompanyProfile,
  DocumentFooter,
  InvoiceItem,
  InvoiceLogAction,
  InvoiceLogRecord,
  InvoiceLogStatus,
  InvoicePaymentStatus,
  PpnMode,
  PriceBasis,
  ProformaInvoiceData,
} from '../types/invoice';
import { calculateInvoiceTotals } from '../utils/formatters';
import {
  formatProformaInvoiceNumber,
  getCounterDocId,
  getCurrentPeriodKey,
  parseSequenceFromInvoiceNumber,
  resolveCompanyCode,
} from '../utils/invoiceNumbering';
import { isValidIsoDate, toLocalDateIso } from '../utils/paymentHelpers';

export const SHARED_TEAM_OWNER_ID = 'shared_team';

export interface InvoiceCounterRecord {
  id: string;
  companyCode: string;
  companyName: string;
  periodKey: string;
  lastSequence: number;
  lastInvoiceNumber: string;
  updatedAtMs: number;
}

const utf8Encoder = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;

function utf8ByteLength(str: string): number {
  return utf8Encoder ? utf8Encoder.encode(str).length : str.length;
}

function safeStr(value: unknown, maxBytes: number, fallback = ''): string {
  const str = typeof value === 'string' ? value : fallback;
  if (!utf8Encoder) return str.slice(0, maxBytes);
  if (utf8Encoder.encode(str).length <= maxBytes) return str;
  let low = 0;
  let high = Math.min(str.length, maxBytes);
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (utf8Encoder.encode(str.slice(0, mid)).length <= maxBytes) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }
  return str.slice(0, low);
}

function safeNonNegNum(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function sanitizeBankMap(bank?: Partial<BankAccount> | null): BankAccount {
  const b = bank || {};
  return {
    id: safeStr(b.id || 'bank-custom', 128, 'bank-custom') || 'bank-custom',
    bankName: safeStr(b.bankName, 80, 'BANK'),
    bankShortName: safeStr(b.bankShortName, 40, 'BANK'),
    accountHolder: safeStr(b.accountHolder, 150, '-'),
    accountNumber: safeStr(b.accountNumber, 50, '-'),
  };
}

function sanitizeCompanyMap(company?: Partial<CompanyProfile> | null): CompanyProfile {
  const c = company || {};
  const rawLogo = typeof c.logoDataUrl === 'string' ? c.logoDataUrl : '';
  // If user uploaded a large base64 image exceeding Firestore rule limit (100KB UTF-8 bytes), omit from cloud snapshot
  const safeLogo = utf8ByteLength(rawLogo) > 95000 ? '' : rawLogo;
  const widthMm = Number(c.logoWidthMm);
  return {
    name: safeStr(c.name, 200),
    addressLine1: safeStr(c.addressLine1, 250),
    addressLine2: safeStr(c.addressLine2, 250),
    phone: safeStr(c.phone, 80),
    email: safeStr(c.email, 120),
    logoDataUrl: safeLogo,
    logoWidthMm: Number.isFinite(widthMm) ? Math.min(120, Math.max(10, widthMm)) : 16,
    showLetterheadInfo: Boolean(c.showLetterheadInfo),
    showLetterheadDivider: Boolean(c.showLetterheadDivider),
  };
}

function sanitizeFooterMap(footer?: Partial<DocumentFooter> | null): DocumentFooter {
  const f = footer || {};
  return {
    enabled: Boolean(f.enabled),
    companyName: safeStr(f.companyName, 200),
    address: safeStr(f.address, 250),
    phone: safeStr(f.phone, 80),
    fax: safeStr(f.fax, 80),
  };
}

function timestampToMs(ts: unknown): number {
  if (ts instanceof Timestamp) {
    return ts.toMillis();
  }
  if (
    ts &&
    typeof ts === 'object' &&
    'toMillis' in ts &&
    typeof (ts as { toMillis: unknown }).toMillis === 'function'
  ) {
    return (ts as { toMillis: () => number }).toMillis();
  }
  return Date.now();
}

const ITEMS_PER_BATCH_CHUNK = 8;

export async function createInvoiceLog(
  adminName: string,
  invoice: ProformaInvoiceData,
  company: CompanyProfile,
  footer: DocumentFooter,
  actionType: InvoiceLogAction,
  initialPaymentStatus: InvoicePaymentStatus = 'pending',
  initialPaymentMeta?: {
    paidAtDate?: string;
    paymentNote?: string;
  }
): Promise<string> {
  const logId = `log_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const path = `invoiceLogs/${logId}`;

  const safeItemsSource = Array.isArray(invoice.items) ? invoice.items : [];
  const totals = calculateInvoiceTotals({ ...invoice, items: safeItemsSource });
  const itemsToSave = safeItemsSource.slice(0, 200);
  const safeColor = /^#[0-9a-fA-F]{6}$/.test(invoice.tableHeaderColor || '')
    ? (invoice.tableHeaderColor as string)
    : '#1E293B';
  const safePpnMode: PpnMode =
    invoice.ppnMode === 'exclude_add' || invoice.ppnMode === 'non_ppn'
      ? invoice.ppnMode
      : 'include';
  const safeNumberFormat: 'comma' | 'dot' = invoice.numberFormat === 'dot' ? 'dot' : 'comma';
  const safeActionType: InvoiceLogAction =
    actionType === 'pdf_export' || actionType === 'print' || actionType === 'restored'
      ? actionType
      : 'manual_save';
  const safePaymentStatus: InvoicePaymentStatus =
    initialPaymentStatus === 'paid' || initialPaymentStatus === 'cancelled'
      ? initialPaymentStatus
      : 'pending';

  const sanitizedCompany = sanitizeCompanyMap(company);
  const sanitizedFooter = sanitizeFooterMap(footer);
  const sanitizedBank = sanitizeBankMap(invoice.bankAccount);
  const cleanedAdminName = safeStr((adminName || '').trim() || 'Tim Admin', 120, 'Tim Admin');
  const cleanedSalesName = safeStr((invoice.salesName || '').trim(), 120, '');
  const rawInitialPaidDate = (initialPaymentMeta?.paidAtDate || '').trim();
  const initialPaidAtDate =
    safePaymentStatus === 'paid'
      ? isValidIsoDate(rawInitialPaidDate)
        ? rawInitialPaidDate
        : toLocalDateIso()
      : '';
  const initialPaymentNote = safeStr((initialPaymentMeta?.paymentNote || '').trim(), 300, '');

  try {
    const firstChunk = itemsToSave.slice(0, ITEMS_PER_BATCH_CHUNK);
    const batch = writeBatch(db);
    const logRef = doc(db, 'invoiceLogs', logId);

    batch.set(logRef, {
      ownerId: SHARED_TEAM_OWNER_ID,
      ownerEmail: '',
      ownerName: cleanedAdminName,
      actionType: safeActionType,
      status: 'active',
      salesName: cleanedSalesName,
      paymentStatus: safePaymentStatus,
      paidAtDate: initialPaidAtDate,
      paymentNote: initialPaymentNote,
      title:
        safeStr(invoice.title || 'PROFORMA INVOICE', 100, 'PROFORMA INVOICE') ||
        'PROFORMA INVOICE',
      cityDate: safeStr(invoice.cityDate, 100),
      invoiceNumber: safeStr(invoice.invoiceNumber, 80),
      showInvoiceNumber: Boolean(invoice.showInvoiceNumber),
      buyerName: safeStr(invoice.buyerName, 200),
      buyerAddress: safeStr(invoice.buyerAddress, 500),
      sellerName: safeStr(sanitizedCompany.name, 200),
      currency: safeStr(invoice.currency || 'Rp', 10, 'Rp') || 'Rp',
      numberFormat: safeNumberFormat,
      ppnMode: safePpnMode,
      ppnRate: Math.min(100, safeNonNegNum(totals.ppnRate, 11)),
      qtyHeader: safeStr(invoice.qtyHeader, 50),
      priceHeader: safeStr(invoice.priceHeader, 50),
      taxLabel: safeStr(invoice.taxLabel, 50),
      qtyUnit: safeStr(invoice.qtyUnit, 30),
      tableHeaderColor: safeColor,
      shippingCost: safeNonNegNum(totals.shippingCost),
      shippingLabel: safeStr(invoice.shippingLabel ?? 'Biaya Ongkir', 100),
      depositAmount: safeNonNegNum(totals.depositAmount),
      depositLabel: safeStr(invoice.depositLabel ?? 'Deposit Kelebihan Bayar', 100),
      additionalNote: safeStr(invoice.additionalNote, 1000),
      highlightTransferTotal: Boolean(invoice.highlightTransferTotal),
      showSignature: Boolean(invoice.showSignature),
      signatureName: safeStr(invoice.signatureName, 100),
      signatureTitle: safeStr(invoice.signatureTitle, 120),
      itemCount: Math.max(0, Math.min(200, Math.floor(itemsToSave.length))),
      totalWeightKg: safeNonNegNum(totals.totalWeightKg),
      subtotal: safeNonNegNum(totals.subtotal),
      ppnAmount: safeNonNegNum(totals.ppnAmount),
      grandTotal: safeNonNegNum(totals.grandTotal),
      appliedDeposit: safeNonNegNum(totals.appliedDeposit),
      netPayable: safeNonNegNum(totals.netPayable),
      bankAccount: sanitizedBank,
      companySnapshot: sanitizedCompany,
      footerSnapshot: sanitizedFooter,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    const addItemToBatch = (targetBatch: ReturnType<typeof writeBatch>, item: InvoiceItem, idx: number) => {
      const itemId = `item_${String(idx).padStart(3, '0')}`;
      const itemRef = doc(db, 'invoiceLogs', logId, 'items', itemId);
      const safeOrderUnit = safeStr(item.orderUnit || 'Kg', 30, 'Kg') || 'Kg';
      const safeBasis: PriceBasis = item.priceBasis === 'per_unit' ? 'per_unit' : 'per_kg';
      targetBatch.set(itemRef, {
        ownerId: SHARED_TEAM_OWNER_ID,
        logId,
        orderIndex: Math.floor(idx),
        namaBarang: safeStr(item.namaBarang, 200),
        itemNote: safeStr(item.itemNote || '', 250),
        orderUnit: safeOrderUnit,
        weightPerUnit: safeNonNegNum(item.weightPerUnit),
        harga: safeNonNegNum(item.harga),
        priceBasis: safeBasis,
        qty: safeNonNegNum(item.qty),
        createdAt: serverTimestamp(),
      });
    };

    firstChunk.forEach((item, idx) => addItemToBatch(batch, item, idx));
    await batch.commit();

    // Commit remaining items in safe chunks (<= 8 items per batch) to stay under Firestore's 20-lookup rule cap
    for (let start = ITEMS_PER_BATCH_CHUNK; start < itemsToSave.length; start += ITEMS_PER_BATCH_CHUNK) {
      const chunkBatch = writeBatch(db);
      const slice = itemsToSave.slice(start, start + ITEMS_PER_BATCH_CHUNK);
      slice.forEach((item, offset) => addItemToBatch(chunkBatch, item, start + offset));
      await chunkBatch.commit();
    }

    return logId;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export function subscribeInvoiceLogs(
  onData: (logs: InvoiceLogRecord[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  const logsQuery = query(
    collection(db, 'invoiceLogs'),
    where('ownerId', '==', SHARED_TEAM_OWNER_ID),
    limit(500)
  );

  return onSnapshot(
    logsQuery,
    (snapshot) => {
      const records: InvoiceLogRecord[] = snapshot.docs.map((docSnap) => {
        const d = docSnap.data();
        const rawPaymentStatus = String(d.paymentStatus || 'pending');
        const paymentStatus: InvoicePaymentStatus =
          rawPaymentStatus === 'paid' || rawPaymentStatus === 'cancelled'
            ? rawPaymentStatus
            : 'pending';
        const salesName = String(d.salesName || '');
        const rawPaidAtDate = String(d.paidAtDate || '');
        const paidAtDate = isValidIsoDate(rawPaidAtDate) ? rawPaidAtDate : '';
        const paymentNote = String(d.paymentNote || '');

        return {
          id: docSnap.id,
          ownerId: String(d.ownerId || SHARED_TEAM_OWNER_ID),
          ownerEmail: String(d.ownerEmail || ''),
          ownerName: String(d.ownerName || 'Tim Admin'),
          actionType: (d.actionType as InvoiceLogAction) || 'manual_save',
          status: (d.status as InvoiceLogStatus) || 'active',
          salesName,
          paymentStatus,
          paidAtDate,
          paymentNote,
          createdAtMs: timestampToMs(d.createdAt),
          updatedAtMs: timestampToMs(d.updatedAt),
          itemCount: Number(d.itemCount) || 0,
          totalWeightKg: Number(d.totalWeightKg) || 0,
          subtotal: Number(d.subtotal) || 0,
          ppnAmount: Number(d.ppnAmount) || 0,
          shippingCost: Number(d.shippingCost) || 0,
          grandTotal: Number(d.grandTotal) || 0,
          appliedDeposit: Number(d.appliedDeposit) || 0,
          netPayable: Number(d.netPayable) || 0,
          sellerName: String(d.sellerName || ''),
          invoiceSnapshot: {
            title: String(d.title || 'PROFORMA INVOICE'),
            invoiceNumber: String(d.invoiceNumber || ''),
            showInvoiceNumber: Boolean(d.showInvoiceNumber),
            cityDate: String(d.cityDate || ''),
            buyerName: String(d.buyerName || ''),
            buyerAddress: String(d.buyerAddress || ''),
            priceHeader: String(d.priceHeader || 'Harga Satuan'),
            taxLabel: String(d.taxLabel || 'Inc PPN'),
            ppnMode: (d.ppnMode as PpnMode) || 'include',
            ppnRate: Number(d.ppnRate ?? 11),
            qtyHeader: String(d.qtyHeader || 'Qty Order'),
            qtyUnit: String(d.qtyUnit || 'Dus'),
            currency: String(d.currency || 'Rp'),
            numberFormat: d.numberFormat === 'dot' ? 'dot' : 'comma',
            tableHeaderColor: String(d.tableHeaderColor || '#1E293B'),
            shippingCost: Number(d.shippingCost) || 0,
            shippingLabel: String(d.shippingLabel || 'Biaya Ongkir'),
            depositAmount: Number(d.depositAmount) || 0,
            depositLabel: String(d.depositLabel || 'Deposit Kelebihan Bayar'),
            bankAccount: (d.bankAccount as BankAccount) || {
              id: 'bank-bca',
              bankName: 'BANK BCA',
              bankShortName: 'BCA',
              accountHolder: '-',
              accountNumber: '-',
            },
            additionalNote: String(d.additionalNote || ''),
            highlightTransferTotal: Boolean(d.highlightTransferTotal),
            salesName,
            showBestRegards: Boolean(salesName),
            showSignature: Boolean(d.showSignature),
            signatureName: String(d.signatureName || ''),
            signatureTitle: String(d.signatureTitle || ''),
          },
          companySnapshot: (d.companySnapshot as CompanyProfile) || {
            logoDataUrl: '',
            logoWidthMm: 16,
            showLetterheadInfo: true,
            showLetterheadDivider: true,
            name: String(d.sellerName || ''),
            addressLine1: '',
            addressLine2: '',
            phone: '',
            email: '',
          },
          footerSnapshot: (d.footerSnapshot as DocumentFooter) || {
            enabled: false,
            companyName: '',
            address: '',
            phone: '',
            fax: '',
          },
          storageSource: 'firebase' as const,
        };
      });

      records.sort((a, b) => b.createdAtMs - a.createdAtMs);
      onData(records);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'invoiceLogs');
      } catch (wrapped) {
        onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  );
}

export async function fetchInvoiceLogItems(logId: string): Promise<InvoiceItem[]> {
  const path = `invoiceLogs/${logId}/items`;
  try {
    const itemsQuery = query(
      collection(db, 'invoiceLogs', logId, 'items'),
      where('ownerId', '==', SHARED_TEAM_OWNER_ID)
    );

    const snap = await getDocs(itemsQuery);
    const rows = snap.docs
      .map((docSnap) => {
        const d = docSnap.data();
        return {
          orderIndex: Number(d.orderIndex) || 0,
          item: {
            id: docSnap.id,
            namaBarang: String(d.namaBarang || ''),
            itemNote: String(d.itemNote || ''),
            orderUnit: String(d.orderUnit || 'Kg'),
            weightPerUnit: Number(d.weightPerUnit) || 0,
            harga: Number(d.harga) || 0,
            priceBasis: (d.priceBasis as PriceBasis) === 'per_unit' ? 'per_unit' : 'per_kg',
            qty: Number(d.qty) || 0,
          } as InvoiceItem,
        };
      })
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map((entry) => entry.item);

    return rows;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function updateInvoiceLogAction(
  logId: string,
  actionType: InvoiceLogAction
): Promise<void> {
  const path = `invoiceLogs/${logId}`;
  try {
    await updateDoc(doc(db, 'invoiceLogs', logId), {
      actionType,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function updateInvoicePaymentStatus(
  logId: string,
  paymentStatus: InvoicePaymentStatus,
  options?: {
    paidAtDate?: string;
    paymentNote?: string;
  }
): Promise<{ paidAtDate: string; paymentNote: string }> {
  const path = `invoiceLogs/${logId}`;
  const rawDate = (options?.paidAtDate || '').trim();
  const nextPaidAtDate =
    paymentStatus === 'paid'
      ? isValidIsoDate(rawDate)
        ? rawDate
        : toLocalDateIso()
      : '';
  const nextPaymentNote = safeStr((options?.paymentNote || '').trim(), 300, '');

  try {
    await updateDoc(doc(db, 'invoiceLogs', logId), {
      paymentStatus,
      paidAtDate: nextPaidAtDate,
      paymentNote: nextPaymentNote,
      updatedAt: serverTimestamp(),
    });
    return { paidAtDate: nextPaidAtDate, paymentNote: nextPaymentNote };
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function updateInvoicePaymentDetails(
  logId: string,
  paidAtDate: string,
  paymentNote: string
): Promise<void> {
  const path = `invoiceLogs/${logId}`;
  const safeDate = isValidIsoDate(paidAtDate) ? paidAtDate.trim() : '';
  const safeNote = safeStr((paymentNote || '').trim(), 300, '');
  try {
    await updateDoc(doc(db, 'invoiceLogs', logId), {
      paidAtDate: safeDate,
      paymentNote: safeNote,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function updateInvoiceSalesName(
  logId: string,
  salesName: string
): Promise<void> {
  const path = `invoiceLogs/${logId}`;
  try {
    await updateDoc(doc(db, 'invoiceLogs', logId), {
      salesName: safeStr(salesName.trim(), 120, ''),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function archiveInvoiceLog(logId: string): Promise<void> {
  const path = `invoiceLogs/${logId}`;
  try {
    await updateDoc(doc(db, 'invoiceLogs', logId), {
      status: 'archived',
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteInvoiceLog(logId: string): Promise<void> {
  const path = `invoiceLogs/${logId}`;
  try {
    const itemsQuery = query(
      collection(db, 'invoiceLogs', logId, 'items'),
      where('ownerId', '==', SHARED_TEAM_OWNER_ID)
    );

    const itemsSnap = await getDocs(itemsQuery);
    const batch = writeBatch(db);
    itemsSnap.docs.forEach((d) => batch.delete(d.ref));
    batch.delete(doc(db, 'invoiceLogs', logId));
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// =========================================================================
// Shared Team Bank Accounts Sync
// =========================================================================
export function subscribeCloudBankAccounts(
  onData: (banks: BankAccount[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  const banksQuery = query(
    collection(db, 'bankAccounts'),
    where('ownerId', '==', SHARED_TEAM_OWNER_ID),
    limit(100)
  );

  return onSnapshot(
    banksQuery,
    (snapshot) => {
      const banks: BankAccount[] = snapshot.docs.map((docSnap) => {
        const d = docSnap.data();
        return {
          id: docSnap.id,
          bankName: String(d.bankName || ''),
          bankShortName: String(d.bankShortName || ''),
          accountHolder: String(d.accountHolder || ''),
          accountNumber: String(d.accountNumber || ''),
        };
      });
      onData(banks);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'bankAccounts');
      } catch (wrapped) {
        onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  );
}

export async function saveCloudBankAccount(bank: BankAccount): Promise<string> {
  const safeId = /^[a-zA-Z0-9_-]{1,128}$/.test(bank.id)
    ? bank.id
    : `bank_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const path = `bankAccounts/${safeId}`;
  try {
    await setDoc(doc(db, 'bankAccounts', safeId), {
      ownerId: SHARED_TEAM_OWNER_ID,
      bankName: safeStr(bank.bankName || 'BANK', 80, 'BANK') || 'BANK',
      bankShortName: safeStr(bank.bankShortName || 'BANK', 40, 'BANK') || 'BANK',
      accountHolder: safeStr(bank.accountHolder || '-', 150, '-') || '-',
      accountNumber: safeStr(bank.accountNumber || '-', 50, '-') || '-',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return safeId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateCloudBankAccount(bank: BankAccount): Promise<void> {
  const path = `bankAccounts/${bank.id}`;
  try {
    await updateDoc(doc(db, 'bankAccounts', bank.id), {
      bankName: safeStr(bank.bankName || 'BANK', 80, 'BANK') || 'BANK',
      bankShortName: safeStr(bank.bankShortName || 'BANK', 40, 'BANK') || 'BANK',
      accountHolder: safeStr(bank.accountHolder || '-', 150, '-') || '-',
      accountNumber: safeStr(bank.accountNumber || '-', 50, '-') || '-',
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteCloudBankAccount(bankId: string): Promise<void> {
  const path = `bankAccounts/${bankId}`;
  try {
    const batch = writeBatch(db);
    batch.delete(doc(db, 'bankAccounts', bankId));
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// =========================================================================
// Shared Per-PT Monthly Invoice Sequence Counters (Atomic Transactions)
// =========================================================================
export function subscribeInvoiceCounters(
  onData: (counters: InvoiceCounterRecord[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  const countersQuery = query(
    collection(db, 'invoiceCounters'),
    where('ownerId', '==', SHARED_TEAM_OWNER_ID),
    limit(200)
  );

  return onSnapshot(
    countersQuery,
    (snapshot) => {
      const records: InvoiceCounterRecord[] = snapshot.docs.map((docSnap) => {
        const d = docSnap.data();
        return {
          id: docSnap.id,
          companyCode: String(d.companyCode || 'INV'),
          companyName: String(d.companyName || ''),
          periodKey: String(d.periodKey || ''),
          lastSequence: Number(d.lastSequence) || 0,
          lastInvoiceNumber: String(d.lastInvoiceNumber || ''),
          updatedAtMs: timestampToMs(d.updatedAt),
        };
      });
      onData(records);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'invoiceCounters');
      } catch (wrapped) {
        onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  );
}

export async function reserveNextInvoiceNumber(
  companyName: string,
  minFloorSequence = 0,
  periodKey: string = getCurrentPeriodKey()
): Promise<{
  invoiceNumber: string;
  sequence: number;
  companyCode: string;
  periodKey: string;
}> {
  const companyCode = resolveCompanyCode(companyName);
  const safePeriod = /^\d{4}-\d{2}$/.test(periodKey) ? periodKey : getCurrentPeriodKey();
  const counterId = getCounterDocId(companyCode, safePeriod);
  const path = `invoiceCounters/${counterId}`;
  const safeCompanyName = safeStr(companyName.trim(), 200, '');
  const safeFloor = Math.max(0, Math.min(999998, Math.floor(minFloorSequence || 0)));

  try {
    const result = await runTransaction(db, async (tx) => {
      const counterRef = doc(db, 'invoiceCounters', counterId);
      const snap = await tx.get(counterRef);
      const currentSeq = snap.exists() ? Math.max(0, Math.floor(Number(snap.data().lastSequence) || 0)) : 0;
      const nextSeq = Math.min(999999, Math.max(currentSeq, safeFloor) + 1);
      const nextInvoiceNumber = formatProformaInvoiceNumber(companyCode, safePeriod, nextSeq);

      if (!snap.exists()) {
        tx.set(counterRef, {
          ownerId: SHARED_TEAM_OWNER_ID,
          companyCode,
          companyName: safeCompanyName,
          periodKey: safePeriod,
          lastSequence: nextSeq,
          lastInvoiceNumber: nextInvoiceNumber,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else {
        tx.update(counterRef, {
          companyName: safeCompanyName,
          lastSequence: nextSeq,
          lastInvoiceNumber: nextInvoiceNumber,
          updatedAt: serverTimestamp(),
        });
      }

      return {
        invoiceNumber: nextInvoiceNumber,
        sequence: nextSeq,
        companyCode,
        periodKey: safePeriod,
      };
    });

    return result;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function syncManualInvoiceNumberFloor(
  companyName: string,
  invoiceNumber: string,
  periodKey: string = getCurrentPeriodKey()
): Promise<void> {
  const companyCode = resolveCompanyCode(companyName);
  const safePeriod = /^\d{4}-\d{2}$/.test(periodKey) ? periodKey : getCurrentPeriodKey();
  const parsedSeq = parseSequenceFromInvoiceNumber(invoiceNumber, companyCode, safePeriod);
  if (parsedSeq <= 0 || parsedSeq > 999999) return;

  const counterId = getCounterDocId(companyCode, safePeriod);
  const safeCompanyName = safeStr(companyName.trim(), 200, '');
  const safeInvoiceNumber = safeStr(invoiceNumber.trim(), 80, '');

  try {
    await runTransaction(db, async (tx) => {
      const counterRef = doc(db, 'invoiceCounters', counterId);
      const snap = await tx.get(counterRef);
      const currentSeq = snap.exists() ? Math.max(0, Math.floor(Number(snap.data().lastSequence) || 0)) : 0;
      if (parsedSeq <= currentSeq) return;

      if (!snap.exists()) {
        tx.set(counterRef, {
          ownerId: SHARED_TEAM_OWNER_ID,
          companyCode,
          companyName: safeCompanyName,
          periodKey: safePeriod,
          lastSequence: parsedSeq,
          lastInvoiceNumber: safeInvoiceNumber,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else {
        tx.update(counterRef, {
          companyName: safeCompanyName,
          lastSequence: parsedSeq,
          lastInvoiceNumber: safeInvoiceNumber,
          updatedAt: serverTimestamp(),
        });
      }
    });
  } catch {
    // Non-fatal floor sync for manually entered numbers
  }
}
