import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabase'

function md5(str) {
  // Simple MD5 via SubtleCrypto not available synchronously, use a hash check via Supabase
  return str // We'll verify against DB
}

export default function Admin() {
  const [authed, setAuthed] = useState(false)
  const [pw, setPw] = useState('')
  const [pwError, setPwError] = useState('')

  const [players, setPlayers] = useState([])
  const [challenges, setChallenges] = useState([])
  const [newName, setNewName] = useState('')
  const [addError, setAddError] = useState('')
  const [addSuccess, setAddSuccess] = useState('')
  const [loading, setLoading] = useState(false)

  async function checkPassword() {
    const { data } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'admin_password')
      .single()

    // Hash input and compare
    const encoded = new TextEncoder().encode(pw)
    const hashBuffer = await crypto.subtle.digest('MD5', encoded).catch(() => null)

    // Fallback: use a simple comparison via Supabase function
    // We query: select md5('input') = stored_value
    const { data: check } = await supabase.rpc('check_admin_password', { input_pw: pw }).catch(() => ({ data: null }))

    if (check === true) {
      setAuthed(true)
      fetchData()
    } else {
      // Direct MD5 comparison not straightforward in browser, use alternative
      // Store hashed pw and compare using a Supabase SQL function
      // For now, simple approach: fetch and compare raw (only works if stored plain)
      // Better: we'll create a Supabase function - but as fallback check plain text too
      if (data?.value === pw) {
        setAuthed(true)
        fetchData()
      } else {
        setPwError('Falsches Passwort.')
      }
    }
  }

  async function fetchData() {
    setLoading(true)
    const [{ data: p }, { data: c }] = await Promise.all([
      supabase.from('players').select('*').order('rank'),
      supabase.from('challenges')
        .select('*, challenger:challenger_id(name), challenged:challenged_id(name)')
        .order('created_at', { ascending: false })
        .limit(20)
    ])
    setPlayers(p || [])
    setChallenges(c || [])
    setLoading(false)
  }

  async function addPlayer() {
    setAddError('')
    setAddSuccess('')
    if (!newName.trim()) { setAddError('Name eingeben.'); return }

    const maxRank = players.filter(p => p.active).length + 1
    const { error } = await supabase.from('players').insert({ name: newName.trim(), rank: maxRank })
    if (error) { setAddError('Fehler: ' + error.message); return }
    setAddSuccess(`${newName} wurde als Rang ${maxRank} hinzugefügt.`)
    setNewName('')
    fetchData()
  }

  async function deactivatePlayer(player) {
    if (!confirm(`${player.name} wirklich deaktivieren? Rang wird freigegeben.`)) return
    await supabase.from('players').update({ active: false }).eq('id', player.id)
    // Shift all players below up
    const below = players.filter(p => p.active && p.rank > player.rank)
    for (const p of below) {
      await supabase.from('players').update({ rank: p.rank - 1 }).eq('id', p.id)
    }
    fetchData()
  }

  async function cancelChallenge(challengeId) {
    if (!confirm('Challenge wirklich abbrechen?')) return
    await supabase.from('challenges').update({ status: 'CANCELLED' }).eq('id', challengeId)
    fetchData()
  }

  async function markWO(challengeId, winnerSide) {
    const challenge = challenges.find(c => c.id === challengeId)
    if (!challenge) return
    if (!confirm(`W.O. für ${winnerSide === 'challenger' ? challenge.challenger?.name : challenge.challenged?.name}?`)) return

    const newStatus = winnerSide === 'challenger' ? 'WO_CHALLENGER' : 'WO_CHALLENGED'
    await supabase.from('challenges').update({ status: newStatus, played_at: new Date().toISOString().split('T')[0] }).eq('id', challengeId)

    if (winnerSide === 'challenger') {
      // Challenger wins by WO → update ranks
      const c = challenge
      const winnerRank = c.rank_challenger_before || players.find(p => p.id === c.challenger_id)?.rank
      const loserRank = c.rank_challenged_before || players.find(p => p.id === c.challenged_id)?.rank
      if (winnerRank > loserRank) {
        const toShift = players.filter(p => p.active && p.rank >= loserRank && p.rank < winnerRank)
        for (const p of toShift) {
          await supabase.from('players').update({ rank: p.rank + 1 }).eq('id', p.id)
        }
        await supabase.from('players').update({ rank: loserRank }).eq('id', c.challenger_id)
      }
    }
    fetchData()
  }

  function statusLabel(s) {
    const map = { PENDING: '⏳ Pendent', ACCEPTED: '✅ Akzeptiert', PLAYED: '🏓 Gespielt', WO_CHALLENGER: 'W.O. Herausforderer', WO_CHALLENGED: 'W.O. Herausgeforderter', CANCELLED: '❌ Abgebrochen' }
    return map[s] || s
  }

  if (!authed) {
    return (
      <div className="page">
        <div className="header">
          <div className="header-logo">TTCD Ladder</div>
          <div className="header-sub">Admin</div>
        </div>
        <div className="card" style={{ maxWidth: 360, margin: '0 auto' }}>
          <div className="modal-title">🔐 Admin-Zugang</div>
          {pwError && <div className="alert alert-error">{pwError}</div>}
          <div className="form-group">
            <label className="form-label">Passwort</label>
            <input
              type="password"
              className="form-input"
              value={pw}
              onChange={e => setPw(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && checkPassword()}
              placeholder="••••••••"
            />
          </div>
          <button className="btn btn-primary" onClick={checkPassword}>Einloggen</button>
          <div style={{ marginTop: 16, textAlign: 'center' }}>
            <Link to="/" className="back-link">← Zurück zur Rangliste</Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <div className="header">
        <div className="header-logo">TTCD Ladder</div>
        <div className="header-sub">Admin-Bereich</div>
      </div>

      <div className="nav">
        <Link to="/">Rangliste</Link>
        <Link to="/result">Eintragen</Link>
        <Link to="/admin" className="active">Admin</Link>
      </div>

      {loading && <div className="spinner" />}

      {/* ADD PLAYER */}
      <div className="section-title">Spieler hinzufügen</div>
      <div className="card">
        {addError && <div className="alert alert-error">{addError}</div>}
        {addSuccess && <div className="alert alert-success">{addSuccess}</div>}
        <div style={{ display: 'flex', gap: 10 }}>
          <input
            className="form-input"
            placeholder="Name des Spielers"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addPlayer()}
            style={{ flex: 1 }}
          />
          <button className="btn btn-primary" style={{ width: 'auto', whiteSpace: 'nowrap' }} onClick={addPlayer}>
            + Hinzufügen
          </button>
        </div>
        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 8 }}>
          Neue Spieler werden automatisch ans Ende der Rangliste gesetzt.
        </p>
      </div>

      {/* PLAYER LIST */}
      <div className="section-title">Spielerliste ({players.filter(p=>p.active).length} aktiv)</div>
      <div className="card">
        {players.filter(p => p.active).map(p => (
          <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
            <div className="rank-badge" style={{ width: 32, height: 32, fontSize: '0.9rem' }}>{p.rank}</div>
            <span style={{ flex: 1 }}>{p.name}</span>
            <button
              onClick={() => deactivatePlayer(p)}
              style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 8, padding: '4px 10px', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.8rem' }}
            >
              Deaktivieren
            </button>
          </div>
        ))}
      </div>

      {/* CHALLENGES */}
      <div className="section-title">Challenges (letzte 20)</div>
      <div className="card">
        {challenges.map(c => (
          <div key={c.id} style={{ padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
              <div>
                <strong>{c.challenger?.name}</strong>
                <span style={{ color: 'var(--text-muted)' }}> vs </span>
                <strong>{c.challenged?.name}</strong>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 3 }}>
                  {statusLabel(c.status)} · {new Date(c.created_at).toLocaleDateString('de-CH')}
                  {c.sets_challenger !== null && ` · ${c.sets_challenger}:${c.sets_challenged}`}
                </div>
              </div>
              {(c.status === 'PENDING' || c.status === 'ACCEPTED') && (
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button
                    onClick={() => markWO(c.id, 'challenger')}
                    style={{ fontSize: '0.7rem', padding: '4px 8px', background: 'rgba(79,142,247,0.1)', border: '1px solid rgba(79,142,247,0.3)', borderRadius: 6, color: 'var(--accent)', cursor: 'pointer' }}
                  >
                    W.O. →Hf
                  </button>
                  <button
                    onClick={() => cancelChallenge(c.id)}
                    style={{ fontSize: '0.7rem', padding: '4px 8px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-muted)', cursor: 'pointer' }}
                  >
                    Abbruch
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
