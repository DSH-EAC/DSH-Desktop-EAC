/**
 * Headless tests for the announcement-HTML sanitizer in client.js.
 *
 * The bundle is executed exactly the way scripts/client-lint.mjs executes it —
 * stubbed window/document/React — and the sanitizer is exercised through the
 * `__test` seam. The bar: nothing that is not on the allowlist survives, text
 * content does, and the output can be materialized to DOM without a single
 * attacker-controlled attribute.
 *
 * Run: node scripts/sanitize-test.mjs
 */
import fs from 'node:fs'

const source = fs.readFileSync(new URL('../client.js', import.meta.url), 'utf8')

globalThis.window = { __ModuleLoader__: { load: record => { globalThis.__registered = record } } }
globalThis.document = {
  createElement: tag => ({ tagName: tag, attributes: {}, style: {}, children: [], setAttribute(k, v) { this.attributes[k] = v }, appendChild(c) { this.children.push(c) }, remove() {}, textContent: '' }),
  createTextNode: text => ({ text }),
  head: { appendChild() {} },
  body: { appendChild() {}, removeChild() {} },
  querySelector: () => null,
  execCommand: () => true,
}

const stubReact = {
  createElement: (type, props, ...children) => ({ type, props, children }),
  Fragment: 'fragment',
  useState: initial => [typeof initial === 'function' ? initial() : initial, () => {}],
  useEffect: () => {},
  useMemo: factory => factory(),
  useRef: () => ({ current: null }),
  useCallback: fn => fn,
}

new Function('window', 'document', 'navigator', source)(globalThis.window, globalThis.document, { language: 'zh-CN' })
const exports = globalThis.__registered.factory(name => {
  if (name === 'react') return stubReact
  throw new Error(`unexpected require "${name}"`)
})
const { parseSafeHtml, safeUrl } = exports.__test
if (typeof parseSafeHtml !== 'function') { console.error('sanitize-test: __test seam missing'); process.exit(1) }

let failures = 0
const check = (name, condition, detail = '') => {
  if (condition) console.log(`  ok  ${name}`)
  else { failures += 1; console.error(`FAIL  ${name}${detail === '' ? '' : ` — ${detail}`}`) }
}

/** Flatten the virtual tree into [tag, props, text] tuples. Text children are plain strings. */
function flatten(nodes, out = []) {
  for (const node of nodes) {
    if (typeof node === 'string') { out.push({ text: node }); continue }
    out.push({ tag: node.tag, props: node.props ?? {} })
    flatten(node.children ?? [], out)
  }
  return out
}

const render = html => flatten(parseSafeHtml(html))

// ── script injection ─────────────────────────────────────────────────────────
{
  const nodes = render('<p>safe</p><script>alert(1)</script><p>after</p>')
  check('script element dropped', nodes.every(node => node.tag !== 'script'))
  check('script content dropped', !nodes.some(node => typeof node.text === 'string' && node.text.includes('alert')))
  check('surrounding text kept', nodes.some(node => node.text === 'safe') && nodes.some(node => node.text === 'after'))
}
{
  const nodes = render('<img src="x" onerror="alert(1)"><p onclick="alert(1)" style="color:red">t</p>')
  check('event handlers dropped', nodes.filter(node => node.props !== undefined).every(node => Object.keys(node.props).every(key => !key.toLowerCase().startsWith('on'))))
  check('img without safe src dropped entirely', !nodes.some(node => node.tag === 'img'))
}
{
  const nodes = render('<div><style>*{display:none}</style>kept</div>')
  check('style element and content dropped', !nodes.some(node => node.tag === 'style')
    && !nodes.some(node => typeof node.text === 'string' && node.text.includes('display')))
}
{
  const nodes = render('<a href="javascript:alert(1)">x</a><a href="JAVASCRIPT:alert(1)">y</a><a href="data:text/html,x">z</a>')
  check('javascript: and data: hrefs dropped', nodes.filter(node => node.tag === 'a').every(node => node.props.href === undefined))
}
{
  const nodes = render('<iframe src="https://evil.example"></iframe><object data="x"></object><embed src="x"><svg onload=alert(1)><circle/></svg>')
  check('iframe/object/embed/svg dropped', !nodes.some(node => ['iframe', 'object', 'embed', 'svg', 'circle'].includes(node.tag)))
}
{
  const nodes = render('<form action="https://evil.example"><input type="text"><button>go</button></form>plain')
  check('form/input/button dropped', !nodes.some(node => ['form', 'input', 'button'].includes(node.tag)))
}

