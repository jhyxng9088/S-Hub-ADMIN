import React, { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import './admin-extra.css'
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
  return new Intl.DateTimeFormat('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value))
}

function relativeTime(ms) {
  const value = Number(ms || 0)
  if (!value) return '기록 없음'
  const diff = Math.max(0, Date.now() - value)
  if (diff < 60_000) return '방금 전'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}분 전`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}시간 전`
  return `${Math.floor(diff / 86_400_000)}일 전`
}

function percent(part, total) {
  if (!total) return '0%'
  return `${Math.round((part / total) * 100)}%`
}

function entityLabel(type) {
  if (type === 'reminder') return '리마인더'
  if (type === 'timetable') return '시간표'
  if (type === 'academic') return '학사일정'
  return type || '활동'
}

function auditLabel(action) {
  if (action === 'student_disabled') return '학생 비활성화'
  if (action === 'student_restored') return '학생 복구'
  if (action === 'student_deleted') return '학생 영구 삭제'
  if (action === 'admin_bootstrapped') return '관리자 등록'
  return action || '관리 작업'
}

function shortUid(uid) {
  const text = String(uid || '')
  return text.length > 14 ? `${text.slice(0, 7)}…${text.slice(-5)}` : text || '없음'
}

function Icon({ name }) {
  const paths = {
    dashboard: <><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></>,
    classes: <><path d="M4 20v-9l8-5 8 5v9"/><path d="M8 20v-6h8v6"/><path d="M9 9V4h6v5"/></>,
    students: <><circle cx="9" cy="8" r="3"/><path d="M3.5 20c.4-4 2.2-6 5.5-6s5.1 2 5.5 6"/><circle cx="17.5" cy="9" r="2.2"/><path d="M15.4 15.2c2.9-.5 5 .9 5.6 4.8"/></>,
    system: <><circle cx="12" cy="12" r="3"/><path d="M12 2.8v2.1M12 19.1v2.1M21.2 12h-2.1M4.9 12H2.8M18.5 5.5 17 7M7 17l-1.5 1.5M18.5 18.5 17 17M7 7 5.5 5.5"/></>,
    audit: <><path d="M6 3h12v18H6z"/><path d="M9 8h6M9 12h6M9 16h4"/></>,
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
    setBusy(true); setMessage('')
    try { await bootstrapAdmin(secret); await onActivated() }
    catch (error) { setMessage(error.message || '관리자 등록에 실패했어.') }
    finally { setBusy(false) }
  }
  return <main className="gate-page"><section className="gate-card"><div className="admin-mark">S</div><p className="eyebrow">S-Hub Admin</p><h1>관리자 권한이 필요해</h1><p className="muted">이 기기의 관리자 UID는 아래 값이야. 최초 1회만 서버의 부트스트랩 키로 등록하면 돼.</p><code className="uid-box">{uid}</code><form onSubmit={activate} className="bootstrap-form"><input type="password" value={secret} onChange={(event) => setSecret(event.target.value)} placeholder="관리자 부트스트랩 키" autoComplete="off"/><button disabled={busy || !secret.trim()}>{busy ? '확인 중…' : '관리자로 등록'}</button></form>{message ? <p className="error-copy">{message}</p> : null}</section></main>
}

function MetricCard({ label, value, detail }) {
  return <article className="metric-card"><p>{label}</p><strong>{value}</strong><span>{detail}</span></article>
}

