function replaceExact(source, marker, replacement, expectedCount = 1) {
  const count = String(source || '').split(marker).length - 1
  if (count !== expectedCount) {
    throw new Error(`S-Hub Admin quota patch drift: expected ${expectedCount}, found ${count}: ${marker.slice(0, 90)}`)
  }
  return String(source).split(marker).join(replacement)
}

export function patchAdminQuotaSource(source, id) {
  const cleanId = String(id || '').split('?')[0]
  if (!cleanId.endsWith('/src/main.jsx')) return String(source || '')
  let next = String(source || '')

  next = replaceExact(
    next,
    "} from './admin-data'\n",
    "} from './admin-data'\nimport { mergeRealtimePresence, subscribeAdminPresence } from './admin-presence'\n",
  )

  next = replaceExact(
    next,
    "  async function refreshData() { setLoading(true); setError(''); try { setData(await loadOverviewData()) } catch (e) { setError(e.message || '관리 데이터를 불러오지 못했어.') } finally { setLoading(false) } }",
    "  async function refreshData(force = false) { setLoading(true); setError(''); try { setData(await loadOverviewData({ force })) } catch (e) { setError(e.message || '관리 데이터를 불러오지 못했어.') } finally { setLoading(false) } }",
  )

  next = replaceExact(
    next,
    "  useEffect(() => { refreshIdentity().then((next) => next.admin ? refreshData() : setLoading(false)).catch((e) => { setError(e.message); setLoading(false) }); if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {}) }, [])",
    `  useEffect(() => { refreshIdentity().then((next) => next.admin ? refreshData(false) : setLoading(false)).catch((e) => { setError(e.message); setLoading(false) }); if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {}) }, [])\n  const presenceScope = useMemo(() => {\n    if (!data) return ''\n    const classes = (data.classes || []).map((row) => row.classId).filter(Boolean).sort().join('|')\n    const identities = (data.users || []).map((user) => [user.classId, ...(user.uids || [user.uid])].filter(Boolean).join(':')).sort().join('|')\n    return \`${'${classes}::${identities}'}\`\n  }, [data])\n  useEffect(() => {\n    if (!identity?.admin || !presenceScope || !data) return undefined\n    return subscribeAdminPresence(data, (presence) => {\n      setData((current) => mergeRealtimePresence(current, presence))\n    }, (presenceError) => {\n      console.warn('Admin RTDB presence sync failed:', presenceError)\n    })\n  }, [identity?.admin?.uid, presenceScope])`,
  )

  next = replaceExact(next, 'onClick={refreshData} aria-label="새로고침"', 'onClick={() => refreshData(true)} aria-label="새로고침"')
  next = replaceExact(next, 'onChanged={refreshData}/>', 'onChanged={() => refreshData(true)}/>')
  next = replaceExact(next, 'if (next.admin) await refreshData() }}/>','if (next.admin) await refreshData(true) }}/>', 1)

  return next
}
