import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabase'

export default function EnterResult() {
  const [players, setPlayers] = useState([])
  const [challenges, setChallenges] = useState([])
  const [mode, setMode] = useState('challenge') // 'challenge' | 'result'

  // Challenge form
  const [challengerId, setChallengerId] = useState('')
  const [challengedId, setChallengedId] = useState('')
  const [challengeError, setChallengeError] = useState('')
  const [challengeSuccess, setChallengeSuccess] = useState('')

  // Result form
  const [selectedChallenge, setSelectedChallenge] = useState('')
  const [setsA, setSetsA] = useState('')
  const [setsB, setSetsB] = useState('')
  const [playedAt, setPlayedAt] = useState(new Date().toISOString().split('T')[0])
  const [resultError, setResultError] = useState('')
  const [resultSuccess, setResultSuccess] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    const [{ data: p }, { data: c }] = await Promise.all([
      supabase.from('players').select('*').eq('active', true).order('rank'),
      supabase.from('challenges')
        .select('*, challenger:challenger_id(id, name, rank), challenged:challenged_id(id, name, rank)')
        .in('status', ['PENDING', 'ACCEPTED'])
        .order('created_at', { ascending: false })
    ])
    setPlayers(p || [])
    setChallenges(c || [])
  }

  // Validation for new challenge
  function validateChallenge() {
    if (!challengerId || !challengedId) return 'Bitte beide Spieler auswählen.'
    if (challengerId === challengedId) return 'Nicht gegen sich selbst!'
    const challenger = players.find(p => p.id === challengerId)
    const challenged = players.find(p => p.id === challengedId)
    if (!challenger || !challenged) return 'Spieler nicht gefunden.'
    if (challenger.rank === 1) return 'Rang 1 kann niemanden herausfordern.'
    if (challenged.rank >= challenger.rank) return 'Du kannst nur höher gerankte Spieler herausfordern (kleinere Rangnummer).'
    if (challenger.rank - challenged.rank > 3) return `Nur max. 3 Plätze höher herausfordern. ${challenged.name} ist ${challenger.rank - challenged.rank} Plätze entfernt.`

    // Check if challenged already has open challenge
    const challengedHasOpen = challenges.some(c => c.challenged_id === challengedId)
    if (challengedHasOpen) return `${challenged.name} hat bereits eine offene Challenge. Bitte warte bis diese abgeschlossen ist.`

    // Check challenger monthly limit (2/month)
    // We'll check this server-side would be ideal, but for now just show warning
    return null
  }

  async function submitChallenge() {
    setChallengeError('')
    setChallengeSuccess('')
    const err = validateChallenge()
    if (err) { setChallengeError(err); return }

    const challenger = players.find(p => p.id === challengerId)
    const challenged = players.find(p => p.id === challengedId)

    // Check monthly limit
    const monthStart = new Date()
    monthStart.setDate(1); monthStart.setHours(0,0,0,0)
    const { data: monthChallenges } = await supabase
      .from('challenges')
      .select('id')
      .eq('challenger_id', challengerId)
      .gte('created_at', monthStart.toISOString())

    if (monthChallenges && monthChallenges.length >= 2) {
      setChallengeError('Limit erreicht: max. 2 Herausforderungen pro Monat.')
      return
    }

    setSubmitting(true)
    const { error } = await supabase.from('challenges').insert({
      challenger_id: challengerId,
      challenged_id: challengedId,
      status: 'PENDING',
      rank_challenger_before: challenger.rank,
      rank_challenged_before: challenged.rank,
      season_id: await getActiveSeasonId()
    })

    setSubmitting(false)
    if (error) { setChallengeError('Fehler: ' + error.message); return }
    setChallengeSuccess(`Challenge von ${challenger.name} gegen ${challenged.name} eingetragen! Jetzt WhatsApp schicken ⚔`)
    setChallengerId('')
    setChallengedId('')
    fetchData()
  }

  async function getActiveSeasonId() {
    const { data } = await supabase.from('seasons').select('id').eq('active', true).single()
    return data?.id || null
  }

  async function submitResult() {
    setResultError('')
    setResultSuccess('')

    const sa = parseInt(setsA)
    const sb = parseInt(setsB)

    if (!selectedChallenge) { setResultError('Bitte eine Challenge auswählen.'); return }
    if (isNaN(sa) || isNaN(sb)) { setResultError('Bitte Sätze eingeben.'); return }
    if (sa < 0 || sb < 0 || sa > 3 || sb > 3) { setResultError('Sätze müssen zwischen 0 und 3 liegen.'); return }
    if (sa === sb) { setResultError('Kein Unentschieden möglich (Best of 5).'); return }
    if (sa !== 3 && sb !== 3) { setResultError('Der Gewinner muss 3 Sätze haben.'); return }
    if (!playedAt) { setResultError('Bitte Datum eingeben.'); return }

    const challenge = challenges.find(c => c.id === selectedChallenge)
    if (!challenge) { setResultError('Challenge nicht gefunden.'); return }

    setSubmitting(true)

    const challengerWon = sa > sb
    const winnerId = challengerWon ? challenge.challenger_id : challenge.challenged_id
    const loserId = challengerWon ? challenge.challenged_id : challenge.challenger_id
    const winnerRankBefore = challengerWon ? challenge.challenger.rank : challenge.challenged.rank
    const loserRankBefore = challengerWon ? challenge.challenged.rank : challenge.challenger.rank

    // Update challenge record
    const { error: challengeErr } = await supabase
      .from('challenges')
      .update({
        status: 'PLAYED',
        sets_challenger: sa,
        sets_challenged: sb,
        played_at: playedAt
      })
      .eq('id', selectedChallenge)

    if (challengeErr) { setSubmitting(false); setResultError('Fehler: ' + challengeErr.message); return }

    // Update ranks if challenger won (challenger takes challenged's rank, everyone in between shifts down)
    if (challengerWon && winnerRankBefore > loserRankBefore) {
      // Shift players between loserRankBefore and winnerRankBefore down by 1
      const { error: shiftErr } = await supabase.rpc('update_ranks_after_challenge', {
        winner_id: winnerId,
        new_rank: loserRankBefore,
        old_rank: winnerRankBefore
      })
      if (shiftErr) {
        // Fallback: manual rank update
        await manualRankUpdate(winnerId, loserRankBefore, winnerRankBefore)
      }
    }
    // If challenged wins, no rank change

    setSubmitting(false)
    setResultSuccess(`Resultat eingetragen! ${challenge.challenger.name} ${sa}:${sb} ${challenge.challenged.name}`)
    setSelectedChallenge('')
    setSetsA('')
    setSetsB('')
    fetchData()
  }

  async function manualRankUpdate(winnerId, newRank, oldRank) {
    // Get all players between newRank and oldRank-1 and shift them down
    const { data: toShift } = await supabase
      .from('players')
      .select('id, rank')
      .gte('rank', newRank)
      .lt('rank', oldRank)

    for (const p of (toShift || [])) {
      await supabase.from('players').update({ rank: p.rank + 1 }).eq('id', p.id)
    }
    // Set winner's new rank
    await supabase.from('players').update({ rank: newRank }).eq('id', winnerId)
  }

  const selectedC = challenges.find(c => c.id === selectedChallenge)

  return (
    <div className="page">
      <div className="header">
        <div className="header-logo">TTCD Ladder</div>
        <div className="header-sub">Eintragen</div>
      </div>

      <div className="nav">
        <Link to="/">Rangliste</Link>
        <Link to="/result" className="active">Eintragen</Link>
        <Link to="/admin">Admin</Link>
      </div>

      {/* Mode toggle */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        <button
          className="btn"
          style={{ flex: 1, background: mode === 'challenge' ? 'var(--accent)' : 'var(--surface)', color: mode === 'challenge' ? '#fff' : 'var(--text-muted)', border: '1px solid var(--border)' }}
          onClick={() => setMode('challenge')}
        >
          ⚔ Neue Challenge
        </button>
        <button
          className="btn"
          style={{ flex: 1, background: mode === 'result' ? 'var(--accent)' : 'var(--surface)', color: mode === 'result' ? '#fff' : 'var(--text-muted)', border: '1px solid var(--border)' }}
          onClick={() => setMode('result')}
        >
          🏓 Resultat
        </button>
      </div>

      {mode === 'challenge' && (
        <div className="card">
          <div className="section-title" style={{ margin: '0 0 16px' }}>Neue Herausforderung</div>

          {challengeError && <div className="alert alert-error">{challengeError}</div>}
          {challengeSuccess && <div className="alert alert-success">{challengeSuccess}</div>}

          <div className="form-group">
            <label className="form-label">Herausforderer</label>
            <select className="form-select" value={challengerId} onChange={e => setChallengerId(e.target.value)}>
              <option value="">— Spieler wählen —</option>
              {players.filter(p => p.rank > 1).map(p => (
                <option key={p.id} value={p.id}>#{p.rank} {p.name}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Herausgeforderter</label>
            <select className="form-select" value={challengedId} onChange={e => setChallengedId(e.target.value)}>
              <option value="">— Spieler wählen —</option>
              {players.filter(p => {
                if (!challengerId) return true
                const challenger = players.find(x => x.id === challengerId)
                if (!challenger) return true
                return p.rank < challenger.rank && challenger.rank - p.rank <= 3
              }).map(p => (
                <option key={p.id} value={p.id}>#{p.rank} {p.name}</option>
              ))}
            </select>
          </div>

          <button className="btn btn-primary" onClick={submitChallenge} disabled={submitting}>
            {submitting ? 'Wird eingetragen...' : '⚔ Challenge eintragen'}
          </button>

          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 12, textAlign: 'center' }}>
            Danach per WhatsApp informieren · Max. 3 Plätze höher · Max. 2/Monat
          </p>
        </div>
      )}

      {mode === 'result' && (
        <div className="card">
          <div className="section-title" style={{ margin: '0 0 16px' }}>Resultat eintragen</div>

          {resultError && <div className="alert alert-error">{resultError}</div>}
          {resultSuccess && <div className="alert alert-success">{resultSuccess}</div>}

          {challenges.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '20px 0' }}>
              Keine offenen Challenges vorhanden.
            </p>
          ) : (
            <>
              <div className="form-group">
                <label className="form-label">Challenge</label>
                <select className="form-select" value={selectedChallenge} onChange={e => setSelectedChallenge(e.target.value)}>
                  <option value="">— Challenge wählen —</option>
                  {challenges.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.challenger?.name} vs {c.challenged?.name}
                    </option>
                  ))}
                </select>
              </div>

              {selectedC && (
                <div className="form-group">
                  <label className="form-label">Sätze (Best of 5)</label>
                  <div className="score-row">
                    <span className="score-name">{selectedC.challenger?.name}</span>
                    <input
                      type="number" min="0" max="3"
                      className="score-input"
                      value={setsA}
                      onChange={e => setSetsA(e.target.value)}
                      placeholder="0"
                    />
                    <span className="score-vs">:</span>
                    <input
                      type="number" min="0" max="3"
                      className="score-input"
                      value={setsB}
                      onChange={e => setSetsB(e.target.value)}
                      placeholder="0"
                    />
                    <span className="score-name">{selectedC.challenged?.name}</span>
                  </div>
                </div>
              )}

              <div className="form-group">
                <label className="form-label">Datum des Spiels</label>
                <input
                  type="date"
                  className="form-input"
                  value={playedAt}
                  onChange={e => setPlayedAt(e.target.value)}
                />
              </div>

              <button className="btn btn-primary" onClick={submitResult} disabled={submitting || !selectedChallenge}>
                {submitting ? 'Wird gespeichert...' : '🏓 Resultat speichern'}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
