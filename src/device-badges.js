function deviceText(user) {
  const parts = []
  const label = String(user?.deviceLabel || '').trim()
  if (label && label !== '미수집') parts.push(label)
  const browser = String(user?.browserLabel || '').trim()
  if (browser) parts.push(browser)
  if (user?.displayMode === 'standalone') parts.push('PWA')
  return parts.join(' · ') || '기기 미수집'
}

function matchUserFromRow(row, users) {
  const name = row.querySelector('.student-main strong')?.childNodes?.[0]?.textContent?.trim() || ''
  const meta = row.querySelector('.student-main small')?.textContent || ''
  if (!name) return null
  return users.find((user) => {
    if (String(user.name || '').trim() !== name) return false
    if (user.classNumber && !meta.includes(`${user.classNumber}반`)) return false
    if (user.studentNumber && !meta.includes(`${user.studentNumber}번`)) return false
    return true
  }) || null
}

function enhanceRows(data) {
  const users = Array.isArray(data?.users) ? data.users : []
  if (!users.length) return

  document.querySelectorAll('.student-row.detailed').forEach((row) => {
    const user = matchUserFromRow(row, users)
    if (!user) return
    let badge = row.querySelector('.device-info-badge')
    if (!badge) {
      badge = document.createElement('span')
      badge.className = 'device-info-badge'
      row.querySelector('.student-main strong')?.appendChild(badge)
    }
    const nextText = deviceText(user)
    if (badge.textContent !== nextText) badge.textContent = nextText
    const nextDevice = String(user.deviceType || 'unknown')
    if (badge.dataset.device !== nextDevice) badge.dataset.device = nextDevice
  })

  document.querySelectorAll('.detail-sheet.expanded').forEach((sheet) => {
    if (sheet.querySelector('.device-detail-row')) return
    const name = sheet.querySelector('.detail-title h2')?.textContent?.trim() || ''
    const subtitle = sheet.querySelector('.detail-title p:last-child')?.textContent || ''
    const user = users.find((item) => String(item.name || '').trim() === name
      && (!item.classNumber || subtitle.includes(`${item.classNumber}반`)))
    if (!user) return
    const grid = sheet.querySelector('.detail-grid')
    if (!grid) return
    const row = document.createElement('div')
    row.className = 'device-detail-row'
    const label = document.createElement('span')
    label.textContent = '사용 기기'
    const value = document.createElement('strong')
    value.textContent = deviceText(user)
    row.append(label, value)
    grid.appendChild(row)
  })
}

function installStyle() {
  if (document.getElementById('shub-device-badge-style')) return
  const style = document.createElement('style')
  style.id = 'shub-device-badge-style'
  style.textContent = `
    .device-info-badge {
      display: inline-flex;
      align-items: center;
      margin-left: 8px;
      padding: 3px 7px;
      border-radius: 999px;
      border: 1px solid rgba(148,163,184,.2);
      background: rgba(148,163,184,.08);
      color: #a8b3c4;
      font-size: 11px;
      font-weight: 650;
      line-height: 1.2;
      vertical-align: middle;
      white-space: nowrap;
    }
    .device-info-badge[data-device="iphone"],
    .device-info-badge[data-device="ipad"] { color: #c7d2fe; }
    .device-info-badge[data-device="android"] { color: #bbf7d0; }
    @media (max-width: 720px) {
      .device-info-badge { margin-left: 6px; margin-top: 4px; }
    }
  `
  document.head.appendChild(style)
}

let scheduled = false
let pendingData = null

function scheduleEnhance(data) {
  if (data) pendingData = data
  if (scheduled) return
  scheduled = true
  const run = () => {
    scheduled = false
    enhanceRows(pendingData || window.__SHUB_ADMIN_OVERVIEW__)
  }
  if (document.visibilityState === 'hidden') window.setTimeout(run, 0)
  else window.requestAnimationFrame(run)
}

installStyle()
window.addEventListener('shub:admin-overview', (event) => scheduleEnhance(event.detail))
const observer = new MutationObserver(() => scheduleEnhance(window.__SHUB_ADMIN_OVERVIEW__))
observer.observe(document.getElementById('root') || document.documentElement, { childList: true, subtree: true })
window.setTimeout(() => scheduleEnhance(window.__SHUB_ADMIN_OVERVIEW__), 0)
