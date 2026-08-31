import { ensureAdminSession } from './firebase'

const ADMIN_API_BASE = 'https://school-reminder-backend.vercel.app/api'
const REQUEST_TIMEOUT_MS = 12_000
const OVERVIEW_CACHE_KEY = 'shub.admin.overview.v2'
const OVERVIEW_CACHE_TTL_MS = 15 * 60 * 1000
let overviewPending = null

function readOverviewCache() {
  try {
    const stored = JSON.parse(localStorage.getItem(OVERVIEW_CACHE_KEY) || 'null')
    if (!stored || typeof stored !== 'object') return null
    if (!stored.data || typeof stored.data !== 'object') return null
    const cachedAt = Number(stored.cachedAt || 0)
    if (!cachedAt || Date.now() - cachedAt > OVERVIEW_CACHE_TTL_MS) return null
    return stored.data
  } catch {
    return null
  }
}

function writeOverviewCache(data) {
  try {
    localStorage.setItem(OVERVIEW_CACHE_KEY, JSON.stringify({ cachedAt: Date.now(), data }))
  } catch {
    // The API response remains authoritative if local storage is unavailable.
  }
}

export function clearOverviewCache() {
  try { localStorage.removeItem(OVERVIEW_CACHE_KEY) } catch {}
}

async function callAdminApi(path, body) {
  const user = await ensureAdminSession()
  const token = await user.getIdToken()
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const response = await fetch(`${ADMIN_API_BASE}/${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body || {}),
      cache: 'no-store',
      signal: controller.signal,
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) {
      const error = new Error(payload.message || '관리자 서버 요청에 실패했어.')
      error.status = response.status
      throw error
    }
    return { user, payload }
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('관리자 서버 응답이 늦어. 잠시 후 새로고침해 줘.')
    throw error
  } finally {
    window.clearTimeout(timeout)
  }
}

export async function loadAdminIdentity() {
  const { user, payload } = await callAdminApi('admin-console', { action: 'identity' })
  return { user, admin: payload.admin || null }
}

export async function bootstrapAdmin(secret) {
  const { payload } = await callAdminApi('admin-bootstrap', { secret: String(secret || '') })
  return payload
}

export async function loadOverviewData({ force = false } = {}) {
  if (!force) {
    const cached = readOverviewCache()
    if (cached) return cached
  }
  if (overviewPending) return overviewPending

  overviewPending = (async () => {
    let result
    try {
      result = await callAdminApi('admin-overview-v3', { force: Boolean(force) })
    } catch (error) {
      // V3 removes the Firestore collection-group index dependency. While a new
      // backend deployment is temporarily unavailable, keep the admin app usable
      // with the already-deployed quota-efficient V2 endpoint instead of failing.
      if (error?.status !== 404) throw error
      result = await callAdminApi('admin-overview-v2', {})
    }

    const data = result.payload.data || null
    if (!data) throw new Error('관리자 데이터 응답이 비어 있어.')
    writeOverviewCache(data)
    try {
      window.__SHUB_ADMIN_OVERVIEW__ = data
      window.dispatchEvent(new CustomEvent('shub:admin-overview', { detail: data }))
    } catch {
      // Rendering must not depend on the optional device badge enhancer.
    }
    return data
  })().finally(() => { overviewPending = null })

  return overviewPending
}

export async function loadClassDetails(classId) {
  if (!classId) throw new Error('반 식별자가 없어.')
  const { payload } = await callAdminApi('admin-class-details', { classId })
  return payload.data
}

export async function loadStudentDetails(user) {
  if (!user?.studentKey) return { todoState: [], identityCount: 0 }
  const { payload } = await callAdminApi('admin-console', {
    action: 'student_details',
    studentKey: user.studentKey,
  })
  return payload.data
}

export async function setStudentAccountStatus(user, status, reason = '') {
  if (!user?.studentKey) throw new Error('학생 식별자가 없어.')
  if (!['active', 'disabled'].includes(status)) throw new Error('지원하지 않는 계정 상태야.')
  const { payload } = await callAdminApi('admin-console', {
    action: 'set_student_status',
    studentKey: user.studentKey,
    status,
    reason: String(reason || '').slice(0, 240),
  })
  clearOverviewCache()
  return payload
}

export async function permanentlyDeleteStudent(user, reason = '') {
  if (!user?.studentKey) throw new Error('학생 식별자가 없어.')
  const { payload } = await callAdminApi('admin-console', {
    action: 'delete_student',
    studentKey: user.studentKey,
    reason: String(reason || '').slice(0, 240),
  })
  clearOverviewCache()
  return payload
}
