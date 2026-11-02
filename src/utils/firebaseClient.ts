import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signInWithCredential,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  updateProfile,
  onAuthStateChanged,
  User,
} from 'firebase/auth';
import {
  initializeFirestore,
  doc,
  getDoc,
  setDoc,
  collection,
  query,
  where,
  getDocs,
  onSnapshot,
  serverTimestamp,
  Unsubscribe,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import {
  cleanForFirestore,
  generateDeterministicFriendCode,
  isGuestUid,
  isTestSubject,
} from './academicRules';
import {
  FriendRequestItem,
  StudentFriend,
  StudyRoom,
  StudyTask,
  UserProfileState,
} from '../types';

export const SCOPES = [
  'https://www.googleapis.com/auth/classroom.courses.readonly',
  'https://www.googleapis.com/auth/classroom.coursework.me.readonly',
  'https://www.googleapis.com/auth/classroom.student-submissions.me.readonly',
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/drive.readonly',
];

const app = initializeApp(firebaseConfig);

// Initialize Analytics if supported in the browser
if (typeof window !== 'undefined' && firebaseConfig.measurementId) {
  import('firebase/analytics')
    .then(({ getAnalytics, isSupported }) => {
      isSupported()
        .then((supported) => {
          if (supported) {
            getAnalytics(app);
          }
        })
        .catch(() => {});
    })
    .catch(() => {});
}

export const db = initializeFirestore(
  app,
  { ignoreUndefinedProperties: true },
  firebaseConfig.firestoreDatabaseId &&
    firebaseConfig.firestoreDatabaseId !== '(default)'
    ? firebaseConfig.firestoreDatabaseId
    : undefined
);

export const auth = getAuth(app);

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

const workspaceGoogleProvider = new GoogleAuthProvider();
for (const scope of SCOPES) {
  workspaceGoogleProvider.addScope(scope);
}
workspaceGoogleProvider.setCustomParameters({ prompt: 'select_account' });

// In-memory access token cache (never stored in localStorage per Workspace skill)
let cachedAccessToken: string | null = null;
let isSigningIn = false;

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


export function getAccessToken(): string | null {
  return cachedAccessToken;
}

export function initAuth(
  onUserChange: (user: User | null, accessToken: string | null) => void
): Unsubscribe {
  if (typeof window !== 'undefined') {
    getRedirectResult(auth)
      .then((result) => {
        if (result?.user) {
          const credential = GoogleAuthProvider.credentialFromResult(result);
          if (credential?.accessToken) {
            cachedAccessToken = credential.accessToken;
          }
          const friendCode = generateDeterministicFriendCode(result.user.uid);
          try {
            localStorage.setItem(
              'explic_verified_session',
              JSON.stringify({
                uid: result.user.uid,
                email: result.user.email || 'scholar@google.com',
                displayName: result.user.displayName || 'Google Scholar',
                friendCode,
                verifiedAt: new Date().toISOString(),
              })
            );
          } catch {}
          onUserChange(result.user, cachedAccessToken);
        }
      })
      .catch((err) => {
        console.warn('Redirect sign-in resolution:', err?.message || err);
      });
  }

  return onAuthStateChanged(auth, (user) => {
    if (!user && !isSigningIn) {
      cachedAccessToken = null;
    }
    onUserChange(user, cachedAccessToken);
  });
}

export async function signInWithGoogleWorkspace(
  includeWorkspaceScopes = false
): Promise<{
  user: User;
  accessToken: string | null;
}> {
  try {
    isSigningIn = true;
    const provider = includeWorkspaceScopes
      ? workspaceGoogleProvider
      : googleProvider;
    let result: any = null;
    try {
      result = await signInWithPopup(auth, provider);
    } catch (popupErr: any) {
      const code = String(popupErr?.code || popupErr?.message || '');
      if (code.includes('popup-blocked')) {
        await signInWithRedirect(auth, provider);
        return { user: auth.currentUser!, accessToken: null };
      }
      throw popupErr;
    }
    const credential = GoogleAuthProvider.credentialFromResult(result);
    cachedAccessToken = credential?.accessToken || null;
    const friendCode = generateDeterministicFriendCode(result.user.uid);
    try {
      localStorage.setItem(
        'explic_verified_session',
        JSON.stringify({
          uid: result.user.uid,
          email: result.user.email || 'scholar@google.com',
          displayName: result.user.displayName || 'Google Scholar',
          friendCode,
          verifiedAt: new Date().toISOString(),
        })
      );
    } catch {}
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (err: any) {
    const errMsg = String(err?.code || err?.message || '');
    if (errMsg.includes('unauthorized-domain')) {
      const currentHost =
        typeof window !== 'undefined' ? window.location.hostname : 'explic.online';
      throw new Error(
        `Firebase domain authorization required: "${currentHost}" is not yet in Authorized Domains in Firebase Console. Please go to Firebase Console -> Authentication -> Settings -> Authorized domains -> Add domain -> enter "${currentHost}". Meanwhile, sign in or register with email below!`
      );
    }
    if (errMsg.includes('popup-blocked')) {
      throw new Error(
        'The Google sign-in popup was blocked by your browser. Please allow popups for explic.online and try again.'
      );
    }
    if (
      errMsg.includes('popup-closed-by-user') ||
      errMsg.includes('cancelled-popup-request')
    ) {
      throw new Error('Google Sign-In was closed before completion.');
    }
    throw err;
  } finally {
    isSigningIn = false;
  }
}

export async function signInOrRegisterWithEmail(params: {
  mode: 'login' | 'register';
  email: string;
  password: string;
  displayName?: string;
}): Promise<User> {
  const cleanEmail = params.email.trim().toLowerCase();
  const cleanPassword = params.password;
  const cleanDisplayName = (params.displayName || '').trim();

  if (!cleanEmail || !cleanEmail.includes('@')) {
    throw new Error('Please enter a valid email address.');
  }
  if (!cleanPassword || cleanPassword.length < 6) {
    throw new Error('Password must be at least 6 characters.');
  }

  let firebaseUser: User | null = null;

  try {
    isSigningIn = true;
    if (params.mode === 'register') {
      try {
        const cred = await createUserWithEmailAndPassword(
          auth,
          cleanEmail,
          cleanPassword
        );
        if (cleanDisplayName) {
          await updateProfile(cred.user, { displayName: cleanDisplayName }).catch(() => {});
        }
        try {
          await sendEmailVerification(cred.user);
        } catch {
          // Best-effort verification email
        }
        firebaseUser = cred.user;
      } catch (regErr: any) {
        const code = String(regErr?.code || '');
        if (code === 'auth/email-already-in-use') {
          // If email is already registered, sign in directly with the provided password
          try {
            const loginCred = await signInWithEmailAndPassword(
              auth,
              cleanEmail,
              cleanPassword
            );
            if (cleanDisplayName && !loginCred.user.displayName) {
              await updateProfile(loginCred.user, {
                displayName: cleanDisplayName,
              }).catch(() => {});
            }
            firebaseUser = loginCred.user;
          } catch {
            throw new Error(
              'This email is already registered with a different password. Please check your password.'
            );
          }
        } else {
          throw regErr;
        }
      }
    } else {
      // mode === 'login'
      try {
        const cred = await signInWithEmailAndPassword(
          auth,
          cleanEmail,
          cleanPassword
        );
        firebaseUser = cred.user;
      } catch (loginErr: any) {
        const code = String(loginErr?.code || '');
        if (
          code === 'auth/user-not-found' ||
          code === 'auth/invalid-credential'
        ) {
          // If user doesn't exist yet on explic-718f0, auto-register seamlessly!
          try {
            const newCred = await createUserWithEmailAndPassword(
              auth,
              cleanEmail,
              cleanPassword
            );
            const resolvedName = cleanDisplayName || cleanEmail.split('@')[0];
            await updateProfile(newCred.user, { displayName: resolvedName }).catch(() => {});
            try {
              await sendEmailVerification(newCred.user);
            } catch {}
            firebaseUser = newCred.user;
          } catch (createErr: any) {
            const createCode = String(createErr?.code || '');
            if (createCode === 'auth/email-already-in-use') {
              throw new Error('Incorrect password for this email account.');
            } else {
              throw loginErr;
            }
          }
        } else {
          throw loginErr;
        }
      }
    }
  } catch (err: any) {
    if (err instanceof Error && !err.message.includes('Firebase:')) {
      throw err;
    }
    const code = String(err?.code || err?.message || '');
    if (
      code.includes('auth/wrong-password') ||
      code.includes('auth/invalid-credential')
    ) {
      throw new Error(
        'Incorrect password for this email account. Please check your credentials.'
      );
    }
    if (code.includes('auth/invalid-email')) {
      throw new Error('Please enter a valid email address.');
    }
    if (code.includes('auth/weak-password')) {
      throw new Error('Password must be at least 6 characters.');
    }
    if (code.includes('auth/too-many-requests')) {
      throw new Error(
        'Too many failed attempts. Please wait a moment and try again.'
      );
    }
    throw new Error(err?.message || 'Authentication failed.');
  } finally {
    isSigningIn = false;
  }

  // Sync or authenticate with resilient backend endpoint (/api/auth/email)
  let serverUser: {
    uid: string;
    email: string;
    displayName: string;
    friendCode: string;
  } | null = null;

  try {
    const res = await fetch('/api/auth/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: params.mode,
        email: cleanEmail,
        password: cleanPassword,
        displayName:
          cleanDisplayName || firebaseUser?.displayName || '',
        uid: firebaseUser?.uid || '',
      }),
    });
    const data = await res.json();
    if (!res.ok && !firebaseUser) {
      throw new Error(data?.error || 'Authentication failed.');
    }
    if (data?.user) {
      serverUser = data.user;
    }
  } catch (apiErr: any) {
    if (
      !firebaseUser &&
      apiErr instanceof Error &&
      apiErr.message.includes('Incorrect password')
    ) {
      throw apiErr;
    }
  }

  // Also check/update local browser account registry for offline resilience
  let localAccountName = '';
  try {
    const rawRegistry = localStorage.getItem('explic_accounts_registry');
    const registry: Record<
      string,
      { uid: string; email: string; displayName: string; password: string }
    > = rawRegistry ? JSON.parse(rawRegistry) : {};
    const existingLocal = registry[cleanEmail];

    if (
      params.mode === 'login' &&
      existingLocal &&
      !firebaseUser &&
      !serverUser &&
      existingLocal.password !== cleanPassword
    ) {
      throw new Error('Incorrect password for this email account.');
    }

    localAccountName = existingLocal?.displayName || '';
    const resolvedUidForRegistry =
      firebaseUser?.uid ||
      serverUser?.uid ||
      existingLocal?.uid ||
      `user-${generateDeterministicFriendCode(cleanEmail)}`;
    const resolvedNameForRegistry =
      cleanDisplayName ||
      firebaseUser?.displayName ||
      serverUser?.displayName ||
      localAccountName ||
      cleanEmail.split('@')[0];

    registry[cleanEmail] = {
      uid: resolvedUidForRegistry,
      email: cleanEmail,
      displayName: resolvedNameForRegistry,
      password: cleanPassword,
    };
    localStorage.setItem('explic_accounts_registry', JSON.stringify(registry));
  } catch (localErr) {
    if (
      localErr instanceof Error &&
      localErr.message.includes('Incorrect password')
    ) {
      throw localErr;
    }
  }

  const finalUid =
    firebaseUser?.uid ||
    serverUser?.uid ||
    `user-${generateDeterministicFriendCode(cleanEmail)}`;
  const finalDisplayName =
    cleanDisplayName ||
    firebaseUser?.displayName ||
    serverUser?.displayName ||
    localAccountName ||
    cleanEmail.split('@')[0];
  const finalFriendCode =
    serverUser?.friendCode || generateDeterministicFriendCode(finalUid);

  try {
    localStorage.setItem(
      'explic_verified_session',
      JSON.stringify({
        uid: finalUid,
        email: cleanEmail,
        displayName: finalDisplayName,
        friendCode: finalFriendCode,
        verifiedAt: new Date().toISOString(),
      })
    );
  } catch {}

  if (firebaseUser) {
    // Ensure displayName is reflected on the returned user object
    if (!firebaseUser.displayName && finalDisplayName) {
      try {
        Object.defineProperty(firebaseUser, 'displayName', {
          value: finalDisplayName,
          configurable: true,
        });
      } catch {}
    }
    return firebaseUser;
  }

  return {
    uid: finalUid,
    email: cleanEmail,
    displayName: finalDisplayName,
    emailVerified: true,
    isAnonymous: false,
  } as unknown as User;
}

