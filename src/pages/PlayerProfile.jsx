import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../supabase'

export default function PlayerProfile() {
  const { id } = useParams()
  const [player, setPlayer] = useState(null)
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchData()
  }, [id])

  async function fetchData() {
    const [{ data: playerData }, { data: challengesData }] = await Promise.all([
      supabase.from('players').select('*').eq('id', id).single(),
      supabase.from('challenges')
        .select('*, challenger:challenger_id(id, name), challenged:challenged_id(id, name)')
        .eq('status', 'PLAYED')
        .or(`challenger_id.eq.${id},challenged_id.eq.${id}`)
        .order('played_at', { ascending: false })
    ])
    setPlayer(playerData)
    setHistory(challengesData || [])
    setLoading(false)
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
          <div className="rank-badge" style={{ width: 52, height: 52, fontSize: '1.5rem',
            background: player.rank === 1 ? 'var(--gold)' : player.rank === 2 ? 'var(--silver)' : player.rank === 3 ? 'var(--bronze)' : 'var(--surface2)',
            color: player.rank <= 2 ? '#000' : 'var(--text)'
          }}>
            {player.rank}
          </div>
          <div>
            <div style={{ fontSize: '1.3rem', fontWeight: 600 }}>{player.name}</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', letterSpacing: 1 }}>
              Rang {player.rank}
            </div>
          </div>
        </div>

        <div className="stats-row">
          <div className="stat-pill">
            <div className="stat-pill-value" style={{ color: '#4ade80' }}>{wins}</div>
            <div className="stat-pill-label">Siege</div>
          </div>
          <div className="stat-pill">
            <div className="stat-pill-value" style={{ color: 'var(--red)' }}>{losses}</div>
            <div className="stat-pill-label">Niederlagen</div>
          </div>
          <div className="stat-pill">
            <div className="stat-pill-value">{history.length}</div>
            <div className="stat-pill-label">Spiele</div>
          </div>
          {history.length > 0 && (
            <div className="stat-pill">
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
              <div key={c.id} className="history-item">
                <div className={`history-score ${won ? 'win' : 'loss'}`}>
                  {myScore}:{theirScore}
                </div>
                <div>
                  <div className="history-opponent">
                    {won ? '⬆ ' : '⬇ '}
                    <Link to={`/player/${opponent?.id}`} style={{ color: 'var(--text)', textDecoration: 'none' }}>
                      {opponent?.name}
                    </Link>
                  </div>
                  <div className="history-rank-change">
                    Rang {myRankBefore} → {theirRankBefore && won ? theirRankBefore : myRankBefore}
                  </div>
                </div>
                <div className="history-date">
                  {c.played_at ? new Date(c.played_at).toLocaleDateString('de-CH') : '—'}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
