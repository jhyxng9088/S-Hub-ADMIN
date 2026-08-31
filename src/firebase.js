import { initializeApp } from 'firebase/app'
import { browserLocalPersistence, getAuth, setPersistence, signInAnonymously } from 'firebase/auth'
import { getDatabase } from 'firebase/database'
import { getFirestore } from 'firebase/firestore'

const DATABASE_URL = 'https://school-adeda-default-rtdb.asia-southeast1.firebasedatabase.app/'

const firebaseConfig = {
  apiKey: 'AIzaSyD4F5hQItDGTGItXJ2vnuu7ExM1LBLn9E0',
  authDomain: 'school-adeda.firebaseapp.com',
  projectId: 'school-adeda',
  storageBucket: 'school-adeda.firebasestorage.app',
  messagingSenderId: '321702677113',
  appId: '1:321702677113:web:390c5d63e3d93ec17f22a8',
  measurementId: 'G-PFCP63TWQS',
  databaseURL: DATABASE_URL,
}

export const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)
export const db = getFirestore(app)
export const realtimeDb = getDatabase(app, DATABASE_URL)

let sessionPromise = null
export async function ensureAdminSession() {
  if (auth.currentUser) return auth.currentUser
  if (!sessionPromise) {
    sessionPromise = (async () => {
      try { await setPersistence(auth, browserLocalPersistence) } catch {}
      const credential = await signInAnonymously(auth)
      return credential.user
    })().catch((error) => {
      sessionPromise = null
      throw error
    })
  }
  return sessionPromise
}