export async function signOutUser(): Promise<void> {
  cachedAccessToken = null;
  try {
    localStorage.removeItem('explic_verified_session');
  } catch {}
  try {
    await auth.signOut();
  } catch {}
}

/**
 * Syncs student public profile to /profiles/{uid}
 */
export async function syncStudentPublicProfile(
  profile: UserProfileState
): Promise<void> {
  if (!profile.isGuest && profile.uid) {
    try {
      const existingRaw = localStorage.getItem('explic_verified_session');
      if (existingRaw) {
        const parsed = JSON.parse(existingRaw);
        localStorage.setItem(
          'explic_verified_session',
          JSON.stringify({
            ...parsed,
            uid: profile.uid,
            displayName: profile.displayName || parsed.displayName || 'Scholar',
            email: profile.email || parsed.email || '',
            friendCode: profile.friendCode || parsed.friendCode,
          })
        );
      }
    } catch {}
  }

  if (
    profile.isGuest ||
    isGuestUid(profile.uid) ||
    !auth.currentUser ||
    auth.currentUser.uid !== profile.uid
  ) {
    return;
  }

  const path = `profiles/${profile.uid}`;
  const docRef = doc(db, 'profiles', profile.uid);
  const payload = cleanForFirestore({
    uid: profile.uid.slice(0, 128),
    displayName: (profile.displayName || 'Scholar').slice(0, 80),
    username: (profile.username || 'scholar').replace(/^@/, '').slice(0, 40),
    friendCode:
      profile.friendCode && /^[0-9]{5}$/.test(profile.friendCode)
        ? profile.friendCode
        : generateDeterministicFriendCode(profile.uid),
    gradeYear: (profile.gradeYear || '').slice(0, 40),
    targetSession: (profile.targetSession || '').slice(0, 40),
    xp: Math.max(0, Math.floor(profile.xp || 0)),
    level: Math.max(1, Math.floor(profile.level || 1)),
    streak: Math.max(0, Math.floor(profile.streak || 0)),
    weeklyFocusMinutes: Math.max(
      0,
      Object.values(profile.weeklyFocusLog || {}).reduce((a, b) => a + b, 0)
    ),
    status: profile.status || 'Online',
    updatedAt: serverTimestamp(),
  });

  try {
    await setDoc(docRef, payload, { merge: true });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes('Missing or insufficient permissions')
    ) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  }
}

