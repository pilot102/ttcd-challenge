import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabase'

const RULES = [
  { n: 1, text: 'Jeder darf max. 3 Plätze höher herausfordern.' },
  { n: 2, text: 'Jeder darf max. 2 Herausforderungen pro Monat machen.' },
  { n: 3, text: 'Das Spiel muss innert 21 Tagen ausgetragen werden, sonst W.O.-Sieg für Herausforderer.' },
  { n: 4, text: 'Spielmodus: Best of 5 Sätze.' },
  { n: 5, text: 'Sieger übernimmt Rang. Verlierer und Zwischenplätze rutschen zurück.' },
  { n: 6, text: 'Rückspiel erst nach 30 Tagen möglich.' },
  { n: 7, text: 'Laufzeit: September – Mai.' },
  { n: 8, text: 'Herausforderung per WhatsApp – Antwortpflicht innerhalb 48 Stunden (akzeptieren, Terminvorschlag oder W.O.).' },
]

export default function Ladder() {
  const [players, setPlayers] = useState([])
  const [openChallenges, setOpenChallenges] = useState([])
  const [loading, setLoading] = useState(true)
  const [showRules, setShowRules] = useState(false)

  useEffect(() => { fetchData() }, [])

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
        <Link to="/result">⚔ Challenge</Link>
        <button onClick={() => setShowRules(true)}>Regeln</button>
      </div>

      {loading ? (
        <div className="spinner" />
      ) : (
        <>
          <div className="ladder-list">
            {players.map(p => (
              <Link key={p.id} to={`/player/${p.id}`} className={getRowClass(p.rank, players.length)}>
                <div className="rank-badge">{p.rank}</div>
                <div className="player-name">{p.name}</div>
                {hasOpenChallenge(p.id) && <span className="challenge-badge">⚔ Challenge</span>}
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

          {/* Admin link versteckt unten */}
          <div style={{ textAlign: 'center', marginTop: 48 }}>
            <Link to="/admin" style={{ fontSize: '0.7rem', color: 'var(--border)', textDecoration: 'none', letterSpacing: 1 }}>
              ⚙ admin
            </Link>
          </div>
        </>
      )}

      {/* Regeln Modal */}
      {showRules && (
        <div className="modal-overlay" onClick={() => setShowRules(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">📋 Regeln</div>
            {RULES.map(r => (
              <div key={r.n} style={{ display: 'flex', gap: 14, marginBottom: 14, alignItems: 'flex-start' }}>
                <div style={{
                  minWidth: 28, height: 28, borderRadius: 8,
                  background: 'var(--accent)', color: '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: 'Bebas Neue, sans-serif', fontSize: '1rem', flexShrink: 0
                }}>{r.n}</div>
                <div style={{ fontSize: '0.9rem', lineHeight: 1.5, paddingTop: 4 }}>{r.text}</div>
              </div>
            ))}
            <button className="btn btn-ghost" style={{ width: '100%', marginTop: 8 }} onClick={() => setShowRules(false)}>
              Schliessen
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
