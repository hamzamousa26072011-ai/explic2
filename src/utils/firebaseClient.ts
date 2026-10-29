import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
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
  getDocFromServer,
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

// Initialize Firestore with ignoreUndefinedProperties: true per specification
export const db = initializeFirestore(
  app,
  { ignoreUndefinedProperties: true },
  firebaseConfig.firestoreDatabaseId
);

export const auth = getAuth(app);

const googleProvider = new GoogleAuthProvider();
for (const scope of SCOPES) {
  googleProvider.addScope(scope);
}

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

// Connection verification when authenticated
async function testConnection() {
  if (!auth.currentUser) return;
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    // Handled gracefully
  }
}
testConnection();

export function getAccessToken(): string | null {
  return cachedAccessToken;
}

export function initAuth(
  onUserChange: (user: User | null, accessToken: string | null) => void
): Unsubscribe {
  return onAuthStateChanged(auth, (user) => {
    if (!user && !isSigningIn) {
      cachedAccessToken = null;
    }
    onUserChange(user, cachedAccessToken);
  });
}

export async function signInWithGoogleWorkspace(): Promise<{
  user: User;
  accessToken: string | null;
}> {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, googleProvider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    cachedAccessToken = credential?.accessToken || null;
    return { user: result.user, accessToken: cachedAccessToken };
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
  if (params.mode === 'register') {
    const cred = await createUserWithEmailAndPassword(
      auth,
      params.email,
      params.password
    );
    if (params.displayName) {
      await updateProfile(cred.user, { displayName: params.displayName });
    }
    try {
      await sendEmailVerification(cred.user);
    } catch {
      // Verification email sent best-effort
    }
    return cred.user;
  } else {
    const cred = await signInWithEmailAndPassword(
      auth,
      params.email,
      params.password
    );
    return cred.user;
  }
}

export async function signOutUser(): Promise<void> {
  cachedAccessToken = null;
  await auth.signOut();
}

/**
 * Syncs student public profile to /profiles/{uid} with strict isGuestUid guard
 */
export async function syncStudentPublicProfile(
  profile: UserProfileState
): Promise<void> {
  if (
    profile.isGuest ||
    isGuestUid(profile.uid) ||
    !auth.currentUser ||
    !auth.currentUser.emailVerified
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
    gradeYear: (profile.gradeYear || 'IGCSE Year 11').slice(0, 40),
    targetSession: (profile.targetSession || 'May/June 2026').slice(0, 40),
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
 * Saves student workspace state across localStorage, /api/user/workspace, and Firestore /workspaces/{uid}
 */
export async function persistResilientWorkspace(
  uid: string,
  workspaceData: unknown
): Promise<void> {
  const serialized = JSON.stringify(workspaceData);
  try {
    localStorage.setItem(`engez_workspace_${uid}`, serialized);
  } catch {
    // Ignore storage quota issues
  }

  try {
    await fetch('/api/user/workspace', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid, payload: workspaceData }),
    });
  } catch {
    // Offline fallback
  }

  if (
    isGuestUid(uid) ||
    !auth.currentUser ||
    auth.currentUser.uid !== uid ||
    !auth.currentUser.emailVerified
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
  if (isGuestUid(uid) || !auth.currentUser || !auth.currentUser.emailVerified) {
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
      if (
        error instanceof Error &&
        error.message.includes('Missing or insufficient permissions')
      ) {
        handleFirestoreError(error, OperationType.LIST, path);
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
