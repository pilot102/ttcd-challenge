import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabase'

export default function Ladder() {
  const [players, setPlayers] = useState([])
  const [openChallenges, setOpenChallenges] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchData()
  }, [])

  async function fetchData() {
    const [{ data: playersData }, { data: challengesData }] = await Promise.all([
      supabase.from('players').select('*').eq('active', true).order('rank'),
      supabase.from('challenges').select('*, challenger:challenger_id(name), challenged:challenged_id(name)')
        .in('status', ['PENDING', 'ACCEPTED'])
    ])
    setPlayers(playersData || [])
    setOpenChallenges(challengesData || [])
    setLoading(false)
  }

  function getRowClass(rank, totalPlayers) {
    if (rank === 1) return 'ladder-row rank-1'
    if (rank === 2) return 'ladder-row rank-2'
    if (rank === 3) return 'ladder-row rank-3'
    if (rank === totalPlayers) return 'ladder-row rank-last'
    return 'ladder-row'
  }

  function hasOpenChallenge(playerId) {
    return openChallenges.some(c => c.challenger_id === playerId || c.challenged_id === playerId)
  }

  function daysLeft(deadline) {
    const diff = new Date(deadline) - new Date()
    return Math.ceil(diff / (1000 * 60 * 60 * 24))
  }

  return (
    <div className="page">
      <div className="header">
        <div className="header-logo">TTCD Ladder</div>
        <div className="header-sub">Club Challenge · Tischtennisclub Düdingen</div>
      </div>

      <div className="nav">
        <Link to="/" className="active">Rangliste</Link>
        <Link to="/result">Resultat eintragen</Link>
        <Link to="/admin">Admin</Link>
      </div>

      {loading ? (
        <div className="spinner" />
      ) : (
        <>
          <div className="ladder-list">
            {players.map(p => (
              <Link
                key={p.id}
                to={`/player/${p.id}`}
                className={getRowClass(p.rank, players.length)}
              >
                <div className="rank-badge">{p.rank}</div>
                <div className="player-name">{p.name}</div>
                {hasOpenChallenge(p.id) && (
                  <span className="challenge-badge">⚔ Challenge</span>
                )}
              </Link>
            ))}
          </div>

          {openChallenges.length > 0 && (
            <>
              <div className="section-title">Offene Challenges</div>
              <div className="card">
                {openChallenges.map(c => {
                  const days = daysLeft(c.deadline_play)
                  return (
                    <div key={c.id} className="open-challenge-row">
                      <div>
                        <strong>{c.challenger?.name}</strong>
                        <span style={{ color: 'var(--text-muted)' }}> fordert </span>
                        <strong>{c.challenged?.name}</strong>
                        <span style={{ color: 'var(--text-muted)' }}> heraus</span>
                      </div>
                      <div className={days <= 5 ? 'deadline-warn' : 'deadline-ok'}>
                        {days > 0 ? `${days}T verbleibend` : 'Abgelaufen'}
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
