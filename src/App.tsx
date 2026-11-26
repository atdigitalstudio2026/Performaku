import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Download,
  Eye,
  FilePlus2,
  History,
  MessageCircle,
  PenLine,
  Printer,
  RotateCcw,
  Save,
} from 'lucide-react';
import { BankAccountsView } from './components/BankAccountsView';
import { InvoiceEditor } from './components/InvoiceEditor';
import { InvoiceLogsView } from './components/InvoiceLogsView';
import { InvoicePreview } from './components/InvoicePreview';
import { MasterDatabaseView } from './components/MasterDatabaseView';
import { PaymentUpdateModal } from './components/PaymentUpdateModal';
import { SalesPerformanceView } from './components/SalesPerformanceView';
import { SavedDraftsView } from './components/SavedDraftsView';
import { WhatsAppModal } from './components/WhatsAppModal';
import {
  CompanyLogoPreset,
  DEFAULT_BANK_ACCOUNTS,
  DEFAULT_COMPANY_PROFILE,
  DEFAULT_DOCUMENT_FOOTER,
  DEFAULT_INVOICE_DATA,
  SALES_REP_OPTIONS,
} from './data/defaultInvoice';
import {
  archiveInvoiceLog,
  createInvoiceLog,
  deleteCloudBankAccount,
  deleteInvoiceLog,
  fetchInvoiceLogItems,
  InvoiceCounterRecord,
  reserveNextInvoiceNumber,
  saveCloudBankAccount,
  subscribeCloudBankAccounts,
  subscribeInvoiceCounters,
  subscribeInvoiceLogs,
  syncManualInvoiceNumberFloor,
  updateCloudBankAccount,
  updateInvoiceLogAction,
  updateInvoicePaymentStatus,
  updateInvoiceSalesName,
} from './services/invoiceLogService';
import {
  deleteCustomerRecord,
  deleteProductRecord,
  makeDeterministicMemoryId,
  normalizeMemoryKey,
  subscribeCustomers,
  subscribeProducts,
  updateCustomerRecordById,
  updateProductRecordById,
  upsertCustomerMemory,
  upsertProductMemory,
} from './services/masterDataService';
import {
  BankAccount,
  CompanyProfile,
  CustomerRecord,
  DocumentFooter,
  InvoiceItem,
  InvoiceLogAction,
  InvoiceLogRecord,
  InvoicePaymentStatus,
  PriceBasis,
  ProductRecord,
  ProformaInvoiceData,
  SavedInvoiceDraft,
} from './types/invoice';
import { calculateInvoiceTotals, formatTodayCityDate } from './utils/formatters';
import { downloadProformaInvoicePdf } from './utils/generatePdf';
import {
  computeFloorSequenceFromLogs,
  formatProformaInvoiceNumber,
  getCounterDocId,
  getCurrentPeriodKey,
  isAutoFormatInvoiceNumber,
  isDuplicateInvoiceNumber,
  resolveCompanyCode,
} from './utils/invoiceNumbering';
import { formatIsoDateId, toLocalDateIso } from './utils/paymentHelpers';
import {
  getDefaultTemplateForStatus,
  WhatsAppTemplateMode,
} from './utils/whatsappMessage';

type ActiveTab = 'editor' | 'logs' | 'sales' | 'database' | 'banks' | 'drafts';
type MobilePane = 'edit' | 'preview';

const STORAGE_KEYS = {
  company: 'proformaku_company_v4',
  footer: 'proformaku_footer_v1',
  invoice: 'proformaku_active_invoice_v2',
  banks: 'proformaku_saved_banks_v2',
  drafts: 'proformaku_saved_drafts_v1',
  localLogs: 'proformaku_invoice_logs_local_v1',
  adminName: 'proformaku_admin_name_v1',
  customers: 'proformaku_customers_cache_v1',
  products: 'proformaku_products_cache_v1',
};

function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

const LEGACY_EXINDO_LOGO = '/assets/aistudio/Exindo_logo_jpg_b93bc77a.jpg';
const NEW_EXINDO_LOGO = '/assets/aistudio/Exindo_logo_png_disesuaikan_a98b1909.png';

function normalizeLogoUrl(url?: string): string {
  if (!url) return '';
  return url === LEGACY_EXINDO_LOGO ? NEW_EXINDO_LOGO : url;
}