function ClassCards({ classes, onOpenClass }) {
  return <div className="class-card-grid">{classes.length ? classes.map((row) => <button className="class-detail-card" key={row.classId} onClick={() => onOpenClass(row)}><div className="class-card-head"><div><span className="eyebrow">{row.grade ? `${row.grade}학년` : '학년 미수집'}</span><h3>{row.classNumber ? `${row.classNumber}반` : row.classId}</h3></div><strong>{row.students}명</strong></div><div className="class-health-line"><span>7일 활성률</span><b>{percent(row.active7d, row.students)}</b><div><i style={{ width: percent(row.active7d, row.students) }}/></div></div><dl className="class-stats"><div><dt>온라인</dt><dd>{row.online}</dd></div><div><dt>24시간</dt><dd>{row.activeToday}</dd></div><div><dt>30일 미접속</dt><dd>{row.inactive30d}</dd></div><div><dt>최근 7일 수정</dt><dd>{row.activity7d}</dd></div><div><dt>리마인더</dt><dd>{row.reminders}</dd></div><div><dt>학사일정</dt><dd>{row.academics}</dd></div></dl><div className="class-footer"><span>{row.timetableConfigured ? `시간표 설정 · ${relativeTime(row.timetableUpdatedAt)}` : '시간표 미설정'}</span><span>변경일 {row.timetableOverrideCount || 0}</span></div></button>) : <div className="empty-state">반 데이터가 없어.</div>}</div>
}

function StudentList({ users, onSelect }) {
  return <div className="student-list">{users.length ? users.map((user) => <button className="student-row detailed" key={user.studentKey || user.uid} onClick={() => onSelect(user)}><span className={`presence-dot ${user.online ? 'online' : ''}`}/><span className="student-main"><strong>{user.name}</strong><small>{user.grade ? `${user.grade}학년 · ` : ''}{user.classNumber ? `${user.classNumber}반` : '반 미상'} · {user.studentNumber ? `${user.studentNumber}번` : '번호 미수집'}</small></span><span className="student-activity"><b>{user.activity7d || 0}</b><small>7일 수정</small></span><span className="student-meta"><small>{relativeTime(user.effectiveLastSeenAt)}</small>{user.identityCount > 1 ? <em>{user.identityCount}기기</em> : null}{user.status !== 'active' ? <b>비활성</b> : null}</span></button>) : <div className="empty-state">조건에 맞는 학생이 없어.</div>}</div>
}

function ActivityList({ items }) {
  return <div className="activity-list">{items?.length ? items.map((item) => <div className="activity-item" key={`${item.id}-${item.updatedAt}`}><div><strong>{entityLabel(item.entityType)} {item.action}</strong><span>{item.entityId || '항목'}</span></div><time>{relativeTime(item.updatedAt)}</time></div>) : <div className="empty-state compact">기록된 수정 활동이 없어.</div>}</div>
}

