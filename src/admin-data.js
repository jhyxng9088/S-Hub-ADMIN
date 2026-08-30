import { ensureAdminSession } from './firebase'

const ADMIN_API_BASE = 'https://school-reminder-backend.vercel.app/api'

async function callAdminApi(path, body) {
  const user = await ensureAdminSession()
  const token = await user.getIdToken(true)
  const response = await fetch(`${ADMIN_API_BASE}/${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body || {}),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.message || '관리자 서버 요청에 실패했어.')
  return { user, payload }
}

export async function loadAdminIdentity() {
  const { user, payload } = await callAdminApi('admin-console', { action: 'identity' })
  return { user, admin: payload.admin || null }
}

export async function bootstrapAdmin(secret) {
  const { payload } = await callAdminApi('admin-bootstrap', { secret: String(secret || '') })
  return payload
}

export async function loadOverviewData() {
  const { payload } = await callAdminApi('admin-overview-v2', {})
  const data = payload.data || null
  try {
    window.__SHUB_ADMIN_OVERVIEW__ = data
    window.dispatchEvent(new CustomEvent('shub:admin-overview', { detail: data }))
  } catch {
    // Rendering must not depend on the optional device badge enhancer.
  }
  return data
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
  return payload
}

export async function permanentlyDeleteStudent(user, reason = '') {
  if (!user?.studentKey) throw new Error('학생 식별자가 없어.')
  const { payload } = await callAdminApi('admin-console', {
    action: 'delete_student',
    studentKey: user.studentKey,
    reason: String(reason || '').slice(0, 240),
  })
  return payload
}