const PAYMENT_STATUS_NOTICE: Record<InvoicePaymentStatus, string> = {
  paid: 'Lunas (masuk ke data penjualan sales)',
  pending: 'Pending (menunggu pembayaran)',
  cancelled: 'Cancel (dibatalkan)',
};

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('editor');
  const [mobilePane, setMobilePane] = useState<MobilePane>('edit');
  const [previewScale, setPreviewScale] = useState<number>(0.85);
  const [isExporting, setIsExporting] = useState(false);
  const [notice, setNotice] = useState<string>('');
  const [waModalState, setWaModalState] = useState<{
    invoice: ProformaInvoiceData;
    company: CompanyProfile;
    footer: DocumentFooter;
    initialMode: WhatsAppTemplateMode;
  } | null>(null);
  const [paymentModalState, setPaymentModalState] = useState<{
    log: InvoiceLogRecord;
    targetStatus: InvoicePaymentStatus;
  } | null>(null);

  // Shared Firebase Log & Bank State (no login required)
  const [adminName, setAdminName] = useState<string>(() =>
    loadFromStorage<string>(STORAGE_KEYS.adminName, '')
  );
  const [cloudLogs, setCloudLogs] = useState<InvoiceLogRecord[]>([]);
  const [localLogs, setLocalLogs] = useState<InvoiceLogRecord[]>(() =>
    loadFromStorage<InvoiceLogRecord[]>(STORAGE_KEYS.localLogs, []).map((l) => ({
      ...l,
      salesName: l.salesName ?? l.invoiceSnapshot?.salesName ?? '',
      paymentStatus: l.paymentStatus ?? 'pending',
      paidAtDate: l.paidAtDate ?? '',
      paymentNote: l.paymentNote ?? '',
      storageSource: 'local' as const,
    }))
  );
  const [loadingLogs, setLoadingLogs] = useState(true);
  const [logsError, setLogsError] = useState('');
  const [cloudBanks, setCloudBanks] = useState<BankAccount[]>([]);
  const [cloudCounters, setCloudCounters] = useState<InvoiceCounterRecord[]>([]);
  const [cloudCustomers, setCloudCustomers] = useState<CustomerRecord[]>([]);
  const [cloudProducts, setCloudProducts] = useState<ProductRecord[]>([]);
  const [localCustomers, setLocalCustomers] = useState<CustomerRecord[]>(() =>
    loadFromStorage<CustomerRecord[]>(STORAGE_KEYS.customers, [])
  );
  const [localProducts, setLocalProducts] = useState<ProductRecord[]>(() =>
    loadFromStorage<ProductRecord[]>(STORAGE_KEYS.products, [])
  );
  const [loadingMaster, setLoadingMaster] = useState(true);
  const [isSyncingMasterFromLogs, setIsSyncingMasterFromLogs] = useState(false);
  const [isGeneratingNumber, setIsGeneratingNumber] = useState(false);
  const reservedNumbersRef = useRef<Set<string>>(new Set());
  const rememberedCustomerSigRef = useRef<Map<string, string>>(new Map());
  const rememberedProductSigRef = useRef<Map<string, string>>(new Map());

  const [company, setCompany] = useState<CompanyProfile>(() => {
    const loaded = {
      ...DEFAULT_COMPANY_PROFILE,
      ...loadFromStorage(STORAGE_KEYS.company, DEFAULT_COMPANY_PROFILE),
    };
    return {
      ...loaded,
      logoDataUrl: normalizeLogoUrl(loaded.logoDataUrl),
    };
  });
  const [footer, setFooter] = useState<DocumentFooter>(() => {
    const loadedFooter = {
      ...DEFAULT_DOCUMENT_FOOTER,
      ...loadFromStorage(STORAGE_KEYS.footer, DEFAULT_DOCUMENT_FOOTER),
    };
    const initialCompany = {
      ...DEFAULT_COMPANY_PROFILE,
      ...loadFromStorage(STORAGE_KEYS.company, DEFAULT_COMPANY_PROFILE),
    };
    return {
      ...loadedFooter,
      companyName: initialCompany.name || loadedFooter.companyName,
    };
  });
  const [invoice, setInvoice] = useState<ProformaInvoiceData>(() => {
    const loaded = {
      ...DEFAULT_INVOICE_DATA,
      ...loadFromStorage(STORAGE_KEYS.invoice, DEFAULT_INVOICE_DATA),
    };
    return {
      ...loaded,
      cityDate: formatTodayCityDate(loaded.cityDate),
      salesName:
        loaded.salesName !== undefined ? loaded.salesName : SALES_REP_OPTIONS[0],
      showBestRegards:
        loaded.showBestRegards !== undefined ? loaded.showBestRegards : true,
    };
  });
  const [localBanks, setLocalBanks] = useState<BankAccount[]>(() =>
    loadFromStorage(STORAGE_KEYS.banks, DEFAULT_BANK_ACCOUNTS)
  );
  const [savedDrafts, setSavedDrafts] = useState<SavedInvoiceDraft[]>(() =>
    loadFromStorage(STORAGE_KEYS.drafts, [])
  );

  const autoMigratedRef = useRef(false);

  // Persist local editor state & admin label
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.adminName, JSON.stringify(adminName));
    } catch {
      // Ignore storage quota errors
    }
  }, [adminName]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.localLogs, JSON.stringify(localLogs));
    } catch {
      // Ignore storage quota errors
    }
  }, [localLogs]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.company, JSON.stringify(company));
    } catch {
      // Ignore storage quota errors
    }
  }, [company]);

  // Automatically keep footer PT name synced with the active invoice PT name
  useEffect(() => {
    setFooter((prev) =>
      prev.companyName === company.name ? prev : { ...prev, companyName: company.name }
    );
  }, [company.name]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.footer, JSON.stringify(footer));
    } catch {
      // Ignore storage quota errors
    }
  }, [footer]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.invoice, JSON.stringify(invoice));
    } catch {
      // Ignore storage quota errors
    }
  }, [invoice]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.banks, JSON.stringify(localBanks));
    } catch {
      // Ignore storage quota errors
    }
  }, [localBanks]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.drafts, JSON.stringify(savedDrafts));
    } catch {
      // Ignore storage quota errors
    }
  }, [savedDrafts]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.customers, JSON.stringify(localCustomers));
    } catch {
      // Ignore storage quota errors
    }
  }, [localCustomers]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.products, JSON.stringify(localProducts));
    } catch {
      // Ignore storage quota errors
    }
  }, [localProducts]);

  // Direct real-time Firestore subscriptions for unified shared team data
  useEffect(() => {
    setLoadingLogs(true);
    setLogsError('');

    const unsubLogs = subscribeInvoiceLogs(
      (records) => {
        setCloudLogs(records);
        setLogsError('');
        setLoadingLogs(false);
      },
      (err) => {
        setLogsError(err.message || 'Gagal memuat log bersama dari Firebase.');
        setLoadingLogs(false);
      }
    );

    const unsubBanks = subscribeCloudBankAccounts(
      (banks) => {
        setCloudBanks(banks);
      },
      () => {
        // Non-fatal fallback to local banks
      }
    );

    const unsubCounters = subscribeInvoiceCounters(
      (counters) => {
        setCloudCounters(counters);
      },
      () => {
        // Non-fatal fallback using logs floor
      }
    );

    let customersReady = false;
    let productsReady = false;
    const markMasterReady = () => {
      if (customersReady && productsReady) {
        setLoadingMaster(false);
      }
    };

    const unsubCustomers = subscribeCustomers(
      (records) => {
        setCloudCustomers(records);
        customersReady = true;
        markMasterReady();
      },
      () => {
        customersReady = true;
        markMasterReady();
      }
    );

    const unsubProducts = subscribeProducts(
      (records) => {
        setCloudProducts(records);
        productsReady = true;
        markMasterReady();
      },
      () => {
        productsReady = true;
        markMasterReady();
      }
    );

    return () => {
      unsubLogs();
      unsubBanks();
      unsubCounters();
      unsubCustomers();
      unsubProducts();
    };
  }, []);

  // Automatically upload any legacy/offline local logs into the unified Firebase database
  useEffect(() => {
    if (autoMigratedRef.current || loadingLogs || logsError || localLogs.length === 0) return;
    autoMigratedRef.current = true;

    const migrate = async () => {
      const remaining: InvoiceLogRecord[] = [];
      let migrated = 0;
      for (const log of localLogs) {
        try {
          const fullInvoice: ProformaInvoiceData = {
            ...DEFAULT_INVOICE_DATA,
            ...log.invoiceSnapshot,
            salesName: log.salesName || log.invoiceSnapshot.salesName || '',
            items: log.localItems || [],
          };
          await createInvoiceLog(
            log.ownerName || adminName || 'Tim Admin',
            fullInvoice,
            log.companySnapshot,
            log.footerSnapshot,
            log.actionType,
            log.paymentStatus || 'pending',
            {
              paidAtDate: log.paidAtDate,
              paymentNote: log.paymentNote,
            }
          );
          migrated += 1;
        } catch {
          remaining.push(log);
        }
      }
      if (migrated > 0) {
        setLocalLogs(remaining);
      }
    };

    void migrate();
  }, [loadingLogs, logsError, localLogs, adminName]);

  const savedBanks: BankAccount[] = (() => {
    const merged = [...localBanks];
    for (const cb of cloudBanks) {
      const idx = merged.findIndex((b) => b.id === cb.id);
      if (idx >= 0) {
        merged[idx] = cb;
      } else {
        merged.push(cb);
      }
    }
    return merged;
  })();

  const showNotice = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(''), 3400);
  };

  const combinedLogs: InvoiceLogRecord[] = useMemo(
    () => [...cloudLogs, ...localLogs].sort((a, b) => b.createdAtMs - a.createdAtMs),
    [cloudLogs, localLogs]
  );

  // Unified Customer Memory: Cloud Firestore + Local Cache
  const savedCustomers: CustomerRecord[] = useMemo(() => {
    const byKey = new Map<string, CustomerRecord>();

    for (const c of localCustomers) {
      const norm = c.normalizedName || normalizeMemoryKey(c.name);
      if (!norm) continue;
      byKey.set(norm, c);
    }

    for (const c of cloudCustomers) {
      const norm = c.normalizedName || normalizeMemoryKey(c.name);
      if (!norm) continue;
      byKey.set(norm, c);
    }

    return Array.from(byKey.values()).sort(
      (a, b) => b.usageCount - a.usageCount || b.updatedAtMs - a.updatedAtMs
    );
  }, [cloudCustomers, localCustomers]);

  // Unified Product Memory: Cloud Firestore + Local Cache
  const savedProducts: ProductRecord[] = useMemo(() => {
    const byKey = new Map<string, ProductRecord>();

    for (const p of localProducts) {
      const norm = p.normalizedName || normalizeMemoryKey(p.name);
      if (!norm) continue;
      byKey.set(norm, p);
    }

    for (const p of cloudProducts) {
      const norm = p.normalizedName || normalizeMemoryKey(p.name);
      if (!norm) continue;
      byKey.set(norm, p);
    }

    return Array.from(byKey.values()).sort(
      (a, b) => b.usageCount - a.usageCount || b.updatedAtMs - a.updatedAtMs
    );
  }, [cloudProducts, localProducts]);

  const rememberCustomerInMemory = (
    input: { name: string; address?: string; defaultSalesName?: string },
    options?: { incrementUsage?: boolean; overwriteEmpty?: boolean; force?: boolean }
  ) => {
    const cleanName = input.name.trim();
    if (cleanName.length < 2) return;
    const norm = normalizeMemoryKey(cleanName);
    if (!norm) return;

    const cleanAddress = (input.address || '').trim();
    const cleanSales = (input.defaultSalesName || '').trim();
    const sig = `${cleanName}|${cleanAddress}|${cleanSales}`;

    if (
      !options?.incrementUsage &&
      !options?.force &&
      rememberedCustomerSigRef.current.get(norm) === sig
    ) {
      return;
    }
    rememberedCustomerSigRef.current.set(norm, sig);

    const id = makeDeterministicMemoryId('cust', cleanName);
    const now = Date.now();

    // Instant local memory update so autocomplete works immediately
    setLocalCustomers((prev) => {
      const idx = prev.findIndex((c) => c.id === id || c.normalizedName === norm);
      if (idx >= 0) {
        const existing = prev[idx];
        const updated: CustomerRecord = {
          ...existing,
          name: cleanName,
          normalizedName: norm,
          address: cleanAddress || options?.overwriteEmpty ? cleanAddress : existing.address,
          defaultSalesName:
            cleanSales || options?.overwriteEmpty ? cleanSales : existing.defaultSalesName,
          usageCount: options?.incrementUsage ? existing.usageCount + 1 : existing.usageCount,
          updatedAtMs: now,
        };
        const copy = [...prev];
        copy[idx] = updated;
        return copy;
      }
      return [
        {
          id,
          ownerId: 'shared_team',
          name: cleanName,
          normalizedName: norm,
          address: cleanAddress,
          defaultSalesName: cleanSales,
          usageCount: 1,
          createdAtMs: now,
          updatedAtMs: now,
        },
        ...prev,
      ];
    });

    // Persist asynchronously to shared Firebase database
    void upsertCustomerMemory(
      {
        name: cleanName,
        address: cleanAddress,
        defaultSalesName: cleanSales,
      },
      {
        incrementUsage: options?.incrementUsage,
        overwriteEmpty: options?.overwriteEmpty,
      }
    ).catch(() => {
      // Non-fatal: already cached locally
    });
  };

  const rememberProductInMemory = (
    item: {
      namaBarang: string;
      orderUnit?: string;
      weightPerUnit?: number;
      harga?: number;
      priceBasis?: PriceBasis;
    },
    options?: { incrementUsage?: boolean; overwriteZero?: boolean; force?: boolean }
  ) => {
    const cleanName = (item.namaBarang || '').trim();
    if (cleanName.length < 2) return;
    const norm = normalizeMemoryKey(cleanName);
    if (!norm) return;

    const unit = (item.orderUnit || 'Sak').trim() || 'Sak';
    const isKg = unit.toLowerCase() === 'kg';
    const weight = isKg ? 1 : Math.max(0, Number(item.weightPerUnit) || 0);
    const harga = Math.max(0, Number(item.harga) || 0);
    const basis: PriceBasis = isKg ? 'per_kg' : item.priceBasis === 'per_unit' ? 'per_unit' : 'per_kg';
    const sig = `${cleanName}|${unit}|${weight}|${harga}|${basis}`;

    if (
      !options?.incrementUsage &&
      !options?.force &&
      rememberedProductSigRef.current.get(norm) === sig
    ) {
      return;
    }
    rememberedProductSigRef.current.set(norm, sig);

    const id = makeDeterministicMemoryId('prod', cleanName);
    const now = Date.now();

    setLocalProducts((prev) => {
      const idx = prev.findIndex((p) => p.id === id || p.normalizedName === norm);
      if (idx >= 0) {
        const existing = prev[idx];
        const updated: ProductRecord = {
          ...existing,
          name: cleanName,
          normalizedName: norm,
          orderUnit: unit,
          weightPerUnit:
            isKg ? 1 : weight > 0 || options?.overwriteZero ? weight : existing.weightPerUnit,
          harga: harga > 0 || options?.overwriteZero ? harga : existing.harga,
          priceBasis: basis,
          usageCount: options?.incrementUsage ? existing.usageCount + 1 : existing.usageCount,
          updatedAtMs: now,
        };
        const copy = [...prev];
        copy[idx] = updated;
        return copy;
      }
      return [
        {
          id,
          ownerId: 'shared_team',
          name: cleanName,
          normalizedName: norm,
          orderUnit: unit,
          weightPerUnit: isKg ? 1 : weight > 0 ? weight : 10,
          harga,
          priceBasis: basis,
          usageCount: 1,
          createdAtMs: now,
          updatedAtMs: now,
        },
        ...prev,
      ];
    });

    void upsertProductMemory(
      {
        name: cleanName,
        orderUnit: unit,
        weightPerUnit: weight,
        harga,
        priceBasis: basis,
      },
      {
        incrementUsage: options?.incrementUsage,
        overwriteZero: options?.overwriteZero,
      }
    ).catch(() => {
      // Non-fatal: already cached locally
    });
  };

  const captureInvoiceToMasterMemory = (targetInvoice: ProformaInvoiceData) => {
    if ((targetInvoice.buyerName || '').trim().length >= 2) {
      rememberCustomerInMemory(
        {
          name: targetInvoice.buyerName,
          address: targetInvoice.buyerAddress,
          defaultSalesName: targetInvoice.salesName,
        },
        { incrementUsage: true }
      );
    }
    for (const item of targetInvoice.items || []) {
      if ((item.namaBarang || '').trim().length >= 2) {
        rememberProductInMemory(item, { incrementUsage: true });
      }
    }
  };

  const activePeriodKey = getCurrentPeriodKey();
  const activeCompanyCode = useMemo(
    () => resolveCompanyCode(company.name),
    [company.name]
  );

  const getNextPreviewForCompany = (companyName: string): {
    companyCode: string;
    floorSeq: number;
    nextNumber: string;
  } => {
    const code = resolveCompanyCode(companyName);
    const counterId = getCounterDocId(code, activePeriodKey);
    const counterDoc = cloudCounters.find((c) => c.id === counterId);
    const counterSeq = counterDoc ? counterDoc.lastSequence : 0;
    const logsFloorSeq = computeFloorSequenceFromLogs(combinedLogs, code, activePeriodKey);
    const floorSeq = Math.max(counterSeq, logsFloorSeq);
    return {
      companyCode: code,
      floorSeq,
      nextNumber: formatProformaInvoiceNumber(code, activePeriodKey, floorSeq + 1),
    };
  };

  const activeNumberInfo = useMemo(
    () => getNextPreviewForCompany(company.name),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [company.name, cloudCounters, combinedLogs, activePeriodKey]
  );

  const isDuplicateCurrentNumber = useMemo(
    () => isDuplicateInvoiceNumber(combinedLogs, invoice.invoiceNumber),
    [combinedLogs, invoice.invoiceNumber]
  );

  const isCurrentNumberReserved = Boolean(
    invoice.invoiceNumber.trim() &&
      reservedNumbersRef.current.has(invoice.invoiceNumber.trim().toUpperCase())
  );

  const reserveAtomicNumberForCompany = async (companyName: string): Promise<string> => {
    const info = getNextPreviewForCompany(companyName);
    try {
      const reserved = await reserveNextInvoiceNumber(
        companyName,
        info.floorSeq,
        activePeriodKey
      );
      reservedNumbersRef.current.add(reserved.invoiceNumber.toUpperCase());
      return reserved.invoiceNumber;
    } catch {
      // Offline fallback: increment locally beyond known floor
      const fallbackNum = formatProformaInvoiceNumber(
        info.companyCode,
        activePeriodKey,
        info.floorSeq + 1
      );
      reservedNumbersRef.current.add(fallbackNum.toUpperCase());
      return fallbackNum;
    }
  };

  const handleGenerateNextNumber = async () => {
    if (isGeneratingNumber) return;
    setIsGeneratingNumber(true);
    try {
      const nextNum = await reserveAtomicNumberForCompany(company.name);
      setInvoice((prev) => ({
        ...prev,
        invoiceNumber: nextNum,
        showInvoiceNumber: true,
      }));
      showNotice(`Nomor otomatis baru untuk ${activeCompanyCode}: ${nextNum}`);
    } finally {
      setIsGeneratingNumber(false);
    }
  };

  const handleSelectCompanyPreset = (preset: CompanyLogoPreset) => {
    setCompany((prev) => ({
      ...prev,
      logoDataUrl: preset.logoUrl,
      logoWidthMm: preset.recommendedWidthMm,
      name: preset.companyName,
    }));
    setFooter((prev) => ({
      ...prev,
      companyName: preset.companyName,
    }));

    const matchedBank =
      savedBanks.find((b) => b.id === preset.defaultBankId) ||
      DEFAULT_BANK_ACCOUNTS.find((b) => b.id === preset.defaultBankId);

    const nextForPreset = getNextPreviewForCompany(preset.companyName);

    setInvoice((prev) => {
      const currentNum = (prev.invoiceNumber || '').trim();
      const shouldAutoSwitchNumber =
        !currentNum ||
        isDuplicateInvoiceNumber(combinedLogs, currentNum) ||
        isAutoFormatInvoiceNumber(currentNum);

      return {
        ...prev,
        bankAccount: matchedBank ? { ...matchedBank } : prev.bankAccount,
        invoiceNumber: shouldAutoSwitchNumber ? nextForPreset.nextNumber : prev.invoiceNumber,
      };
    });
  };

  const ensureUniqueNumberBeforeCommit = async (
    currentInvoice: ProformaInvoiceData
  ): Promise<ProformaInvoiceData> => {
    if (!currentInvoice.showInvoiceNumber) {
      return currentInvoice;
    }

    const trimmed = (currentInvoice.invoiceNumber || '').trim();
    const upperKey = trimmed.toUpperCase();
    const alreadyReserved = Boolean(trimmed && reservedNumbersRef.current.has(upperKey));
    const isDuplicate = isDuplicateInvoiceNumber(combinedLogs, trimmed);
    const isUnreservedAuto = !alreadyReserved && isAutoFormatInvoiceNumber(trimmed);

    if (!trimmed || isDuplicate || isUnreservedAuto) {
      const assigned = await reserveAtomicNumberForCompany(company.name);
      const updatedInvoice: ProformaInvoiceData = {
        ...currentInvoice,
        invoiceNumber: assigned,
        showInvoiceNumber: true,
      };
      setInvoice(updatedInvoice);
      return updatedInvoice;
    }

    // Respect user's custom or already-reserved number & bump counter floor if matching format
    void syncManualInvoiceNumberFloor(company.name, trimmed, activePeriodKey);
    return currentInvoice;
  };

  const buildLocalLogEntry = (
    actionType: InvoiceLogAction,
    targetInvoice: ProformaInvoiceData
  ): InvoiceLogRecord => {
    const totals = calculateInvoiceTotals(targetInvoice);
    const now = Date.now();
    const { items, ...restSnapshot } = JSON.parse(
      JSON.stringify(targetInvoice)
    ) as ProformaInvoiceData;
    const cleanedSales = (targetInvoice.salesName || '').trim();
    return {
      id: `local_log_${now}_${Math.random().toString(36).slice(2, 6)}`,
      ownerId: 'shared_team',
      ownerEmail: '',
      ownerName: adminName.trim() || 'Tim Admin',
      actionType,
      status: 'active',
      salesName: cleanedSales,
      paymentStatus: 'pending',
      paidAtDate: '',
      paymentNote: '',
      createdAtMs: now,
      updatedAtMs: now,
      itemCount: items.length,
      totalWeightKg: totals.totalWeightKg,
      subtotal: totals.subtotal,
      ppnAmount: totals.ppnAmount,
      shippingCost: totals.shippingCost,
      grandTotal: totals.grandTotal,
      appliedDeposit: totals.appliedDeposit,
      netPayable: totals.netPayable,
      sellerName: company.name || '-',
      invoiceSnapshot: restSnapshot,
      companySnapshot: JSON.parse(JSON.stringify(company)) as CompanyProfile,
      footerSnapshot: JSON.parse(JSON.stringify(footer)) as DocumentFooter,
      storageSource: 'local',
      localItems: items,
    };
  };

  const recordLogShared = async (
    actionType: InvoiceLogAction,
    targetInvoice: ProformaInvoiceData
  ): Promise<'firebase' | 'local'> => {
    captureInvoiceToMasterMemory(targetInvoice);
    try {
      await createInvoiceLog(
        adminName.trim() || 'Tim Admin',
        targetInvoice,
        company,
        footer,
        actionType,
        'pending'
      );
      if (targetInvoice.invoiceNumber.trim()) {
        reservedNumbersRef.current.delete(targetInvoice.invoiceNumber.trim().toUpperCase());
      }
      return 'firebase';
    } catch {
      const localEntry = buildLocalLogEntry(actionType, targetInvoice);
      setLocalLogs((prev) => [localEntry, ...prev].slice(0, 150));
      if (targetInvoice.invoiceNumber.trim()) {
        reservedNumbersRef.current.delete(targetInvoice.invoiceNumber.trim().toUpperCase());
      }
      return 'local';
    }
  };

  const handleSyncLocalLogsToFirebase = async () => {
    if (localLogs.length === 0) return;
    let syncedCount = 0;
    const remaining: InvoiceLogRecord[] = [];
    for (const log of localLogs) {
      try {
        const fullInvoice: ProformaInvoiceData = {
          ...DEFAULT_INVOICE_DATA,
          ...log.invoiceSnapshot,
          salesName: log.salesName || log.invoiceSnapshot.salesName || '',
          items: log.localItems || [],
        };
        await createInvoiceLog(
          log.ownerName || adminName.trim() || 'Tim Admin',
          fullInvoice,
          log.companySnapshot,
          log.footerSnapshot,
          log.actionType,
          log.paymentStatus || 'pending',
          {
            paidAtDate: log.paidAtDate,
            paymentNote: log.paymentNote,
          }
        );
        syncedCount += 1;
      } catch {
        remaining.push(log);
      }
    }
    setLocalLogs(remaining);
    if (syncedCount > 0) {
      showNotice(`${syncedCount} log berhasil disinkronkan ke database bersama Firebase.`);
    } else {
      showNotice('Gagal mengunggah log ke Firebase. Periksa koneksi internet.');
    }
  };

  const handleUpdatePaymentStatus = async (
    log: InvoiceLogRecord,
    nextStatus: InvoicePaymentStatus,
    options?: { paidAtDate?: string; paymentNote?: string }
  ) => {
    const nextPaidAtDate =
      nextStatus === 'paid' ? options?.paidAtDate || toLocalDateIso() : '';
    const nextPaymentNote =
      options?.paymentNote !== undefined ? options.paymentNote : log.paymentNote || '';

    if (log.storageSource === 'local') {
      setLocalLogs((prev) =>
        prev.map((item) =>
          item.id === log.id
            ? {
                ...item,
                paymentStatus: nextStatus,
                paidAtDate: nextPaidAtDate,
                paymentNote: nextPaymentNote,
                updatedAtMs: Date.now(),
              }
            : item
        )
      );
      const dateInfo =
        nextStatus === 'paid' && nextPaidAtDate
          ? ` (Tgl Lunas: ${formatIsoDateId(nextPaidAtDate)})`
          : '';
      showNotice(`Status diubah ke ${PAYMENT_STATUS_NOTICE[nextStatus]}${dateInfo}.`);
      return;
    }

    await updateInvoicePaymentStatus(log.id, nextStatus, {
      paidAtDate: nextPaidAtDate,
      paymentNote: nextPaymentNote,
    });
    const dateInfo =
      nextStatus === 'paid' && nextPaidAtDate
        ? ` (Tgl Lunas: ${formatIsoDateId(nextPaidAtDate)})`
        : '';
    showNotice(`Status invoice diubah ke ${PAYMENT_STATUS_NOTICE[nextStatus]}${dateInfo}.`);
  };

  const handleOpenPaymentModal = (
    log: InvoiceLogRecord,
    targetStatus: InvoicePaymentStatus
  ) => {
    setPaymentModalState({ log, targetStatus });
  };

  const handleUpdateSalesName = async (log: InvoiceLogRecord, nextSalesName: string) => {
    if (log.storageSource === 'local') {
      setLocalLogs((prev) =>
        prev.map((item) =>
          item.id === log.id
            ? {
                ...item,
                salesName: nextSalesName,
                invoiceSnapshot: { ...item.invoiceSnapshot, salesName: nextSalesName },
                updatedAtMs: Date.now(),
              }
            : item
        )
      );
      showNotice(`Sales invoice ditetapkan ke ${nextSalesName}.`);
      return;
    }

    await updateInvoiceSalesName(log.id, nextSalesName);
    showNotice(`Sales invoice ditetapkan ke ${nextSalesName}.`);
  };

  const handleDownloadPdf = async () => {
    if (isExporting) return;
    setIsExporting(true);
    try {
      const committedInvoice = await ensureUniqueNumberBeforeCommit(invoice);
      const filename = await downloadProformaInvoicePdf(committedInvoice, company, footer);
      const savedTo = await recordLogShared('pdf_export', committedInvoice);
      const salesInfo = committedInvoice.salesName
        ? ` (Sales: ${committedInvoice.salesName})`
        : '';
      const numInfo = committedInvoice.showInvoiceNumber && committedInvoice.invoiceNumber
        ? ` [${committedInvoice.invoiceNumber}]`
        : '';
      showNotice(
        savedTo === 'firebase'
          ? `PDF diunduh & tercatat ke Log Firebase${numInfo}${salesInfo}: ${filename}`
          : `PDF diunduh & disimpan sementara di browser: ${filename}`
      );
    } catch {
      showNotice('Gagal membuat PDF. Periksa kembali logo atau data invoice.');
    } finally {
      setIsExporting(false);
    }
  };

  const handlePrint = async () => {
    const committedInvoice = await ensureUniqueNumberBeforeCommit(invoice);
    setTimeout(() => {
      window.print();
    }, 60);
    await recordLogShared('print', committedInvoice);
  };

  const handleSaveToCloudLog = async () => {
    const committedInvoice = await ensureUniqueNumberBeforeCommit(invoice);
    const savedTo = await recordLogShared('manual_save', committedInvoice);
    const salesInfo = committedInvoice.salesName
      ? ` untuk sales ${committedInvoice.salesName}`
      : '';
    const numInfo = committedInvoice.showInvoiceNumber && committedInvoice.invoiceNumber
      ? ` (${committedInvoice.invoiceNumber})`
      : '';
    showNotice(
      savedTo === 'firebase'
        ? `Proforma Invoice${numInfo} tercatat ke Log Firebase${salesInfo} (Status: Pending).`
        : 'Koneksi sedang terganggu; invoice disimpan sementara di browser.'
    );
  };

  const handleNewBlankInvoice = () => {
    const nextNum = getNextPreviewForCompany(company.name).nextNumber;
    setInvoice((prev) => ({
      ...prev,
      invoiceNumber: nextNum,
      showInvoiceNumber: true,
      cityDate: formatTodayCityDate(prev.cityDate),
      buyerName: '',
      buyerAddress: '',
      shippingCost: 0,
      depositAmount: 0,
      additionalNote: '',
      items: [
        {
          id: `item-${Date.now()}`,
          namaBarang: '',
          orderUnit: 'Sak',
          weightPerUnit: 10,
          harga: 0,
          priceBasis: 'per_kg',
          qty: 1,
        },
      ],
    }));
    showNotice(`Lembar invoice baru siap diisi (${nextNum}).`);
  };

  const handleSaveDraft = () => {
    captureInvoiceToMasterMemory(invoice);
    const draft: SavedInvoiceDraft = {
      id: `draft-${Date.now()}`,
      savedAt: new Date().toISOString(),
      data: JSON.parse(JSON.stringify(invoice)) as ProformaInvoiceData,
    };
    setSavedDrafts((prev) => [draft, ...prev]);
    showNotice('Draft invoice berhasil disimpan di browser.');
  };

  const handleResetExample = () => {
    const nextForDefault = getNextPreviewForCompany(DEFAULT_COMPANY_PROFILE.name).nextNumber;
    setInvoice({
      ...DEFAULT_INVOICE_DATA,
      invoiceNumber: nextForDefault,
      showInvoiceNumber: true,
      cityDate: formatTodayCityDate(),
    });
    setCompany((prev) => ({
      ...DEFAULT_COMPANY_PROFILE,
      logoDataUrl: prev.logoDataUrl || DEFAULT_COMPANY_PROFILE.logoDataUrl,
    }));
    setFooter(DEFAULT_DOCUMENT_FOOTER);
    showNotice('Data dikembalikan ke contoh awal.');
  };

  const handleAddBankPreset = (bank: BankAccount) => {
    setLocalBanks((prev) => {
      const exists = prev.some(
        (b) =>
          b.accountNumber.trim() === bank.accountNumber.trim() &&
          b.bankShortName.trim().toLowerCase() === bank.bankShortName.trim().toLowerCase()
      );
      if (exists) return prev;
      return [...prev, bank];
    });
    void saveCloudBankAccount(bank).catch(() => {});
    showNotice(`Rekening ${bank.bankShortName} ditambahkan ke daftar bersama.`);
  };

  const handleUpdateBank = (updated: BankAccount) => {
    setLocalBanks((prev) => prev.map((b) => (b.id === updated.id ? updated : b)));
    if (cloudBanks.some((b) => b.id === updated.id)) {
      void updateCloudBankAccount(updated).catch(() => {});
    } else {
      void saveCloudBankAccount(updated).catch(() => {});
    }
    if (invoice.bankAccount.id === updated.id) {
      setInvoice((prev) => ({ ...prev, bankAccount: updated }));
    }
    showNotice('Data rekening bersama diperbarui.');
  };

  const handleDeleteBank = (id: string) => {
    setLocalBanks((prev) => prev.filter((b) => b.id !== id));
    if (cloudBanks.some((b) => b.id === id)) {
      void deleteCloudBankAccount(id).catch(() => {});
    }
    showNotice('Rekening dihapus dari daftar.');
  };

  const handleUseBank = (bank: BankAccount) => {
    setInvoice((prev) => ({ ...prev, bankAccount: { ...bank } }));
    setActiveTab('editor');
    showNotice(`Rekening aktif diganti ke ${bank.bankShortName} (${bank.accountNumber}).`);
  };

  const handleFetchLogItems = async (log: InvoiceLogRecord): Promise<InvoiceItem[]> => {
    if (log.storageSource === 'local') {
      return log.localItems || [];
    }
    return fetchInvoiceLogItems(log.id);
  };

  const handleSyncMasterFromLogs = async () => {
    if (isSyncingMasterFromLogs || combinedLogs.length === 0) return;
    setIsSyncingMasterFromLogs(true);
    try {
      const customerMap = new Map<
        string,
        { name: string; address: string; defaultSalesName: string }
      >();
      const productMap = new Map<string, InvoiceItem>();

      for (const log of combinedLogs) {
        const bName = (log.invoiceSnapshot?.buyerName || '').trim();
        if (bName.length >= 2) {
          const norm = normalizeMemoryKey(bName);
          if (norm && !customerMap.has(norm)) {
            customerMap.set(norm, {
              name: bName,
              address: (log.invoiceSnapshot?.buyerAddress || '').trim(),
              defaultSalesName: (log.salesName || '').trim(),
            });
          }
        }
        try {
          const items = await handleFetchLogItems(log);
          for (const item of items) {
            const pName = (item.namaBarang || '').trim();
            if (pName.length >= 2) {
              const norm = normalizeMemoryKey(pName);
              if (norm && !productMap.has(norm)) {
                productMap.set(norm, item);
              }
            }
          }
        } catch {
          // Skip unreadable log items
        }
      }

      let custCount = 0;
      for (const cust of customerMap.values()) {
        try {
          await upsertCustomerMemory(cust);
          custCount += 1;
        } catch {
          // Continue
        }
      }

      let prodCount = 0;
      for (const prod of productMap.values()) {
        try {
          await upsertProductMemory({
            name: prod.namaBarang,
            orderUnit: prod.orderUnit,
            weightPerUnit: prod.weightPerUnit,
            harga: prod.harga,
            priceBasis: prod.priceBasis,
          });
          prodCount += 1;
        } catch {
          // Continue
        }
      }

      showNotice(
        `Impor selesai: ${custCount} customer & ${prodCount} barang masuk ke database bersama.`
      );
    } finally {
      setIsSyncingMasterFromLogs(false);
    }
  };

  const handleSaveMasterCustomer = async (
    input: { name: string; address: string; defaultSalesName: string },
    editingId?: string | null
  ) => {
    if (editingId && cloudCustomers.some((c) => c.id === editingId)) {
      await updateCustomerRecordById(editingId, input);
      setLocalCustomers((prev) =>
        prev.map((c) =>
          c.id === editingId
            ? {
                ...c,
                name: input.name,
                normalizedName: normalizeMemoryKey(input.name),
                address: input.address,
                defaultSalesName: input.defaultSalesName,
                updatedAtMs: Date.now(),
              }
            : c
        )
      );
      showNotice(`Data customer "${input.name}" diperbarui.`);
      return;
    }

    rememberCustomerInMemory(input, { overwriteEmpty: true, force: true });
    showNotice(`Customer "${input.name}" disimpan ke database bersama.`);
  };

  const handleDeleteMasterCustomer = async (customer: CustomerRecord) => {
    setLocalCustomers((prev) =>
      prev.filter((c) => c.id !== customer.id && c.normalizedName !== customer.normalizedName)
    );
    if (cloudCustomers.some((c) => c.id === customer.id)) {
      await deleteCustomerRecord(customer.id);
    }
    showNotice(`Customer "${customer.name}" dihapus dari database.`);
  };

  const handleUseMasterCustomer = (customer: CustomerRecord) => {
    setInvoice((prev) => ({
      ...prev,
      buyerName: customer.name,
      buyerAddress: customer.address || prev.buyerAddress,
      salesName:
        !prev.salesName && customer.defaultSalesName
          ? customer.defaultSalesName
          : prev.salesName,
    }));
    setActiveTab('editor');
    showNotice(`Customer "${customer.name}" diterapkan ke invoice aktif.`);
  };

  const handleSaveMasterProduct = async (
    input: {
      name: string;
      orderUnit: string;
      weightPerUnit: number;
      harga: number;
      priceBasis: PriceBasis;
    },
    editingId?: string | null
  ) => {
    if (editingId && cloudProducts.some((p) => p.id === editingId)) {
      await updateProductRecordById(editingId, input);
      setLocalProducts((prev) =>
        prev.map((p) =>
          p.id === editingId
            ? {
                ...p,
                name: input.name,
                normalizedName: normalizeMemoryKey(input.name),
                orderUnit: input.orderUnit,
                weightPerUnit: input.weightPerUnit,
                harga: input.harga,
                priceBasis: input.priceBasis,
                updatedAtMs: Date.now(),
              }
            : p
        )
      );
      showNotice(`Data barang "${input.name}" diperbarui.`);
      return;
    }

    rememberProductInMemory(
      {
        namaBarang: input.name,
        orderUnit: input.orderUnit,
        weightPerUnit: input.weightPerUnit,
        harga: input.harga,
        priceBasis: input.priceBasis,
      },
      { overwriteZero: true, force: true }
    );
    showNotice(`Barang "${input.name}" disimpan ke database bersama.`);
  };

  const handleDeleteMasterProduct = async (product: ProductRecord) => {
    setLocalProducts((prev) =>
      prev.filter((p) => p.id !== product.id && p.normalizedName !== product.normalizedName)
    );
    if (cloudProducts.some((p) => p.id === product.id)) {
      await deleteProductRecord(product.id);
    }
    showNotice(`Barang "${product.name}" dihapus dari database.`);
  };

  const handleAddMasterProductToInvoice = (product: ProductRecord) => {
    const isKg = product.orderUnit.toLowerCase() === 'kg';
    setInvoice((prev) => {
      const hasSingleBlank =
        prev.items.length === 1 && !prev.items[0].namaBarang.trim();
      const newItem: InvoiceItem = {
        id: `item-${Date.now()}`,
        namaBarang: product.name,
        orderUnit: product.orderUnit,
        weightPerUnit: isKg ? 1 : product.weightPerUnit,
        harga: product.harga,
        priceBasis: isKg ? 'per_kg' : product.priceBasis,
        qty: 1,
      };
      return {
        ...prev,
        items: hasSingleBlank ? [newItem] : [...prev.items, newItem],
      };
    });
    setActiveTab('editor');
    showNotice(`"${product.name}" dimasukkan ke daftar barang invoice.`);
  };

  const handleLoadLogToEditor = (
    restoredInvoice: ProformaInvoiceData,
    restoredCompany: CompanyProfile,
    restoredFooter: DocumentFooter
  ) => {
    setInvoice({ ...DEFAULT_INVOICE_DATA, ...restoredInvoice });
    const nextCompanyName = restoredCompany.name || DEFAULT_COMPANY_PROFILE.name;
    setCompany((prev) => ({
      ...DEFAULT_COMPANY_PROFILE,
      ...restoredCompany,
      logoDataUrl: normalizeLogoUrl(restoredCompany.logoDataUrl || prev.logoDataUrl),
    }));
    setFooter({
      ...DEFAULT_DOCUMENT_FOOTER,
      ...restoredFooter,
      companyName: nextCompanyName,
    });
    setActiveTab('editor');
    showNotice('Data Proforma Invoice dari log dimuat ke editor.');
  };

  const handleDownloadLogPdf = async (log: InvoiceLogRecord, items: InvoiceItem[]) => {
    const fullInvoice: ProformaInvoiceData = {
      ...DEFAULT_INVOICE_DATA,
      ...log.invoiceSnapshot,
      salesName: log.salesName,
      showBestRegards: Boolean(log.salesName),
      items,
    };
    const filename = await downloadProformaInvoicePdf(
      fullInvoice,
      log.companySnapshot,
      log.footerSnapshot
    );
    if (log.storageSource === 'local') {
      setLocalLogs((prev) =>
        prev.map((item) =>
          item.id === log.id
            ? { ...item, actionType: 'pdf_export', updatedAtMs: Date.now() }
            : item
        )
      );
    } else if (log.status !== 'archived') {
      try {
        await updateInvoiceLogAction(log.id, 'pdf_export');
      } catch {
        // Non-fatal
      }
    }
    showNotice(`PDF diunduh dari log: ${filename}`);
  };

  const handleOpenWhatsAppForEditor = () => {
    setWaModalState({
      invoice,
      company,
      footer,
      initialMode: 'invoice',
    });
  };

  const handleOpenWhatsAppForLog = async (
    log: InvoiceLogRecord,
    cachedItems?: InvoiceItem[]
  ) => {
    const items = cachedItems ?? (await handleFetchLogItems(log));
    const fullInvoice: ProformaInvoiceData = {
      ...DEFAULT_INVOICE_DATA,
      ...log.invoiceSnapshot,
      salesName: log.salesName,
      showBestRegards: Boolean(log.salesName),
      items,
    };
    setWaModalState({
      invoice: fullInvoice,
      company: log.companySnapshot,
      footer: log.footerSnapshot,
      initialMode: getDefaultTemplateForStatus(log.paymentStatus),
    });
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#F4F5F7] text-[#0F172A]">
      {/* Top Bar Contract: 3 zones */}
      <header className="no-print sticky top-0 z-30 bg-white border-b border-slate-200 px-4 sm:px-6 h-[60px] flex items-center justify-between gap-4 sm:gap-6">
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            setActiveTab('editor');
          }}
          className="font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
        >
          ProformaKu
        </a>

        <nav className="flex items-center gap-4 sm:gap-6 text-xs sm:text-sm font-medium overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab('editor')}
            className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'editor'
                ? 'border-[#1D4ED8] text-slate-900'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            Editor Invoice
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('logs')}
            className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'logs'
                ? 'border-[#1D4ED8] text-slate-900'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            Log Invoice ({combinedLogs.filter((l) => l.status !== 'archived').length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('sales')}
            className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'sales'
                ? 'border-[#1D4ED8] text-slate-900'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            Performa Sales
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('database')}
            className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'database'
                ? 'border-[#1D4ED8] text-slate-900'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            Database ({savedCustomers.length + savedProducts.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('banks')}
            className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'banks'
                ? 'border-[#1D4ED8] text-slate-900'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            Daftar Rekening
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('drafts')}
            className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'drafts'
                ? 'border-[#1D4ED8] text-slate-900'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            Draft Lokal ({savedDrafts.length})
          </button>
        </nav>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleDownloadPdf}
            disabled={isExporting}
            className="inline-flex items-center gap-2 px-3.5 sm:px-4 py-2 text-xs sm:text-sm font-medium rounded-md bg-[#1D4ED8] text-white hover:bg-blue-800 disabled:opacity-60 transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <Download className="w-4 h-4" />
            {isExporting ? 'Memproses...' : 'Unduh PDF'}
          </button>
        </div>
      </header>

      {/* Non-intrusive toast feedback */}
      {notice && (
        <div
          role="status"
          className="no-print fixed bottom-5 right-5 z-50 bg-slate-900 text-white text-xs font-medium px-4 py-2.5 rounded-md shadow-lg"
        >
          {notice}
        </div>
      )}

      {/* Main Content */}
      {activeTab === 'editor' && (
        <main className="flex-1 flex flex-col lg:flex-row">
          {/* Mobile Pane Switcher */}
          <div className="no-print lg:hidden bg-white border-b border-slate-200 px-4 py-2 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setMobilePane('edit')}
              className={`flex-1 inline-flex items-center justify-center gap-1.5 py-2 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                mobilePane === 'edit'
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-700'
              }`}
            >
              <PenLine className="w-3.5 h-3.5" />
              Isi Data Invoice
            </button>
            <button
              type="button"
              onClick={() => setMobilePane('preview')}
              className={`flex-1 inline-flex items-center justify-center gap-1.5 py-2 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                mobilePane === 'preview'
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-700'
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              Pratinjau Dokumen
            </button>
          </div>

          {/* Left Pane: Form Editor */}
          <aside
            className={`no-print w-full lg:w-[490px] xl:w-[520px] shrink-0 border-r border-slate-200 bg-white lg:h-[calc(100vh-60px)] lg:overflow-y-auto ${
              mobilePane === 'edit' ? 'block' : 'hidden lg:block'
            }`}
          >
            <InvoiceEditor
              invoice={invoice}
              company={company}
              footer={footer}
              savedBanks={savedBanks}
              savedCustomers={savedCustomers}
              savedProducts={savedProducts}
              activeCompanyCode={activeCompanyCode}
              nextInvoiceNumberPreview={activeNumberInfo.nextNumber}
              isDuplicateNumber={isDuplicateCurrentNumber}
              isCurrentNumberReserved={isCurrentNumberReserved}
              isGeneratingNumber={isGeneratingNumber}
              onChangeInvoice={setInvoice}
              onChangeCompany={setCompany}
              onChangeFooter={setFooter}
              onSaveBankPreset={handleAddBankPreset}
              onSelectCompanyPreset={handleSelectCompanyPreset}
              onGenerateNextNumber={handleGenerateNextNumber}
              onRememberCustomer={(cust) => rememberCustomerInMemory(cust)}
              onRememberProduct={(item) => rememberProductInMemory(item)}
            />
          </aside>

          {/* Right Pane: Live A4 Preview Studio */}
          <section
            className={`flex-1 flex flex-col bg-[#E8EAEE] lg:h-[calc(100vh-60px)] ${
              mobilePane === 'preview' ? 'block' : 'hidden lg:flex'
            }`}
          >
            {/* Preview Workspace Toolbar */}
            <div className="no-print bg-white border-b border-slate-200 px-4 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-slate-600 mr-1">Zoom A4:</span>
                {[0.65, 0.85, 1].map((z) => (
                  <button
                    key={z}
                    type="button"
                    onClick={() => setPreviewScale(z)}
                    className={`px-2.5 py-1 text-xs font-mono rounded transition-colors cursor-pointer whitespace-nowrap ${
                      previewScale === z
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    {Math.round(z * 100)}%
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleNewBlankInvoice}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded border border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 transition-colors cursor-pointer whitespace-nowrap"
                >
                  <FilePlus2 className="w-3.5 h-3.5" />
                  Invoice Baru
                </button>
                <button
                  type="button"
                  onClick={handleSaveToCloudLog}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded border border-blue-200 bg-blue-50/70 text-[#1D4ED8] hover:bg-blue-100/70 transition-colors cursor-pointer whitespace-nowrap"
                >
                  <History className="w-3.5 h-3.5" />
                  Simpan ke Log
                </button>
                <button
                  type="button"
                  onClick={handleOpenWhatsAppForEditor}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded border border-emerald-300 bg-emerald-50/80 text-emerald-800 hover:bg-emerald-100 transition-colors cursor-pointer whitespace-nowrap"
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  WhatsApp
                </button>
                <button
                  type="button"
                  onClick={handleSaveDraft}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer whitespace-nowrap"
                >
                  <Save className="w-3.5 h-3.5" />
                  Draft Lokal
                </button>
                <button
                  type="button"
                  onClick={handleResetExample}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer whitespace-nowrap"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Contoh Awal
                </button>
                <button
                  type="button"
                  onClick={handlePrint}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer whitespace-nowrap"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Cetak
                </button>
              </div>
            </div>

            {/* Scrollable Paper Canvas */}
            <div className="flex-1 overflow-auto p-4 sm:p-8 flex justify-center items-start">
              <InvoicePreview
                invoice={invoice}
                company={company}
                footer={footer}
                scale={previewScale}
              />
            </div>
          </section>
        </main>
      )}

      {activeTab === 'logs' && (
        <main className="flex-1">
          <InvoiceLogsView
            adminName={adminName}
            onChangeAdminName={setAdminName}
            logs={combinedLogs}
            localOnlyCount={localLogs.length}
            loadingLogs={loadingLogs}
            logsError={logsError}
            onSyncLocalLogs={handleSyncLocalLogsToFirebase}
            onSaveCurrentToLog={handleSaveToCloudLog}
            onUpdatePaymentStatus={handleUpdatePaymentStatus}
            onOpenPaymentModal={handleOpenPaymentModal}
            onUpdateSalesName={handleUpdateSalesName}
            onFetchLogItems={handleFetchLogItems}
            onLoadLogToEditor={handleLoadLogToEditor}
            onDownloadLogPdf={handleDownloadLogPdf}
            onArchiveLog={async (log) => {
              if (log.storageSource === 'local') {
                setLocalLogs((prev) =>
                  prev.map((item) =>
                    item.id === log.id
                      ? { ...item, status: 'archived', updatedAtMs: Date.now() }
                      : item
                  )
                );
              } else {
                await archiveInvoiceLog(log.id);
              }
              showNotice('Log dipindahkan ke arsip.');
            }}
            onDeleteLog={async (log) => {
              if (log.storageSource === 'local') {
                setLocalLogs((prev) => prev.filter((item) => item.id !== log.id));
                showNotice('Log lokal dihapus permanen.');
                return;
              }
              await deleteInvoiceLog(log.id);
              showNotice('Log dihapus permanen dari database bersama Firebase.');
            }}
            onOpenWhatsApp={handleOpenWhatsAppForLog}
            onNotify={showNotice}
          />
        </main>
      )}

      {activeTab === 'sales' && (
        <main className="flex-1">
          <SalesPerformanceView
            logs={combinedLogs}
            loadingLogs={loadingLogs}
            onUpdatePaymentStatus={handleUpdatePaymentStatus}
            onOpenPaymentModal={handleOpenPaymentModal}
            onUpdateSalesName={handleUpdateSalesName}
            onFetchLogItems={handleFetchLogItems}
            onLoadLogToEditor={handleLoadLogToEditor}
            onDownloadLogPdf={handleDownloadLogPdf}
            onOpenWhatsApp={handleOpenWhatsAppForLog}
            onNotify={showNotice}
          />
        </main>
      )}

      {activeTab === 'database' && (
        <main className="flex-1">
          <MasterDatabaseView
            customers={savedCustomers}
            products={savedProducts}
            loadingMaster={loadingMaster}
            totalLogsAvailable={combinedLogs.length}
            isSyncingFromLogs={isSyncingMasterFromLogs}
            onSyncFromLogs={handleSyncMasterFromLogs}
            onSaveCustomer={handleSaveMasterCustomer}
            onDeleteCustomer={handleDeleteMasterCustomer}
            onUseCustomer={handleUseMasterCustomer}
            onSaveProduct={handleSaveMasterProduct}
            onDeleteProduct={handleDeleteMasterProduct}
            onAddProductToInvoice={handleAddMasterProductToInvoice}
            onNotify={showNotice}
          />
        </main>
      )}

      {activeTab === 'banks' && (
        <main className="flex-1">
          <BankAccountsView
            banks={savedBanks}
            activeBankId={invoice.bankAccount.id}
            onAddBank={handleAddBankPreset}
            onUpdateBank={handleUpdateBank}
            onDeleteBank={handleDeleteBank}
            onUseBank={handleUseBank}
          />
        </main>
      )}

      {activeTab === 'drafts' && (
        <main className="flex-1">
          <SavedDraftsView
            drafts={savedDrafts}
            company={company}
            onSaveCurrentDraft={handleSaveDraft}
            onLoadDraft={(draft) => {
              setInvoice({
                ...DEFAULT_INVOICE_DATA,
                ...(JSON.parse(JSON.stringify(draft.data)) as ProformaInvoiceData),
              });
              setActiveTab('editor');
              showNotice('Draft lokal dimuat ke editor.');
            }}
            onDeleteDraft={(id) => {
              setSavedDrafts((prev) => prev.filter((d) => d.id !== id));
              showNotice('Draft lokal dihapus.');
            }}
            onDownloadDraftPdf={async (draft) => {
              try {
                const filename = await downloadProformaInvoicePdf(draft.data, company, footer);
                showNotice(`PDF diunduh: ${filename}`);
              } catch {
                showNotice('Gagal mengunduh PDF draft.');
              }
            }}
          />
        </main>
      )}

      {waModalState && (
        <WhatsAppModal
          invoice={waModalState.invoice}
          company={waModalState.company}
          footer={waModalState.footer}
          initialMode={waModalState.initialMode}
          onClose={() => setWaModalState(null)}
          onNotify={showNotice}
        />
      )}

      {paymentModalState && (
        <PaymentUpdateModal
          log={paymentModalState.log}
          targetStatus={paymentModalState.targetStatus}
          onSave={async ({ paymentStatus, paidAtDate, paymentNote }) => {
            await handleUpdatePaymentStatus(paymentModalState.log, paymentStatus, {
              paidAtDate,
              paymentNote,
            });
          }}
          onClose={() => setPaymentModalState(null)}
        />
      )}
    </div>
  );
}
