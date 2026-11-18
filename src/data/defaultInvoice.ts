import { BankAccount, CompanyProfile, DocumentFooter, ProformaInvoiceData } from '../types/invoice';

export interface CompanyLogoPreset {
  id: string;
  companyName: string;
  logoUrl: string;
  recommendedWidthMm: number;
}

export const COMPANY_LOGO_PRESETS: CompanyLogoPreset[] = [
  {
    id: 'sra',
    companyName: 'PT. Sumber Roso Agromakmur',
    logoUrl: '/assets/aistudio/LOGO_SRA_SUMBER_ROSO_AGROMAKMUR-02_3e1a1d18.png',
    recommendedWidthMm: 46,
  },
  {
    id: 'exindo',
    companyName: 'PT Exindokarsa Agung',
    logoUrl: '/assets/aistudio/Exindo_logo_jpg_b93bc77a.jpg',
    recommendedWidthMm: 26,
  },
  {
    id: 'indo-megah-raya',
    companyName: 'PT Indo Megah Raya',
    logoUrl: '/assets/aistudio/Logo_Indo_Megah_Raya_503dc3d1.png',
    recommendedWidthMm: 54,
  },
  {
    id: 'pelangi-agro',
    companyName: 'PT Pelangi Agro Sejahtera',
    logoUrl: '/assets/aistudio/Logo_Pelangi_Agro_Sejahtera_ec7b5e3e.png',
    recommendedWidthMm: 50,
  },
];

export const DEFAULT_COMPANY_PROFILE: CompanyProfile = {
  logoDataUrl: COMPANY_LOGO_PRESETS[0].logoUrl,
  logoWidthMm: COMPANY_LOGO_PRESETS[0].recommendedWidthMm,
  showLetterheadInfo: true,
  showLetterheadDivider: true,
  name: 'PT. Sumber Roso Agromakmur',
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
    id: 'bca-utama',
    bankName: 'BANK BCA',
    bankShortName: 'BCA',
    accountHolder: 'PT.SUMBER ROSO AGROMAKMUR',
    accountNumber: '4967 959 595',
  },
  {
    id: 'mandiri-ops',
    bankName: 'BANK MANDIRI',
    bankShortName: 'Mandiri',
    accountHolder: 'PT.SUMBER ROSO AGROMAKMUR',
    accountNumber: '123 00 9876543 2',
  },
];

export const DEFAULT_INVOICE_DATA: ProformaInvoiceData = {
  title: 'PROFORMA INVOICE',
  invoiceNumber: 'PI/SRA/2026/11/001',
  showInvoiceNumber: false,
  cityDate: 'Jakarta, 18 November 2026',
  buyerName: 'Ryuu Industry Indonesia',
  buyerAddress: '',
  priceHeader: 'Harga/kg',
  taxLabel: 'Inc PPN',
  ppnMode: 'include',
  ppnRate: 11,
  qtyHeader: 'Qty Order',
  qtyUnit: 'Kg',
  currency: 'Rp',
  numberFormat: 'comma',
  items: [
    {
      id: 'item-1',
      namaBarang: 'Wijen Hitam Akram 10kg',
      inner: '10 kg',
      harga: 59000,
      qty: 20,
    },
  ],
  bankAccount: DEFAULT_BANK_ACCOUNTS[0],
  additionalNote: '',
  highlightTransferTotal: true,
  showSignature: false,
  signatureName: 'Bagian Keuangan',
  signatureTitle: 'PT Exindokarsa Agung',
};