/**
 * Loads student workspace state from Firestore /workspaces/{uid} & /profiles/{uid},
 * falling back to /api/user/workspace and localStorage so all user data is restored on login.
 */
export async function loadStudentWorkspace(
  uid: string,
  email?: string
): Promise<{
  profile?: Partial<UserProfileState>;
  tasks?: StudyTask[];
  exams?: any[];
  habits?: any[];
  friends?: StudentFriend[];
  rooms?: StudyRoom[];
  studyTools?: any[];
} | null> {
  const cleanUid = (uid || '').trim();
  const cleanEmail = (email || '').trim().toLowerCase();

  // 1. Try Firestore if signed in with Firebase Auth
  if (
    cleanUid &&
    !isGuestUid(cleanUid) &&
    auth.currentUser &&
    auth.currentUser.uid === cleanUid
  ) {
    try {
      const [wsSnap, profSnap] = await Promise.all([
        getDoc(doc(db, 'workspaces', cleanUid)).catch(() => null),
        getDoc(doc(db, 'profiles', cleanUid)).catch(() => null),
      ]);

      let firestoreBundle: any = null;
      if (wsSnap && wsSnap.exists()) {
        const data = wsSnap.data();
        if (data?.payloadJson) {
          firestoreBundle = JSON.parse(data.payloadJson);
        }
      }

      if (profSnap && profSnap.exists()) {
        const pData = profSnap.data();
        firestoreBundle = firestoreBundle || {};
        firestoreBundle.profile = {
          ...(firestoreBundle.profile || {}),
          uid: cleanUid,
          displayName:
            pData.displayName || firestoreBundle.profile?.displayName,
          username: pData.username || firestoreBundle.profile?.username,
          friendCode: pData.friendCode || firestoreBundle.profile?.friendCode,
          xp: typeof pData.xp === 'number' ? pData.xp : firestoreBundle.profile?.xp,
          level:
            typeof pData.level === 'number'
              ? pData.level
              : firestoreBundle.profile?.level,
          streak:
            typeof pData.streak === 'number'
              ? pData.streak
              : firestoreBundle.profile?.streak,
        };
      }

      if (firestoreBundle) {
        return firestoreBundle;
      }
    } catch {
      // Fall through to server / localStorage backup
    }
  }

  // 2. Try Server Workspace Endpoint (/api/user/workspace)
  try {
    const queryParams = new URLSearchParams();
    if (cleanUid) queryParams.set('uid', cleanUid);
    if (cleanEmail) queryParams.set('email', cleanEmail);
    const res = await fetch(`/api/user/workspace?${queryParams.toString()}`);
    if (res.ok) {
      const data = await res.json();
      if (data?.record?.payload && typeof data.record.payload === 'object') {
        return data.record.payload;
      }
    }
  } catch {
    // Fall through to localStorage
  }

  // 3. Try localStorage by UID or Email
  try {
    if (cleanUid) {
      const rawByUid = localStorage.getItem(`engez_workspace_${cleanUid}`);
      if (rawByUid) {
        const parsed = JSON.parse(rawByUid);
        if (parsed && typeof parsed === 'object') return parsed;
      }
    }
    if (cleanEmail) {
      const rawByEmail = localStorage.getItem(
        `engez_workspace_email_${cleanEmail}`
      );
      if (rawByEmail) {
        const parsed = JSON.parse(rawByEmail);
        if (parsed && typeof parsed === 'object') return parsed;
      }
    }
  } catch {
    // Ignore parse errors
  }

  return null;
}

