import React, { useId, useState } from 'react'

export default function PracticeQuestion({ question, answer, onAnswer, title = 'Try a similar question' }) {
  const id = useId()
  const [selected, setSelected] = useState(answer?.choice ?? null)
  const [localAnswer, setLocalAnswer] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const checked = answer || localAnswer
  async function submit(event) {
    event.preventDefault()
    if (selected === null || checked || busy) return
    setBusy(true)
    setError('')
    try {
      if (onAnswer) await onAnswer(selected)
      else setLocalAnswer({ choice: selected, correct: selected === question.correctIndex })
    } catch (error) {
      setError(error.message)
    } finally {
      setBusy(false)
    }
  }
  return <form className="similar-practice" onSubmit={submit}>
    <h3>{title}</h3><p>{question.prompt}</p>
    <fieldset aria-label="Answer choices" disabled={!!checked || busy}>
      {question.choices.map((choice, index) => <label key={index}>
        <input type="radio" name={id} checked={selected === index} onChange={() => setSelected(index)}/>{choice}
      </label>)}
    </fieldset>
    {checked ? <p role="status"><strong>{checked.correct ? 'Correct.' : 'Keep practicing.'}</strong> {question.explanation}</p>
      : <button className="button secondary small" disabled={selected === null || busy}>{busy ? 'Checking…' : 'Check answer'}</button>}
    {error && <p role="alert">{error}</p>}
  </form>
}
