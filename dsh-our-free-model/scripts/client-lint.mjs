/**
 * Static checks over the browser half.
 *
 *   1. the ModuleLoader bundle registers itself and exports a plugin object;
 *   2. every literal `t('key')` in the source exists in BOTH dictionaries, no
 *      dictionary key goes unused, and the two key sets match — the shell shows
 *      the raw key when a lookup misses, which reads as a broken UI;
 *   3. every `ofm_*` class the code emits is defined in the injected stylesheet,
 *      and every declared rule is reachable.
 *
 * Run: node scripts/client-lint.mjs
 */
import fs from 'node:fs'

const source = fs.readFileSync(new URL('../client.js', import.meta.url), 'utf8')

globalThis.window = { __ModuleLoader__: { load: record => { globalThis.__registered = record } } }
globalThis.document = {
  createElement: () => ({ setAttribute() {}, style: {}, remove() {} }),
  head: { appendChild() {} },
  body: { appendChild() {}, removeChild() {} },
  execCommand: () => true,
}

/** A react stand-in, just enough for the factory body to run and export. */
const stubReact = {
  createElement: (type, props, ...children) => ({ type, props, children }),
  Fragment: 'fragment',
  useState: initial => [typeof initial === 'function' ? initial() : initial, () => {}],
  useEffect: () => {},
  useMemo: factory => factory(),
  useRef: () => ({ current: null }),
  useCallback: fn => fn,
}

// The wrapper is a single expression, so a Function body reproduces the browser's
// script semantics without needing a DOM or a module graph.
new Function('window', 'document', 'navigator', source)(globalThis.window, globalThis.document, { language: 'zh-CN' })

const problems = []
const record = globalThis.__registered

if (record === undefined) {
  problems.push('the bundle never registered itself with the module loader')
} else {
  if (record.id !== 'dsh-our-free-model') problems.push(`registered id "${record.id}" must equal the package name`)
  if (typeof record.factory !== 'function') problems.push('factory is not a function')
  else {
    const exports = record.factory(name => {
      if (name === 'react') return stubReact
      throw new Error(`the browser half may only require react; it asked for "${name}"`)
    })
    if (typeof exports.apply !== 'function') problems.push('exports.apply is missing')
    if (!Array.isArray(exports.inject)) problems.push('exports.inject is missing')
    else for (const service of exports.inject) {
      if (service !== 'slots' && service !== 'locale') problems.push(`unexpected injected service "${service}"`)
    }
  }
}

// ── dictionary coverage ──────────────────────────────────────────────────────
const used = new Set()
for (const match of source.matchAll(/\bt\(\s*'([A-Za-z][\w.]*)'\s*[,)]/g)) used.add(match[1])
// `list(t, ['a', 'b'])` renders one row per key, so the keys reach `t` indirectly.
for (const match of source.matchAll(/\blist\(\s*t\s*,\s*\[([^\]]*)\]/g)) {
  for (const key of match[1].matchAll(/'([A-Za-z][\w.]*)'/g)) used.add(key[1])
}
if (used.size === 0) problems.push('no t(...) call found — the matcher has drifted from the source')