function StudentSheet({ user, admin, onClose, onChanged }) {
  const [details, setDetails] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  useEffect(() => { let active = true; loadStudentDetails(user).then((value) => active && setDetails(value)).catch((e) => active && setError(e.message)); return () => { active = false } }, [user])
  async function toggleStatus() { setBusy(true); setError(''); try { await setStudentAccountStatus(user, user.status === 'active' ? 'disabled' : 'active', '관리자 앱에서 변경'); await onChanged(); onClose() } catch (e) { setError(e.message) } finally { setBusy(false) } }
  async function removePermanently() { if (!confirmDelete) { setConfirmDelete(true); return } setBusy(true); setError(''); try { await permanentlyDeleteStudent(user, '관리자 앱에서 영구 삭제'); await onChanged(); onClose() } catch (e) { setError(e.message) } finally { setBusy(false) } }
  const todo = details?.todoSummary
  return <div className="sheet-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="detail-sheet expanded"><div className="sheet-handle"/><div className="detail-title"><div><p className="eyebrow">학생 상세</p><h2>{user.name}</h2><p>{user.grade ? `${user.grade}학년 · ` : ''}{user.classNumber || '?'}반 · {user.studentNumber || '?'}번</p></div><button className="close-button" onClick={onClose}>×</button></div><div className="status-strip"><span className={user.online ? 'status-live' : ''}>{user.online ? '현재 온라인' : `마지막 접속 ${relativeTime(user.effectiveLastSeenAt)}`}</span><span>{user.status === 'active' ? '계정 정상' : '계정 비활성'}</span></div>
    <div className="detail-grid"><div><span>최초 가입</span><strong>{formatDateTime(user.createdAt)}</strong></div><div><span>연결 인증 계정</span><strong>{details ? `${details.identityCount}개` : '불러오는 중'}</strong></div><div><span>최근 7일 수정</span><strong>{user.activity7d || 0}회</strong></div><div><span>전체 수정 기록</span><strong>{details ? `${details.activityTotal}회` : '불러오는 중'}</strong></div><div><span>푸시 등록</span><strong>{details ? `${details.pushDevices}대` : `${user.pushDevices || 0}대`}</strong></div><div><span>리마인더 상태</span><strong>{todo ? `${todo.completed}/${todo.total} 완료` : '불러오는 중'}</strong></div><div><span>앱 버전</span><strong>{user.appVersion || '미수집'}</strong></div><div><span>실행 형태</span><strong>{user.displayMode || '미수집'}</strong></div></div>
    <section className="sheet-section"><div className="sheet-section-title"><h3>최근 수정 활동</h3><span>최대 30개</span></div><ActivityList items={details?.recentActivity}/></section>
    <section className="sheet-section"><div className="sheet-section-title"><h3>연결된 인증 계정</h3><span>{details?.identityCount || user.identityCount || 0}개</span></div><div className="identity-list">{details?.identities?.length ? details.identities.map((item) => <div className="identity-item" key={item.uid}><div><strong>{shortUid(item.uid)}</strong><span>{item.disabled === true ? '비활성' : item.disabled === false ? '정상' : 'Auth 기록 없음'}</span></div><div><small>가입 {formatDateTime(item.createdAt)}</small><small>최근 로그인 {relativeTime(item.lastSignInAt)}</small></div></div>) : <div className="empty-state compact">계정 정보를 불러오는 중이야.</div>}</div></section>
    <details className="technical-details"><summary>식별 정보</summary><dl><dt>대표 UID</dt><dd>{user.uid}</dd><dt>Student Key</dt><dd>{user.studentKey || '없음'}</dd><dt>마지막 데이터 갱신</dt><dd>{formatDateTime(user.updatedAt)}</dd></dl></details>{error ? <p className="error-copy">{error}</p> : null}<div className="sheet-actions"><button className="secondary-action" disabled={busy} onClick={toggleStatus}>{user.status === 'active' ? '학생 비활성화' : '학생 복구'}</button>{admin.role === 'super_admin' ? <button className={`danger-action ${confirmDelete ? 'confirming' : ''}`} disabled={busy} onClick={removePermanently}>{confirmDelete ? '정말 영구 삭제' : '영구 삭제'}</button> : null}</div>{confirmDelete ? <p className="danger-note">영구 삭제는 연결된 Firebase 인증 계정과 학생 개인 데이터를 제거해. 반 공용 리마인더·시간표·학사일정은 삭제하지 않아.</p> : null}</section></div>
}

