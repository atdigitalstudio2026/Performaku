export type PriceBasis = 'per_kg' | 'per_unit';

export interface InvoiceItem {
  id: string;
  namaBarang: string;
  orderUnit: string;
  weightPerUnit: number;
  harga: number;
  priceBasis: PriceBasis;
  qty: number;
  inner?: string;
}

export interface BankAccount {
  id: string;
  bankName: string;
  bankShortName: string;
  accountHolder: string;
  accountNumber: string;
}

export interface CompanyProfile {
  logoDataUrl: string;
  logoWidthMm: number;
  showLetterheadInfo: boolean;
  showLetterheadDivider: boolean;
  name: string;
  addressLine1: string;
  addressLine2: string;
  phone: string;
  email: string;
}

export interface DocumentFooter {
  enabled: boolean;
  companyName: string;
  address: string;
  phone: string;
  fax: string;
}

export type PpnMode = 'include' | 'exclude_add' | 'non_ppn';

export interface ProformaInvoiceData {
  title: string;
  invoiceNumber: string;
  showInvoiceNumber: boolean;
  cityDate: string;
  buyerName: string;
  buyerAddress: string;
  priceHeader: string;
  taxLabel: string;
  ppnMode: PpnMode;
  ppnRate: number;
  qtyHeader: string;
  qtyUnit: string;
  currency: string;
  numberFormat: 'comma' | 'dot';
  tableHeaderColor?: string;
  shippingCost?: number;
  shippingLabel?: string;
  depositAmount?: number;
  depositLabel?: string;
  items: InvoiceItem[];
  bankAccount: BankAccount;
  additionalNote: string;
  highlightTransferTotal: boolean;
  salesName?: string;
  showBestRegards?: boolean;
  showSignature: boolean;
  signatureName: string;
  signatureTitle: string;
}

export interface SavedInvoiceDraft {
  id: string;
  savedAt: string;
  data: ProformaInvoiceData;
}

export type InvoiceLogAction = 'manual_save' | 'pdf_export' | 'print' | 'restored';
export type InvoiceLogStatus = 'active' | 'archived';
export type InvoicePaymentStatus = 'pending' | 'paid' | 'cancelled';

export interface InvoiceLogRecord {
  id: string;
  ownerId: string;
  ownerEmail: string;
  ownerName: string;
  actionType: InvoiceLogAction;
  status: InvoiceLogStatus;
  salesName: string;
  paymentStatus: InvoicePaymentStatus;
  createdAtMs: number;
  updatedAtMs: number;
  itemCount: number;
  totalWeightKg: number;
  subtotal: number;
  ppnAmount: number;
  shippingCost: number;
  grandTotal: number;
  appliedDeposit: number;
  netPayable: number;
  sellerName: string;
  invoiceSnapshot: Omit<ProformaInvoiceData, 'items'>;
  companySnapshot: CompanyProfile;
  footerSnapshot: DocumentFooter;
  storageSource?: 'firebase' | 'local';
  localItems?: InvoiceItem[];
}