const KEYS = {}
for (const language of ['zh', 'en']) {
  const start = source.indexOf(`      ${language}: {`)
  if (start === -1) { problems.push(`${language} dictionary block not found`); continue }
  const end = source.indexOf('\n      },', start)
  const block = source.slice(start, end)
  // A key is either a bare identifier or a quoted string; dotted keys must be quoted.
  const found = new Set()
  for (const match of block.matchAll(/^\s*'([A-Za-z][\w.]*)'\s*:/gm)) found.add(match[1])
  for (const match of block.matchAll(/^\s*([A-Za-z][A-Za-z0-9]*)\s*:\s*(?=[^{\s])/gm)) found.add(match[1])
  KEYS[language] = found
}

/** Keys reached through a template or a table rather than a `t('literal')`. */
const INDIRECT = new Set([
  'state.available', 'state.region-blocked', 'state.throttled', 'state.unavailable', 'state.unknown',
  'ann.preamble', 'ann.models', 'ann.steps', 'ann.features', 'ann.updates',
  'level.info', 'level.update', 'level.warn', 'level.urgent',
])

for (const language of ['zh', 'en']) {
  for (const key of used) {
    if (!KEYS[language]?.has(key)) problems.push(`t('${key}') has no ${language} entry`)
  }
}
for (const key of KEYS.zh ?? []) {
  if (!KEYS.en?.has(key)) problems.push(`'${key}' exists in zh but not en`)
}
for (const key of KEYS.en ?? []) {
  if (!KEYS.zh?.has(key)) problems.push(`'${key}' exists in en but not zh`)
}
for (const language of ['zh', 'en']) {
  for (const key of KEYS[language] ?? []) {
    if (used.has(key) || INDIRECT.has(key) || key.startsWith('meta.')) continue
    problems.push(`${language} key '${key}' is never used`)
  }
}

// ── style coverage ───────────────────────────────────────────────────────────
const cssStart = source.indexOf('const CSS = `')
const css = source.slice(cssStart + 'const CSS = `'.length, source.indexOf('\n`', cssStart))
if (css.length === 0) problems.push('the stylesheet block was not located')
const declared = new Set([...css.matchAll(/\.(ofm_[A-Za-z0-9_]+)/g)].map(match => match[1]))

const referenced = new Set()
// Any quoted or templated run that carries a class name. The scan walks the
// source with a small state machine so that quotes inside comments and inside
// regex literals (the attribute parser has both) cannot unbalance a naive
// global regex and swallow the rest of the file. Regex literals are skipped
// when a literal can start there; division after a value keeps scanning.
function* stringRuns(src) {
  const REGEX_PRECEDERS = new Set(['(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '>', '+', '-', '*', '%', '~', '^'])
  let i = 0
  let prev = ''
  while (i < src.length) {
    const ch = src[i]
    if (ch === '/' && src[i + 1] === '/') { i = src.indexOf('\n', i); if (i === -1) break; i += 1; continue }
    if (ch === '/' && src[i + 1] === '*') { i = src.indexOf('*/', i) + 2; continue }
    if (ch === '"' || ch === "'" || ch === '`') {
      let j = i + 1
      let run = ''
      while (j < src.length && src[j] !== ch) {
        if (src[j] === '\\') { run += src[j] + src[j + 1] ?? ''; j += 2; continue }
        run += src[j]
        j += 1
      }
      yield run
      i = j + 1
      prev = 'x'
      continue
    }
    if (ch === '/' && REGEX_PRECEDERS.has(prev)) {
      let j = i + 1
      let inClass = false
      while (j < src.length) {
        const c = src[j]
        if (c === '\\') { j += 2; continue }
        if (c === '[') inClass = true
        else if (c === ']') inClass = false
        else if (c === '/' && !inClass) break
        j += 1
      }
      j += 1
      while (j < src.length && /[a-z]/.test(src[j])) j += 1
      i = j
      prev = 'x'
      continue
    }
    if (!/\s/.test(ch)) prev = ch
    i += 1
  }
}
for (const run of stringRuns(source)) {
  for (const token of run.split(/[\s,]+/)) if (/^ofm_[A-Za-z0-9_]+$/.test(token)) referenced.add(token)
}

for (const name of referenced) if (!declared.has(name)) problems.push(`.${name} is emitted but never styled`)
for (const name of declared) if (!referenced.has(name)) problems.push(`.${name} is styled but never emitted`)

if (problems.length === 0) {
  console.log(`client-lint: OK (${used.size} copy keys used, ${declared.size} style rules)`)
} else {
  console.log(`client-lint: ${problems.length} problem(s)`)
  for (const problem of problems) console.log(`  - ${problem}`)
  process.exit(1)
}
