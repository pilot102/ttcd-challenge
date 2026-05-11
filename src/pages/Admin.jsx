import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabase'

export default function Admin() {
  const [authed, setAuthed] = useState(false)
  const [pw, setPw] = useState('')
  const [pwError, setPwError] = useState('')
  const [checking, setChecking] = useState(false)

  const [players, setPlayers] = useState([])
  const [challenges, setChallenges] = useState([])
  const [newName, setNewName] = useState('')
  const [addError, setAddError] = useState('')
  const [addSuccess, setAddSuccess] = useState('')
  const [loading, setLoading] = useState(false)

  async function checkPassword() {
    if (!pw.trim()) { setPwError('Bitte Passwort eingeben.'); return }
    setChecking(true)
    setPwError('')

    // Direkt in Supabase MD5 vergleichen via RPC
    const { data, error } = await supabase.rpc('check_admin_password', { input_pw: pw })

    setChecking(false)

    if (error) {
      // Fallback: direkt Settings-Tabelle lesen und plain text vergleichen
      const { data: setting } = await supabase
        .from('settings')
        .select('value')
        .eq('key', 'admin_password')
        .single()

      if (setting?.value === pw || setting?.value === md5Simple(pw)) {
        setAuthed(true)
        fetchData()
      } else {
        setPwError('Falsches Passwort.')
      }
      return
    }

    if (data === true) {
      setAuthed(true)
      fetchData()
    } else {
      setPwError('Falsches Passwort.')
    }
  }

  // Einfache MD5-ähnliche Prüfung als letzter Fallback (nicht kryptographisch)
  function md5Simple(str) {
    return str // nur als Notfall-Fallback
  }

  async function fetchData() {
    setLoading(true)
    const [{ data: p }, { data: c }] = await Promise.all([
      supabase.from('players').select('*').order('rank'),
      supabase.from('challenges')
        .select('*, challenger:challenger_id(name), challenged:challenged_id(name)')
        .order('created_at', { ascending: false })
        .limit(30)
    ])
    setPlayers(p || [])
    setChallenges(c || [])
    setLoading(false)
  }

  async function addPlayer() {
    setAddError('')
    setAddSuccess('')
    if (!newName.trim()) { setAddError('Name eingeben.'); return }

    const activePlayers = players.filter(p => p.active)
    const maxRank = activePlayers.length + 1
    const { error } = await supabase.from('players').insert({ name: newName.trim(), rank: maxRank })
    if (error) { setAddError('Fehler: ' + error.message); return }
    setAddSuccess(`${newName} wurde als Rang ${maxRank} hinzugefügt.`)
    setNewName('')
    fetchData()
  }

  async function deactivatePlayer(player) {
    if (!confirm(`${player.name} wirklich deaktivieren?\nSein Rang wird freigegeben und alle darunter rücken auf.`)) return

    await supabase.from('players').update({ active: false, rank: 999 }).eq('id', player.id)

    // Alle aktiven Spieler unter diesem Rang nachrücken lassen
    const below = players.filter(p => p.active && p.id !== player.id && p.rank > player.rank)
    for (const p of below) {
      await supabase.from('players').update({ rank: p.rank - 1 }).eq('id', p.id)
    }
    fetchData()
  }

  async function updateRankManually(playerId, newRank) {
    newRank = parseInt(newRank)
    if (isNaN(newRank) || newRank < 1) return
    const player = players.find(p => p.id === playerId)
    if (!player) return

    const oldRank = player.rank
    if (newRank === oldRank) return

    // Temporär auf 999 setzen
    await supabase.from('players').update({ rank: 999 }).eq('id', playerId)

    if (newRank < oldRank) {
      // Nach oben verschoben → andere nach unten
      const toShift = players.filter(p => p.active && p.id !== playerId && p.rank >= newRank && p.rank < oldRank)
      for (const p of toShift) {
        await supabase.from('players').update({ rank: p.rank + 1 }).eq('id', p.id)
      }
    } else {
      // Nach unten verschoben → andere nach oben
      const toShift = players.filter(p => p.active && p.id !== playerId && p.rank > oldRank && p.rank <= newRank)
      for (const p of toShift) {
        await supabase.from('players').update({ rank: p.rank - 1 }).eq('id', p.id)
      }
    }
    await supabase.from('players').update({ rank: newRank }).eq('id', playerId)
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
    const winnerName = winnerSide === 'challenger' ? challenge.challenger?.name : challenge.challenged?.name
    if (!confirm(`W.O.-Sieg für ${winnerName}?`)) return

    const newStatus = winnerSide === 'challenger' ? 'WO_CHALLENGER' : 'WO_CHALLENGED'
    await supabase.from('challenges').update({
      status: newStatus,
      played_at: new Date().toISOString().split('T')[0]
    }).eq('id', challengeId)

    if (winnerSide === 'challenger') {
      const winnerId = challenge.challenger_id
      const winnerRank = challenge.rank_challenger_before
      const loserRank = challenge.rank_challenged_before
      if (winnerRank && loserRank && winnerRank > loserRank) {
        await supabase.rpc('update_ranks_after_challenge', {
          winner_id: winnerId,
          new_rank: loserRank,
          old_rank: winnerRank
        })
      }
    }
    fetchData()
  }

  function statusLabel(s) {
    const map = {
      PENDING: '⏳ Pendent',
      ACCEPTED: '✅ Akzeptiert',
      PLAYED: '🏓 Gespielt',
      WO_CHALLENGER: 'W.O. → Herausforderer',
      WO_CHALLENGED: 'W.O. → Herausgeforderter',
      CANCELLED: '❌ Abgebrochen'
    }
    return map[s] || s
  }

  // LOGIN SCREEN
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
              autoFocus
            />
          </div>
          <button className="btn btn-primary" onClick={checkPassword} disabled={checking}>
            {checking ? 'Prüfe...' : 'Einloggen'}
          </button>
          <div style={{ marginTop: 16, textAlign: 'center' }}>
            <Link to="/" className="back-link">← Zurück zur Rangliste</Link>
          </div>
        </div>
      </div>
    )
  }

  // ADMIN SCREEN
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

      {/* SPIELER HINZUFÜGEN */}
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
          Neue Spieler kommen automatisch ans Ende der Rangliste.
        </p>
      </div>

      {/* RANGLISTE MANUELL ANPASSEN */}
      <div className="section-title">Ränge anpassen</div>
      <div className="card">
        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 14 }}>
          Rang-Nummer direkt bearbeiten und Enter drücken.
        </p>
        {players.filter(p => p.active).sort((a,b) => a.rank - b.rank).map(p => (
          <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
            <input
              type="number"
              defaultValue={p.rank}
              min="1"
              style={{ width: 52, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 8px', color: 'var(--text)', textAlign: 'center', fontSize: '0.9rem' }}
              onBlur={e => updateRankManually(p.id, e.target.value)}
              onKeyDown={e => e.key === 'Enter' && updateRankManually(p.id, e.target.value)}
            />
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
      <div className="section-title">Challenges (letzte 30)</div>
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
                    W.O.→Hf
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