/**
 * Saves student workspace state across localStorage, /api/user/workspace, and Firestore /workspaces/{uid}
 */
export async function persistResilientWorkspace(
  uid: string,
  workspaceData: unknown
): Promise<void> {
  const serialized = JSON.stringify(workspaceData);
  const cleanEmail = String(
    (workspaceData as any)?.profile?.email || ''
  )
    .trim()
    .toLowerCase();

  try {
    localStorage.setItem(`engez_workspace_${uid}`, serialized);
    if (cleanEmail && cleanEmail.includes('@')) {
      localStorage.setItem(`engez_workspace_email_${cleanEmail}`, serialized);
    }
  } catch {
    // Ignore storage quota issues
  }

  try {
    await fetch('/api/user/workspace', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        uid,
        email: cleanEmail,
        payload: workspaceData,
      }),
    });
  } catch {
    // Offline fallback
  }

  if (
    isGuestUid(uid) ||
    !auth.currentUser ||
    auth.currentUser.uid !== uid
  ) {
    return;
  }

  const path = `workspaces/${uid}`;
  try {
    await setDoc(
      doc(db, 'workspaces', uid),
      cleanForFirestore({
        ownerId: uid,
        payloadJson: serialized.slice(0, 490000),
        updatedAt: serverTimestamp(),
      })
    );
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes('Missing or insufficient permissions')
    ) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  }
}

