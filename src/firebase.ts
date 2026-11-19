import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { doc, getDocFromServer, getFirestore } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Koneksi Firestore offline. Periksa konfigurasi Firebase.');
    }
  }
}

void testConnection();

export const FIREBASE_PROJECT_ID = firebaseConfig.projectId;

export interface AuthErrorDetails {
  code: string;
  title: string;
  detail: string;
  showDomainHelper?: boolean;
  showNewTabHelper?: boolean;
  showProviderHelper?: boolean;
}

export function parseAuthError(error: unknown): AuthErrorDetails {
  const errObj = error as { code?: string; message?: string } | null;
  const code = typeof errObj?.code === 'string' ? errObj.code : 'unknown';
  const rawMessage = typeof errObj?.message === 'string' ? errObj.message : String(error || '');

  if (code === 'auth/unauthorized-domain') {
    return {
      code,
      title: 'Domain belum didaftarkan di Firebase Authentication',
      detail:
        'Firebase menolak login Google karena domain halaman ini belum masuk daftar Authorized Domains di Firebase Console.',
      showDomainHelper: true,
    };
  }

  if (code === 'auth/popup-blocked') {
    return {
      code,
      title: 'Jendela popup login Google diblokir browser',
      detail:
        'Browser memblokir jendela popup (sering terjadi di dalam pratinjau iframe). Izinkan pop-up untuk situs ini atau buka aplikasi di tab baru.',
      showNewTabHelper: true,
    };
  }

  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
    return {
      code,
      title: 'Jendela login Google ditutup sebelum selesai',
      detail:
        'Jika jendela login langsung tertutup otomatis di dalam pratinjau, coba buka aplikasi di tab baru lalu klik Masuk dengan Google lagi.',
      showNewTabHelper: true,
    };
  }

  if (code === 'auth/operation-not-allowed') {
    return {
      code,
      title: 'Login Google belum diaktifkan di Firebase Console',
      detail:
        'Aktifkan provider "Google" di menu Firebase Console → Authentication → Sign-in method.',
      showProviderHelper: true,
    };
  }

  if (code === 'auth/network-request-failed') {
    return {
      code,
      title: 'Koneksi jaringan ke Firebase terganggu',
      detail: 'Periksa koneksi internet atau nonaktifkan pemblokir pelacak/cookie pihak ketiga lalu coba lagi.',
      showNewTabHelper: true,
    };
  }

  return {
    code,
    title: 'Gagal masuk dengan akun Google',
    detail:
      rawMessage ||
      'Terjadi kendala saat membuka login Google. Coba buka aplikasi di tab baru dan ulangi login.',
    showNewTabHelper: true,
  };
}

export async function signInWithGoogle() {
  return signInWithPopup(auth, googleProvider);
}

export async function signOutUser() {
  return signOut(auth);
}
