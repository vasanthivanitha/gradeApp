import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Link, NavLink, Navigate, Outlet, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom'
import { AlertCircle, BookOpen, Camera, Check, ChevronDown, CircleCheck, CreditCard, FileCheck2, FileText, Files, FolderClock, GraduationCap, LockKeyhole, LogOut, ScanLine, ShieldCheck, Sparkles, Trash2, UploadCloud, X } from 'lucide-react'
import { config, login, register, request, resend, reset, session, signOut, upload, verify } from './auth'
import '@fontsource-variable/sora'
import '@fontsource-variable/jetbrains-mono'
import { gradeLabel, gradeLevels, progressFor, subjects } from './practice'
import { WritingWorkshop } from './WritingWorkshop'
import { prepareSheetPhoto } from './sheetPhoto'
import FixAndExplain from './FixAndExplain'
import './style.css'

const AppContext = createContext(null)
const formats = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
  pdf: 'application/pdf', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
}
const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 })
const date = (unix) => new Date(unix * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

function Brand() {
  return <Link to="/" className="brand"><span><GraduationCap size={21}/></span>Grade<span className="brand-ai">AI</span></Link>
}

function PublicHeader() {
  const { account } = useContext(AppContext)
  return <header className="header"><div className="nav-width"><Brand/><nav aria-label="Main navigation">
    <NavLink to="/writing-practice">Writing practice</NavLink>
    <NavLink to="/pricing">Pricing</NavLink>
    {account ? <Link className="button primary small" to="/grade">Dashboard</Link> : <><Link to="/login">Sign in</Link><Link className="button primary small" to="/register">Start free</Link></>}
  </nav></div></header>
}

function Footer() {
  return <footer className="footer content-width"><Brand/><nav aria-label="Policies"><Link to="/terms">Terms</Link><Link to="/privacy">Privacy</Link><Link to="/refund">Refunds</Link></nav></footer>
}

function Landing() {
  const { account } = useContext(AppContext)
  return <><PublicHeader/><main>
    <div className="hero-grid content-width">
      <section className="hero-copy">
        <div className="eyebrow"><Sparkles size={15}/> AI FEEDBACK FOR HOME LEARNING</div>
        <h1>Grade smarter.<br/><span>Learn together.</span></h1>
        <p>Turn your child’s answer sheets into clear scores and step-by-step feedback. Let your child retry a missed answer, explain what changed, and save the result for later.</p>
        <div className="actions"><Link className="button primary" to={account ? '/grade' : '/register'}>{account ? 'Grade a sheet' : 'Start grading free'}</Link><Link className="button secondary" to={account ? '/practice' : '/writing-practice'}>Try writing practice</Link></div>
        <div className="hero-note"><CircleCheck size={16}/> {config.unlimitedTrial ? 'Free testing' : '5 free sheets'} <span>·</span> No credit card required</div>
      </section>
      <div className="hero-art" aria-hidden="true">
        <div className="art-light"></div>
        <div className="paper">
          <div className="paper-head"><span className="paper-icon"><FileText size={19}/></span><div><strong>Answer sheet</strong><small>Photo, PDF, or Word document</small></div></div>
          <div className="paper-line long"></div><div className="paper-line medium"></div>
          <div className="paper-row"><div className="paper-box"></div><div className="paper-line"></div><Check size={17}/></div>
          <div className="paper-row"><div className="paper-box"></div><div className="paper-line"></div><Check size={17}/></div>
          <div className="paper-row"><div className="paper-box"></div><div className="paper-line"></div><Check size={17}/></div>
          <span className="scan-corner"></span>
        </div>
        <div className="art-badge art-scan"><ScanLine size={21}/></div>
        <div className="art-badge art-feedback"><span><Sparkles size={20}/></span><div><strong>Per-question feedback</strong><small>Corrections and explanations</small></div></div>
      </div>
    </div>
    <section className="card content-width retry-demo-invite">
      <div><h2>One mistake can turn into a better answer</h2><p>Try Fix &amp; Explain with a sample question. No account needed.</p></div>
      <Link className="button secondary" to="/try-a-retry">Try an example</Link>
    </section>
    <section className="feature-section content-width" aria-labelledby="features"><h2 id="features">From upload to understanding</h2>
      <div className="feature-grid">
        <Feature icon={UploadCloud} title="Upload any answer sheet">Use your phone camera or upload a PDF or Word document for English, Math, or Science in grades K–5.</Feature>
        <Feature icon={FileCheck2} title="Get a score and clear feedback">See the grade, correct answers, and an explanation for each mistake.</Feature>
        <Feature icon={BookOpen} title="Review progress together">Reopen past sheets by student and turn mistakes into practice.</Feature>
      </div>
    </section>
  </main><Footer/></>
}

function Feature({ icon: Icon, title, children }) {
  return <article className="feature card"><span className="tile"><Icon size={21}/></span><h3>{title}</h3><p>{children}</p></article>
}

function Notice({ text, neutral = false }) {
  return text && <div className={neutral ? 'notice neutral' : 'notice'} role={neutral ? 'status' : 'alert'}><AlertCircle size={17}/><span>{text}</span></div>
}

function Pricing({ modal = false }) {
  const { account, call } = useContext(AppContext)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  const [month, year] = config.plans
  const savings = month.price && year.price ? Math.floor((1 - year.price / (month.price * 12)) * 100) : null
  async function checkout(plan) {
    setBusy(plan)
    setError('')
    try {
      const result = await call('/billing/checkout', { method: 'POST', body: { plan } })
      window.location.assign(result.url)
    } catch (error) {
      setBusy('')
      setError(error.message)
    }
  }
  const cards = <><Notice text={error}/><div className="pricing-grid">
    <article className="card plan"><span className="tile"><Sparkles size={19}/></span><h2>Free trial</h2>
      <p className="price">$0</p><p>{config.unlimitedTrial ? 'Free grading during testing' : '5 sheets total'}</p><p>No payment card required.</p>
      {!account && <Link className="button secondary" to="/register">Start free</Link>}
    </article>
    {config.plans.map((plan) => <article className={'card plan ' + (plan.id === 'yearly' ? 'yearly' : '')} key={plan.id}>
      <span className="tile"><CreditCard size={19}/></span><h2>{plan.name}</h2>
      <p className="price">{plan.price ? currency.format(plan.price) : '—'} <small>/{plan.id === 'yearly' ? 'year' : 'month'}</small></p>
      <p>{plan.quota} sheets per month</p>
      <p>{plan.id === 'yearly' && savings > 0 ? 'Save ' + savings + '% compared with monthly billing.' : plan.id === 'yearly' ? 'Billed annually.' : 'Billed monthly.'}</p>
      {account ? <button className={'button ' + (plan.id === 'yearly' ? 'primary' : 'secondary')} disabled={!!busy || !plan.price} onClick={() => checkout(plan.id)}>
        {busy === plan.id ? 'Opening checkout…' : 'Choose ' + plan.name}</button> :
        <Link className="button secondary" to={'/register?plan=' + plan.id}>Choose {plan.name}</Link>}
    </article>)}
  </div></>
  return modal ? cards : <><PublicHeader/><main className="content-width page"><div className="page-head"><h1>Pick your grading plan</h1><p>{config.unlimitedTrial ? 'Try grading for free during testing.' : 'Start with five free sheets. Upgrade when you need more.'}</p></div>{cards}</main><Footer/></>
}

function AuthPage({ mode }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { setAccount } = useContext(AppContext)
  const [email, setEmail] = useState(location.state?.email || '')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [sent, setSent] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const next = new URLSearchParams(location.search).get('plan') ? '/pricing' : '/grade'
  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    setMessage('')
    try {
      if (mode === 'register') {
        await register(email, password)
        navigate('/verify' + location.search, { state: { email } })
      } else if (mode === 'verify') {
        await verify(email, code)
        navigate('/login' + location.search, { state: { email, verified: true } })
      } else if (mode === 'reset') {
        await reset(email, sent ? code : null, password)
        if (sent) navigate('/login', { state: { email } })
        else {
          setSent(true)
          setMessage('If the account exists, a reset code was sent.')
        }
      } else {
        const current = await login(email, password)
        setAccount(current.getIdToken().payload.email)
        navigate(next)
      }
    } catch (error) {
      if (error.code === 'UserNotConfirmedException') navigate('/verify' + location.search, { state: { email } })
      else setError(error.message)
    } finally { setBusy(false) }
  }
  async function resendCode() {
    if (!email) return setError('Enter your email address first.')
    setBusy(true)
    setError('')
    try {
      await resend(email)
      setMessage('A new verification code was sent.')
    } catch (error) { setError(error.message) }
    finally { setBusy(false) }
  }
  const titles = { register: 'Create your parent account', login: 'Welcome back', verify: 'Verify your email', reset: 'Reset your password' }
  const descriptions = { register: config.unlimitedTrial ? 'Try grading for free during testing.' : 'Start with five free answer sheets.', login: 'Sign in to review and grade answer sheets.', verify: 'Enter the code sent to your email address.', reset: 'Use the email address on your parent account.' }
  return <><PublicHeader/><main className="auth-wrap"><section className="card auth">
    <span className="tile"><LockKeyhole size={20}/></span><h1>{titles[mode]}</h1><p>{descriptions[mode]}</p>
    <Notice text={error}/><Notice text={message || (location.state?.verified ? 'Email verified. You can now sign in.' : '')} neutral/>
    <form onSubmit={submit}>
      <label>Email address<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email"/></label>
      {(mode === 'verify' || (mode === 'reset' && sent)) && <label>Verification code<input value={code} onChange={(event) => setCode(event.target.value)} required pattern="[0-9]{6}" inputMode="numeric" autoComplete="one-time-code"/></label>}
      {(mode === 'login' || mode === 'register' || (mode === 'reset' && sent)) && <label>Password
        <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={mode === 'login' ? undefined : 12} required autoComplete={mode === 'login' ? 'current-password' : 'new-password'}/>
        {mode !== 'login' && <small>Use at least 12 characters including upper and lower case letters and a number.</small>}
      </label>}
      {mode === 'register' && <label className="check"><input type="checkbox" required/> <span>I am the parent or guardian and agree to the <Link to="/terms">Terms</Link> and <Link to="/privacy">Privacy Policy</Link>.</span></label>}
      <button disabled={busy} className="button primary">{busy ? 'Please wait…' : ({ login: 'Sign in', register: 'Create account', verify: 'Verify email', reset: sent ? 'Set new password' : 'Send reset code' })[mode]}</button>
      {mode === 'verify' && <button type="button" className="button text-button" disabled={busy} onClick={resendCode}>Resend code</button>}
    </form>
    {mode === 'login' ? <div className="auth-links"><Link to="/register">Create an account</Link><Link to="/reset">Forgot password?</Link></div> : <Link to={'/login' + location.search}>Back to sign in</Link>}
  </section></main><Footer/></>
}