// ── well-formed content survives ─────────────────────────────────────────────
{
  const html = '<h2>标题</h2><p>段落 <strong>加粗</strong> 与 <em>斜体</em>、<code>code</code>。</p><ul><li>一</li><li>二</li></ul><blockquote>引用</blockquote><hr><pre><code>npm i</code></pre><table><thead><tr><th>列</th></tr></thead><tbody><tr><td>值</td></tr></tbody></table>'
  const nodes = render(html)
  check('headings kept', nodes.some(node => node.tag === 'h2'))
  check('list kept', nodes.some(node => node.tag === 'ul') && nodes.some(node => node.tag === 'li'))
  check('table kept', nodes.some(node => node.tag === 'table') && nodes.some(node => node.tag === 'td'))
  check('pre+code kept', nodes.some(node => node.tag === 'pre') && nodes.some(node => node.tag === 'code'))
  check('text preserved', nodes.some(node => typeof node.text === 'string' && node.text.includes('加粗')))
}
{
  const nodes = render('<a href="https://example.com/doc" title="doc">link</a>')
  const anchor = nodes.find(node => node.tag === 'a')
  check('https link kept with safe target', anchor !== undefined
    && anchor.props.href === 'https://example.com/doc'
    && anchor.props.target === '_blank'
    && anchor.props.rel === 'noopener noreferrer')
}
{
  const nodes = render('<img src="data:image/png;base64,iVBORw0KGgo=" alt="pixel" width="4">')
  const img = nodes.find(node => node.tag === 'img')
  check('data:image kept with alt/width', img !== undefined && img.props.src.startsWith('data:image/png') && img.props.alt === 'pixel' && img.props.width === 4)
}
{
  const nodes = render('<p style="color: red; background-color:#123; position:fixed; left:0">styled</p>')
  const p = nodes.find(node => node.tag === 'p')
  check('style allowlist', p.props.style !== undefined
    && p.props.style.color === 'red'
    && p.props.style.backgroundColor === '#123'
    && p.props.style.position === undefined
    && p.props.style.left === undefined)
}
{
  const nodes = render('<div><span>unwrapped content</span></div><video src="x"></video><details><summary>more</summary>body</details>')
  check('unknown media element unwrapped, children kept', !nodes.some(node => node.tag === 'video')
    && nodes.some(node => node.tag === 'details') && nodes.some(node => node.tag === 'summary'))
}

// ── malformed input degrades gracefully ──────────────────────────────────────
{
  check('empty input -> empty tree', parseSafeHtml('').length === 0 && parseSafeHtml('   ').length === 0)
  check('non-string -> empty tree', parseSafeHtml(undefined).length === 0 && parseSafeHtml(null).length === 0)
  const nodes = render('<p>unclosed <b>bold <i>italic')
  check('unclosed tags still render their text', nodes.some(node => node.text === 'unclosed ') && nodes.some(node => node.text === 'bold '))
  const stray = render('</p></div>stray close</nonexistent>')
  check('stray closes do not crash', stray.some(node => node.text === 'stray close'))
  const trick = render('<<script>alert(1)</script>')
  check('mangled tag open is text or dropped, never script', !flatten(trick).some(node => node.tag === 'script'))
  const huge = render(`<p>${'x'.repeat(100)}</p>`.repeat(3000))
  check('element cap holds', flatten(huge).filter(node => node.tag !== undefined).length <= 4000)
}

// ── URL gate ─────────────────────────────────────────────────────────────────
check('plain https allowed', safeUrl('https://example.com/a?b=1') !== undefined)
check('protocol-relative rejected', safeUrl('//example.com/x') === undefined)
check('mailto allowed', safeUrl('mailto:a@b.co') !== undefined)
check('fragment allowed', safeUrl('#anchor') !== undefined)
check('bare word rejected', safeUrl('javascript&colon;alert') === undefined)
check('data:image allowed for images only', safeUrl('data:image/gif;base64,R0lGOD', true) !== undefined && safeUrl('data:image/gif;base64,R0lGOD') === undefined)
check('data:text/html rejected', safeUrl('data:text/html;base64,PHNjcmlwdD4=', true) === undefined)
check('length cap', safeUrl(`https://example.com/${'a'.repeat(3000)}`) === undefined)

if (failures === 0) console.log('sanitize-test: OK')
else { console.error(`sanitize-test: ${failures} failure(s)`); process.exit(1) }
