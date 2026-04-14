import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { getFirestore, doc, getDoc, setDoc, collection, query, getDocs, deleteDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const dbFirestore = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const googleProvider = new GoogleAuthProvider();

export const loginWithGoogle = () => signInWithPopup(auth, googleProvider);
export const logout = () => signOut(auth);

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string | null;
  photoURL: string | null;
  role: 'admin' | 'user';
  createdAt?: any;
}

export const getUserProfile = async (uid: string): Promise<UserProfile | null> => {
  const userDoc = await getDoc(doc(dbFirestore, 'users', uid));
  return userDoc.exists() ? (userDoc.data() as UserProfile) : null;
};

export const createUserProfile = async (user: FirebaseUser): Promise<UserProfile> => {
  const existing = await getUserProfile(user.uid);
  if (existing) return existing;

  const isAdmin = user.email === 'yander.marrero040488@gmail.com';
  const profile: UserProfile = {
    uid: user.uid,
    email: user.email || '',
    displayName: user.displayName,
    photoURL: user.photoURL,
    role: isAdmin ? 'admin' : 'user',
    createdAt: serverTimestamp(),
  };

  await setDoc(doc(dbFirestore, 'users', user.uid), profile);
  return profile;
};

export const getAllUsers = async (): Promise<UserProfile[]> => {
  const q = query(collection(dbFirestore, 'users'));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => doc.data() as UserProfile);
};

export const updateUserRole = async (uid: string, role: 'admin' | 'user') => {
  await updateDoc(doc(dbFirestore, 'users', uid), { role });
};

export const deleteUser = async (uid: string) => {
  await deleteDoc(doc(dbFirestore, 'users', uid));
};