function AuditList({ rows }) {
  return <div className="audit-list">{rows?.length ? rows.map((row) => <article key={row.id}><div><strong>{auditLabel(row.action)}</strong><span>{row.targetName || (row.targetStudentKey ? shortUid(row.targetStudentKey) : '시스템')}</span></div><div><time>{formatDateTime(row.createdAt)}</time><small>관리자 {shortUid(row.actorUid)}{row.affectedAuthUsers ? ` · 계정 ${row.affectedAuthUsers}개` : ''}</small></div></article>) : <div className="empty-state">관리자 작업 기록이 아직 없어.</div>}</div>
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
  async function refreshIdentity() { const next = await loadAdminIdentity(); setIdentity(next); return next }
  async function refreshData() { setLoading(true); setError(''); try { setData(await loadOverviewData()) } catch (e) { setError(e.message || '관리 데이터를 불러오지 못했어.') } finally { setLoading(false) } }
  useEffect(() => { refreshIdentity().then((next) => next.admin ? refreshData() : setLoading(false)).catch((e) => { setError(e.message); setLoading(false) }); if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {}) }, [])
  const filteredUsers = useMemo(() => { if (!data) return []; const needle = queryText.trim().toLocaleLowerCase('ko'); return data.users.filter((user) => { if (classFilter !== 'all' && user.classId !== classFilter) return false; if (!needle) return true; return [user.name, user.classNumber, user.studentNumber, user.uid, user.studentKey].some((value) => String(value || '').toLocaleLowerCase('ko').includes(needle)) }) }, [data, queryText, classFilter])
  if (!identity && loading) return <main className="loading-page">S-Hub Admin 불러오는 중…</main>
  if (identity && !identity.admin) return <AccessGate uid={identity.user.uid} onActivated={async () => { const next = await refreshIdentity(); if (next.admin) await refreshData() }}/>
  const admin = identity?.admin
  const metrics = data?.metrics || {}
  const navItems = [['dashboard','dashboard','대시보드'],['classes','classes','반'],['students','students','학생'],['audit','audit','감사 로그'],['system','system','시스템']]
  const title = page === 'dashboard' ? '학교 현황' : page === 'classes' ? '반별 현황' : page === 'students' ? '학생 관리' : page === 'audit' ? '관리자 감사 로그' : '시스템 상태'
  return <div className="app-shell"><aside className="sidebar"><div className="brand"><div className="brand-mark">S</div><div><strong>S-Hub</strong><span>Admin</span></div></div><nav>{navItems.map(([id, icon, label]) => <button key={id} className={page === id ? 'active' : ''} onClick={() => setPage(id)}><Icon name={icon}/><span>{label}</span></button>)}</nav><div className="admin-profile"><span>{admin?.label}</span><small>{admin?.role === 'super_admin' ? 'Super Admin' : 'Admin'}</small></div></aside><main className="content"><header className="topbar"><div><p className="eyebrow">S-Hub 운영 콘솔</p><h1>{title}</h1></div><button className="icon-button" onClick={refreshData} aria-label="새로고침"><Icon name="refresh"/></button></header>{error ? <div className="error-banner">{error}</div> : null}{loading && !data ? <div className="loading-card">데이터 불러오는 중…</div> : null}
    {data && page === 'dashboard' ? <><section className="metric-grid dense"><MetricCard label="전체 학생" value={metrics.total} detail={`${metrics.classCount || 0}개 반`}/><MetricCard label="현재 온라인" value={metrics.online} detail="최근 2분"/><MetricCard label="7일 활성" value={metrics.active7d} detail={`${percent(metrics.active7d, metrics.total)} 활성률`}/><MetricCard label="30일 활성" value={metrics.active30d} detail={`${percent(metrics.active30d, metrics.total)} 활성률`}/><MetricCard label="30일 미접속" value={metrics.inactive30d} detail="장기 비활성"/><MetricCard label="최근 7일 가입" value={metrics.joined7d} detail="신규 학생"/><MetricCard label="인증 계정" value={metrics.authIdentities} detail={`추가 계정 ${metrics.extraIdentities || 0}`}/><MetricCard label="푸시 등록" value={metrics.pushEnabled} detail={`${percent(metrics.pushEnabled, metrics.total)} 학생`}/></section><section className="summary-strip"><div><span>공용 리마인더</span><strong>{metrics.totalReminders || 0}</strong></div><div><span>학사일정</span><strong>{metrics.totalAcademicEvents || 0}</strong></div><div><span>최근 7일 수정</span><strong>{metrics.activity7d || 0}</strong></div><div><span>복수 인증 학생</span><strong>{metrics.multiIdentityStudents || 0}</strong></div></section><section className="section-block"><div className="section-title"><div><p className="eyebrow">Classes</p><h2>반별 상태</h2></div><button onClick={() => setPage('classes')}>전체 보기</button></div><ClassCards classes={data.classes.slice(0, 6)} onOpenClass={(row) => { setClassFilter(row.classId); setPage('students') }}/></section><section className="section-block"><div className="section-title"><div><p className="eyebrow">Recent</p><h2>최근 접속 학생</h2></div><button onClick={() => setPage('students')}>학생 관리</button></div><StudentList users={[...data.users].sort((a,b) => b.effectiveLastSeenAt - a.effectiveLastSeenAt).slice(0, 8)} onSelect={setSelectedUser}/></section></> : null}
    {data && page === 'classes' ? <section className="section-block standalone"><div className="section-title"><div><p className="eyebrow">Overview</p><h2>전체 반</h2></div><span className="section-meta">활성률 · 시간표 · 공용 데이터 · 수정량</span></div><ClassCards classes={data.classes} onOpenClass={(row) => { setClassFilter(row.classId); setPage('students') }}/></section> : null}
    {data && page === 'students' ? <section className="section-block standalone"><div className="student-toolbar"><label className="search-box"><Icon name="search"/><input value={queryText} onChange={(event) => setQueryText(event.target.value)} placeholder="이름, 반, 번호, UID 검색"/></label><select value={classFilter} onChange={(event) => setClassFilter(event.target.value)}><option value="all">전체 반</option>{data.classes.map((row) => <option key={row.classId} value={row.classId}>{row.grade ? `${row.grade}학년 ` : ''}{row.classNumber ? `${row.classNumber}반` : row.classId}</option>)}</select></div><div className="student-result-meta">{filteredUsers.length}명 · 7일 활동/최근 접속/연결 계정 표시</div><StudentList users={filteredUsers} onSelect={setSelectedUser}/></section> : null}
    {data && page === 'audit' ? <section className="section-block standalone"><div className="section-title"><div><p className="eyebrow">Security</p><h2>최근 관리자 작업</h2></div><span className="section-meta">최근 80개</span></div><AuditList rows={data.audit}/></section> : null}
    {data && page === 'system' ? <section className="system-grid expanded-system"><article><p className="eyebrow">Identity</p><h2>관리자 세션</h2><dl><dt>권한</dt><dd>{admin?.role}</dd><dt>UID</dt><dd>{shortUid(admin?.uid)}</dd></dl></article><article><p className="eyebrow">Data quality</p><h2>학생 데이터 상태</h2><dl><dt>번호 미수집</dt><dd>{metrics.missingStudentNumber || 0}명</dd><dt>학년 미수집</dt><dd>{metrics.missingGrade || 0}명</dd><dt>접속 기록 없음</dt><dd>{metrics.missingLastSeen || 0}명</dd><dt>30일 지난 presence</dt><dd>{metrics.stalePresence || 0}건</dd></dl></article><article><p className="eyebrow">Authentication</p><h2>인증 구조</h2><dl><dt>고유 학생</dt><dd>{metrics.total || 0}</dd><dt>Firebase Auth 계정</dt><dd>{metrics.authIdentities || 0}</dd><dt>복수 계정 학생</dt><dd>{metrics.multiIdentityStudents || 0}</dd><dt>비활성 학생</dt><dd>{metrics.disabled || 0}</dd></dl></article><article><p className="eyebrow">Content</p><h2>공용 데이터</h2><dl><dt>리마인더</dt><dd>{metrics.totalReminders || 0}</dd><dt>학사일정</dt><dd>{metrics.totalAcademicEvents || 0}</dd><dt>전체 수정 기록</dt><dd>{metrics.totalActivity || 0}</dd><dt>최근 7일 수정</dt><dd>{metrics.activity7d || 0}</dd></dl></article><article className="system-wide"><p className="eyebrow">Privacy & Security</p><h2>관리자 데이터 원칙</h2><p className="muted">운영에 필요한 계정 상태·접속 시각·공용 데이터 수정 기록만 집계해. 정확한 위치, IP 주소, AI 대화 내용, 푸시 endpoint/암호키 같은 민감 정보는 관리자 화면에 노출하지 않아.</p></article></section> : null}
  </main><nav className="mobile-nav five-items">{navItems.map(([id, icon, label]) => <button key={id} className={page === id ? 'active' : ''} onClick={() => setPage(id)}><Icon name={icon}/><span>{label === '대시보드' ? '홈' : label === '감사 로그' ? '로그' : label}</span></button>)}</nav>{selectedUser ? <StudentSheet user={selectedUser} admin={admin} onClose={() => setSelectedUser(null)} onChanged={refreshData}/> : null}</div>
}

createRoot(document.getElementById('root')).render(<React.StrictMode><App/></React.StrictMode>)
