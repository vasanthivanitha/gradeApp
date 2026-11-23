export const subjects = ['English', 'Math', 'Science']
export const gradeLevels = [0, 1, 2, 3, 4, 5]
export const gradeLabel = (grade) => grade == null ? 'Grade not recorded' : grade === 0 ? 'Kindergarten' : 'Grade ' + grade

const math = { title: 'Khan Academy Math', url: 'https://www.khanacademy.org/math' }
const gradeFiveMath = { title: 'Khan Academy Grade 5 Math', url: 'https://www.khanacademy.org/math/get-ready-for-5th-grade' }
const grammar = { title: 'Khan Academy Grammar', url: 'https://www.khanacademy.org/humanities/grammar' }
const reading = { title: 'Khan Academy Reading and Language Arts', url: 'https://www.khanacademy.org/ela' }
const writing = { title: 'ReadWriteThink Persuasion Map', url: 'https://www.readwritethink.org/classroom-resources/student-interactives/persuasion' }
const science = { title: 'Khan Academy Science', url: 'https://www.khanacademy.org/science' }

const skills = {
  grammar: ['Grammar and mechanics', 'Read each sentence aloud. Mark where one idea ends, then check capital letters and punctuation.', grammar],
  language: ['Language and clarity', 'Pick one confusing sentence. Say it in your own words, then write the clearer version.', grammar],
  vocabulary: ['Vocabulary', 'Choose one vague word and replace it with a more exact word. Read both versions to see which is clearer.', reading],
  organization: ['Organization', 'Put the main idea first. Move the details into an order that makes sense, then add an ending.', writing],
  content: ['Content and development', 'Add a reason, fact, or example that supports your main idea. Explain how it helps your reader.', writing],
  'reading-comprehension': ['Reading comprehension', 'Read a short passage, explain its main idea in your own words, and point to one detail that supports it.', reading],
  'number-operations': ['Number operations', 'Solve three similar problems. Use a drawing, an estimate, or the opposite operation to check each answer.', math],
  'fractions-decimals': ['Fractions and decimals', 'Draw or label a number line, then locate and compare two fractions or decimals.', math],
  'geometry-measurement': ['Geometry and measurement', 'Draw the shape or measurement. Label what you know and include the units in your answer.', math],
  'data-patterns': ['Data and patterns', 'Read a small table or graph, describe a pattern, and use it to explain what comes next.', math],
  'word-problems': ['Word problems', 'Underline what the problem asks for, draw a model, and explain why your operation fits.', math],
  'life-science': ['Life science', 'Draw a plant or animal and label two parts. Explain how each part helps it live.', science],
  'physical-science': ['Physical science', 'Predict what happens when you push a toy gently and then more firmly. Try it and explain what changed.', science],
  'earth-space': ['Earth and space science', 'Make a labeled drawing of one idea you studied, such as how clouds form or why we see day and night.', science],
  'scientific-reasoning': ['Scientific reasoning', 'Write a prediction, record what you observe, and say whether the observation supports your prediction.', science],
}

export function practiceFor(skill, subject, grade) {
  const entry = skills[skill]
  if (!entry) return null
  const [label, activity, defaultLink] = entry
  const link = skill === 'content' && subject === 'Science' ? science
    : skill === 'content' && subject === 'Math' ? math : defaultLink
  const resource = link === math && grade === 5 ? gradeFiveMath : link
  return { label, activity, resource }
}

export function progressFor(rows, subject) {
  const completed = rows.filter((row) => row.subject === subject && row.status === 'done' && Number.isFinite(row.scorePct))
  const latest = completed[0]
  const comparable = !latest ? [] : latest.gradeLevel == null ? [latest] : completed.filter((row) =>
    row.gradeLevel === latest.gradeLevel && (row.assessment || 'questions') === (latest.assessment || 'questions'))
  const groups = new Map()
  for (const row of completed) {
    for (const result of row.skillBreakdown || []) {
      const practice = practiceFor(result.skill, row.subject, row.gradeLevel)
      if (!practice || !Number.isFinite(result.earned) || !Number.isFinite(result.max) || result.max <= 0) continue
      const key = [row.gradeLevel ?? 'unknown', row.assessment || 'questions', result.skill].join('/')
      const needsPractice = result.earned / result.max < (row.assessment === 'writing' ? .75 : .7)
      if (!groups.has(key)) {
        groups.set(key, { key, skill: result.skill, ...practice, grade: row.gradeLevel, recentNeedsPractice: needsPractice,
          total: 0, misses: 0, sources: [], latestScore: result.earned / result.max })
      }
      const group = groups.get(key)
      group.total++
      if (needsPractice) {
        group.misses++
        if (group.sources.length < 3) group.sources.push(row.submissionId)
      }
    }
  }
  const priorities = [...groups.values()].filter((group) => group.recentNeedsPractice)
    .sort((a, b) => b.misses - a.misses || a.latestScore - b.latestScore).slice(0, 3)
  return { completed: completed.length, comparable, priorities, hasSkillData: groups.size > 0 }
}
