import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../supabase'

export default function PlayerProfile() {
  const { id } = useParams()
  const [player, setPlayer] = useState(null)
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState(null)

  useEffect(() => { fetchData() }, [id])

  async function fetchData() {
    const [{ data: playerData }, { data: challengesData }] = await Promise.all([
      supabase.from('players').select('*').eq('id', id).single(),
      supabase.from('challenges')
        .select('*, challenger:challenger_id(id, name, rank), challenged:challenged_id(id, name, rank)')
        .eq('status', 'PLAYED')
        .or(`challenger_id.eq.${id},challenged_id.eq.${id}`)
        .order('played_at', { ascending: false })
    ])
    setPlayer(playerData)
    setHistory(challengesData || [])
    setLoading(false)
  }

  async function deleteResult(challenge) {
    if (!confirm(`Ergebnis wirklich löschen?\n${challenge.challenger?.name} vs ${challenge.challenged?.name}\n\nACHTUNG: Die Ränge werden NICHT automatisch zurückgesetzt – bitte manuell via Admin korrigieren falls nötig.`)) return

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
          <div>
            <div style={{ fontSize: '1.3rem', fontWeight: 600 }}>{player.name}</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', letterSpacing: 1 }}>Rang {player.rank}</div>
          </div>
        </div>

        {/* Stats – wrap on mobile */}
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
                    background: 'none', border: '1px solid var(--border)',
                    borderRadius: 8, padding: '4px 10px', color: 'var(--text-muted)',
                    cursor: 'pointer', fontSize: '0.75rem', flexShrink: 0,
                    opacity: deleting === c.id ? 0.4 : 1
                  }}
                >
                  🗑
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
