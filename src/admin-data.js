import {
  collection,
  collectionGroup,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  setDoc,
} from 'firebase/firestore'
import { db, ensureAdminSession } from './firebase'

const ACTIVE_WINDOW_MS = 2 * 60 * 1000
const RECENT_WINDOW_MS = 24 * 60 * 60 * 1000
const ADMIN_API_BASE = 'https://school-reminder-backend.vercel.app/api'

function numberOrNull(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function safeText(value, max = 120) {
  return String(value ?? '').trim().slice(0, max)
}

function classNumberFromId(classId) {
  const match = /^class-(\d{1,2})$/.exec(String(classId || ''))
  return match ? Number(match[1]) : null
}

function pathClassId(snapshot) {
  const segments = snapshot.ref.path.split('/')
  const classIndex = segments.indexOf('classes')
  return classIndex >= 0 ? segments[classIndex + 1] || '' : ''
}

export function normalizeUser(snapshot, control = null) {
  const value = snapshot.data() || {}
  const classNumber = numberOrNull(value.classNumber) ?? classNumberFromId(value.classId)
  return {
    uid: snapshot.id,
    name: safeText(value.name, 30) || '이름 없음',
    grade: numberOrNull(value.grade),
    classId: safeText(value.classId, 40),
    classNumber,
    studentNumber: numberOrNull(value.studentNumber),
    studentKey: safeText(value.studentKey, 100),
    createdAt: numberOrNull(value.createdAt) || 0,
    updatedAt: numberOrNull(value.updatedAt) || 0,
    lastSeenAt: numberOrNull(value.lastSeenAt) || 0,
    lastSyncAt: numberOrNull(value.lastSyncAt) || 0,
    appVersion: safeText(value.appVersion, 40),
    platform: safeText(value.platform, 80),
    browser: safeText(value.browser, 80),
    displayMode: safeText(value.displayMode, 30),
    userAgent: safeText(value.userAgent, 350),
    status: safeText(control?.status, 30) || 'active',
    disabledAt: numberOrNull(control?.disabledAt) || 0,
    disabledBy: safeText(control?.disabledBy, 100),
    deletedAt: numberOrNull(control?.deletedAt) || 0,
  }
}

export async function loadAdminIdentity() {
  const user = await ensureAdminSession()
  const snapshot = await getDoc(doc(db, 'admins', user.uid))
  if (!snapshot.exists()) return { user, admin: null }
  const value = snapshot.data() || {}
  if (value.active !== true) return { user, admin: null }
  return {
    user,
    admin: {
      uid: user.uid,
      role: value.role === 'super_admin' ? 'super_admin' : 'admin',
      label: safeText(value.label, 60) || 'S-Hub 관리자',
    },
  }
}

export async function bootstrapAdmin(secret) {
  const user = await ensureAdminSession()
  const token = await user.getIdToken(true)
  const response = await fetch(`${ADMIN_API_BASE}/admin-bootstrap`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ secret: String(secret || '') }),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.message || '관리자 등록에 실패했어.')
  return payload
}

async function readCollectionSafely(reference) {
  try {
    return await getDocs(reference)
  } catch (error) {
    if (error?.code === 'permission-denied') throw error
    console.warn('Admin collection read failed:', error)
    return { docs: [] }
  }
}