/**
 * Searches student profiles by 5-digit friendCode or username, strictly filtering out test subjects
 */
export async function findStudentByCodeOrUsername(
  searchQuery: string
): Promise<StudentFriend[]> {
  const cleaned = searchQuery.trim().replace(/^@/, '');
  if (!cleaned || !auth.currentUser) return [];

  const results: StudentFriend[] = [];
  const path = 'profiles';

  try {
    if (/^[0-9]{5}$/.test(cleaned)) {
      const q = query(
        collection(db, 'profiles'),
        where('friendCode', '==', cleaned)
      );
      const snap = await getDocs(q);
      snap.forEach((docSnap) => {
        const d = docSnap.data();
        if (!isTestSubject(d.displayName) && !isTestSubject(d.username)) {
          results.push({
            uid: d.uid,
            displayName: d.displayName,
            username: d.username,
            friendCode: d.friendCode,
            status: d.status || 'Online',
            weeklyFocusMinutes: d.weeklyFocusMinutes || 0,
            streak: d.streak || 1,
            level: d.level || 1,
            xp: d.xp || 0,
            gradeYear: d.gradeYear,
          });
        }
      });
    }
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes('Missing or insufficient permissions')
    ) {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  }
  return results;
}

/**
 * Real-time subscription to incoming friend requests
 */
export function subscribeToRealFriendRequests(
  uid: string,
  onRequestsUpdate: (requests: FriendRequestItem[]) => void
): Unsubscribe {
  if (isGuestUid(uid) || !auth.currentUser || auth.currentUser.uid !== uid) {
    onRequestsUpdate([]);
    return () => {};
  }

  const path = 'friendRequests';
  const q = query(collection(db, path), where('toUid', '==', uid));
  return onSnapshot(
    q,
    (snapshot) => {
      const items: FriendRequestItem[] = [];
      snapshot.forEach((docSnap) => {
        const d = docSnap.data();
        if (d.status === 'pending' && !isTestSubject(d.fromName)) {
          items.push({
            id: docSnap.id,
            fromUid: d.fromUid,
            fromName: d.fromName,
            fromCode: d.fromCode,
            toUid: d.toUid,
            toCode: d.toCode,
            status: d.status,
            createdAt:
              d.createdAt?.toDate?.()?.toISOString?.() ||
              new Date().toISOString(),
          });
        }
      });
      onRequestsUpdate(items);
    },
    (error) => {
      onRequestsUpdate([]);
      if (
        auth.currentUser &&
        auth.currentUser.uid === uid &&
        auth.currentUser.emailVerified &&
        error instanceof Error &&
        error.message.includes('Missing or insufficient permissions')
      ) {
        console.warn('Friend requests listener permission warning:', error.message);
      }
    }
  );
}