function usageText(usage) {
  if (usage.unlimited) return 'Free grading during testing'
  if (usage.plan === 'trial') return usage.remaining + ' of ' + usage.limit + ' free sheets left'
  return usage.used + ' of ' + usage.limit + ' used' + (usage.renewal ? ', renews ' + date(usage.renewal) : '')
}

function Usage({ usage }) {
  if (!usage) return null
  return <div className="usage card"><span className="tile"><Files size={19}/></span><div><strong>{usageText(usage)}</strong>
    <p>{usage.unlimited ? 'Daily upload limit applies.' : ['past_due', 'canceled', 'unpaid'].includes(usage.subscriptionStatus) ? 'Your subscription is inactive.' : 'Your grading allowance'}</p></div>
    {!usage.unlimited && <div className="usage-track" role="progressbar" aria-label="Grading allowance used" aria-valuemin={0} aria-valuemax={usage.limit} aria-valuenow={Math.min(usage.limit, usage.used)}><span style={{width: Math.min(100, usage.used / usage.limit * 100) + '%'}}/></div>}
    <Link to={usage.plan === 'trial' && !usage.hasBillingAccount ? '/pricing' : '/billing'}>{usage.plan === 'trial' && !usage.hasBillingAccount ? 'View plans' : 'Billing'}</Link>
  </div>
}

