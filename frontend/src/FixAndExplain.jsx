import React, { useState } from 'react'
import { Link } from 'react-router-dom'

export default function FixAndExplain({ options, saved, onSave }) {
  const [selection, setSelection] = useState(saved ? saved.kind + ':' + saved.index : options[0].key)
  const [answer, setAnswer] = useState(saved?.answer || '')
  const [explanation, setExplanation] = useState(saved?.explanation || '')
  const [showComparison, setShowComparison] = useState(!!saved)
  const [savedKey, setSavedKey] = useState(saved ? saved.kind + ':' + saved.index : '')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const choice = options.find((option) => option.key === selection) || options[0]

  function choose(key) {
    setSelection(key)
    setAnswer(key === savedKey ? saved?.answer || '' : '')
    setExplanation(key === savedKey ? saved?.explanation || '' : '')
    setShowComparison(key === savedKey)
    setError('')
  }

  async function save(event) {
    event.preventDefault()
    if (pending || !answer.trim() || !explanation.trim()) return
    setPending(true)
    setError('')
    try {
      await onSave({ kind: choice.kind, index: choice.index, answer, explanation })
      setSavedKey(choice.key)
    } catch (error) {
      setError(error.message)
    } finally {
      setPending(false)
    }
  }

  return <section className="card retry-card" aria-label="Fix and Explain">
    <div className="section-head"><h2>Fix &amp; Explain</h2>{savedKey && <span className="grade-pill">Retry saved</span>}</div>
    <p>Try one item again, compare your work, then explain what you changed.</p>
    {options.length > 1 && <label className="retry-field">What would you like to retry?
      <select value={selection} disabled={pending} onChange={(event) => choose(event.target.value)}>
        {options.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
      </select>
    </label>}
    <div className="retry-prompt"><h3>{choice.prompt}</h3>
      <p><strong>Original work</strong> {choice.original}</p></div>
    <form className="retry-form" onSubmit={save}>
      <label>Your new {choice.kind === 'writing' ? 'sentence' : 'answer'}
        <textarea rows={3} required maxLength={1200} value={answer} disabled={pending}
          onChange={(event) => setAnswer(event.target.value)}/>
      </label>
      {!showComparison ? <button type="button" className="button secondary" disabled={!answer.trim()}
        onClick={() => setShowComparison(true)}>Compare my retry</button> : <>
        <div className="workshop-example retry-comparison">
          <div><h3>Your retry</h3><p>{answer}</p></div>
          <div><h3>{choice.kind === 'writing' ? 'One possible revision' : 'Reference answer'}</h3><p>{choice.reference}</p></div>
        </div>
        <p>{choice.reason}</p>
        <label>What did you change and why?
          <textarea rows={2} required maxLength={600} value={explanation} disabled={pending}
            onChange={(event) => setExplanation(event.target.value)}/>
        </label>
        {onSave ? <><p className="retry-note">One retry is saved with this sheet. It uses no grading credit.</p>
          {error && <p role="alert">{error}</p>}
          <button className="button primary" disabled={pending || !answer.trim() || !explanation.trim()}>
            {pending ? 'Saving…' : 'Save retry'}</button>
        </> : <Link className="button primary" to="/register">Try it with your own homework</Link>}
      </>}
    </form>
  </section>
}
