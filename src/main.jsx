import React, { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import {
  bootstrapAdmin,
  loadAdminIdentity,
  loadOverviewData,
  loadStudentDetails,
  permanentlyDeleteStudent,
  setStudentAccountStatus,
} from './admin-data'

function formatDateTime(ms) {
  const value = Number(ms || 0)
  if (!value) return '기록 없음'
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(value))
}

function relativeTime(ms) {
  const value = Number(ms || 0)
  if (!value) return '기록 없음'
  const diff = Date.now() - value
  if (diff < 60_000) return '방금 전'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}분 전`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}시간 전`
  return `${Math.floor(diff / 86_400_000)}일 전`
}

function Icon({ name }) {
  const paths = {
    dashboard: <><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></>,
    classes: <><path d="M4 20v-9l8-5 8 5v9"/><path d="M8 20v-6h8v6"/><path d="M9 9V4h6v5"/></>,
    students: <><circle cx="9" cy="8" r="3"/><path d="M3.5 20c.4-4 2.2-6 5.5-6s5.1 2 5.5 6"/><circle cx="17.5" cy="9" r="2.2"/><path d="M15.4 15.2c2.9-.5 5 .9 5.6 4.8"/></>,
    system: <><circle cx="12" cy="12" r="3"/><path d="M12 2.8v2.1M12 19.1v2.1M21.2 12h-2.1M4.9 12H2.8M18.5 5.5 17 7M7 17l-1.5 1.5M18.5 18.5 17 17M7 7 5.5 5.5"/></>,
    search: <><circle cx="10.5" cy="10.5" r="6.2"/><path d="m15.1 15.1 4.5 4.5"/></>,
    refresh: <><path d="M20 7v5h-5"/><path d="M4.7 17A8 8 0 0 0 18.9 8L20 12"/><path d="M4 17v-5h5"/><path d="M19.3 7A8 8 0 0 0 5.1 16L4 12"/></>,
  }
  return <svg viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>
}

