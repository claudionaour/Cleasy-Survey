import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  User
} from 'firebase/auth';
import { auth } from '../firebase';

export const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets'
];

const provider = new GoogleAuthProvider();
SCOPES.forEach((scope) => provider.addScope(scope));

let isSigningIn = false;
let cachedAccessToken: string | null = null;
let inFlightSignIn: Promise<{ user: User; accessToken: string } | null> | null = null;

/**
 * Tracks Google Sheets OAuth session readiness (requires in-memory access token).
 */
export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, (user: User | null) => {
    if (user) {
      if (cachedAccessToken) {
        if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
      } else if (!isSigningIn) {
        cachedAccessToken = null;
        if (onAuthFailure) onAuthFailure();
      }
    } else {
      cachedAccessToken = null;
      if (onAuthFailure) onAuthFailure();
    }
  });
};

/**
 * Tracks Firebase Authentication state across sessions for Firestore persistence.
 */
export const subscribeFirebaseAuth = (
  onState: (user: User | null, ready: boolean) => void
) => {
  return onAuthStateChanged(auth, (user: User | null) => {
    onState(user, true);
  });
};

export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  if (inFlightSignIn) return inFlightSignIn;

  inFlightSignIn = (async () => {
    try {
      isSigningIn = true;
      const result = await signInWithPopup(auth, provider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (!credential?.accessToken) {
        throw new Error('No se obtuvo el token de acceso de Google.');
      }
      cachedAccessToken = credential.accessToken;
      return { user: result.user, accessToken: cachedAccessToken };
    } finally {
      isSigningIn = false;
      inFlightSignIn = null;
    }
  })();

  return inFlightSignIn;
};

export const getCachedAccessTokenSync = (): string | null => {
  return cachedAccessToken;
};

export const getAccessToken = async (): Promise<string | null> => {
  return cachedAccessToken;
};

export const clearAccessToken = () => {
  cachedAccessToken = null;
};

export const logout = async () => {
  await auth.signOut();
  cachedAccessToken = null;
};