function Dashboard() {
  const { account, ready, setAccount, usage, refresh } = useContext(AppContext)
  const navigate = useNavigate()
  const location = useLocation()
  useEffect(() => { if (account) refresh().catch(() => {}) }, [account, location.pathname, refresh])
  if (!ready) return <main className="page content-width" role="status">Loading your account…</main>
  if (!account) return <Navigate to="/login" replace/>
  async function leave() {
    await signOut()
    setAccount(null)
    navigate('/')
  }
  return <><header className="header"><div className="nav-width"><Brand/><nav className="dashboard-nav" aria-label="Dashboard">
    <NavLink to="/grade"><UploadCloud size={17}/>Grade Sheet</NavLink>
    <NavLink to="/history"><FolderClock size={17}/>History</NavLink>
    <NavLink to="/practice"><BookOpen size={17}/>Writing Practice</NavLink>
    <NavLink to="/billing"><CreditCard size={17}/>Billing</NavLink>
    <button className="button text-button" onClick={leave}><LogOut size={17}/>Sign Out</button>
  </nav></div></header><main className="content-width page workspace"><Usage usage={usage}/><Outlet/></main><Footer/></>
}

async function uploadForGrading(call, file, fields, onProgress) {
  const info = await call('/uploads/presign', { method: 'POST', body: {
    ...fields, fileType: file.type, fileName: file.candidate.name, size: file.candidate.size,
  } })
  await upload(info.uploadUrl, info.headers, file.candidate, onProgress)
  return info.submissionId
}

function WorkshopPage({ publicPage = false }) {
  const { account, call, refresh } = useContext(AppContext)
  const { state } = useLocation()
  const navigate = useNavigate()
  const [progress, setProgress] = useState(null)
  const [error, setError] = useState('')
  async function assess({ draft, studentName, gradeLevel }) {
    setProgress(0)
    setError('')
    try {
      const type = 'text/plain'
      const candidate = new File([draft], 'Paragraph draft.txt', { type })
      const id = await uploadForGrading(call, { candidate, type }, {
        studentName, subject: 'English', assessment: 'writing', gradeLevel,
      }, setProgress)
      refresh().catch(() => {})
      navigate('/results/' + id, { state: { justUploaded: true } })
    } catch (error) {
      setError(error.message)
      setProgress(null)
    }
  }
  const content = <WritingWorkshop initial={state} account={account} onAssess={assess} error={error} progress={progress}/>
  return publicPage ? <><PublicHeader/><main className="content-width page workspace">{content}</main><Footer/></> : content
}