function AccessGate({ uid, onActivated }) {
  const [secret, setSecret] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  async function activate(event) {
    event.preventDefault()
    if (!secret.trim()) return
    setBusy(true)
    setMessage('')
    try {
      await bootstrapAdmin(secret)
      await onActivated()
    } catch (error) {
      setMessage(error.message || '관리자 등록에 실패했어.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="gate-page">
      <section className="gate-card">
        <div className="admin-mark">S</div>
        <p className="eyebrow">S-Hub Admin</p>
        <h1>관리자 권한이 필요해</h1>
        <p className="muted">이 기기의 관리자 UID는 아래 값이야. 최초 1회만 서버의 부트스트랩 키로 관리자 등록을 하면 이후에는 이 기기에서 바로 열려.</p>
        <code className="uid-box">{uid}</code>
        <form onSubmit={activate} className="bootstrap-form">
          <input type="password" value={secret} onChange={(event) => setSecret(event.target.value)} placeholder="관리자 부트스트랩 키" autoComplete="off" />
          <button disabled={busy || !secret.trim()}>{busy ? '확인 중…' : '관리자로 등록'}</button>
        </form>
        {message ? <p className="error-copy">{message}</p> : null}
      </section>
    </main>
  )
}

function MetricCard({ label, value, detail }) {
  return <article className="metric-card"><p>{label}</p><strong>{value}</strong><span>{detail}</span></article>
}

function ClassTable({ classes, onOpenClass }) {
  return (
    <div className="table-card">
      <div className="table-head"><span>반</span><span>학생</span><span>오늘 활동</span><span>온라인</span><span>리마인더</span></div>
      {classes.length ? classes.map((row) => (
        <button className="table-row" key={row.classId} onClick={() => onOpenClass(row)}>
          <span className="row-title">{row.grade ? `${row.grade}학년 ` : ''}{row.classNumber ? `${row.classNumber}반` : row.classId}</span>
          <span>{row.students}</span><span>{row.activeToday}</span><span>{row.online}</span><span>{row.reminders}</span>
        </button>
      )) : <div className="empty-state">반 데이터가 없어.</div>}
    </div>
  )
}

function StudentList({ users, onSelect }) {
  return (
    <div className="student-list">
      {users.length ? users.map((user) => (
        <button className="student-row" key={user.uid} onClick={() => onSelect(user)}>
          <span className={`presence-dot ${user.online ? 'online' : ''}`} />
          <span className="student-main"><strong>{user.name}</strong><small>{user.grade ? `${user.grade}학년 · ` : ''}{user.classNumber ? `${user.classNumber}반` : '반 미상'} · {user.studentNumber ? `${user.studentNumber}번` : '번호 미수집'}</small></span>
          <span className="student-meta"><small>{relativeTime(user.effectiveLastSeenAt)}</small>{user.status !== 'active' ? <b>비활성</b> : null}</span>
        </button>
      )) : <div className="empty-state">조건에 맞는 학생이 없어.</div>}
    </div>
  )
}

function StudentSheet({ user, admin, onClose, onChanged }) {
  const [details, setDetails] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    let active = true
    loadStudentDetails(user).then((value) => active && setDetails(value)).catch((e) => active && setError(e.message))
    return () => { active = false }
  }, [user])

  async function toggleStatus() {
    setBusy(true); setError('')
    try {
      await setStudentAccountStatus(user, user.status === 'active' ? 'disabled' : 'active', '관리자 앱에서 변경')
      await onChanged()
      onClose()
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  async function removePermanently() {
    if (!confirmDelete) { setConfirmDelete(true); return }
    setBusy(true); setError('')
    try {
      await permanentlyDeleteStudent(user, '관리자 앱에서 영구 삭제')
      await onChanged()
      onClose()
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  const completed = details?.todoState?.filter((item) => item.completed).length || 0
  const hidden = details?.todoState?.filter((item) => item.hidden).length || 0

  return (
    <div className="sheet-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="detail-sheet">
        <div className="sheet-handle" />
        <div className="detail-title"><div><p className="eyebrow">학생 상세</p><h2>{user.name}</h2><p>{user.grade ? `${user.grade}학년 · ` : ''}{user.classNumber || '?'}반 · {user.studentNumber || '?'}번</p></div><button className="close-button" onClick={onClose}>×</button></div>
        <div className="status-strip"><span className={user.online ? 'status-live' : ''}>{user.online ? '현재 온라인' : `마지막 활동 ${relativeTime(user.effectiveLastSeenAt)}`}</span><span>{user.status === 'active' ? '계정 정상' : '계정 비활성'}</span></div>
        <div className="detail-grid">
          <div><span>가입</span><strong>{formatDateTime(user.createdAt)}</strong></div>
          <div><span>마지막 동기화</span><strong>{formatDateTime(user.lastSyncAt)}</strong></div>
          <div><span>앱 버전</span><strong>{user.appVersion || '미수집'}</strong></div>
          <div><span>실행 형태</span><strong>{user.displayMode || '미수집'}</strong></div>
          <div><span>플랫폼</span><strong>{user.platform || '미수집'}</strong></div>
          <div><span>브라우저</span><strong>{user.browser || '미수집'}</strong></div>
          <div><span>푸시 기기</span><strong>{user.pushDevices}대</strong></div>
          <div><span>개인 리마인더 상태</span><strong>{details ? `완료 ${completed} · 숨김 ${hidden}` : '불러오는 중'}</strong></div>
        </div>
        <details className="technical-details"><summary>기술 정보</summary><dl><dt>UID</dt><dd>{user.uid}</dd><dt>Student Key</dt><dd>{user.studentKey || '없음'}</dd><dt>User Agent</dt><dd>{user.userAgent || '미수집'}</dd></dl></details>
        {error ? <p className="error-copy">{error}</p> : null}
        <div className="sheet-actions">
          <button className="secondary-action" disabled={busy} onClick={toggleStatus}>{user.status === 'active' ? '학생 비활성화' : '학생 복구'}</button>
          {admin.role === 'super_admin' ? <button className={`danger-action ${confirmDelete ? 'confirming' : ''}`} disabled={busy} onClick={removePermanently}>{confirmDelete ? '정말 영구 삭제' : '영구 삭제'}</button> : null}
        </div>
        {confirmDelete ? <p className="danger-note">영구 삭제는 Firebase 인증 계정과 개인 데이터를 제거해. 다시 누르면 실행돼.</p> : null}
      </section>
    </div>
  )
}

function App() {
  const [identity, setIdentity] = useState(null)
  const [data, setData] = useState(null)
  const [page, setPage] = useState('dashboard')
  const [queryText, setQueryText] = useState('')
  const [classFilter, setClassFilter] = useState('all')
  const [selectedUser, setSelectedUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function refreshIdentity() {
    const next = await loadAdminIdentity()
    setIdentity(next)
    return next
  }

  async function refreshData() {
    setLoading(true); setError('')
    try { setData(await loadOverviewData()) } catch (e) { setError(e.message || '관리 데이터를 불러오지 못했어.') } finally { setLoading(false) }
  }

  useEffect(() => {
    refreshIdentity().then((next) => next.admin ? refreshData() : setLoading(false)).catch((e) => { setError(e.message); setLoading(false) })
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {})
  }, [])

  const filteredUsers = useMemo(() => {
    if (!data) return []
    const needle = queryText.trim().toLocaleLowerCase('ko')
    return data.users.filter((user) => {
      if (classFilter !== 'all' && user.classId !== classFilter) return false
      if (!needle) return true
      return [user.name, user.classNumber, user.studentNumber, user.uid, user.studentKey].some((value) => String(value || '').toLocaleLowerCase('ko').includes(needle))
    })
  }, [data, queryText, classFilter])

  if (!identity && loading) return <main className="loading-page">S-Hub Admin 불러오는 중…</main>
  if (identity && !identity.admin) return <AccessGate uid={identity.user.uid} onActivated={async () => { const next = await refreshIdentity(); if (next.admin) await refreshData() }} />

  const admin = identity?.admin
  const metrics = data?.metrics || { total: 0, online: 0, activeToday: 0, disabled: 0, missingStudentNumber: 0, missingGrade: 0 }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark">S</div><div><strong>S-Hub</strong><span>Admin</span></div></div>
        <nav>{[['dashboard','dashboard','대시보드'],['classes','classes','반'],['students','students','학생'],['system','system','시스템']].map(([id, icon, label]) => <button key={id} className={page === id ? 'active' : ''} onClick={() => setPage(id)}><Icon name={icon}/><span>{label}</span></button>)}</nav>
        <div className="admin-profile"><span>{admin?.label}</span><small>{admin?.role === 'super_admin' ? 'Super Admin' : 'Admin'}</small></div>
      </aside>
      <main className="content">
        <header className="topbar"><div><p className="eyebrow">S-Hub 운영 콘솔</p><h1>{page === 'dashboard' ? '학교 현황' : page === 'classes' ? '반별 현황' : page === 'students' ? '학생 관리' : '시스템 상태'}</h1></div><button className="icon-button" onClick={refreshData} aria-label="새로고침"><Icon name="refresh"/></button></header>
        {error ? <div className="error-banner">{error}</div> : null}
        {loading && !data ? <div className="loading-card">데이터 불러오는 중…</div> : null}

        {data && page === 'dashboard' ? <>
          <section className="metric-grid"><MetricCard label="전체 학생" value={metrics.total} detail={`비활성 ${metrics.disabled}명`}/><MetricCard label="현재 온라인" value={metrics.online} detail="최근 2분 기준"/><MetricCard label="오늘 활동" value={metrics.activeToday} detail="최근 24시간 기준"/><MetricCard label="데이터 보완 필요" value={metrics.missingStudentNumber + metrics.missingGrade} detail={`번호 ${metrics.missingStudentNumber} · 학년 ${metrics.missingGrade}`}/></section>
          <section className="section-block"><div className="section-title"><div><p className="eyebrow">Classes</p><h2>반별 상태</h2></div><button onClick={() => setPage('classes')}>전체 보기</button></div><ClassTable classes={data.classes.slice(0, 8)} onOpenClass={(row) => { setClassFilter(row.classId); setPage('students') }}/></section>
          <section className="section-block"><div className="section-title"><div><p className="eyebrow">Recent</p><h2>최근 학생</h2></div><button onClick={() => setPage('students')}>학생 관리</button></div><StudentList users={[...data.users].sort((a,b) => b.effectiveLastSeenAt - a.effectiveLastSeenAt).slice(0, 8)} onSelect={setSelectedUser}/></section>
        </> : null}

        {data && page === 'classes' ? <section className="section-block standalone"><div className="section-title"><div><p className="eyebrow">Overview</p><h2>전체 반</h2></div></div><ClassTable classes={data.classes} onOpenClass={(row) => { setClassFilter(row.classId); setPage('students') }}/></section> : null}

        {data && page === 'students' ? <section className="section-block standalone"><div className="student-toolbar"><label className="search-box"><Icon name="search"/><input value={queryText} onChange={(event) => setQueryText(event.target.value)} placeholder="이름, 반, 번호, UID 검색"/></label><select value={classFilter} onChange={(event) => setClassFilter(event.target.value)}><option value="all">전체 반</option>{data.classes.map((row) => <option key={row.classId} value={row.classId}>{row.grade ? `${row.grade}학년 ` : ''}{row.classNumber ? `${row.classNumber}반` : row.classId}</option>)}</select></div><StudentList users={filteredUsers} onSelect={setSelectedUser}/></section> : null}

        {data && page === 'system' ? <section className="system-grid"><article><p className="eyebrow">Identity</p><h2>관리자 세션</h2><dl><dt>권한</dt><dd>{admin?.role}</dd><dt>UID</dt><dd>{admin?.uid}</dd></dl></article><article><p className="eyebrow">Data quality</p><h2>수집 상태</h2><dl><dt>학생 번호 미수집</dt><dd>{metrics.missingStudentNumber}명</dd><dt>학년 미수집</dt><dd>{metrics.missingGrade}명</dd></dl></article><article><p className="eyebrow">Security</p><h2>접근 원칙</h2><p className="muted">관리자 데이터는 Firestore Rules와 서버 권한 검사를 모두 통과해야 접근할 수 있어. Public GitHub 저장소 자체는 관리자 권한을 주지 않아.</p></article></section> : null}
      </main>
      <nav className="mobile-nav">{[['dashboard','dashboard','홈'],['classes','classes','반'],['students','students','학생'],['system','system','시스템']].map(([id, icon, label]) => <button key={id} className={page === id ? 'active' : ''} onClick={() => setPage(id)}><Icon name={icon}/><span>{label}</span></button>)}</nav>
      {selectedUser ? <StudentSheet user={selectedUser} admin={admin} onClose={() => setSelectedUser(null)} onChanged={refreshData}/> : null}
    </div>
  )
}

createRoot(document.getElementById('root')).render(<React.StrictMode><App/></React.StrictMode>)