export async function loadOverviewData() {
  await ensureAdminSession()

  const [usersSnapshot, controlsSnapshot, remindersSnapshot, academicsSnapshot, activitySnapshot, presenceSnapshot, pushesSnapshot] = await Promise.all([
    getDocs(collection(db, 'users')),
    readCollectionSafely(collection(db, 'accountControls')),
    readCollectionSafely(collectionGroup(db, 'todos')),
    readCollectionSafely(collectionGroup(db, 'academicEvents')),
    readCollectionSafely(query(collectionGroup(db, 'activity'), orderBy('updatedAt', 'desc'), limit(250))),
    readCollectionSafely(collectionGroup(db, 'presence')),
    readCollectionSafely(collectionGroup(db, 'pushSubscriptions')),
  ])

  const controls = new Map(controlsSnapshot.docs.map((item) => [item.id, item.data() || {}]))
  const users = usersSnapshot.docs.map((item) => normalizeUser(item, controls.get(item.id))).sort((a, b) => {
    return (a.grade ?? 99) - (b.grade ?? 99)
      || (a.classNumber ?? 99) - (b.classNumber ?? 99)
      || (a.studentNumber ?? 99) - (b.studentNumber ?? 99)
      || a.name.localeCompare(b.name, 'ko')
  })

  const now = Date.now()
  const presenceByStudent = new Map()
  for (const item of presenceSnapshot.docs) {
    const value = item.data() || {}
    const studentKey = safeText(value.studentKey, 100)
    if (!studentKey) continue
    const lastSeenMs = numberOrNull(value.lastSeenMs) || 0
    if (lastSeenMs > (presenceByStudent.get(studentKey) || 0)) presenceByStudent.set(studentKey, lastSeenMs)
  }

  const pushCountByStudent = new Map()
  for (const item of pushesSnapshot.docs) {
    const value = item.data() || {}
    const studentKey = safeText(value.studentKey, 100)
    if (!studentKey) continue
    pushCountByStudent.set(studentKey, (pushCountByStudent.get(studentKey) || 0) + 1)
  }

  const remindersByClass = new Map()
  for (const item of remindersSnapshot.docs) {
    const classId = pathClassId(item)
    if (classId) remindersByClass.set(classId, (remindersByClass.get(classId) || 0) + 1)
  }

  const academicsByClass = new Map()
  for (const item of academicsSnapshot.docs) {
    const classId = pathClassId(item)
    if (classId) academicsByClass.set(classId, (academicsByClass.get(classId) || 0) + 1)
  }

  const activity = activitySnapshot.docs.map((item) => ({
    id: item.id,
    classId: pathClassId(item),
    ...(item.data() || {}),
  }))

  const enrichedUsers = users.map((user) => {
    const presence = presenceByStudent.get(user.studentKey) || user.lastSeenAt || 0
    return {
      ...user,
      effectiveLastSeenAt: Math.max(presence, user.lastSeenAt || 0),
      online: presence >= now - ACTIVE_WINDOW_MS,
      activeToday: Math.max(presence, user.lastSeenAt || 0) >= now - RECENT_WINDOW_MS,
      pushDevices: pushCountByStudent.get(user.studentKey) || 0,
    }
  })

  const classesMap = new Map()
  for (const user of enrichedUsers) {
    const key = user.classId || `class-${user.classNumber ?? 'unknown'}`
    if (!classesMap.has(key)) {
      classesMap.set(key, {
        classId: key,
        grade: user.grade,
        classNumber: user.classNumber,
        students: 0,
        online: 0,
        activeToday: 0,
        disabled: 0,
        reminders: remindersByClass.get(key) || 0,
        academics: academicsByClass.get(key) || 0,
      })
    }
    const row = classesMap.get(key)
    row.students += 1
    if (user.online) row.online += 1
    if (user.activeToday) row.activeToday += 1
    if (user.status !== 'active') row.disabled += 1
  }

  const classes = [...classesMap.values()].sort((a, b) => {
    return (a.grade ?? 99) - (b.grade ?? 99) || (a.classNumber ?? 99) - (b.classNumber ?? 99)
  })

  return {
    users: enrichedUsers,
    classes,
    activity,
    metrics: {
      total: enrichedUsers.length,
      online: enrichedUsers.filter((user) => user.online).length,
      activeToday: enrichedUsers.filter((user) => user.activeToday).length,
      disabled: enrichedUsers.filter((user) => user.status !== 'active').length,
      missingStudentNumber: enrichedUsers.filter((user) => !Number.isInteger(user.studentNumber)).length,
      missingGrade: enrichedUsers.filter((user) => !Number.isInteger(user.grade)).length,
    },
  }
}

export async function loadStudentDetails(user) {
  if (!user?.studentKey) return { todoState: [], pushSubscriptions: [] }
  const [todoState, pushSubscriptions] = await Promise.all([
    readCollectionSafely(collection(db, 'students', user.studentKey, 'todoState')),
    readCollectionSafely(collection(db, 'students', user.studentKey, 'pushSubscriptions')),
  ])
  return {
    todoState: todoState.docs.map((item) => ({ id: item.id, ...(item.data() || {}) })),
    pushSubscriptions: pushSubscriptions.docs.map((item) => ({ id: item.id, ...(item.data() || {}) })),
  }
}

export async function setStudentAccountStatus(user, status, reason = '') {
  if (!user?.uid) throw new Error('학생 UID가 없어.')
  if (!['active', 'disabled'].includes(status)) throw new Error('지원하지 않는 계정 상태야.')
  const adminUser = await ensureAdminSession()
  await setDoc(doc(db, 'accountControls', user.uid), {
    status,
    reason: safeText(reason, 240),
    disabledAt: status === 'disabled' ? Date.now() : 0,
    disabledBy: adminUser.uid,
    updatedAt: Date.now(),
  }, { merge: true })
  await setDoc(doc(db, 'adminAudit', `${Date.now()}-${adminUser.uid.slice(0, 8)}`), {
    action: status === 'disabled' ? 'student_disabled' : 'student_restored',
    actorUid: adminUser.uid,
    targetUid: user.uid,
    targetStudentKey: user.studentKey || '',
    targetName: user.name || '',
    reason: safeText(reason, 240),
    createdAt: Date.now(),
  })
}

export async function permanentlyDeleteStudent(user, reason = '') {
  if (!user?.uid) throw new Error('학생 UID가 없어.')
  const adminUser = await ensureAdminSession()
  const token = await adminUser.getIdToken(true)
  const response = await fetch(`${ADMIN_API_BASE}/admin-student`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      action: 'delete',
      targetUid: user.uid,
      reason: safeText(reason, 240),
    }),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.message || '학생 삭제에 실패했어.')
  return payload
}