function GradeSheet() {
  const { call, refresh } = useContext(AppContext)
  const navigate = useNavigate()
  const { state } = useLocation()
  const initialGrade = gradeLevels.includes(state?.gradeLevel) ? state.gradeLevel : 5
  const picker = useRef(null)
  const camera = useRef(null)
  const [assessment, setAssessment] = useState('questions')
  const [file, setFile] = useState(null)
  const [error, setError] = useState('')
  const [dragging, setDragging] = useState(false)
  const [progress, setProgress] = useState(null)
  const [preparing, setPreparing] = useState(false)
  const [preview, setPreview] = useState('')
  const busy = preparing || progress !== null
  useEffect(() => {
    if (!file?.type.startsWith('image/')) {
      setPreview('')
      return
    }
    const url = URL.createObjectURL(file.candidate)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [file])
  async function pick(candidate, fromCamera = false) {
    if (!candidate || busy) return
    const extension = candidate.name.split('.').at(-1).toLowerCase()
    const type = formats[extension]
    const photo = fromCamera || type?.startsWith('image/') || candidate.type.startsWith('image/')
    if (!candidate.size || candidate.size > 20 * 1024 ** 2 || (!type && !photo)) {
      setError('Choose a photo, PDF, or DOCX up to 20 MB.')
      return
    }
    setError('')
    if (!photo) {
      setFile({ candidate, type })
      return
    }
    setPreparing(true)
    try {
      setFile(await prepareSheetPhoto(candidate, type))
    } catch (error) {
      setError(error.message)
    } finally {
      setPreparing(false)
    }
  }
  async function send(event) {
    event.preventDefault()
    if (busy) return
    if (!file) return setError('Take a photo or choose a file before grading.')
    setProgress(0)
    setError('')
    const fields = new FormData(event.target)
    try {
      const id = await uploadForGrading(call, file, {
        studentName: fields.get('studentName'), subject: fields.get('subject'),
        assessment, gradeLevel: Number(fields.get('gradeLevel')),
      }, setProgress)
      refresh().catch(() => {})
      navigate('/results/' + id, { state: { justUploaded: true } })
    } catch (error) {
      setError(error.message)
      setProgress(null)
    }
  }
  return <><div className="page-head"><h1>Grade a sheet</h1><p>Upload a question sheet or get grade-level feedback on a writing sample.</p></div>
    <form className="card upload-form" onSubmit={send}>
      <div className="form-row"><label>Student nickname<input name="studentName" placeholder="e.g. Alex" defaultValue={state?.studentName || ''} required maxLength={40} disabled={busy}/></label>
      <label>Subject<select name="subject" required defaultValue="" disabled={busy}
        onChange={(event) => { if (event.target.value === 'English') setAssessment('writing') }}><option value="" disabled>Select a subject</option>{subjects.map((subject) => <option key={subject}>{subject}</option>)}</select></label></div>
      <div className="form-row assessment-row">
        <label>Assessment type<select value={assessment} disabled={busy} onChange={(event) => setAssessment(event.target.value)}>
          <option value="questions">Question sheet</option><option value="writing">Writing sample</option>
        </select></label>
        <label>Grade level<select name="gradeLevel" defaultValue={initialGrade} disabled={busy}>
          {gradeLevels.map((level) => <option key={level} value={level}>{gradeLabel(level)}</option>)}
        </select></label>
      </div>
      <div className={'drop-zone' + (dragging ? ' dragging' : '')} onDragOver={(event) => { event.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)}
        onDrop={(event) => { event.preventDefault(); setDragging(false); pick(event.dataTransfer.files[0]) }}>
        <input ref={picker} type="file" hidden accept={Object.keys(formats).map((format) => '.' + format).join(',')} onChange={(event) => { pick(event.target.files[0]); event.target.value = '' }}/>
        <input ref={camera} type="file" hidden accept="image/*" capture="environment"
          onChange={(event) => { pick(event.target.files[0], true); event.target.value = '' }}/>
        {preview ? <img className="sheet-preview" src={preview} alt="Preview of the worksheet photo"/> :
          <span className="tile">{file ? <FileText size={24}/> : <UploadCloud size={24}/>}</span>}
        <strong>{file ? file.candidate.name : 'Add your child’s work'}</strong>
        <p>{file ? (file.candidate.size / 1024 ** 2).toFixed(2) + ' MB' : 'Take a photo or choose a JPEG, PNG, WebP, PDF, or DOCX.'}</p>
        {preview && <p>Check that the entire page is visible and the writing is readable.</p>}
        {preparing && <p role="status">Preparing your photo…</p>}
        <div className="actions upload-options">
          <button type="button" className="button secondary" disabled={busy} onClick={() => camera.current.click()}>
            <Camera size={18}/>{preview ? 'Retake photo' : 'Take photo'}</button>
          <button type="button" className="button secondary" disabled={busy} onClick={() => picker.current.click()}>
            <FileText size={18}/>{file ? 'Change file' : 'Choose file'}</button>
          {file && <button type="button" className="button text-button" disabled={busy}
            onClick={() => { setFile(null); setError('') }}>Remove file</button>}
        </div>
      </div>
      <Notice text={error}/>
      {progress !== null && <div role="status" className="progress"><progress aria-label="Upload progress" max="100" value={progress}/><span>Uploading {progress}%</span></div>}
      <p className="privacy-note"><ShieldCheck size={18}/> Use a first name or nickname. Remove full names, school names, birth dates, and faces before uploading. Original files expire after 30 days.</p>
      <button className="button primary grade-submit" disabled={busy}><Sparkles size={17}/>{progress === null ? 'Grade this sheet' : 'Uploading…'}</button>
    </form></>
}

const rubricLabels = {
  grammar: 'Grammar and mechanics',
  language: 'Language and clarity',
  vocabulary: 'Vocabulary',
  organization: 'Organization',
  content: 'Content and development',
}
const rubricLevels = ['No evidence', 'Beginning', 'Developing', 'Meets expectations', 'Exceeds expectations']

const demoRetry = [{
  key: 'question:0', kind: 'question', index: 0, label: 'Fraction addition',
  prompt: 'What is one fourth plus another one fourth?',
  original: 'Two eighths.',
  reference: 'Two fourths, which is equal to one half.',
  reason: 'Both pieces are fourths, so count two pieces and keep the size of each piece the same.',
}]

function RetryDemo() {
  return <><PublicHeader/><main className="content-width page workspace"><FixAndExplain options={demoRetry}/></main><Footer/></>
}

function SheetRetry({ item, onSave }) {
  const examples = item.feedback.revisionExamples || []
  const questions = item.feedback.questions || []
  const options = examples.length ? examples.map((example, index) => ({
    key: 'writing:' + index, kind: 'writing', index,
    label: (index + 1) + '. ' + rubricLabels[example.criterion],
    prompt: 'Rewrite this excerpt in your own words.',
    original: example.original, reference: example.revised, reason: example.why,
  })) : questions.flatMap((question, index) => ['incorrect', 'partial'].includes(question.status) ? [{
    key: 'question:' + index, kind: 'question', index, label: 'Question ' + (index + 1),
    prompt: question.question, original: question.studentAnswer,
    reference: question.correctAnswer, reason: question.explanation,
  }] : [])
  return options.length > 0 && <FixAndExplain key={item.submissionId} options={options} saved={item.retry} onSave={onSave}/>
}

function WritingResult({ item, onSave }) {
  const { revisionExamples, paragraphSteps } = item.feedback
  const focus = item.feedback.rubric.reduce((lowest, row) => row.earned < lowest.earned ? row : lowest)
  return <><div className="page-head"><h1>{item.subject} writing results</h1><p>{item.studentName} · {gradeLabel(item.gradeLevel)} · {item.fileName}</p></div>
    <section className="card result-overview">
      <div className="score-ring" style={{ '--score': item.scorePct + '%' }}><div><strong>{item.totalEarned}/{item.totalMax}</strong><span>Rubric points</span></div></div>
      <div><span className="grade-pill">{gradeLabel(item.gradeLevel)} rubric</span><h2>Writing feedback</h2><p>{item.feedback.overallFeedback}</p></div>
    </section>
    <SheetRetry item={item} onSave={onSave}/>
    <section className="card paragraph-practice">
      <h2>Improve this paragraph</h2>
      {revisionExamples?.map((example, index) => <article className="paragraph-revision" key={index}>
        <h3>{rubricLabels[example.criterion]}</h3>
        <div className="workshop-example">
          <div><h4>From your draft</h4><p>{example.original}</p></div>
          <div><h4>One possible revision</h4><p>{example.revised}</p></div>
        </div>
        <p><strong>Why it helps</strong> {example.why}</p>
      </article>)}
      {paragraphSteps?.length > 0 && <div className="paragraph-revision">
        <h3>What to change in the paragraph</h3>
        <ol>{paragraphSteps.map((step, index) => <li key={index}>{step}</li>)}</ol>
      </div>}
      <p><strong>Revision focus · {rubricLabels[focus.criterion]}</strong> {focus.suggestion}</p>
      <Link className="button secondary small" to="/practice" state={{
        focus: focus.criterion, suggestion: focus.suggestion, studentName: item.studentName, gradeLevel: item.gradeLevel,
      }}>Open writing workshop</Link>
    </section>
    <section className="writing-rubric">
      <div className="section-head"><h2>Rubric and revision suggestions</h2></div>
      <p className="rubric-scale">{rubricLevels.map((label, score) => <span key={label}>{score} · {label}</span>)}</p>
      {item.feedback.rubric.map((row) => <article className="card rubric-row" key={row.criterion}>
        <div className="section-head"><h3>{rubricLabels[row.criterion]}</h3>
          <span className="grade-pill">{row.earned}/{row.max} · {rubricLevels[row.earned]}</span></div>
        <p>{row.feedback}</p><p className="rubric-suggestion"><strong>Try this:</strong> {row.suggestion}</p>
      </article>)}
    </section>
  </>
}

function Result() {
  const { id } = useParams()
  const { state } = useLocation()
  const { call, refresh, setUpgrade } = useContext(AppContext)
  const [item, setItem] = useState(null)
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState([])
  useEffect(() => {
    const controller = new AbortController()
    let timer
    let retries = 0
    setItem(null)
    setError('')
    setExpanded([])
    async function poll() {
      try {
        const row = await call('/submissions/' + id, { signal: controller.signal })
        if (controller.signal.aborted) return
        setItem(row)
        retries = 0
        if (['uploading', 'grading'].includes(row.status)) timer = setTimeout(poll, 3000)
        else {
          const usage = await refresh().catch(() => null)
          if (!controller.signal.aborted && state?.justUploaded && row.status === 'done' && row.reservation === 'trial' &&
              usage?.plan === 'trial' && !usage.unlimited && usage.trialCompleted === 5 && !sessionStorage.getItem('trial-modal:' + id)) {
            sessionStorage.setItem('trial-modal:' + id, '1')
            setUpgrade('You’ve reached your free sheet allowance. Choose a plan to keep grading.')
          }
        }
      } catch (error) {
        if (controller.signal.aborted) return
        const transient = !error.status || error.status === 404 || error.status === 429 || error.status >= 500
        if (transient && retries++ < 5) timer = setTimeout(poll, 3000)
        else setError(error.message)
      }
    }
    poll()
    return () => { controller.abort(); clearTimeout(timer) }
  }, [id, call, refresh, setUpgrade, state])
  if (error) return <><div className="page-head"><h1>Sheet results</h1></div><Notice text={error}/><Link to="/history">Back to history</Link></>
  if (!item || ['uploading', 'grading'].includes(item.status)) return <section className="card grading" role="status">
    <span className="spinner"/><h1>{item?.status === 'grading' ? 'Grading your sheet' : 'Preparing your sheet'}</h1>
    <p>Checking for updates every few seconds. You can reopen this sheet in History.</p>
  </section>
  if (item.status === 'error') return <section className="card grading"><h1>Grading didn’t finish</h1><Notice text={item.errorMessage}/>{item.reservation !== 'testing' && <p>Your sheet allowance has been restored.</p>}<Link className="button primary" to="/grade">Upload another copy</Link></section>
  async function saveRetry(retry) {
    const result = await call('/submissions/' + id + '/retry', { method: 'POST', body: retry })
    setItem((current) => current?.submissionId === id ? { ...current, ...result } : current)
  }
  if (item.feedback.rubric) return <WritingResult item={item} onSave={saveRetry}/>
  const questions = item.feedback.questions
  const all = expanded.length === questions.length
  const counts = Object.fromEntries(['correct', 'partial', 'incorrect'].map((status) => [status, questions.filter((question) => question.status === status).length]))
  return <><div className="page-head"><h1>{item.subject} results</h1><p>{item.studentName} · {gradeLabel(item.gradeLevel)} · {item.fileName}</p></div>
    <section className="card result-overview"><div className="score-ring" style={{ '--score': item.scorePct + '%' }}><div><strong>{item.scorePct}%</strong><span>{item.totalEarned} / {item.totalMax} points</span></div></div>
      <div><span className="grade-pill">Grade {item.grade}</span><h2>{item.feedback.encouragement}</h2><p>{item.feedback.overallFeedback}</p></div></section>
    <div className="stat-grid">{Object.entries(counts).map(([status, count]) => <div className={'card stat ' + status} key={status}><span>{status}</span><strong>{count}</strong></div>)}</div>
    <SheetRetry item={item} onSave={saveRetry}/>
    <section><div className="section-head"><h2>Question breakdown</h2><button className="button secondary small" onClick={() => setExpanded(all ? [] : questions.map((_, index) => index))}>{all ? 'Collapse All' : 'Expand All'}</button></div>
    {questions.map((question, index) => {
      const open = expanded.includes(index)
      return <article key={index} className="card question"><button className="question-toggle" type="button" aria-expanded={open} aria-controls={'question-' + index} onClick={() => setExpanded(open ? expanded.filter((i) => i !== index) : [...expanded, index])}>
        <span>{index + 1}. {question.question}</span><span className={'question-status ' + question.status}>{question.earned}/{question.max} · {question.status}</span><ChevronDown size={18}/></button>
        <div id={'question-' + index} className="question-body" hidden={!open}><dl><div><dt>Student answer</dt><dd>{question.studentAnswer}</dd></div><div><dt>Correct answer</dt><dd>{question.correctAnswer}</dd></div><div><dt>Explanation</dt><dd>{question.explanation}</dd></div></dl></div></article>
    })}</section></>
}

function PracticeLink({ resource }) {
  return <a className="practice-link" href={resource.url} target="_blank" rel="noopener noreferrer">{resource.title} ↗</a>
}

function StudentProgress({ rows, subject, studentName }) {
  const displayedSubjects = subject ? subjects.filter((value) => value === subject) : subjects
  return <section className="progress-panel" aria-label="Student progress">
    <h2>Progress and practice</h2>
    <div className="progress-grid">
      {displayedSubjects.map((name) => {
        const { completed, comparable, priorities, hasSkillData } = progressFor(rows, name)
        const [recent, previous] = comparable
        const change = previous ? Math.round((recent.scorePct - previous.scorePct) * 10) / 10 : null
        return <article className="card progress-card" key={name}>
          <div className="section-head"><h3>{name}</h3><span className="grade-pill">{completed} {completed === 1 ? 'graded sheet' : 'graded sheets'}</span></div>
          {recent && <><p className="score-history-label">{gradeLabel(recent.gradeLevel)} · {recent.assessment === 'writing' ? 'Writing samples' : 'Question sheets'}</p>
            <ol className="score-history" aria-label="Recent comparable scores">
              {comparable.slice(0, 5).reverse().map((row) => <li key={row.submissionId}>
                <Link to={'/results/' + row.submissionId}><span>{new Date(row.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                  <strong>{row.scorePct}%</strong></Link>
              </li>)}
            </ol>
            {change !== null && <p>{change > 0 ? '+' : ''}{change} percentage points from the previous comparable sheet.</p>}
          </>}
          {!completed && <p>No graded sheets in this view.</p>}
          {completed > 0 && !hasSkillData && <p>Skill suggestions will appear after new assessments are graded.</p>}
          {hasSkillData && priorities.length === 0 && <p>No practice priorities in the latest observations.</p>}
          {priorities.length > 0 && <div className="practice-priorities"><h4>Practice next</h4>
            {priorities.map((priority) => <div className="practice-priority" key={priority.key}>
              <strong>{priority.label}</strong>
              <small>{gradeLabel(priority.grade)} · Needs practice on {priority.misses} of {priority.total} assessed sheets</small>
              <p>{priority.activity}</p>
              {name === 'English' && rubricLabels[priority.skill]
                ? <Link className="practice-link" to="/practice" state={{
                    focus: priority.skill, gradeLevel: priority.grade, studentName,
                  }}>Practice in GradeAI</Link>
                : <PracticeLink resource={priority.resource}/>}
            </div>)}</div>}
        </article>
      })}
    </div>
  </section>
}

function History() {
  const { call } = useContext(AppContext)
  const [rows, setRows] = useState([])
  const [student, setStudent] = useState(null)
  const [grade, setGrade] = useState('')
  const [subject, setSubject] = useState('')
  const [period, setPeriod] = useState('')
  const [cursor, setCursor] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [deleting, setDeleting] = useState(null)
  const [busy, setBusy] = useState(false)
  const load = useCallback(async (after = '', signal) => {
    setLoading(true)
    setError('')
    try {
      const data = await call('/submissions' + (after ? '?cursor=' + encodeURIComponent(after) : ''), { signal })
      setRows((old) => after ? [...old, ...data.items] : data.items)
      setCursor(data.cursor)
    } catch (error) { if (!signal?.aborted) setError(error.message) }
    finally { if (!signal?.aborted) setLoading(false) }
  }, [call])
  useEffect(() => {
    const controller = new AbortController()
    load('', controller.signal)
    return () => controller.abort()
  }, [load])
  async function remove() {
    setBusy(true)
    setError('')
    try {
      await call('/submissions/' + deleting.submissionId, { method: 'DELETE' })
      setRows((old) => old.filter((item) => item.submissionId !== deleting.submissionId))
      setDeleting(null)
    } catch (error) { setError(error.message); setDeleting(null) }
    finally { setBusy(false) }
  }
  const students = new Map()
  for (const row of rows) {
    const key = row.studentName.toLocaleLowerCase()
    if (!students.has(key)) students.set(key, row)
  }
  const activeStudent = students.has(student) ? student : student === null && students.size === 1 ? students.keys().next().value : ''
  const studentRows = activeStudent ? rows.filter((row) => row.studentName.toLocaleLowerCase() === activeStudent) : rows
  const availableGrades = [...new Set(studentRows.map((row) => row.gradeLevel ?? 'unknown'))]
    .sort((a, b) => (a === 'unknown' ? 99 : a) - (b === 'unknown' ? 99 : b))
  const selectedGrade = availableGrades.some((level) => String(level) === grade) ? grade : ''
  const from = period ? Date.now() - Number(period) * 86400000 : 0
  const filteredRows = studentRows.filter((row) =>
    (!selectedGrade || String(row.gradeLevel ?? 'unknown') === selectedGrade) &&
    (!subject || row.subject === subject) && Date.parse(row.createdAt) >= from)
  const groups = new Map()
  for (const row of filteredRows) {
    const name = row.studentName.toLocaleLowerCase()
    if (!groups.has(name)) groups.set(name, [])
    groups.get(name).push(row)
  }
  const current = students.get(activeStudent)
  return <><div className="page-head"><h1>Student history</h1><p>Review graded sheets, compare progress, and find the next skill to practice.</p></div><Notice text={error}/>
    {rows.length > 0 && <section className="card history-filters" aria-label="History filters">
      <label>Student<select value={activeStudent} onChange={(event) => { setStudent(event.target.value); setGrade('') }}>
        <option value="">All students</option>
        {[...students].map(([key, row]) => <option key={key} value={key}>{row.studentName}</option>)}
      </select></label>
      <label>Grade level<select value={selectedGrade} onChange={(event) => setGrade(event.target.value)}>
        <option value="">All grades</option>
        {availableGrades.map((level) => <option key={level} value={level}>{gradeLabel(level === 'unknown' ? null : level)}</option>)}
      </select></label>
      <label>Subject<select value={subject} onChange={(event) => setSubject(event.target.value)}>
        <option value="">All subjects</option>
        {[...new Set([...subjects, ...rows.map((row) => row.subject)])].map((value) => <option key={value}>{value}</option>)}
      </select></label>
      <label>Period<select value={period} onChange={(event) => setPeriod(event.target.value)}>
        <option value="">All dates</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option>
      </select></label>
    </section>}
    {cursor && <p className="history-coverage">This view uses the sheets loaded so far. Load older sheets to include them in the filters and progress summary.</p>}
    {current && <div className="section-head student-heading"><h2>{current.studentName}</h2>
      <Link className="button secondary small" to="/grade" state={{
        studentName: current.studentName, gradeLevel: selectedGrade ? Number(selectedGrade) : current.gradeLevel,
      }}>Grade another sheet</Link></div>}
    {current && (!subject || subjects.includes(subject)) && <StudentProgress rows={filteredRows} subject={subject} studentName={current.studentName}/>}
    {!current && rows.length > 0 && <p className="history-coverage">Select a student to see their progress and practice suggestions.</p>}
    {!loading && rows.length > 0 && filteredRows.length === 0 && <p>No sheets match these filters.</p>}
    {loading && <p role="status">Loading sheets…</p>}
    {!loading && !error && !rows.length && !cursor && <section className="card grading"><FolderClock size={31}/><h2>No sheets yet</h2><Link className="button primary" to="/grade">Grade a sheet</Link></section>}
    {[...groups.values()].map((group) => <section className="history-group" key={group[0].studentName}><h2>{current ? 'Submissions' : group[0].studentName}</h2>
      {group.map((row) => <div className="card history-row" key={row.submissionId}><Link to={'/results/' + row.submissionId}><span className="tile"><FileText size={18}/></span><span><strong>{row.subject}{row.retrySavedAt && <span className="history-retry"> · Retry saved</span>}</strong><small>{gradeLabel(row.gradeLevel)} · {row.fileName} · {new Date(row.createdAt).toLocaleDateString()}</small></span></Link>
        <span className="status">{row.status === 'done' ? row.assessment === 'writing' ? row.totalEarned + '/' + row.totalMax + ' rubric points' : row.scorePct + '% · ' + row.grade : row.status === 'error' ? 'Unable to grade' : row.status}</span>
        <button className="button icon-button" aria-label={'Delete ' + row.fileName} onClick={() => setDeleting(row)}><Trash2 size={17}/></button></div>)}
    </section>)}
    {cursor && <button className="button secondary" disabled={loading} onClick={() => load(cursor)}>Load older sheets</button>}
    {deleting && <Modal title="Delete this answer sheet?" close={() => !busy && setDeleting(null)}><p>The file and its feedback will be removed.</p><div className="actions"><button className="button secondary" disabled={busy} onClick={() => setDeleting(null)}>Cancel</button><button className="button danger" disabled={busy} onClick={remove}>{busy ? 'Deleting…' : 'Delete sheet'}</button></div></Modal>}
  </>
}

function Billing() {
  const { call, usage, refresh, setAccount } = useContext(AppContext)
  const location = useLocation()
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const checkout = new URLSearchParams(location.search).get('checkout') === 'success'
  useEffect(() => {
    if (!checkout || !usage || usage.plan !== 'trial') return
    const timer = setInterval(() => refresh().catch(() => {}), 3000)
    const expiry = setTimeout(() => clearInterval(timer), 60000)
    return () => { clearInterval(timer); clearTimeout(expiry) }
  }, [checkout, usage?.plan, refresh])
  async function manage() {
    setBusy(true)
    setError('')
    try {
      const result = await call('/billing/portal', { method: 'POST' })
      window.location.assign(result.url)
    } catch (error) { setError(error.message); setBusy(false) }
  }
  async function remove() {
    setBusy(true)
    setError('')
    try {
      await call('/me', { method: 'DELETE' })
      await signOut()
      setAccount(null)
      navigate('/', { replace: true })
    } catch (error) { setError(error.message); setBusy(false); setConfirm(false) }
  }
  const plan = config.plans.find((plan) => usage?.plan === plan.id)
  return <><div className="page-head"><h1>Account and billing</h1><p>Manage your allowance, subscription, and account data.</p></div>
    <Notice text={error}/><Notice neutral text={checkout ? plan ? 'Your subscription is active.' : 'Checkout complete. Waiting for Stripe to confirm your subscription.' : ''}/>
    <section className="card settings"><span className="tile"><CreditCard size={20}/></span><h2>{plan?.name || 'Free trial'}</h2>
      {usage && <p>{usageText(usage)}.</p>}<div className="actions"><Link to="/pricing" className="button secondary">View plans</Link>
      <button className="button primary" disabled={busy || !usage?.hasBillingAccount} onClick={manage}>Manage subscription</button></div></section>
    <section className="card settings"><h2>Delete account</h2><p>Permanently remove your account, answer sheets, and grading history, and cancel any active subscription.</p><button className="button danger" onClick={() => setConfirm(true)}>Delete my account</button></section>
    {confirm && <Modal title="Permanently delete your account?" close={() => !busy && setConfirm(false)}><p>You’ll be signed out immediately. Deletion and subscription cancellation run in the background.</p>
      <div className="actions"><button className="button secondary" disabled={busy} onClick={() => setConfirm(false)}>Keep account</button><button className="button danger" disabled={busy} onClick={remove}>{busy ? 'Requesting deletion…' : 'Delete account'}</button></div></Modal>}
  </>
}

const policies = {
  terms: ['Terms of Service', [
    'GradeAI provides AI-generated educational feedback for home learning. A parent or guardian must hold the account and have permission to upload the work. Review AI feedback with your child before using it to guide study.',
    'A verified account can grade for free under the trial limits shown on the site. Paid plans renew at the interval and price displayed at Checkout. Use the billing portal to manage or cancel renewal.',
    'Upload only work you have permission to share. Do not upload images of people, school names, or other personal details. You can delete a sheet in History and request account deletion in Account and Billing.',
  ]],
  privacy: ['Privacy Policy', [
    'We use your email to provide and secure your parent account. We collect a student nickname, selected subject, uploaded file, and grading feedback to deliver the service. Remove identifying details from the filename and sheet before uploading.',
    'AWS hosts GradeAI and Amazon Bedrock processes answer sheets for grading. Stripe handles payments and provides subscription information to GradeAI. GradeAI does not receive payment card details.',
    'Original uploads expire after 30 days. Grading history remains until you delete it or request account deletion. Stripe may retain transaction records to meet its obligations. Service metrics track grading usage, estimated AI cost, and reliability.',
  ]],
  refund: ['Refund Policy', [
    'Trial grading is free. Failed grading releases any reserved sheet allowance.',
    'Cancel renewal through Manage subscription in Account and Billing. Paid access generally continues until the end of the current paid billing period. Cancelling renewal does not automatically issue a refund.',
    'For billing errors or refund requests, use the merchant support contact on your Stripe receipt. Any rights under applicable law still apply.',
  ]],
}

function Policy({ type }) {
  const [title, paragraphs] = policies[type]
  return <><PublicHeader/><main className="content-width page"><article className="card policy"><h1>{title}</h1>{paragraphs.map((text) => <p key={text}>{text}</p>)}</article></main><Footer/></>
}

function Modal({ title, children, close, wide = false }) {
  const dialog = useRef(null)
  useEffect(() => {
    const element = dialog.current
    element.showModal()
    return () => element.close()
  }, [])
  return <dialog className={wide ? 'wide-modal' : ''} ref={dialog} aria-labelledby="modal-title" onCancel={(event) => { event.preventDefault(); close() }}>
    <div className="section-head"><h2 id="modal-title">{title}</h2><button className="button icon-button" aria-label="Close dialog" onClick={close}><X size={21}/></button></div>
    {children}
  </dialog>
}

function App() {
  const [ready, setReady] = useState(false)
  const [account, setAccount] = useState(null)
  const [usage, setUsage] = useState(null)
  const [upgrade, setUpgrade] = useState('')
  const navigate = useNavigate()
  const location = useLocation()
  const call = useCallback(async (path, options) => {
    try { return await request(path, options) }
    catch (error) {
      if (error.status === 402) setUpgrade(error.message)
      if (error.status === 401 || ['NotAuthorizedException', 'UserNotFoundException'].includes(error.code)) {
        setAccount(null)
        navigate('/login')
      }
      throw error
    }
  }, [navigate])
  const refresh = useCallback(async () => {
    const data = await call('/me/usage')
    setUsage(data)
    return data
  }, [call])
  useEffect(() => {
    session().then((current) => {
      if (current?.isValid()) setAccount(current.getIdToken().payload.email)
    }).catch(() => {}).finally(() => setReady(true))
  }, [])
  useEffect(() => { window.scrollTo(0, 0) }, [location.pathname])
  useEffect(() => { if (!account) { setUsage(null); setUpgrade('') } }, [account])
  return <AppContext.Provider value={{ ready, account, setAccount, call, usage, refresh, setUpgrade }}>
    <Routes>
      <Route path="/" element={<Landing/>}/>
      <Route path="/pricing" element={<Pricing/>}/>
      <Route path="/writing-practice" element={<WorkshopPage publicPage/>}/>
      <Route path="/try-a-retry" element={<RetryDemo/>}/>
      {['login', 'register', 'verify', 'reset'].map((mode) => <Route key={mode} path={'/' + mode} element={<AuthPage key={mode} mode={mode}/>}/>)}
      {Object.keys(policies).map((type) => <Route key={type} path={'/' + type} element={<Policy type={type}/>}/>)}
      <Route element={<Dashboard/>}>
        <Route path="/grade" element={<GradeSheet/>}/>
        <Route path="/history" element={<History/>}/>
        <Route path="/practice" element={<WorkshopPage/>}/>
        <Route path="/billing" element={<Billing/>}/>
        <Route path="/results/:id" element={<Result/>}/>
      </Route>
      <Route path="*" element={<><PublicHeader/><main className="content-width page"><h1>Page not found</h1><Link to="/">Go home</Link></main><Footer/></>}/>
    </Routes>
    {upgrade && <Modal title="Keep grading with GradeAI" close={() => setUpgrade('')} wide><p>{upgrade}</p><Pricing modal/></Modal>}
  </AppContext.Provider>
}

createRoot(document.getElementById('root')).render(<BrowserRouter><App/></BrowserRouter>)
