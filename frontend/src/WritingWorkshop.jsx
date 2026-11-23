import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { gradeLabel, gradeLevels } from './practice'

const lessons = {
  grammar: { title: 'Fix sentence boundaries', before: 'The bell rang we went outside.',
    after: 'The bell rang. We went outside.', why: 'Each sentence expresses one complete idea. Add an ending mark and start the next sentence with a capital letter.',
    tryIt: 'The dog barked the baby woke up.', sample: 'The dog barked. The baby woke up.' },
  language: { title: 'Make the meaning clear', before: 'When Mia told Ava about the race, she smiled.',
    after: 'Ava smiled when Mia told her about the race.', why: 'Naming who smiled makes it clear what happened.',
    tryIt: 'When Leo showed Max the drawing, he laughed.', sample: 'Max laughed when Leo showed him the drawing.' },
  vocabulary: { title: 'Choose more exact words', before: 'The bird went to the tree.',
    after: 'The sparrow flew to the tallest branch.', why: 'Precise nouns and verbs help the reader picture what happened.',
    tryIt: 'The animal moved across the ground.', sample: 'The rabbit hopped across the grass.' },
  organization: { title: 'Put ideas in order', before: 'Finally, we ate the bread. First, we mixed the dough.',
    after: 'First, we mixed the dough. Then, we baked it. Finally, we ate the bread.', why: 'Sequence words guide the reader through the events in order.',
    tryIt: 'I fed my fish. I opened the food jar first.', sample: 'First, I opened the food jar. Then I fed my fish.' },
  content: { title: 'Support your main idea', before: 'Our class should have a garden because it would be good.',
    after: 'Our class should have a garden because we could measure how much plants grow each week.', why: 'A specific reason explains why the idea matters.',
    tryIt: 'Our class should read outside because it would be fun.', sample: 'Our class should read outside because we could act out parts of the story on the playground.' },
}

export function WritingWorkshop({ initial, account, onAssess, error, progress }) {
  const [grade, setGrade] = useState(gradeLevels.includes(initial?.gradeLevel) ? initial.gradeLevel : 5)
  const [focus, setFocus] = useState(Object.hasOwn(lessons, initial?.focus) ? initial.focus : 'grammar')
  const [revision, setRevision] = useState('')
  const [parts, setParts] = useState({ idea: '', reason: '', example: '', ending: '' })
  const [checks, setChecks] = useState({})
  const lesson = lessons[focus]
  const early = grade <= 2
  const draft = [parts.idea, parts.reason, parts.example, parts.ending].map((part) => part.trim()).filter(Boolean).join(' ')
  const busy = progress !== null

  function submit(event) {
    event.preventDefault()
    const fields = new FormData(event.currentTarget)
    if (draft && !busy) onAssess({ draft, gradeLevel: grade, studentName: fields.get('studentName') })
  }

  return <><div className="page-head"><h1>Writing workshop</h1>
    <p>Practice one sentence, then build a paragraph and check your own draft.</p></div>
    <div className="card workshop-controls">
      <label>Grade level<select value={grade} disabled={busy} onChange={(event) => setGrade(Number(event.target.value))}>
        {gradeLevels.map((level) => <option key={level} value={level}>{gradeLabel(level)}</option>)}
      </select></label>
      <label>Practice skill<select value={focus} onChange={(event) => { setFocus(event.target.value); setRevision('') }}>
        {Object.entries(lessons).map(([key, item]) => <option key={key} value={key}>{item.title}</option>)}
      </select></label>
    </div>
    {initial?.suggestion && <p className="workshop-focus"><strong>From your writing feedback</strong> {initial.suggestion}</p>}
    <section className="card workshop-section">
      <h2>Revise a sentence</h2>
      <div className="workshop-example">
        <div><h3>Before</h3><p>{lesson.before}</p></div>
        <div><h3>After</h3><p>{lesson.after}</p></div>
      </div>
      <p>{lesson.why}</p>
      <label className="workshop-field">Your turn · {lesson.tryIt}
        <textarea rows={2} maxLength={600} placeholder="Write your revision here" value={revision}
          onChange={(event) => setRevision(event.target.value)}/>
      </label>
      {revision.trim() && <><p className="workshop-hint">Read the original and your revision out loud. What changed, and did you keep the original meaning?</p>
        <details key={focus} className="workshop-sample"><summary>Compare with one possible revision</summary>
          <p>{lesson.sample}</p></details></>}
    </section>
    <section className="card workshop-section">
      <h2>Build a paragraph</h2>
      <p>{early ? 'What game do you like to play? Say why you like it and describe one fun part.'
        : 'Should your class spend more time learning outdoors? Give an opinion and support it with a reason and an example.'}</p>
      <form className="workshop-form" onSubmit={submit}>
        <div className="workshop-parts">
          {[
            ['idea', early ? 'What I think' : 'Topic sentence', early ? 'My favorite game is…' : 'I think our class should…'],
            ['reason', 'Reason', early ? 'I like it because…' : 'One reason is…'],
            ['example', 'Specific detail', early ? 'One fun part is…' : 'For example…'],
            ['ending', 'Closing sentence', early ? 'That is why…' : 'That is why I think…'],
          ].map(([key, label, placeholder]) => <label key={key}>{label}
            <textarea rows={2} maxLength={700} disabled={busy} placeholder={placeholder} value={parts[key]}
              onChange={(event) => {
                setParts({ ...parts, [key]: event.target.value })
                setChecks({})
              }}/>
          </label>)}
        </div>
        {draft && <div className="workshop-draft"><h3>Read your draft out loud</h3><p>{draft}</p></div>}
        {draft && <fieldset className="workshop-checklist"><legend>Before you finish</legend>
          {['My first sentence tells my main idea.', 'I added a reason or example.', 'I checked capitals and punctuation.'].map((check) =>
            <label key={check}><input type="checkbox" checked={!!checks[check]}
              onChange={(event) => setChecks({ ...checks, [check]: event.target.checked })}/>{check}</label>)}
        </fieldset>}
        {account ? <>
          {draft && <><label>Student nickname<input name="studentName" maxLength={40} required disabled={busy}
            defaultValue={initial?.studentName || ''} placeholder="e.g. Alex"/></label>
            <p className="workshop-hint">Grading uses one sheet and saves the result in Student History.</p></>}
          {error && <p role="alert">{error}</p>}
          <button className="button primary" disabled={!draft || busy}>{busy ? 'Submitting draft…' : 'Grade my draft'}</button>
        </> : <div className="workshop-signup">
          <p>Want feedback on your child’s own draft? Start with five free grades and track their writing progress in one place.</p>
          <Link className="button primary" to="/register">Start grading free</Link>
        </div>}
      </form>
    </section>
  </>
}
