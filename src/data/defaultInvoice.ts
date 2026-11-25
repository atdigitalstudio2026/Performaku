import { BankAccount, CompanyProfile, DocumentFooter, ProformaInvoiceData } from '../types/invoice';
import { formatTodayCityDate } from '../utils/formatters';

export interface CompanyLogoPreset {
  id: string;
  companyName: string;
  logoUrl: string;
  recommendedWidthMm: number;
  defaultBankId: string;
}

export const COMPANY_LOGO_PRESETS: CompanyLogoPreset[] = [
  {
    id: 'sra',
    companyName: 'PT Sumber Roso Agromakmur',
    logoUrl: '/assets/aistudio/LOGO_SRA_SUMBER_ROSO_AGROMAKMUR-02_3e1a1d18.png',
    recommendedWidthMm: 46,
    defaultBankId: 'bca-sra',
  },
  {
    id: 'exindo',
    companyName: 'PT Exindokarsa Agung',
    logoUrl: '/assets/aistudio/Exindo_logo_png_disesuaikan_a98b1909.png',
    recommendedWidthMm: 34,
    defaultBankId: 'bca-exindo',
  },
  {
    id: 'indo-megah-raya',
    companyName: 'PT Indo Megah Raya',
    logoUrl: '/assets/aistudio/Logo_Indo_Megah_Raya_503dc3d1.png',
    recommendedWidthMm: 54,
    defaultBankId: 'bca-indo-megah',
  },
  {
    id: 'pelangi-agro',
    companyName: 'PT Pelangi Agro Sejahtera',
    logoUrl: '/assets/aistudio/Logo_Pelangi_Agro_Sejahtera_ec7b5e3e.png',
    recommendedWidthMm: 50,
    defaultBankId: 'bca-pelangi-agro',
  },
];

export const DEFAULT_COMPANY_PROFILE: CompanyProfile = {
  logoDataUrl: COMPANY_LOGO_PRESETS[0].logoUrl,
  logoWidthMm: COMPANY_LOGO_PRESETS[0].recommendedWidthMm,
  showLetterheadInfo: true,
  showLetterheadDivider: true,
  name: 'PT Sumber Roso Agromakmur',
  addressLine1: 'Jl.Raya Bekasi Timur No.136',
  addressLine2: 'Jakarta Timur 13410',
  phone: 'Telp.021-8191908',
  email: '',
};

export const DEFAULT_DOCUMENT_FOOTER: DocumentFooter = {
  enabled: true,
  companyName: 'PT Exindokarsa Agung',
  address: 'Jl Raya Bekasi Timur No. 136',
  phone: 'P +62 21 819 1908',
  fax: 'F +62 21 851 7193',
};

export const DEFAULT_BANK_ACCOUNTS: BankAccount[] = [
  {
    id: 'bca-sra',
    bankName: 'BANK BCA',
    bankShortName: 'BCA',
    accountHolder: 'PT Sumber Roso Agromakmur',
    accountNumber: '4967 959 595',
  },
  {
    id: 'bca-exindo',
    bankName: 'BANK BCA',
    bankShortName: 'BCA',
    accountHolder: 'PT Exindokarsa Agung',
    accountNumber: '4960 496 022',
  },
  {
    id: 'bca-indo-megah',
    bankName: 'BANK BCA',
    bankShortName: 'BCA',
    accountHolder: 'PT Indo Megah Raya',
    accountNumber: '4966 510 510',
  },
  {
    id: 'bca-pelangi-agro',
    bankName: 'BANK BCA',
    bankShortName: 'BCA',
    accountHolder: 'PT Pelangi Agro Sejahtera',
    accountNumber: '4963 123 321',
  },
];

export const TABLE_HEADER_COLOR_PRESETS = [
  { label: 'Slate Gelap', hex: '#1E293B' },
  { label: 'Biru Korporat', hex: '#0B4F9C' },
  { label: 'Hijau Agro', hex: '#0B7A4B' },
  { label: 'Teal', hex: '#0F766E' },
  { label: 'Abu Klasik', hex: '#A6A6A6' },
  { label: 'Abu Terang', hex: '#E2E8F0' },
];

export const DEFAULT_INVOICE_DATA: ProformaInvoiceData = {
  title: 'PROFORMA INVOICE',
  invoiceNumber: 'PI/SRA/2026/11/001',
  showInvoiceNumber: false,
  cityDate: formatTodayCityDate('Jakarta'),
  buyerName: 'Ryuu Industry Indonesia',
  buyerAddress: '',
  priceHeader: 'Harga Satuan',
  taxLabel: 'Inc PPN',
  ppnMode: 'include',
  ppnRate: 11,
  qtyHeader: 'Qty Order',
  qtyUnit: 'Kg',
  currency: 'Rp',
  numberFormat: 'comma',
  tableHeaderColor: '#1E293B',
  shippingCost: 0,
  shippingLabel: 'Biaya Ongkir',
  depositAmount: 0,
  depositLabel: 'Deposit Kelebihan Bayar',
  items: [
    {
      id: 'item-1',
      namaBarang: 'Wijen Hitam Akram 10kg',
      orderUnit: 'Sak',
      weightPerUnit: 10,
      harga: 59000,
      priceBasis: 'per_kg',
      qty: 2,
    },
  ],
  bankAccount: DEFAULT_BANK_ACCOUNTS[0],
  additionalNote: '',
  highlightTransferTotal: true,
  showSignature: false,
  signatureName: 'Bagian Keuangan',
  signatureTitle: 'PT Exindokarsa Agung',
};
