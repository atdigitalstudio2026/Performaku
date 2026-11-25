import {
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  query,
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

export const SHARED_TEAM_OWNER_ID = 'shared_team';

function safeStr(value: unknown, maxLen: number, fallback = ''): string {
  const str = typeof value === 'string' ? value : fallback;
  return str.slice(0, maxLen);
}

function safeNonNegNum(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function sanitizeBankMap(bank: BankAccount): BankAccount {
  return {
    id: safeStr(bank.id || 'bank-custom', 128, 'bank-custom'),
    bankName: safeStr(bank.bankName, 80, 'BANK'),
    bankShortName: safeStr(bank.bankShortName, 40, 'BANK'),
    accountHolder: safeStr(bank.accountHolder, 150, '-'),
    accountNumber: safeStr(bank.accountNumber, 50, '-'),
  };
}

function sanitizeCompanyMap(company: CompanyProfile): CompanyProfile {
  const rawLogo = safeStr(company.logoDataUrl, 95000, '');
  // If user uploaded a large base64 image exceeding Firestore limit, omit from cloud snapshot
  const safeLogo =
    company.logoDataUrl && company.logoDataUrl.length > 95000 ? '' : rawLogo;
  const widthMm = Number(company.logoWidthMm);
  return {
    name: safeStr(company.name, 200),
    addressLine1: safeStr(company.addressLine1, 250),
    addressLine2: safeStr(company.addressLine2, 250),
    phone: safeStr(company.phone, 80),
    email: safeStr(company.email, 120),
    logoDataUrl: safeLogo,
    logoWidthMm: Number.isFinite(widthMm) ? Math.min(120, Math.max(10, widthMm)) : 16,
    showLetterheadInfo: Boolean(company.showLetterheadInfo),
    showLetterheadDivider: Boolean(company.showLetterheadDivider),
  };
}

function sanitizeFooterMap(footer: DocumentFooter): DocumentFooter {
  return {
    enabled: Boolean(footer.enabled),
    companyName: safeStr(footer.companyName, 200),
    address: safeStr(footer.address, 250),
    phone: safeStr(footer.phone, 80),
    fax: safeStr(footer.fax, 80),
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

export async function createInvoiceLog(
  adminName: string,
  invoice: ProformaInvoiceData,
  company: CompanyProfile,
  footer: DocumentFooter,
  actionType: InvoiceLogAction,
  initialPaymentStatus: InvoicePaymentStatus = 'pending'
): Promise<string> {
  const logId = `log_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const path = `invoiceLogs/${logId}`;

  const totals = calculateInvoiceTotals(invoice);
  const itemsToSave = invoice.items.slice(0, 200);
  const safeColor = /^#[0-9a-fA-F]{6}$/.test(invoice.tableHeaderColor || '')
    ? (invoice.tableHeaderColor as string)
    : '#1E293B';
  const safePpnMode: PpnMode =
    invoice.ppnMode === 'exclude_add' || invoice.ppnMode === 'non_ppn'
      ? invoice.ppnMode
      : 'include';
  const safeNumberFormat: 'comma' | 'dot' = invoice.numberFormat === 'dot' ? 'dot' : 'comma';
  const safePaymentStatus: InvoicePaymentStatus =
    initialPaymentStatus === 'paid' || initialPaymentStatus === 'cancelled'
      ? initialPaymentStatus
      : 'pending';

  const sanitizedCompany = sanitizeCompanyMap(company);
  const sanitizedFooter = sanitizeFooterMap(footer);
  const sanitizedBank = sanitizeBankMap(invoice.bankAccount);
  const cleanedAdminName = safeStr(adminName.trim() || 'Tim Admin', 120, 'Tim Admin');
  const cleanedSalesName = safeStr((invoice.salesName || '').trim(), 120, '');

  try {
    const batch = writeBatch(db);
    const logRef = doc(db, 'invoiceLogs', logId);

    batch.set(logRef, {
      ownerId: SHARED_TEAM_OWNER_ID,
      ownerEmail: '',
      ownerName: cleanedAdminName,
      actionType,
      status: 'active',
      salesName: cleanedSalesName,
      paymentStatus: safePaymentStatus,
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
      shippingCost: totals.shippingCost,
      shippingLabel: safeStr(invoice.shippingLabel ?? 'Biaya Ongkir', 100),
      depositAmount: totals.depositAmount,
      depositLabel: safeStr(invoice.depositLabel ?? 'Deposit Kelebihan Bayar', 100),
      additionalNote: safeStr(invoice.additionalNote, 1000),
      highlightTransferTotal: Boolean(invoice.highlightTransferTotal),
      showSignature: Boolean(invoice.showSignature),
      signatureName: safeStr(invoice.signatureName, 100),
      signatureTitle: safeStr(invoice.signatureTitle, 120),
      itemCount: itemsToSave.length,
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

    itemsToSave.forEach((item, idx) => {
      const itemId = `item_${String(idx).padStart(3, '0')}`;
      const itemRef = doc(db, 'invoiceLogs', logId, 'items', itemId);
      const safeOrderUnit = safeStr(item.orderUnit || 'Kg', 30, 'Kg') || 'Kg';
      const safeBasis: PriceBasis = item.priceBasis === 'per_unit' ? 'per_unit' : 'per_kg';
      batch.set(itemRef, {
        ownerId: SHARED_TEAM_OWNER_ID,
        logId,
        orderIndex: idx,
        namaBarang: safeStr(item.namaBarang, 200),
        orderUnit: safeOrderUnit,
        weightPerUnit: safeNonNegNum(item.weightPerUnit),
        harga: safeNonNegNum(item.harga),
        priceBasis: safeBasis,
        qty: safeNonNegNum(item.qty),
        createdAt: serverTimestamp(),
      });
    });

    await batch.commit();
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

        return {
          id: docSnap.id,
          ownerId: String(d.ownerId || SHARED_TEAM_OWNER_ID),
          ownerEmail: String(d.ownerEmail || ''),
          ownerName: String(d.ownerName || 'Tim Admin'),
          actionType: (d.actionType as InvoiceLogAction) || 'manual_save',
          status: (d.status as InvoiceLogStatus) || 'active',
          salesName,
          paymentStatus,
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
  paymentStatus: InvoicePaymentStatus
): Promise<void> {
  const path = `invoiceLogs/${logId}`;
  try {
    await updateDoc(doc(db, 'invoiceLogs', logId), {
      paymentStatus,
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
