import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../supabase'

export default function PlayerProfile() {
  const { id } = useParams()
  const [player, setPlayer] = useState(null)
  const [allPlayers, setAllPlayers] = useState([])
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState(null)

  const [showChallenge, setShowChallenge] = useState(false)
  const [challengerId, setChallengerId] = useState('')
  const [challengeError, setChallengeError] = useState('')
  const [challengeSuccess, setChallengeSuccess] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => { fetchData() }, [id])

  async function fetchData() {
    const [{ data: playerData }, { data: challengesData }, { data: allPlayersData }] = await Promise.all([
      supabase.from('players').select('*').eq('id', id).single(),
      supabase.from('challenges')
        .select('*, challenger:challenger_id(id, name, rank), challenged:challenged_id(id, name, rank)')
        .eq('status', 'PLAYED')
        .or(`challenger_id.eq.${id},challenged_id.eq.${id}`)
        .order('played_at', { ascending: false }),
      supabase.from('players').select('*').eq('active', true).order('rank')
    ])
    setPlayer(playerData)
    setHistory(challengesData || [])
    setAllPlayers(allPlayersData || [])
    setLoading(false)
  }

  function eligibleChallengers() {
    if (!player) return []
    return allPlayers.filter(p => {
      if (p.id === player.id) return false
      if (p.rank === 1) return false
      if (p.rank >= player.rank) return false
      if (player.rank - p.rank > 3) return false
      return true
    })
  }

  async function submitChallenge() {
    setChallengeError('')
    if (!challengerId) { setChallengeError('Bitte wähle aus wer du bist.'); return }

    const challenger = allPlayers.find(p => p.id === challengerId)
    if (!challenger) return

    setSubmitting(true)

    const { data: openChallenged } = await supabase
      .from('challenges').select('id')
      .eq('challenged_id', player.id)
      .in('status', ['PENDING', 'ACCEPTED'])

    if (openChallenged && openChallenged.length > 0) {
      setChallengeError(`${player.name} hat bereits eine offene Challenge. Bitte warte.`)
      setSubmitting(false)
      return
    }

    const monthStart = new Date()
    monthStart.setDate(1); monthStart.setHours(0,0,0,0)
    const { data: monthChallenges } = await supabase
      .from('challenges').select('id')
      .eq('challenger_id', challengerId)
      .gte('created_at', monthStart.toISOString())

    if (monthChallenges && monthChallenges.length >= 2) {
      setChallengeError('Limit erreicht: max. 2 Herausforderungen pro Monat.')
      setSubmitting(false)
      return
    }

    const { data: season } = await supabase
      .from('seasons').select('id').eq('active', true).single()

    const { error } = await supabase.from('challenges').insert({
      challenger_id: challengerId,
      challenged_id: player.id,
      status: 'PENDING',
      rank_challenger_before: challenger.rank,
      rank_challenged_before: player.rank,
      season_id: season?.id || null
    })

    setSubmitting(false)
    if (error) { setChallengeError('Fehler: ' + error.message); return }
    setChallengeSuccess(`Challenge eingetragen! ${challenger.name} fordert ${player.name} heraus. Jetzt per WhatsApp informieren!`)
    setChallengerId('')
  }

  function closeModal() {
    setShowChallenge(false)
    setChallengeError('')
    setChallengeSuccess('')
    setChallengerId('')
  }

  async function deleteResult(challenge) {
    if (!confirm(`Ergebnis wirklich löschen?\n${challenge.challenger?.name} vs ${challenge.challenged?.name}\n\nACHTUNG: Ränge werden nicht automatisch zurückgesetzt.`)) return
    setDeleting(challenge.id)
    const { error } = await supabase.from('challenges').delete().eq('id', challenge.id)
    setDeleting(null)
    if (error) { alert('Fehler: ' + error.message); return }
    fetchData()
  }

  if (loading) return <div className="page"><div className="spinner" /></div>
  if (!player) return <div className="page"><p>Spieler nicht gefunden.</p></div>

  const wins = history.filter(c => {
    const isChallenger = c.challenger_id === id
    return isChallenger ? c.sets_challenger > c.sets_challenged : c.sets_challenged > c.sets_challenger
  }).length
  const losses = history.length - wins
  const challengers = eligibleChallengers()

  return (
    <div className="page">
      <div className="header">
        <div className="header-logo">TTCD Ladder</div>
        <div className="header-sub">Spielerprofil</div>
      </div>

      <Link to="/" className="back-link">← Zurück zur Rangliste</Link>

      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
          <div className="rank-badge" style={{
            width: 52, height: 52, fontSize: '1.5rem',
            background: player.rank === 1 ? 'var(--gold)' : player.rank === 2 ? 'var(--silver)' : player.rank === 3 ? 'var(--bronze)' : 'var(--surface2)',
            color: player.rank <= 2 ? '#000' : 'var(--text)'
          }}>
            {player.rank}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '1.3rem', fontWeight: 600 }}>{player.name}</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', letterSpacing: 1 }}>Rang {player.rank}</div>
          </div>
          {challengers.length > 0 && (
            <button
              onClick={() => setShowChallenge(true)}
              style={{
                background: 'rgba(79,142,247,0.12)', border: '1px solid rgba(79,142,247,0.4)',
                borderRadius: 10, padding: '8px 16px', color: 'var(--accent)',
                cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600,
                flexShrink: 0, fontFamily: 'DM Sans, sans-serif', letterSpacing: 0.5
              }}
            >
              ⚔ Herausfordern
            </button>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <div className="stat-pill" style={{ minWidth: 70 }}>
            <div className="stat-pill-value" style={{ color: '#4ade80' }}>{wins}</div>
            <div className="stat-pill-label">Siege</div>
          </div>
          <div className="stat-pill" style={{ minWidth: 70 }}>
            <div className="stat-pill-value" style={{ color: 'var(--red)' }}>{losses}</div>
            <div className="stat-pill-label">Niederlagen</div>
          </div>
          <div className="stat-pill" style={{ minWidth: 70 }}>
            <div className="stat-pill-value">{history.length}</div>
            <div className="stat-pill-label">Spiele</div>
          </div>
          {history.length > 0 && (
            <div className="stat-pill" style={{ minWidth: 70 }}>
              <div className="stat-pill-value">{Math.round(wins / history.length * 100)}%</div>
              <div className="stat-pill-label">Siegquote</div>
            </div>
          )}
        </div>
      </div>

      <div className="section-title">Spielverlauf</div>

      {history.length === 0 ? (
        <div className="card" style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 32 }}>
          Noch keine Spiele eingetragen.
        </div>
      ) : (
        <div className="card">
          {history.map(c => {
            const isChallenger = c.challenger_id === id
            const myScore = isChallenger ? c.sets_challenger : c.sets_challenged
            const theirScore = isChallenger ? c.sets_challenged : c.sets_challenger
            const won = myScore > theirScore
            const opponent = isChallenger ? c.challenged : c.challenger
            const myRankBefore = isChallenger ? c.rank_challenger_before : c.rank_challenged_before
            const theirRankBefore = isChallenger ? c.rank_challenged_before : c.rank_challenger_before

            return (
              <div key={c.id} className="history-item" style={{ alignItems: 'flex-start' }}>
                <div className={`history-score ${won ? 'win' : 'loss'}`} style={{ paddingTop: 2 }}>
                  {myScore}:{theirScore}
                </div>
                <div style={{ flex: 1 }}>
                  <div className="history-opponent">
                    {won ? '⬆ ' : '⬇ '}
                    <Link to={`/player/${opponent?.id}`} style={{ color: 'var(--text)', textDecoration: 'none' }}>
                      {opponent?.name}
                    </Link>
                  </div>
                  <div className="history-rank-change">
                    Rang {myRankBefore} → {won ? theirRankBefore : myRankBefore}
                  </div>
                  <div className="history-date" style={{ marginTop: 2 }}>
                    {c.played_at ? new Date(c.played_at).toLocaleDateString('de-CH') : '—'}
                  </div>
                </div>
                <button
                  onClick={() => deleteResult(c)}
                  disabled={deleting === c.id}
                  style={{
                    background: 'none', border: '1px solid var(--border)', borderRadius: 8,
                    padding: '4px 10px', color: 'var(--text-muted)', cursor: 'pointer',
                    fontSize: '0.75rem', flexShrink: 0, opacity: deleting === c.id ? 0.4 : 1
                  }}
                >
                  🗑
                </button>
              </div>
            )
          })}
        </div>
      )}

      {showChallenge && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">⚔ {player.name} herausfordern</div>

            {challengeSuccess ? (
              <>
                <div className="alert alert-success">{challengeSuccess}</div>
                <button className="btn btn-primary" onClick={closeModal}>Schliessen</button>
              </>
            ) : (
              <>
                {challengeError && <div className="alert alert-error">{challengeError}</div>}
                <div className="form-group">
                  <label className="form-label">Wer bist du?</label>
                  <select className="form-select" value={challengerId} onChange={e => setChallengerId(e.target.value)}>
                    <option value="">— Spieler wählen —</option>
                    {challengers.map(p => (
                      <option key={p.id} value={p.id}>#{p.rank} {p.name}</option>
                    ))}
                  </select>
                </div>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.5 }}>
                  Nach dem Eintragen per WhatsApp informieren.<br/>
                  {player.name} hat 48h Zeit zu antworten.
                </p>
                <button className="btn btn-primary" onClick={submitChallenge} disabled={submitting || !challengerId}>
                  {submitting ? 'Wird eingetragen...' : '⚔ Challenge eintragen'}
                </button>
                <button className="btn btn-ghost" style={{ width: '100%', marginTop: 8 }} onClick={closeModal}>
                  Abbrechen
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