/**
 * Fetch active courses, coursework, and submission states from Google Classroom REST API
 */
export async function fetchGoogleClassroomCoursework(
  accessToken: string
): Promise<StudyTask[]> {
  const coursesRes = await fetch(
    'https://classroom.googleapis.com/v1/courses?courseStates=ACTIVE',
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  if (!coursesRes.ok) {
    throw new Error('Failed to fetch Google Classroom courses.');
  }
  const coursesData = await coursesRes.json();
  const courses: any[] = coursesData.courses || [];

  const tasks: StudyTask[] = [];

  await Promise.all(
    courses.slice(0, 6).map(async (course) => {
      try {
        const cwRes = await fetch(
          `https://classroom.googleapis.com/v1/courses/${course.id}/courseWork?pageSize=10`,
          {
            headers: { Authorization: `Bearer ${accessToken}` },
          }
        );
        if (!cwRes.ok) return;
        const cwData = await cwRes.json();
        const courseWorkList: any[] = cwData.courseWork || [];

        for (const work of courseWorkList) {
          let submissionState: 'TURNED_IN' | 'RETURNED' | 'NEW' = 'NEW';
          try {
            const subRes = await fetch(
              `https://classroom.googleapis.com/v1/courses/${course.id}/courseWork/${work.id}/studentSubmissions?userId=me`,
              {
                headers: { Authorization: `Bearer ${accessToken}` },
              }
            );
            if (subRes.ok) {
              const subData = await subRes.json();
              const rawState = subData.studentSubmissions?.[0]?.state;
              if (rawState === 'TURNED_IN' || rawState === 'RETURNED') {
                submissionState = rawState;
              }
            }
          } catch {
            // Keep default NEW state
          }

          let dueDate = new Date(Date.now() + 3 * 86400000)
            .toISOString()
            .slice(0, 10);
          if (work.dueDate) {
            const y = work.dueDate.year || 2026;
            const m = String(work.dueDate.month || 10).padStart(2, '0');
            const d = String(work.dueDate.day || 28).padStart(2, '0');
            dueDate = `${y}-${m}-${d}`;
          }

          tasks.push({
            id: `gc-${course.id}-${work.id}`,
            title: work.title || 'Classroom Assignment',
            subject: course.name || 'Google Classroom',
            dueDate,
            dueTime: '23:59',
            priority: submissionState === 'NEW' ? 'High' : 'Medium',
            estimatedMinutes: 45,
            completed:
              submissionState === 'TURNED_IN' || submissionState === 'RETURNED',
            source: 'classroom',
            courseName: course.name,
            submissionState,
            alternateLink: work.alternateLink,
          });
        }
      } catch {
        // Skip individual course error
      }
    })
  );

  return tasks;
}

/**
 * Exports a study task or revision block to the user's primary Google Calendar
 * (Requires explicit user confirmation in the UI before calling, per Workspace skill)
 */
export async function exportTaskToGoogleCalendar(
  accessToken: string,
  task: StudyTask
): Promise<{ htmlLink?: string }> {
  const startIso = `${task.dueDate}T${task.dueTime || '16:00'}:00`;
  const startDate = new Date(startIso);
  const validStart = isNaN(startDate.getTime())
    ? new Date(Date.now() + 3600000)
    : startDate;
  const endDate = new Date(
    validStart.getTime() + (task.estimatedMinutes || 45) * 60000
  );

  const res = await fetch(
    'https://www.googleapis.com/calendar/v3/calendars/primary/events',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        summary: `[Explic] ${task.subject}: ${task.title}`,
        description: `Academic Study Block (${task.priority} Priority) — Duration: ${task.estimatedMinutes} mins.`,
        start: { dateTime: validStart.toISOString() },
        end: { dateTime: endDate.toISOString() },
      }),
    }
  );

  if (!res.ok) {
    throw new Error('Failed to create Google Calendar event.');
  }
  return await res.json();
}
