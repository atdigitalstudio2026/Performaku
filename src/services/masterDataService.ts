import {
  collection,
  deleteDoc,
  doc,
  limit,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  Timestamp,
  Unsubscribe,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { CustomerRecord, PriceBasis, ProductRecord } from '../types/invoice';
import { SHARED_TEAM_OWNER_ID } from './invoiceLogService';

const utf8Encoder = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;

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

function timestampToMs(ts: unknown): number {
  if (ts instanceof Timestamp) return ts.toMillis();
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

export function normalizeMemoryKey(raw: string): string {
  return safeStr(raw.trim().replace(/\s+/g, ' ').toLowerCase(), 200);
}

function fnv1aHex(str: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i += 1) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function makeDeterministicMemoryId(prefix: 'cust' | 'prod', rawName: string): string {
  const norm = normalizeMemoryKey(rawName);
  const slug = norm
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);
  const hash = fnv1aHex(norm);
  return `${prefix}_${slug ? `${slug}_` : ''}${hash}`;
}

export function subscribeCustomers(
  onData: (records: CustomerRecord[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  const path = 'customers';
  const q = query(
    collection(db, path),
    where('ownerId', '==', SHARED_TEAM_OWNER_ID),
    limit(500)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const records: CustomerRecord[] = snapshot.docs.map((docSnap) => {
        const d = docSnap.data();
        return {
          id: docSnap.id,
          ownerId: String(d.ownerId || SHARED_TEAM_OWNER_ID),
          name: String(d.name || ''),
          normalizedName: String(d.normalizedName || ''),
          address: String(d.address || ''),
          defaultSalesName: String(d.defaultSalesName || ''),
          usageCount: Math.max(1, Math.floor(Number(d.usageCount) || 1)),
          createdAtMs: timestampToMs(d.createdAt),
          updatedAtMs: timestampToMs(d.updatedAt),
        };
      });
      records.sort((a, b) => b.usageCount - a.usageCount || b.updatedAtMs - a.updatedAtMs);
      onData(records);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (e) {
        onError(e instanceof Error ? e : new Error(String(e)));
      }
    }
  );
}

export function subscribeProducts(
  onData: (records: ProductRecord[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  const path = 'products';
  const q = query(
    collection(db, path),
    where('ownerId', '==', SHARED_TEAM_OWNER_ID),
    limit(500)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const records: ProductRecord[] = snapshot.docs.map((docSnap) => {
        const d = docSnap.data();
        return {
          id: docSnap.id,
          ownerId: String(d.ownerId || SHARED_TEAM_OWNER_ID),
          name: String(d.name || ''),
          normalizedName: String(d.normalizedName || ''),
          orderUnit: String(d.orderUnit || 'Sak'),
          weightPerUnit: safeNonNegNum(d.weightPerUnit, 10),
          harga: safeNonNegNum(d.harga, 0),
          priceBasis: d.priceBasis === 'per_unit' ? 'per_unit' : 'per_kg',
          usageCount: Math.max(1, Math.floor(Number(d.usageCount) || 1)),
          createdAtMs: timestampToMs(d.createdAt),
          updatedAtMs: timestampToMs(d.updatedAt),
        };
      });
      records.sort((a, b) => b.usageCount - a.usageCount || b.updatedAtMs - a.updatedAtMs);
      onData(records);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (e) {
        onError(e instanceof Error ? e : new Error(String(e)));
      }
    }
  );
}

export interface UpsertCustomerInput {
  name: string;
  address?: string;
  defaultSalesName?: string;
}

export async function upsertCustomerMemory(
  input: UpsertCustomerInput,
  options?: { incrementUsage?: boolean; overwriteEmpty?: boolean }
): Promise<CustomerRecord | null> {
  const cleanName = safeStr(input.name.trim(), 200);
  if (cleanName.length < 2) return null;

  const normalizedName = normalizeMemoryKey(cleanName);
  if (!normalizedName) return null;

  const customerId = makeDeterministicMemoryId('cust', cleanName);
  const path = `customers/${customerId}`;
  const docRef = doc(db, 'customers', customerId);

  const incomingAddress = safeStr((input.address || '').trim(), 500);
  const incomingSales = safeStr((input.defaultSalesName || '').trim(), 120);
  const incrementUsage = Boolean(options?.incrementUsage);
  const overwriteEmpty = Boolean(options?.overwriteEmpty);

  try {
    const result = await runTransaction(db, async (tx) => {
      const snap = await tx.get(docRef);
      const nowMs = Date.now();

      if (!snap.exists()) {
        tx.set(docRef, {
          ownerId: SHARED_TEAM_OWNER_ID,
          name: cleanName,
          normalizedName,
          address: incomingAddress,
          defaultSalesName: incomingSales,
          usageCount: 1,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        return {
          id: customerId,
          ownerId: SHARED_TEAM_OWNER_ID,
          name: cleanName,
          normalizedName,
          address: incomingAddress,
          defaultSalesName: incomingSales,
          usageCount: 1,
          createdAtMs: nowMs,
          updatedAtMs: nowMs,
        };
      }

      const prev = snap.data();
      const prevUsage = Math.max(1, Math.floor(Number(prev.usageCount) || 1));
      const nextUsage = Math.min(999999, incrementUsage ? prevUsage + 1 : prevUsage);
      const prevAddress = safeStr(prev.address, 500);
      const prevSales = safeStr(prev.defaultSalesName, 120);

      const nextAddress =
        incomingAddress || overwriteEmpty ? incomingAddress : prevAddress;
      const nextSales =
        incomingSales || overwriteEmpty ? incomingSales : prevSales;

      tx.update(docRef, {
        name: cleanName,
        normalizedName,
        address: nextAddress,
        defaultSalesName: nextSales,
        usageCount: nextUsage,
        updatedAt: serverTimestamp(),
      });

      return {
        id: customerId,
        ownerId: SHARED_TEAM_OWNER_ID,
        name: cleanName,
        normalizedName,
        address: nextAddress,
        defaultSalesName: nextSales,
        usageCount: nextUsage,
        createdAtMs: timestampToMs(prev.createdAt),
        updatedAtMs: nowMs,
      };
    });

    return result;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function updateCustomerRecordById(
  id: string,
  input: UpsertCustomerInput & { usageCount?: number }
): Promise<void> {
  const cleanName = safeStr(input.name.trim(), 200);
  if (!cleanName) return;
  const normalizedName = normalizeMemoryKey(cleanName);
  const path = `customers/${id}`;

  try {
    await updateDoc(doc(db, 'customers', id), {
      name: cleanName,
      normalizedName,
      address: safeStr((input.address || '').trim(), 500),
      defaultSalesName: safeStr((input.defaultSalesName || '').trim(), 120),
      ...(input.usageCount !== undefined
        ? { usageCount: Math.min(999999, Math.max(1, Math.floor(input.usageCount))) }
        : {}),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteCustomerRecord(id: string): Promise<void> {
  const path = `customers/${id}`;
  try {
    await deleteDoc(doc(db, 'customers', id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export interface UpsertProductInput {
  name: string;
  orderUnit?: string;
  weightPerUnit?: number;
  harga?: number;
  priceBasis?: PriceBasis;
}

export async function upsertProductMemory(
  input: UpsertProductInput,
  options?: { incrementUsage?: boolean; overwriteZero?: boolean }
): Promise<ProductRecord | null> {
  const cleanName = safeStr(input.name.trim(), 200);
  if (cleanName.length < 2) return null;

  const normalizedName = normalizeMemoryKey(cleanName);
  if (!normalizedName) return null;

  const productId = makeDeterministicMemoryId('prod', cleanName);
  const path = `products/${productId}`;
  const docRef = doc(db, 'products', productId);

  const incomingUnit = safeStr((input.orderUnit || 'Sak').trim(), 30, 'Sak') || 'Sak';
  const incomingWeight = safeNonNegNum(input.weightPerUnit, 0);
  const incomingHarga = safeNonNegNum(input.harga, 0);
  const incomingBasis: PriceBasis = input.priceBasis === 'per_unit' ? 'per_unit' : 'per_kg';
  const incrementUsage = Boolean(options?.incrementUsage);
  const overwriteZero = Boolean(options?.overwriteZero);

  try {
    const result = await runTransaction(db, async (tx) => {
      const snap = await tx.get(docRef);
      const nowMs = Date.now();

      if (!snap.exists()) {
        const finalWeight =
          incomingUnit.toLowerCase() === 'kg'
            ? 1
            : incomingWeight > 0
            ? incomingWeight
            : 10;
        tx.set(docRef, {
          ownerId: SHARED_TEAM_OWNER_ID,
          name: cleanName,
          normalizedName,
          orderUnit: incomingUnit,
          weightPerUnit: finalWeight,
          harga: incomingHarga,
          priceBasis: incomingUnit.toLowerCase() === 'kg' ? 'per_kg' : incomingBasis,
          usageCount: 1,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        return {
          id: productId,
          ownerId: SHARED_TEAM_OWNER_ID,
          name: cleanName,
          normalizedName,
          orderUnit: incomingUnit,
          weightPerUnit: finalWeight,
          harga: incomingHarga,
          priceBasis: incomingUnit.toLowerCase() === 'kg' ? 'per_kg' : incomingBasis,
          usageCount: 1,
          createdAtMs: nowMs,
          updatedAtMs: nowMs,
        };
      }

      const prev = snap.data();
      const prevUsage = Math.max(1, Math.floor(Number(prev.usageCount) || 1));
      const nextUsage = Math.min(999999, incrementUsage ? prevUsage + 1 : prevUsage);
      const prevWeight = safeNonNegNum(prev.weightPerUnit, 10);
      const prevHarga = safeNonNegNum(prev.harga, 0);

      const nextWeight =
        incomingUnit.toLowerCase() === 'kg'
          ? 1
          : incomingWeight > 0 || overwriteZero
          ? incomingWeight
          : prevWeight;
      const nextHarga =
        incomingHarga > 0 || overwriteZero ? incomingHarga : prevHarga;
      const nextBasis: PriceBasis =
        incomingUnit.toLowerCase() === 'kg' ? 'per_kg' : incomingBasis;

      tx.update(docRef, {
        name: cleanName,
        normalizedName,
        orderUnit: incomingUnit,
        weightPerUnit: nextWeight,
        harga: nextHarga,
        priceBasis: nextBasis,
        usageCount: nextUsage,
        updatedAt: serverTimestamp(),
      });

      return {
        id: productId,
        ownerId: SHARED_TEAM_OWNER_ID,
        name: cleanName,
        normalizedName,
        orderUnit: incomingUnit,
        weightPerUnit: nextWeight,
        harga: nextHarga,
        priceBasis: nextBasis,
        usageCount: nextUsage,
        createdAtMs: timestampToMs(prev.createdAt),
        updatedAtMs: nowMs,
      };
    });

    return result;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function updateProductRecordById(
  id: string,
  input: UpsertProductInput & { usageCount?: number }
): Promise<void> {
  const cleanName = safeStr(input.name.trim(), 200);
  if (!cleanName) return;
  const normalizedName = normalizeMemoryKey(cleanName);
  const cleanUnit = safeStr((input.orderUnit || 'Sak').trim(), 30, 'Sak') || 'Sak';
  const isKg = cleanUnit.toLowerCase() === 'kg';
  const path = `products/${id}`;

  try {
    await updateDoc(doc(db, 'products', id), {
      name: cleanName,
      normalizedName,
      orderUnit: cleanUnit,
      weightPerUnit: isKg ? 1 : safeNonNegNum(input.weightPerUnit, 0),
      harga: safeNonNegNum(input.harga, 0),
      priceBasis: isKg ? 'per_kg' : input.priceBasis === 'per_unit' ? 'per_unit' : 'per_kg',
      ...(input.usageCount !== undefined
        ? { usageCount: Math.min(999999, Math.max(1, Math.floor(input.usageCount))) }
        : {}),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteProductRecord(id: string): Promise<void> {
  const path = `products/${id}`;
  try {
    await deleteDoc(doc(db, 'products', id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}
