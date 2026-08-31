import { onValue, ref } from 'firebase/database'
import { realtimeDb } from './firebase'

function classIdsFromOverview(data) {
  return [...new Set((data?.classes || []).map((row) => String(row?.classId || '')).filter(Boolean))]
}

export function mergeRealtimePresence(data, presenceByClass) {
  if (!data || typeof data !== 'object') return data
  const now = Date.now()
  const users = (data.users || []).map((user) => {
    const classPresence = presenceByClass?.[user.classId] || {}
    const uids = Array.isArray(user.uids) && user.uids.length ? user.uids : [user.uid]
    let online = false
    let connectedAt = 0
    uids.filter(Boolean).forEach((uid) => {
      const entry = classPresence?.[uid]
      if (!entry || typeof entry !== 'object') return
      online = true
      connectedAt = Math.max(connectedAt, Number(entry.connectedAt || 0))
    })
    return {
      ...user,
      online,
      effectiveLastSeenAt: online ? Math.max(Number(user.effectiveLastSeenAt || 0), connectedAt || now) : user.effectiveLastSeenAt,
    }
  })

  const onlineByClass = new Map()
  users.forEach((user) => {
    if (!user.online || !user.classId) return
    onlineByClass.set(user.classId, (onlineByClass.get(user.classId) || 0) + 1)
  })
  const classes = (data.classes || []).map((row) => ({
    ...row,
    online: onlineByClass.get(row.classId) || 0,
  }))

  return {
    ...data,
    users,
    classes,
    metrics: {
      ...(data.metrics || {}),
      online: users.filter((user) => user.online).length,
      presenceTransport: 'rtdb',
    },
  }
}

export function subscribeAdminPresence(data, onChange, onError = () => {}) {
  const classIds = classIdsFromOverview(data)
  if (!classIds.length) return () => {}

  const state = {}
  let stopped = false
  const emit = () => {
    if (!stopped) onChange({ ...state })
  }
  const unsubscribers = classIds.map((classId) => onValue(
    ref(realtimeDb, `presence/${classId}`),
    (snapshot) => {
      state[classId] = snapshot.val() || {}
      emit()
    },
    (error) => {
      onError(error)
    },
  ))

  return () => {
    stopped = true
    unsubscribers.forEach((unsubscribe) => unsubscribe())
  }
}
