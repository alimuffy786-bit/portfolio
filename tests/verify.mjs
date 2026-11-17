// ─────────────────────────────────────────────────────────────────────────────
// verify.mjs — the portfolio's acceptance harness, rebuilt for §13c (frame-only).
//
// Runs the real page in Chrome over CDP, at every audited width, and asserts the
// macro grid: ONE centred 1280px frame, held as the middle TRACK of a three-column
// bleed layer (--frame-cols) rather than as a padding, so the cinematic blocks
// (.camp-grid, .wall-room, .mag-spread, .case-03) span 1/-1 and run edge to edge;
// prose is capped at 42ch and CENTRED in its column instead of hugging its left
// edge; and the sub-1200 bands are byte-identical to the baseline.
//
// STEP 8h also owns A1b: Lenis 1.3.25 is alive above 768px and gone below it, the two
// swipe decks (and the two overlay scroll roots) opt out with data-lenis-prevent, the
// wheel is demonstrably smoothed, and the view() timelines still advance under it.
//
//   node tests/verify.mjs      (or: node tests/verify.mjs --shots | --report)
//
// Overrides (env): PORTFOLIO_CHROME=… PORTFOLIO_PORT=… PORTFOLIO_DBG=…
//
// Exit code 0 = green. Every assertion prints one indented line.
// ─────────────────────────────────────────────────────────────────────────────
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

/* THIS FILE LIVES IN THE REPO NOW. Everything it touches is resolved from here rather than from a
   hardcoded checkout path or %TEMP%: ROOT is the repo one level up from `tests/`, and every
   throwaway (Chrome profile, screenshots, logs) lands in `.cdp-run/` beside it — which `.gitignore`
   keeps out of history, so a run never leaves anything behind in the machine's temp folder.
   PORTFOLIO_CHROME / PORTFOLIO_PORT / PORTFOLIO_DBG exist so a second Chrome on a taken port is an
   env var away, not an edit. */
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const PORT = Number(process.env.PORTFOLIO_PORT || 8766);
const DBG  = Number(process.env.PORTFOLIO_DBG || 9334);
const CHROME = process.env.PORTFOLIO_CHROME
  || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const RUN = Date.now();
const RUNDIR = path.join(ROOT, '.cdp-run');
const PROFILE = path.join(RUNDIR, 'profile-' + RUN);
const SHOTS = process.argv.includes('--shots');
const SHOTDIR = path.join(RUNDIR, 'shots', String(RUN));

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2',
  /* §06 — the masthead is a plain .ttf carried by the repo. Without this entry the static server
     answers with its octet-stream default, Chrome refuses the face with a MIME warning, and 11j
     (no console error) fails on a file that is perfectly fine. */
  '.ttf': 'font/ttf',
  '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8',
};

const sleep = ms => new Promise(r => setTimeout(r, ms));

/* A TRANSITION IS NOT A STATE. Several steps below assert the GROUND or the BOX of something that
   arrives on a CSS transition — the head's phase fading in under the sheet, the skip link dropping
   into view on focus. Sampling those on a stopwatch measures whichever frame the machine happened to
   be on, so a loaded box reports `rgba(234, 231, 224, 0.467)` and a quiet one reports `0.85`, on the
   same page. `settles` asks again until the value has actually arrived, so the two boxes agree. The
   predicate is the assertion's own, so a value that never arrives still fails, with the last sample.
   It reaches the session through `ws` rather than a parameter because it is declared out here with
   the other helpers, above the block that owns the connection. */
async function settles(expr, pred, tries = 30, step = 60) {
  let last = null;
  for (let i = 0; i < tries; i++) {
    last = await ws.eval(expr);
    if (pred(last)) return last;
    await sleep(step);
  }
  return last;
}

/* §16d — "AT REST" MEANS NOTHING IS TOUCHING IT. A plate inverts to the sheet's dark ground under
   the pointer, and in the index the four plates tile the whole screen — so one of them is ALWAYS
   hovered. That is the design, not a bug in the probe: the reading below therefore asks that every
   plate is its own `--pop` except at most one, which must be the dark ground. Three at rest, one
   under the hand. */
const restInk = ink => Array.isArray(ink) && ink.length === 4
  && ink.filter(t => t.bg === t.pop).length >= 3
  && ink.every(t => t.bg === t.pop || t.bg === 'rgb(20, 17, 16)');

/* §16 — A VIEW IS A PLACE, NOT A SCROLL POSITION. The three states became exclusive: the gate is
   250vh with the four sections `hidden` inside it, and a view swaps the gate out for exactly ONE
   section. So every measurement that used to be taken by scrolling past the fold has to be taken
   INSIDE a chosen view — these three doors call the same module a press calls, and every step below
   that needs a section goes through them instead of through `scrollTo`. */
async function enterView(id) {
  await ws.eval(`window.__ad && window.__ad.view(${JSON.stringify(id || 'who')})`);
  await settles(`window.__ad.mode()`, v => v === 'view');
  await sleep(240);
}
async function enterIndex() {
  await ws.eval(`window.__ad && window.__ad.index()`);
  await settles(`window.__ad.mode()`, v => v === 'index');
  await sleep(240);
}
async function enterCover() {
  await ws.eval(`window.__ad && window.__ad.cover()`);
  await settles(`window.__ad.mode()`, v => v === 'cover');
  await sleep(200);
}
// THE END OF THE GATE (§16d). The gate is one screen and owns its own progress, so there is no
// scroll position that means "the contents are up". `__ad.index()` is the same instant route a deep
// link takes, and every step that used to scroll to the end of a 250vh block calls this instead.
const GATE_END = `window.__ad && window.__ad.index()`;
// …and any position INSIDE the morph is one call on the module's own machine — `setProgress` is the
// only writer of `state.p` a probe is allowed to be, and it parks the plates for measurement.
const GATE_P = p => `window.__ad.index(); window.__ad.gate.setProgress(${p});`;

function serve() {
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent((req.url || '/').split('?')[0]);
    if (p.endsWith('/')) p += 'index.html';
    const abs = path.normalize(path.join(ROOT, p));
    if (!abs.startsWith(ROOT)) { res.writeHead(403).end(); return; }
    fs.readFile(abs, (err, buf) => {
      if (err) { res.writeHead(404).end('404'); return; }
      res.writeHead(200, {
        'content-type': TYPES[path.extname(abs).toLowerCase()] || 'application/octet-stream',
        'cache-control': 'no-store',
      });
      res.end(buf);
    });
  });
  return new Promise((res, rej) => {
    server.once('error', rej);
    server.listen(PORT, '127.0.0.1', () => res(server));
  });
}

async function waitJson(url, tries = 150) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(url); if (r.ok) return await r.json(); } catch { /* not up yet */ }
    await sleep(100);
  }
  throw new Error('timed out waiting for ' + url);
}

class CDP {
  constructor(ws) {
    this.ws = ws; this.n = 0; this.pending = new Map(); this.events = new Map();
    ws.addEventListener('message', ev => {
      const m = JSON.parse(ev.data);
      if (m.id && this.pending.has(m.id)) {
        const { resolve, reject } = this.pending.get(m.id);
        this.pending.delete(m.id);
        if (m.error) reject(new Error(m.error.message)); else resolve(m.result);
        return;
      }
      const ls = this.events.get(m.method);
      if (ls) ls.forEach(fn => fn(m.params));
    });
  }
  static async open(url) {
    const ws = new WebSocket(url);
    await new Promise((res, rej) => {
      ws.addEventListener('open', res, { once: true });
      ws.addEventListener('error', () => rej(new Error('ws error')), { once: true });
    });
    return new CDP(ws);
  }
  send(method, params = {}) {
    const id = ++this.n;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  on(method, fn) {
    if (!this.events.has(method)) this.events.set(method, []);
    this.events.get(method).push(fn);
  }
  once(method, ms = 15000) {
    return Promise.race([
      new Promise(res => this.on(method, res)),
      sleep(ms).then(() => { throw new Error('timeout: ' + method); }),
    ]);
  }
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', {
      expression, returnByValue: true, awaitPromise: true, userGesture: true,
    });
    if (r.exceptionDetails) {
      throw new Error('eval: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
    }
    return r.result.value;
  }
}

// ── assertions ───────────────────────────────────────────────────────────────
let pass = 0; const failures = [];
const group = name => console.log('\n' + name);
function ok(cond, label, detail) {
  if (cond) { pass++; return; }
  failures.push(label + (detail ? ` — ${detail}` : ''));
  console.log(`   FAIL  ${label}${detail ? `  [${detail}]` : ''}`);
}
const near = (a, b, tol = 1) => Math.abs(a - b) <= tol;
const n2 = v => Math.round(v * 100) / 100;
// a measurement worth keeping in the log even when it passes (8a uses the same idiom)
const note = s => console.log('   note  ' + s);
// ── STEP 8a — STATIC: the source ─────────────────────────────────────────────
const html = await fsp.readFile(path.join(ROOT, 'index.html'), 'utf8');
const styleTag = html.match(/<style>([\s\S]*?)<\/style>/);
const cssText = (styleTag ? styleTag[1] : '').replace(/\/\*[\s\S]*?\*\//g, '');
const JS_SET = new Set(['--sbw', '--r', '--x', '--y', '--gx', '--gy', '--ox', '--oy', '--art-ratio',
  '--bubble-x', '--bubble-y', '--sheen-a',
  // §16 — the gate writes its two: the scrub position on the stage, and the ink on the flood; and
  // the pull-up drawer writes its own travel as a fraction, `--pull`. `--bleach` is the morph's: the
  // ink each plate still owes the block it grew out of (1 = the block's colour, 0 = the dark ground).
  '--gate-p', '--flood', '--pull', '--bleach']);

group('STEP 8a — THE FRAME IN THE SOURCE (rail removed, 1280 frame declared)');
ok(!/class="rail"/.test(html), '8a.1  no <aside class="rail"> in the markup');
ok(!/rail-in|rail-note|rail-lbl/.test(html), '8a.2  no rail apparatus classes in the markup');
ok(!/\.rail(?![-\w])/.test(cssText), '8a.3  no .rail selector in the stylesheet');
ok(!/--rail|--stick-top/.test(cssText), '8a.4  no --rail / --stick-top token left behind');
ok(!/1520px|1689px/.test(cssText), '8a.5  no 1520px frame or 1689px threshold left');
ok(/--maxw:1280px/.test(cssText), '8a.6  --maxw is 1280px');
ok(/--measure:42ch/.test(cssText), '8a.7  --measure is 42ch');
ok(/--gutter:max\(var\(--pad\),\s*calc\(\(100% - var\(--maxw\)\) \/ 2\)\)/.test(cssText),
  '8a.8  --gutter is still max(--pad, (100% - --maxw)/2)');
ok(!/grid-template-columns:var\(--rail\)/.test(cssText), '8a.9  no rail track in any grid');
ok(!/minmax\(0,var\(--measure\)\)/.test(cssText), '8a.10 the case-02 track override is gone');
ok(/\.frame-main\{display:contents;\}/.test(cssText), '8a.11 .frame-main is contents below 1200');
ok(/\.frame-main\{display:block;min-width:0;\}/.test(cssText), '8a.12 .frame-main is a plain block at >=1200');
ok(/\.camp-grid,\.who-body\{position:relative;\}/.test(cssText), '8a.13 the two splits host the hairline');
ok(/\.case-02 \.camp-grid\{display:grid;grid-template-columns:1fr 1fr;gap:5rem;align-items:start;\}/.test(cssText),
  '8a.14 the campaign spread is back on its base 1fr 1fr + 5rem');
ok([...cssText.matchAll(/\.case-02 \.camp-grid\{([^}]*)\}/g)].every(m => !/--measure/.test(m[1])),
  '8a.14b no .case-02 .camp-grid rule mentions the measure');
ok(/--frame-w:1px/.test(cssText) && /--frame:rgba\(20,16,12,0\.06\)/.test(cssText),
  '8a.15 the fine-line tokens survive (used by the hairlines)');
ok(/--frame-cols:minmax\(var\(--pad\),1fr\) minmax\(0,var\(--maxw\)\) minmax\(var\(--pad\),1fr\)/.test(cssText),
  '8a.19 the frame is declared as three tracks as well as a gutter (--frame-cols)');
ok(!/-50vw\)/.test(cssText) && !/width:100vw/.test(cssText),
  '8a.20 no 100vw / calc(50% - 50vw) breakout (100vw includes the classic scrollbar)');
ok(/#work,#magazine\{display:grid;grid-template-columns:var\(--frame-cols\);padding-inline:0;\}/.test(cssText),
  '8a.21 #work and #magazine trade padding-inline for the frame tracks');
ok(/#work > \.frame-main\{display:contents;\}/.test(cssText),
  '8a.22 #work .frame-main goes transparent above 1200');
ok(/\.case > \.camp-grid,\.case > \.wall-room\{grid-column:1\/-1;\}/.test(cssText)
  && /#magazine > \.mag-spread\{grid-column:1\/-1;/.test(cssText),
  '8a.23 the three cinematic blocks are grid-column:1/-1 (they span the monitor)');
ok(/\.who-text p,\.case-p,\.dyk-text,\.skills-text\{max-width:var\(--measure\);margin-inline:auto;\}/.test(cssText),
  '8a.24 the measure is centred in its column, not pinned to its left edge');

const defined = new Set([...cssText.matchAll(/(--[a-z0-9-]+)\s*:/g)].map(m => m[1]));
const used = new Set([...cssText.matchAll(/var\((--[a-z0-9-]+)/g)].map(m => m[1]));
const undef = [...used].filter(u => !defined.has(u) && !JS_SET.has(u));
const unused = [...defined].filter(d => !used.has(d) && !JS_SET.has(d));
ok(undef.length === 0, '8a.16 every var(--x) resolves (declared, or set from main.js)', undef.join(', '));
if (unused.length) console.log(`   note  custom properties with no CSS consumer: ${unused.join(', ')}`);

// structural: three wrappers, one per numbered section, wrapping everything
const wrappers = [...html.matchAll(/<div class="frame-main">/g)].length;
ok(wrappers === 3, '8a.17 exactly three .frame-main wrappers', String(wrappers));
for (const id of ['who', 'work', 'reach']) {
  const re = new RegExp(`<section id="${id}"[^>]*>\\s*<div class="frame-main">`);
  ok(re.test(html), `8a.18 #${id} opens directly on its .frame-main wrapper`);
}

// ── boot ─────────────────────────────────────────────────────────────────────
const server = await serve();
const chrome = spawn(CHROME, [
  '--headless=new',
  `--remote-debugging-port=${DBG}`,
  `--user-data-dir=${PROFILE}`,
  '--no-first-run', '--no-default-browser-check', '--disable-extensions',
  '--disable-background-networking', '--disable-sync', '--disable-gpu',
  '--force-device-scale-factor=1', '--window-size=1440,900',
  'about:blank',
], { stdio: 'ignore' });

let ws = null;
try {
  await waitJson(`http://127.0.0.1:${DBG}/json/version`);
  const target = await (await fetch(`http://127.0.0.1:${DBG}/json/new?about:blank`, { method: 'PUT' })).json();
  const cdp = await CDP.open(target.webSocketDebuggerUrl);
  ws = cdp;

  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Log.enable');
  await cdp.send('Page.setLifecycleEventsEnabled', { enabled: true });

  const consoleErrors = [];
  cdp.on('Runtime.exceptionThrown', p => consoleErrors.push('exception: ' + (p.exceptionDetails?.exception?.description || p.exceptionDetails?.text)));
  cdp.on('Runtime.consoleAPICalled', p => {
    if (p.type === 'error' || p.type === 'assert') consoleErrors.push((p.args || []).map(a => a.value ?? a.description ?? a.type).join(' '));
  });
  cdp.on('Log.entryAdded', p => { if (p.entry?.level === 'error') consoleErrors.push(p.entry.text); });

  const loaded = cdp.once('Page.loadEventFired');
  await cdp.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/index.html` });
  await loaded;
  await cdp.eval('document.fonts.ready.then(() => document.fonts.status)');
  await sleep(400);

  group('STEP 8b — BOOT (no console noise, the deck and the wall are alive)');
  ok(consoleErrors.length === 0, '8b.1  no console errors or uncaught exceptions', consoleErrors.slice(0, 3).join(' | '));
  ok(await cdp.eval(`document.getElementById('who') !== null`), '8b.2  the document parsed');
  ok(await cdp.eval(`document.querySelectorAll('#wallRow .frame').length === 18`), '8b.3  the wall built its 18 frames');
  ok(await cdp.eval(`document.querySelectorAll('.rail').length === 0`), '8b.4  zero .rail nodes in the live DOM');
  ok(await cdp.eval(`document.querySelectorAll('.frame-main').length === 3`), '8b.5  three .frame-main nodes in the live DOM');
  // ── the measurement snapshot ───────────────────────────────────────────────
  const SNAP = `(() => {
    const W = document.documentElement.clientWidth, VW = window.innerWidth;
    const px = v => Math.round(v * 100) / 100;
    const num = v => { const n = parseFloat(v); return Number.isFinite(n) ? px(n) : null; };
    const R = el => { const r = el.getBoundingClientRect(); return { l: px(r.left), r: px(r.right), t: px(r.top + window.scrollY), w: px(r.width), h: px(r.height) }; };
    const q = s => document.querySelector(s);
    const cs = (el, pseudo) => getComputedStyle(el, pseudo);
    const o = {
      W, VW,
      gutter: px(Math.max(VW * 0.05, (W - 1280) / 2)),
      inner: 0,           // filled below: the 100% basis is the client box, not the viewport
      overflow: document.documentElement.scrollWidth - W,
      navPad: num(cs(q('.head-bar')).paddingLeft),
      footPad: num(cs(q('.footer')).paddingLeft),
    };
    o.inner = px(W - 2 * o.gutter);
    for (const id of ['who', 'work', 'reach']) {
      const sec = document.getElementById(id), fm = sec.querySelector('.frame-main');
      o[id] = R(sec);
      o[id + 'Pad'] = num(cs(sec).paddingLeft);
      o[id + 'PadT'] = num(cs(sec).paddingTop);
      o[id + 'PadB'] = num(cs(sec).paddingBottom);
      o[id + 'Display'] = cs(sec).display;
      o[id + 'Frame'] = Object.assign({ display: cs(fm).display }, R(fm));
    }
    o.magazine = R(document.getElementById('magazine'));
    o.magazinePad = num(cs(document.getElementById('magazine')).paddingLeft);
    const cases = [...document.querySelectorAll('#work .case')];
    o.caseLeft = cases.map(c => R(c).l);
    o.caseRight = cases.map(c => R(c).r);
    o.caseContentLeft = cases.map(c => (c.firstElementChild ? R(c.firstElementChild).l : null));
    o.caseTracks = cases.map(c => cs(c).gridTemplateColumns.split(' ').map(num));
    o.casePad = num(cs(cases[0]).paddingLeft);
    const wk = document.getElementById('work');
    o.workTracks = cs(wk).gridTemplateColumns.split(' ').map(num);
    o.workPad = num(cs(wk).paddingLeft);
    o.magTracks = cs(document.getElementById('magazine')).gridTemplateColumns.split(' ').map(num);
    const eid = document.getElementById('eidImg');
    o.eid = eid ? R(eid) : null;
    o.eidCap = eid ? num(cs(eid).maxWidth) : null;
    const prose = sel => [...document.querySelectorAll(sel)].map(el => {
      const rr = R(el), p = el.parentElement, pk = cs(p), pr = p.getBoundingClientRect();
      const fl = px(pr.left + parseFloat(pk.borderLeftWidth) + parseFloat(pk.paddingLeft));
      const fr = px(pr.right - parseFloat(pk.borderRightWidth) - parseFloat(pk.paddingRight));
      return {
        w: rr.w, mw: num(cs(el).maxWidth), ml: num(cs(el).marginLeft), mr: num(cs(el).marginRight),
        l: rr.l, r: rr.r, cls: el.className || el.tagName,
        parent: p.className || p.tagName, pdisplay: pk.display,
        field: px(fr - fl), airL: px(rr.l - fl), airR: px(fr - rr.r),
      };
    });
    o.caseP = prose('.case-p'); o.whoP = prose('.who-text p');
    o.foot = prose('.footnotes'); o.skills = prose('.skills-line'); o.dyk = prose('.dyk-text');
    o.log = prose('.log-entries');
    o.vis = {};
    for (const s of ['.camp-grid', '.wall-room', '.mag-spread', '.ops-grid', '.mag-manifesto', '.case-03', '.leaflet-stage']) {
      const el = q(s);
      if (!el) { o.vis[s] = null; continue; }
      const st = cs(el);
      o.vis[s] = Object.assign(R(el), {
        padL: num(st.paddingLeft), padR: num(st.paddingRight),
        borL: num(st.borderLeftWidth), borR: num(st.borderRightWidth),
      });
    }
    const cg = q('.camp-grid');
    o.campTracks = cg ? cs(cg).gridTemplateColumns.split(' ').map(num) : null;
    o.campGap = cg ? num(cs(cg).columnGap) : null;
    o.campCols = cg ? [...cg.children].map(R) : null;
    const cf = q('.case-01 .case-foot');
    o.caseFoot = cf ? R(cf) : null;
    o.caseFootTracks = cf ? cs(cf).gridTemplateColumns.split(' ').map(num) : null;
    o.campRight = q('.camp-right') ? R(q('.camp-right')) : null;
    o.magPlate = q('.mag-plate') ? R(q('.mag-plate')) : null;
    o.magColophon = q('.mag-colophon') ? R(q('.mag-colophon')) : null;
    o.wallRow = q('.wall-row') ? R(q('.wall-row')) : null;
    const hb = el => { const s = cs(el, '::before'); return { content: s.content, w: num(s.width), left: num(s.left), bg: s.backgroundColor }; };
    o.hair = { camp: cg ? hb(cg) : null, who: hb(q('.who-body')) };
    o.whoCols = [...q('.who-body').children].map(R);
    o.magEdges = ['.mag-masthead', '.mag-manifesto', '.mag-quote'].map(s => { const el = q(s); return el ? R(el).l : null; });
    o.magBorder = (s => [s.borderTopWidth, s.borderRightWidth, s.borderBottomWidth, s.borderLeftWidth])(cs(q('#magazine')));
    const co = q('.reach-coords');
    o.coords = co && cs(co).display !== 'none' ? R(co) : null;
    return o;
  })()`;

  const WIDTHS = [390, 768, 834, 1024, 1199, 1200, 1280, 1440, 1680, 1920, 2560, 3840];
  const S = new Map();
  for (const w of WIDTHS) {
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: w, height: 900, deviceScaleFactor: 1, mobile: false });
    await cdp.eval('window.scrollTo({top:0,behavior:"instant"})');
    await sleep(130);
    S.set(w, await cdp.eval(SNAP));
  }
  // ── STEP 8c — the frame, measured ────────────────────────────────────────
  group('STEP 8c — THE FRAME, MEASURED (one centred 1280 column, inside a bleed layer)');
  for (const w of WIDTHS) {
    const s = S.get(w), tag = String(w).padStart(4);
    ok(s.overflow <= 0, `${tag}  no horizontal overflow`, `scrollWidth - clientWidth = ${s.overflow}`);
    ok(near(s.whoPad, s.gutter, 0.6), `${tag}  #who padding-inline = gutter`, `${s.whoPad} vs ${s.gutter}`);
    ok(near(s.navPad, s.gutter, 0.6), `${tag}  the bar sits on the same gutter`, `${s.navPad} vs ${s.gutter}`);
    ok(near(s.footPad, s.gutter, 0.6), `${tag}  footer sits on the same gutter`, `${s.footPad} vs ${s.gutter}`);
    ok(near(s.magazine.l, 0, 0.5) && near(s.magazine.w, s.W, 0.5),
      `${tag}  #magazine stays full-bleed`, `${s.magazine.w} vs ${s.W}`);
    if (w < 1200) {
      // display:contents generates no box, so the wrapper cannot be measured — the section
      // itself is full-bleed and its own --pad is what used to be the frame
      for (const id of ['who', 'work', 'reach']) {
        ok(s[id + 'Frame'].display === 'contents',
          `${tag}  #${id} .frame-main is display:contents (sub-1200 untouched)`, s[id + 'Frame'].display);
        ok(near(s[id].l, 0, 0.5) && near(s[id].w, s.W, 0.5),
          `${tag}  #${id} keeps its full-bleed band`, `${s[id].l}..${n2(s[id].l + s[id].w)}`);
      }
      ok(near(s.casePad, s.gutter, 0.6),
        `${tag}  the case sheet still carries the 5vw gutter`, String(s.casePad));
      ok(s.reachDisplay === 'flex', `${tag}  #reach is a flex column`, s.reachDisplay);
      ok(s.workDisplay === 'block', `${tag}  #work is a plain block`, s.workDisplay);
      ok(near(s.magazinePad, s.gutter, 0.6),
        `${tag}  #magazine frames its content with padding`, `${s.magazinePad} vs ${s.gutter}`);
      ok(s.caseLeft.every(l => near(l + s.casePad, s.gutter, 1)),
        `${tag}  every .case starts on the frame`, s.caseLeft.map(l => l + s.casePad).join(','));
      ok(s.workTracks.length === 1 && s.workTracks[0] === null,
        `${tag}  #work has no grid track below 1200`, String(s.workTracks));
    } else {
      // §13c-2: the frame is a TRACK now, not a padding. #work is the grid that holds the
      // full-bleed bands; track 2 of it (and of every .case) is the same 1280 column.
      ok(s.workDisplay === 'grid', `${tag}  #work is the frame grid`, s.workDisplay);
      ok(near(s.workPad, 0, 0.5), `${tag}  #work carries no inline padding`, String(s.workPad));
      ok(s.workTracks.length === 3, `${tag}  #work has three tracks`, s.workTracks.join(' / '));
      ok(near(s.workTracks[0], s.gutter, 1) && near(s.workTracks[1], s.inner, 1)
        && near(s.workTracks[2], s.W - s.gutter - s.inner, 1),
        `${tag}  #work's tracks are [gutter | inner | gutter]`,
        `${s.workTracks.join(' / ')} vs ${s.gutter} / ${s.inner} / ${n2(s.W - s.gutter - s.inner)}`);
      ok(s.workFrame.display === 'contents',
        `${tag}  #work .frame-main is transparent (the cases are grid items)`, s.workFrame.display);
      for (const id of ['who', 'reach']) {
        const f = s[id + 'Frame'];
        ok(f.display === 'block', `${tag}  #${id} .frame-main is still a real block`, f.display);
        ok(near(f.l, s.gutter, 1) && near(f.r, s.W - s.gutter, 1),
          `${tag}  #${id} column spans the frame`, `${f.l}..${f.r} vs ${s.gutter}..${n2(s.W - s.gutter)}`);
        ok(near(f.w, s.inner, 1), `${tag}  #${id} column is min(90vw, 1280)`, `${f.w} vs ${s.inner}`);
      }
      ok(s.reachDisplay === 'flex',
        `${tag}  #reach is still a flex column (no grid skeleton)`, s.reachDisplay);
      ok(near(s.casePad, 0, 0.5),
        `${tag}  .case adds no inline padding (the gutter is a track)`, String(s.casePad));
      ok(s.caseLeft.every(l => near(l, 0, 0.5)) && s.caseRight.every(r => near(r, s.W, 0.5)),
        `${tag}  every .case is a full-bleed band`,
        s.caseLeft.map((l, i) => `${l}..${s.caseRight[i]}`).join(' '));
      ok(s.caseContentLeft.every(l => near(l, s.gutter, 1)),
        `${tag}  every .case opens its content on the frame`, s.caseContentLeft.join(','));
      ok(s.caseTracks.every(t => t.length === 3 && near(t[0], s.gutter, 1) && near(t[1], s.inner, 1)),
        `${tag}  every .case repeats the frame tracks`, s.caseTracks.map(t => t.join('/')).join('  '));
      ok(near(s.magazinePad, 0, 0.5),
        `${tag}  #magazine frames its content with a track, not padding`, String(s.magazinePad));
      ok(s.magTracks.length === 3 && near(s.magTracks[0], s.gutter, 1) && near(s.magTracks[1], s.inner, 1),
        `${tag}  #magazine's tracks are the frame`, s.magTracks.join(' / '));
      ok(s.eid && near(s.eid.l, 0, 0.5),
        `${tag}  the campaign plate touches the monitor's left edge`, s.eid ? String(s.eid.l) : 'missing');
      const above = s.reachFrame.t - (s.reach.t + s.reachPadT);
      const below = (s.reach.t + s.reach.h - s.reachPadB) - (s.reachFrame.t + s.reachFrame.h);
      ok(near(above, below, 1.5),
        `${tag}  #reach centres its one column in 80vh`, `${n2(above)} above / ${n2(below)} below`);
      ok(s.coords === null || near(s.coords.r, s.W - s.gutter, 1),
        `${tag}  .reach-coords keeps the frame edge`,
        s.coords ? `${s.coords.r} vs ${n2(s.W - s.gutter)}` : 'hidden');
    }
  }

  // ── STEP 8d — the measure ────────────────────────────────────────────────
  group('STEP 8d — THE MEASURE (42ch for prose, and only for prose)');
  const chProbe = await cdp.eval(`(() => {
    const p = document.querySelector('.case-p'), st = getComputedStyle(p);
    const sp = document.createElement('span');
    sp.style.cssText = 'position:absolute;visibility:hidden;white-space:pre;font:' + st.font + ';letter-spacing:' + st.letterSpacing;
    sp.textContent = '0'.repeat(42);
    p.appendChild(sp);
    const w = sp.getBoundingClientRect().width; sp.remove();
    return { fortyTwoCh: Math.round(w * 100) / 100, maxWidth: parseFloat(st.maxWidth) };
  })()`);
  ok(near(chProbe.maxWidth, chProbe.fortyTwoCh, chProbe.fortyTwoCh * 0.02),
    '8d.1  --measure resolves to exactly 42ch of the prose face',
    `${chProbe.maxWidth} vs ${chProbe.fortyTwoCh}`);

  for (const w of WIDTHS) {
    const s = S.get(w), tag = String(w).padStart(4);
    if (w < 1200) {
      // the shot below 1200 is a shot of the OLD page: the §13c measure must not be in
      // force here, so no prose block may be sitting on the 42ch number
      const onMeasure = [...s.caseP, ...s.whoP, ...s.foot, ...s.skills]
        .filter(e => e.mw !== null && Math.abs(e.mw - chProbe.maxWidth) < 2);
      ok(onMeasure.length === 0, `${tag}  the 42ch measure is not applied below 1200`,
        onMeasure.map(e => `${e.cls}:${e.mw}`).join(' '));
    } else {
      const all = [...s.caseP, ...s.whoP, ...s.foot, ...s.skills];
      ok(all.length > 0 && all.every(e => e.mw !== null), `${tag}  every prose block carries the measure`);
      ok(all.every(e => e.w <= e.mw + 0.6), `${tag}  no prose line exceeds the measure`,
        all.filter(e => e.w > e.mw + 0.6).map(e => `${e.w}>${e.mw}`).join(' '));
      ok(new Set(all.map(e => e.mw)).size === 1, `${tag}  one number for every prose block`,
        [...new Set(all.map(e => e.mw))].join(','));
      ok(s.log.every(e => e.mw === null || e.mw > 343), `${tag}  .log-entries stays exempt`);
    }
  }
  // ...and the measure is CENTRED in its column instead of hugging the left edge (§13c-2).
  // A 343px block against the left edge of a 1280 frame leaves 937px of dead air on one
  // side; `margin-inline:auto` splits that air evenly and the block reads as an editorial
  // column. Measured as AIR, not as margins: a grid item's `auto` margin computes to 0px
  // even while it centres, so margins alone would have passed the very bug this fixes.
  // Below 1200 there are no auto margins at all — the proof that none of this reaches the
  // audited phone and tablet bands.
  for (const w of WIDTHS) {
    const s = S.get(w), tag = String(w).padStart(4);
    const all = [...s.caseP, ...s.whoP, ...s.foot, ...s.skills, ...s.dyk];
    if (w < 1200) {
      // .dyk-text is left out on purpose: it has carried `margin:0 auto` in the base sheet
      // since before this pass, so its auto margins are original behaviour, not a leak.
      const off = [...s.caseP, ...s.whoP, ...s.foot, ...s.skills].filter(e => e.ml !== 0 || e.mr !== 0);
      ok(off.length === 0, `${tag}  no new auto margins below 1200`,
        off.map(e => `${e.cls}:${e.ml}/${e.mr}`).join(' '));
    } else {
      const inside = e => e.airL >= -0.5 && e.airR >= -0.5 && near(e.airL + e.w + e.airR, e.field, 1.5);
      ok(all.length > 0 && all.every(inside),
        `${tag}  every prose block is contained in its field`,
        all.filter(e => !inside(e)).map(e => `${e.cls}:${n2(e.airL)}+${n2(e.w)}+${n2(e.airR)}≠${n2(e.field)}`).join(' '));
      // a plain block parent is the direct proof: the air either side is the same number
      const blocks = all.filter(e => e.pdisplay === 'block');
      ok(blocks.length >= 5 && blocks.every(e => near(e.airL, e.airR, 1.5)),
        `${tag}  prose in a block parent is centred in it`,
        `${blocks.filter(e => !near(e.airL, e.airR, 1.5)).map(e => `${e.cls}:${e.airL}/${e.airR}`).join(' ')} (${blocks.length} blocks)`);
      // and nothing is pinned to a wide field's left edge — that IS the dead space
      const pinned = all.filter(e => e.airL < 1 && e.w < e.field - 1);
      ok(pinned.length === 0, `${tag}  no capped prose hugs a field's left edge`,
        pinned.map(e => `${e.cls}:${e.airL} of ${n2(e.field)}`).join(' '));
      // grid parents: the item has to be centred in its TRACK, not merely inside the container
      const foot = s.caseP.find(e => e.parent === 'case-foot');
      if (foot && s.caseFootTracks && s.caseFootTracks.length === 2) {
        ok(near(foot.airL, (s.caseFootTracks[0] - foot.w) / 2, 2),
          `${tag}  .case-foot's paragraph is centred in its own track`,
          `${n2(foot.airL)} vs ${n2((s.caseFootTracks[0] - foot.w) / 2)} in ${n2(s.caseFootTracks[0])}`);
      }
      const t = s.workTracks;
      const caseKids = all.filter(e => e.pdisplay === 'grid' && String(e.parent).split(' ')[0] === 'case');
      if (t.length === 3) {
        ok(caseKids.length > 0 && caseKids.every(e => near(e.l, t[0] + (t[1] - e.w) / 2, 2)),
          `${tag}  .case's own prose is centred in the frame track`,
          caseKids.filter(e => !near(e.l, t[0] + (t[1] - e.w) / 2, 2)).map(e => `${e.cls}:${e.l}`).join(' '));
      }
    }
  }
  // ── STEP 8e — the pictures leave the frame, the prose stays in it ────────
  group('STEP 8e — FULL-BLEED PICTURES, FRAMED PROSE (the breakout is exact)');
  const BLEED = ['.camp-grid', '.wall-room', '.mag-spread', '.case-03'];
  const FRAMED = ['.ops-grid', '.mag-manifesto'];
  for (const w of WIDTHS) {
    if (w < 1200) continue;
    const s = S.get(w), tag = String(w).padStart(4);
    for (const sel of BLEED) {
      const b = s.vis[sel];
      ok(b && near(b.l, 0, 1) && near(b.r, s.W, 1),
        `${tag}  ${sel} runs edge to edge`, b ? `${b.l}..${b.r} vs 0..${s.W}` : 'missing');
      ok(b && b.padL === 0 && b.padR === 0,
        `${tag}  ${sel} carries no side padding`, b ? `${b.padL} / ${b.padR}` : 'missing');
      ok(b && b.borL === 0 && b.borR === 0,
        `${tag}  ${sel} carries no side border`, b ? `${b.borL} / ${b.borR}` : 'missing');
    }
    for (const sel of FRAMED) {
      const b = s.vis[sel];
      ok(b && near(b.w, s.inner, 1) && near(b.l, s.gutter, 1),
        `${tag}  ${sel} stays framed`, b ? `${b.l}..${b.l + b.w} (${b.w}) vs ${s.gutter}..${n2(s.gutter + s.inner)}` : 'missing');
    }
    // the breakout stops on the CLIENT box: where this Chrome keeps a classic scrollbar,
    // window.innerWidth is s.W + 15, so a 100vw breakout would have overshot by that much
    ok(near(s.vis['.camp-grid'].r, s.W, 1) && s.overflow <= 0,
      `${tag}  the bleed stops on the client box, not on 100vw`,
      `right ${s.vis['.camp-grid'].r} / client ${s.W} / viewport ${s.VW}`);
  }
  // ── STEP 8f — the hairlines ──────────────────────────────────────────────
  group('STEP 8f — THE TWO HAIRLINES (drawn in the gap, costing no geometry)');
  for (const w of [1200, 1280, 1440, 1920, 2560, 3840]) {
    const s = S.get(w), tag = String(w).padStart(4);
    for (const [name, rule] of [['camp-grid', s.hair.camp], ['who-body', s.hair.who]]) {
      ok(rule && rule.content !== 'none', `${tag}  ${name}::before is generated`, rule && rule.content);
      ok(rule && near(rule.w, 1, 0.6), `${tag}  ${name}::before is one pixel`, rule && String(rule.w));
      ok(rule && /0\.06\)/.test(rule.bg || ''), `${tag}  ${name}::before is the 6% ink line`, rule && rule.bg);
    }
    // .camp-grid is `1fr 1fr + gap`, so its gap centre IS its own centre — which, now that the
    // block is full-bleed, is the monitor's centre. `left:50%` is the whole rule; the check is
    // that the two tracks stay equal (so 50% is the gap) and the line lands on the page's centre.
    const g = s.vis['.camp-grid'], gr = s.hair.camp, t = s.campTracks;
    ok(t && t.length === 2 && near(t[0], t[1], 0.5),
      `${tag}  case-02 grid is two equal tracks (override deleted)`, t && t.join(' / '));
    ok(t && t[0] > 480, `${tag}  the campaign sheet keeps its width`, t && String(t[1]));
    ok(t && s.campGap !== null && near(t[0] * 2 + s.campGap, g.w, 1),
      `${tag}  the tracks + gap fill the bleed exactly`,
      t && s.campGap !== null ? `${n2(t[0] * 2 + s.campGap)} vs ${n2(g.w)}` : 'missing');
    const x = g.l + gr.left;                       // ::before left resolves against the padding box
    ok(near(x, g.l + g.w / 2, 1.5),
      `${tag}  camp-grid::before is on the block's own centre`, `${n2(x)} vs ${n2(g.l + g.w / 2)}`);
    ok(x > g.l + t[0] - 1 && x < g.l + g.w - t[0],
      `${tag}  camp-grid::before sits in the air between the tracks`,
      `${n2(x)} in ${n2(g.l + t[0])}..${n2(g.l + g.w - t[0])}`);
    ok(near(x, s.W / 2, 1.5),
      `${tag}  the fold hairline lands on the page's centre`, `${n2(x)} vs ${n2(s.W / 2)}`);
    // .who-body keeps its asymmetric 33/67 split: the line is at (100% - gap)*0.33 + gap/2
    const C = s.whoCols;
    ok(C && C.length === 2 && s.hair.who, `${tag}  .who-body has its two columns`,
      C ? `${C[0].r} / ${C[1].l}` : 'missing');
    if (C && C.length === 2 && s.hair.who) {
      const xw = C[0].l + s.hair.who.left;
      ok(xw > C[0].r - 1 && xw < C[1].l + 1,
        `${tag}  who-body::before sits inside the gap`, `${n2(xw)} in ${C[0].r}..${C[1].l}`);
      ok(near(xw, C[0].r + (C[1].l - C[0].r) / 2, 1.5),
        `${tag}  who-body::before is centred on the gap`, `${n2(xw)} vs ${n2(C[0].r + (C[1].l - C[0].r) / 2)}`);
    }
  }
  for (const w of [390, 768, 1024, 1199]) {
    const s = S.get(w), tag = String(w).padStart(4);
    ok(s.hair.camp.content === 'none' && s.hair.who.content === 'none',
      `${tag}  no hairline is drawn below 1200`, `${s.hair.camp.content} / ${s.hair.who.content}`);
  }

  // ── STEP 8g — the magazine stays a flat field ───────────────────────────
  group('STEP 8g — #magazine IS STILL ONE FLAT FIELD');
  for (const w of WIDTHS) {
    const s = S.get(w), tag = String(w).padStart(4);
    ok(s.magBorder.every(b => parseFloat(b) === 0), `${tag}  no border on #magazine`, s.magBorder.join(' '));
    const lefts = s.magEdges.filter(v => v !== null);
    ok(lefts.length >= 3 && lefts.every(l => near(l, lefts[0], 1)),
      `${tag}  every magazine block shares one left edge`, lefts.join(','));
    ok(lefts.length >= 3 && near(lefts[0], s.gutter, 1),
      `${tag}  that edge is the frame`, `${lefts[0]} vs ${s.gutter}`);
  }
  // ── STEP 8h — the view() timelines survive ───────────────────────────────
  group('STEP 8h — THE SCROLL-DRIVEN ANIMATIONS SURVIVE THE REFRAME');
  ok(await cdp.eval(`CSS.supports('animation-timeline: view()')`), '8h.1  this Chrome has view() timelines');
  // §16 — the reveal lives in #work, and #work is not in the document until a place is chosen: its
  // view() timeline is a function of where the element sits in the scrollport, so it is read inside
  // the place it belongs to, on the page the reader actually gets.
  await enterView('work');

  // The Eid reveal is a view() timeline on an element whose HEIGHT is its timeline's
  // length: a narrower sheet is a different animation, not just a smaller picture. At full
  // entry (element bottom on viewport bottom) progress = 0.9h / (0.4h + 0.5H).
  for (const H of [900, 768]) {
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: H, deviceScaleFactor: 1, mobile: false });
    await sleep(220);
    const box = await cdp.eval(`(() => { const r = document.getElementById('eidImg').getBoundingClientRect();
      return { top: Math.round(r.top + window.scrollY), bottom: Math.round(r.bottom + window.scrollY), h: Math.round(r.height * 100) / 100 }; })()`);
    await cdp.eval(`window.scrollTo({ top: ${box.bottom - H}, behavior: 'instant' })`);
    await cdp.eval('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(1))))');
    await sleep(140);
    const eid = await cdp.eval(`(() => {
      const el = document.getElementById('eidImg'), s = getComputedStyle(el);
      const m = /circle\\(([\\d.]+)%/.exec(s.clipPath || '');
      return { clip: s.clipPath, radius: m ? parseFloat(m[1]) : null, timeline: s.animationTimeline };
    })()`);
    const progress = eid.radius / 75;
    const expect = (0.9 * box.h) / (0.4 * box.h + 0.5 * H);
    ok(eid.timeline && eid.timeline.startsWith('view'),
      `8h.2  ${H}px  the Eid reveal is still on a view() timeline`, eid.timeline);
    ok(progress >= 0.70 && progress <= 0.92,
      `8h.3  ${H}px  Eid reveal progress at full entry sits in the 0.70-0.90 band`,
      `${n2(progress)} (radius ${eid.radius}%, h=${box.h}, model ${n2(expect)})`);
    // 8h.4 — the sheet is now paid for out of the SCREEN. --eid-cap caps the plate at 68vh
    // so its view() timeline (whose length is its own height) keeps the reveal at ~0.79 no
    // matter how wide the monitor is. The band is a fraction of H, not a pixel range.
    ok(box.h >= 0.60 * H - 1 && box.h <= 0.70 * H + 1,
      `8h.4  ${H}px  the sheet is paid out of the screen (--eid-cap), not the column`,
      `${box.h}px = ${n2(box.h / H)}H`);
  }
  const others = await cdp.eval(`(() => {
    const t = s => { const el = document.querySelector(s); return el ? getComputedStyle(el).animationTimeline : null; };
    const root = document.documentElement;
    const has = s => { const el = document.querySelector(s); return !!(el && el.hasAttribute('data-lenis-prevent')); };
    return { whoPhoto: t('.who-photo'), clipImg: t('.clip-img'),
      lenis: typeof window.Lenis, live: root.classList.contains('lenis'), cls: root.className,
      smooth: getComputedStyle(root).scrollBehavior,
      decks: ['.wall-room', '.art-wall'].filter(has).length,
      overlays: ['#lfModal', '#artOverlay'].filter(has).length };
  })()`);
  ok(others.whoPhoto && others.whoPhoto.startsWith('view'), '8h.5  the who-photo clip is still on view()', others.whoPhoto);
  ok(others.clipImg && others.clipImg.startsWith('view'), '8h.6  the case images are still on view()', others.clipImg);
  // ── A1b: the smoother is on the page, and only where it is wanted ────────
  ok(others.lenis === 'function', '8h.7  the vendored Lenis build reached the page', others.lenis);
  ok(others.live, '8h.8  1440  a Lenis instance is alive (html carries .lenis)', others.cls);
  // the native smooth is deliberately KEPT: Lenis writes behavior:'instant', so it cannot fight
  // it, and the rule that would remove it is what turns in-page anchors into instant jumps.
  ok(others.smooth === 'smooth', '8h.9  native smooth is left alone for in-page anchors', others.smooth);
  ok(others.decks === 2, '8h.10  both swipe decks opt out (data-lenis-prevent)', `${others.decks}/2`);
  ok(others.overlays === 2, '8h.11  both overlay scroll roots opt out too', `${others.overlays}/2`);
  note(`A1b  html="${others.cls}" at 1440; scroll-behavior is still "${others.smooth}"`);

  // 8h.12/13 — the wheel belongs to the smoother, and it is SMOOTH: native scrolling would land
  // 600px in one step, so a reading 90 ms in would already equal the settled one. The wheel is
  // aimed at the fixed rail (y=30) so it can never land inside a data-lenis-prevent band.
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await cdp.eval('window.scrollTo({top:0,behavior:"instant"})');
  await sleep(250);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 720, y: 30, deltaX: 0, deltaY: 600 });
  await sleep(90);
  const early = await cdp.eval('Math.round(window.scrollY)');
  await sleep(1200);
  const settled = await cdp.eval('Math.round(window.scrollY)');
  ok(settled > 400 && settled < 800, '8h.12  a 600px wheel lands as ~600px of scroll', `${settled}px`);
  ok(early > 0 && early < settled - 40, '8h.13  and it gets there over frames, not in one step',
    `90 ms: ${early}px → settled: ${settled}px`);
  note(`A1b  a 600px wheel reads ${early}px at 90 ms and ${settled}px settled (native: 600/600)`);

  // 8h.14–16 — a view() timeline under the SMOOTHER's own scrolling (not a native scrollTo).
  // Lenis writes real offsets, so the reveal is driven by scroll position exactly as before; a
  // smoother that moved a wrapper by transform would leave the timeline frozen at 0.
  const probe = () => cdp.eval(`(() => {
      const s = getComputedStyle(document.getElementById('eidImg'));
      const m = /circle\\(([\\d.]+)%/.exec(s.clipPath || '');
      return { y: Math.round(window.scrollY), r: m ? parseFloat(m[1]) : null };
    })()`);
  // SAMPLE AT REST, NOT ON A TIMER. A wheel burst is thousands of pixels of travel and Lenis eases
  // into it, so a reading taken after a fixed sleep can land mid-flight — and a mid-flight reading at
  // ~2.8k, just short of the reveal's own start, is a legitimate 0% that says nothing about the
  // timeline. Polling until scrollY holds still twice running makes the sample a position, not a race.
  const settledY = async (limit = 8000) => {
    let prev = -1, held = 0;
    const t0 = Date.now();
    while (Date.now() - t0 < limit){
      await sleep(120);
      const y = await cdp.eval('Math.round(window.scrollY)');
      if (y === prev){ if (++held >= 2) return y; }
      else { held = 0; prev = y; }
    }
    return prev;
  };
  // A BURST IS N WHEELS, 45 ms APART, so the smoother sees N events rather than one coalesced jump.
  const burst = async (n = 1) => {
    for (let i = 0; i < n; i++){
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 720, y: 30, deltaX: 0, deltaY: 900 });
      await sleep(45);
    }
    return settledY();
  };
  // THE RESYNC. Lenis holds a target of its own; a browser jump to 0 does not move it, and a sweep
  // measured from the wrong start is the bug this block used to have (a run that began near the
  // bottom read 75% at 11,412px twice and proved nothing). A 1px wheel makes the smoother adopt the
  // offset the page is actually at before the first burst.
  await cdp.eval('window.scrollTo({top:0,behavior:"instant"})');
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 720, y: 30, deltaX: 0, deltaY: 1 });
  await sleep(400);
  // WALK THE PAGE DOWN IN ONE-WHEEL STEPS AND READ THE RADIUS AT EVERY REST. Nothing here assumes
  // where the window starts: the pair it reports is the FIRST reading with a painted circle and a
  // LATER reading that is both bigger and at least 1500px further down, so a narrow window is caught
  // on the way in instead of being leapt over in one 3600px burst.
  const profile = [];
  const sweep = [];
  for (let step = 0; step < 16; step++){
    await burst(1);
    const p = await probe();
    profile.push(p);
    const first = profile.find(q => q.r !== null && q.r > 0);
    const later = first ? profile.find(q => q.r !== null && q.r > first.r && q.y > first.y + 1500) : null;
    if (later){ sweep.push(first, later); break; }
  }
  if (!sweep.length){                      // never advanced: report what was actually read
    const opened = profile.filter(q => q.r !== null && q.r > 0);
    sweep.push(opened[0] || profile[0], profile[profile.length - 1]);
  }
  ok(sweep.every(p => p.r !== null), '8h.14  the Eid reveal still reports a painted radius',
    sweep.map(p => p.r).join(' / '));
  ok(sweep[1].y > sweep[0].y + 1500, '8h.15  the smoother carries the page down',
    `${sweep[0].y}px → ${sweep[1].y}px`);
  ok(sweep[0].r > 0 && sweep[1].r > sweep[0].r, '8h.16  the reveal advances with the smoother, not against it',
    `${sweep[0].r}% → ${sweep[1].r}%`);
  note(`A1b  smoother sweep ${sweep[0].y}px (reveal ${sweep[0].r}%) → ${sweep[1].y}px (reveal ${sweep[1].r}%), `
    + `read at ${profile.length} rests: ${profile.slice(0, 8).map(p => `${p.y}/${p.r}`).join(' ')}`);

  // 8h.17–19 — the phone never gets an instance, and its native scrolling is untouched. The
  // breakpoint is a live listener: crossing it destroys rather than pauses.
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: false });
  await cdp.eval('window.scrollTo({top:0,behavior:"instant"})');
  await sleep(350);
  const phone = await cdp.eval(`(() => { const r = document.documentElement;
    return { cls: r.className, live: r.classList.contains('lenis'),
             smooth: getComputedStyle(r).scrollBehavior }; })()`);
  ok(!phone.live, '8h.17  390  no Lenis instance exists below 768', phone.cls || '(no lenis classes)');
  ok(phone.smooth === 'smooth', '8h.18  390  native smooth scrolling is untouched', phone.smooth);
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await sleep(350);
  ok(await cdp.eval(`document.documentElement.classList.contains('lenis')`),
    '8h.19  1440  crossing back rebuilds the instance', 'html.lenis');
  await cdp.eval('window.scrollTo({top:0,behavior:"instant"})');
  await sleep(250);

  // 8h.20–25 — a locked page must keep its OVERLAY scrolling, over BOTH surfaces that can take
  // the wheel: the deck and the rest of the overlay. A stopped Lenis preventDefaults the wheel
  // and the overlay is not the page, so the attribute decides whether that half moves at all.
  // Measured rather than assumed: with data-lenis-prevent deleted from #artOverlay, 8h.23 reads
  // 400px → 400px (dead) while the deck half still moves on .art-wall's own copy of the
  // attribute. That is why the deck keeps one even though, today, the overlay above it already
  // covers every node inside it — belt and braces, counted in 8h.10 and 8h.11.
  const lockedAt = await cdp.eval('Math.round(window.scrollY)');
  await cdp.eval(`document.getElementById('footerB1').click()`);
  await sleep(950);                                   // the 0.75 s clip-path reveal
  const before = await cdp.eval(`({ locked: document.body.dataset.scrollLock === '1',
    stopped: document.documentElement.classList.contains('lenis-stopped') })`);
  ok(before.locked, '8h.20  the wall locks the page behind it', String(before.locked));
  ok(before.stopped, '8h.21  and the smoother is stopped, not left running behind it', String(before.stopped));
  const lockedTop = () => cdp.eval(`Math.round(document.getElementById('artOverlay').scrollTop)`);
  const probeY = inWall => cdp.eval(`(() => {
    const ov = document.getElementById('artOverlay');
    for (let y = 80; y <= 860; y += 20){
      const el = document.elementFromPoint(720, y);
      if (!el || !ov.contains(el)) continue;
      if ((!!el.closest('.art-wall')) === ${inWall}) return y;
    }
    return null;
  })()`);
  for (const [n, deck] of [[22, true], [23, false]]){
    const what = deck ? 'the deck' : 'the ledger';
    const y = await probeY(deck);
    if (y === null){ ok(false, `8h.${n}  the page-locked overlay still scrolls over ${what}`, 'no probe point'); continue; }
    const top0 = await lockedTop();
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 720, y, deltaX: 0, deltaY: 400 });
    await sleep(500);
    const top1 = await lockedTop();
    ok(top1 > top0, `8h.${n}  the page-locked overlay still scrolls over ${what}`,
      `${top0}px → ${top1}px with the wheel at y=${y}`);
  }
  const after = await cdp.eval(`({ top: Math.round(document.getElementById('artOverlay').scrollTop),
    y: Math.round(window.scrollY) })`);
  ok(after.y === lockedAt, '8h.24  and the page behind it did not move', `${lockedAt}px → ${after.y}px`);
  await cdp.eval(`document.getElementById('artClose').click()`);
  await sleep(500);
  const reopened = await cdp.eval(`({ locked: document.body.dataset.scrollLock === '1',
    stopped: document.documentElement.classList.contains('lenis-stopped') })`);
  ok(!reopened.locked && !reopened.stopped, '8h.25  closing it starts the smoother again',
    JSON.stringify(reopened));
  note(`A1b  locked page: overlay scrollTop 0 → ${after.top}px, page ${lockedAt} → ${after.y}px`);

  // 8h.26/27 — a guard must not become a DEAD BAND. The wall room refuses the smoother (it is
  // its own scroller) but a refused wheel is not a swallowed one: Lenis returns before
  // preventDefault, so the browser takes it and chains to the document exactly as it did before
  // a smoother existed. The pointer is placed on the room by hit-test, not by arithmetic.
  await cdp.eval(`(() => { const el = document.getElementById('wallRoom');
    const y = Math.round(el.getBoundingClientRect().top + window.scrollY);
    window.scrollTo({ top: y, behavior: 'instant' }); })()`);
  await sleep(350);
  const roomY = await cdp.eval(`(() => {
    const room = document.getElementById('wallRoom'), h = window.innerHeight;
    for (let y = 120; y < Math.min(820, h - 20); y += 20){
      const el = document.elementFromPoint(720, y);
      if (el && room.contains(el)) return y;
    }
    return null;
  })()`);
  const roomFrom = await cdp.eval('Math.round(window.scrollY)');
  if (roomY === null){
    ok(false, '8h.26  a wheel over the protected wall room still moves the page', 'no point inside the room');
  } else {
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 720, y: roomY, deltaX: 0, deltaY: 400 });
    await sleep(700);
    const roomTo = await cdp.eval('Math.round(window.scrollY)');
    ok(roomTo > roomFrom + 150, '8h.26  a wheel over the protected wall room still moves the page',
      `${roomFrom}px → ${roomTo}px with the wheel at y=${roomY} (the room\'s own box)`);
    note(`A1b  wheel over .wall-room: page ${roomFrom}px → ${roomTo}px — refused by the smoother, chained by the browser`);
    ok(await cdp.eval('document.documentElement.classList.contains("lenis")'),
      '8h.27  and the instance is still the one driving everything else', 'html.lenis');
  }

  group('STEP 8i — THE BLEED IS EXACT; THE PHONE AND TABLET BANDS DID NOT MOVE');
  for (const w of WIDTHS) {
    const s = S.get(w), tag = String(w).padStart(4);
    if (w < 1200) {
      // the two pictures are still framed by the 5vw gutter — the old geometry, untouched
      for (const sel of ['.camp-grid', '.wall-room']) {
        const b = s.vis[sel];
        ok(b && near(b.l, s.gutter, 1) && near(b.r, s.W - s.gutter, 1),
          `${tag}  ${sel} is still framed by the gutter`, b ? `${b.l}..${b.r}` : 'missing');
      }
      ok(s.vis['.mag-spread'] && near(s.vis['.mag-spread'].l, s.gutter, 1),
        `${tag}  .mag-spread is still inside the magazine's padding`,
        String(s.vis['.mag-spread'] && s.vis['.mag-spread'].l));
    } else {
      // the plate is capped for the reveal: square, and inside the 68vh budget of a 900px window
      ok(s.eid && near(s.eid.w, s.eid.h, 1) && s.eid.h <= 0.70 * 900 + 1,
        `${tag}  the Eid plate stays square and inside the 68vh budget`,
        s.eid ? `${s.eid.w}x${s.eid.h}` : 'missing');
      // the spread: the plate leaves the monitor on the right, the colophon opens on the frame
      ok(s.magPlate && near(s.magPlate.r, s.W, 1),
        `${tag}  the magazine plate hangs off the right edge`, s.magPlate ? String(s.magPlate.r) : 'missing');
      ok(s.magColophon && near(s.magColophon.l, s.gutter, 1),
        `${tag}  the magazine colophon opens on the frame's left line`,
        s.magColophon ? String(s.magColophon.l) : 'missing');
      ok(s.magPlate && s.magColophon && s.magPlate.l > s.magColophon.r,
        `${tag}  the plate and the colophon do not collide`,
        s.magPlate && s.magColophon ? `${n2(s.magColophon.r)} < ${n2(s.magPlate.l)}` : 'missing');
      // the stat column is a measure column centred in its half — the optical fix, not a void.
      // The half is the SECOND TRACK of the camp-grid: tracks + gap fill the bleed, so the
      // track starts at t[0] + (bleed - 2t[0]) and runs to the right edge.
      const g = s.vis['.camp-grid'], t = s.campTracks;
      const rightL = g && t && t.length === 2 ? g.l + g.w - t[1] : null;
      ok(g && s.campRight && rightL !== null && near(s.campRight.l - rightL, g.r - s.campRight.r, 2),
        `${tag}  the campaign's right column is centred in its half`,
        s.campRight && rightL !== null ? `air ${n2(s.campRight.l - rightL)} / ${n2(g.r - s.campRight.r)}` : 'missing');
      // the wall's frames stay inside the room's mat
      ok(s.wallRow && s.vis['.wall-room']
        && s.wallRow.l >= s.vis['.wall-room'].l - 0.5 && s.wallRow.r <= s.vis['.wall-room'].r + 0.5,
        `${tag}  the wall's frames stay inside the room`,
        s.wallRow ? `${s.wallRow.l}..${s.wallRow.r}` : 'missing');
    }
  }

  // ── STEP 9 — the bar, the mark, the list, the drawer ────────────────────
  // Workstream B replaced the old five-link bar with a place: a breadcrumb that names the
  // section under the reading line and opens the section list, and a gear that opens the
  // settings drawer. The asterisk moved out of the chrome and into the hero. Everything below
  // is measured in the live page except 9a, which reads the source.
  const jsText = await fsp.readFile(path.join(ROOT, 'js', 'main.js'), 'utf8');

  group('STEP 9a — STATIC: the bar is a place, not a menu');
  ok(!/footerEgg/.test(html), '9a.1  the old nav asterisk (#footerEgg) is gone from the markup');
  ok(!/class="nav-links"|\.nav-links/.test(html), '9a.2  and the five-link row (.nav-links) with it');
  ok(!/nav-mark/.test(html) && !/nav-mark/.test(jsText), '9a.3  no dead nav-mark selector is left in the source');
  ok(/class="head-brand"/.test(html) && /class="head-nav"/.test(html) && /class="head-actions"/.test(html)
    && (html.match(/class="head-nav-link"/g) || []).length === 4
    && /id="soundToggle"/.test(html) && /id="setOpen"/.test(html)
    && /<dialog class="set-drawer" id="setPanel"[^>]*data-lenis-prevent/.test(html),
    '9a.4  the bar is three zones — the name, the four places, the two controls — and the drawer is still a <dialog> off Lenis',
    'one <nav> of four links rather than a disclosure, and the gear is the drawer\'s only handle');
  ok(/\.site-head\{position:fixed;top:0;left:0;right:0;z-index:510/.test(cssText)
    && /\.head-bar\{[^}]*height:var\(--head-h\)/.test(cssText)
    && !/nav-hidden|HIDE_AT/.test(cssText + jsText),
    '9a.5  the head is a fixed wrapper around ONE row at --head-h, and there is no hide state left to declare',
    'the bar that never leaves cannot need a transform to come back');
  const barRule = (/\n\.head-bar\{([^}]*)\}/.exec(cssText) || [, ''])[1];
  ok(/transition:background-color 0\.3s ease,border-color 0\.3s ease/.test(barRule)
    && !/transition[^;]*\b(top|height|width|padding|margin)\b/.test(barRule),
    '9a.6  and its transitions are the GROUND it changes — no geometry in the list, so a phase change cannot reflow the page',
    barRule.slice(0, 78));
  ok(!/classList\.toggle\('is-scrolled'/.test(jsText) && !/class="hero-asterisk"/.test(html)
    && !/getElementById\('heroAsterisk'\)/.test(jsText),
    '9a.7  the hero asterisk `html.is-scrolled` used to take away is gone from both files, and the class writer went with the rule it fed',
    'no .hero-asterisk markup, no #heroAsterisk lookup, no is-scrolled write (§06 retired them)');
  ok((html.match(/href="#(who|work|magazine|reach)" data-nav-for="\1"/g) || []).length === 8
    && (html.match(/class="head-nav-link" href="#(who|work|magazine|reach)" data-nav-for="\1"/g) || []).length === 4
    && (html.match(/class="metro-block" href="#(who|work|magazine|reach)" data-nav-for="\1"/g) || []).length === 4,
    '9a.8  both rows are real fragments: each link\'s href names the section its data-nav-for names, in the bar and on the board',
    '8 links across the two surfaces, 0 of them pointing at an id that does not exist');
  ok(/\.set-drawer\{[^}]*display:none/.test(cssText),
    '9a.9  a closed drawer is display:none too (no off-screen Tab stops)');
  ok(/html\[data-motion="off"\] \*/.test(cssText) && /html\[data-a11y="on"\] body/.test(cssText),
    '9a.10 both preference attributes are read by the stylesheet');
  ok(/const stillMotion = \(\) => calmMotion\(\) \|\| rootEl\.getAttribute\('data-motion'\) === 'off'/.test(jsText),
    '9a.11 one predicate folds the system setting and the switch together');
  ok(/const calm = stillMotion/.test(jsText) && /const prefersReduced = stillMotion/.test(jsText)
    && /const still = stillMotion/.test(jsText) && /!stillMotion\(\)/.test(jsText)
    && !/tiltStillMQ/.test(jsText),
    '9a.12 and the magnet, the comparison, the leaflet, the tilt and the smoother all ask it');

  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await cdp.eval(`(() => { try { localStorage.removeItem('ad-a11y'); localStorage.removeItem('ad-motion'); } catch(e){} })()`);
  await cdp.eval('window.scrollTo({top:0,behavior:"instant"})');
  // WAIT FOR THE GROUND, NOT FOR A STOPWATCH. The phase is an IntersectionObserver callback and the
  // bar's ground is a 0.3s transition off that attribute, so a fixed sleep here is a bet on two
  // asynchronous things at once: the observer's frame, and the smoother letting go of the previous
  // step's wheel. `settles` asks until the bar has actually arrived at the hero ground.
  await settles(`(() => ({ phase: document.documentElement.getAttribute('data-phase'),
    bg: getComputedStyle(document.getElementById('siteNav')).backgroundColor }))()`,
    v => v.phase === 'hero' && /^rgba?\([^)]*,\s*0(?:\.0+)?\)$|^transparent$/.test(v.bg));

  // ── STEP 9b — THE HEAD IS ALWAYS THERE; THE PHASE IS ONE OBSERVER ─────────
  // §05 replaced the Headroom bar with a fixed three-zone head that never leaves. What used to be
  // measured here — a bar sliding out on a downward wheel and back on an upward one — is now the
  // opposite assertion: the bar is in the same place at every scroll position, and the only thing
  // that changes is its ground, which ONE IntersectionObserver on #hero writes as one attribute.
  group('STEP 9b — THE HEAD NEVER HIDES, AND ITS PHASE IS ONE OBSERVER');
  ok(/new IntersectionObserver\(entries => \{[\s\S]{0,500}?'data-phase', e\.isIntersecting \? 'hero' : 'sheet'/.test(jsText),
    '9b.1  one IntersectionObserver on #hero writes html[data-phase] — hero under the sheet, sheet after it');
  ok(!/HIDE_AT|anchorY|nav-hidden/.test(jsText) && !/nav-hidden/.test(cssText),
    '9b.2  and nothing is left of the Headroom machinery in either file');

  // §16 — THE HEAD BELONGS TO THE VIEW. §05 said the bar never hides; the gate narrows that claim
  // honestly: the bar never hides WHILE THERE IS A PAGE UNDER IT. On the cover and in the index
  // there is no page yet — a poster and its contents — so the bar is `display:none`, and it comes
  // back at the same --head-h the moment the fold is behind the reader.
  // 9b.3 reads the COVER, so the page is put there first — several steps above scroll and wheel.
  await enterCover();
  const cover = await cdp.eval(`(() => {
    const h = document.querySelector('.site-head'), s = document.querySelector('.skip-link');
    const g = document.getElementById('gate'), b = document.querySelector('.metroboard');
    const st = document.getElementById('gateStage'), f = document.querySelector('.footer');
    const vs = [...document.querySelectorAll('[data-view]')];
    return { mode: document.documentElement.getAttribute('data-mode'),
      head: getComputedStyle(h).visibility, skip: getComputedStyle(s).display,
      hh: Math.round(h.getBoundingClientRect().height * 100) / 100,
      gateH: Math.round(g.getBoundingClientRect().height), vh: window.innerHeight,
      stageH: Math.round(st.getBoundingClientRect().height),
      docH: document.documentElement.scrollHeight,
      hidden: vs.filter(v => v.hasAttribute('inert')).length,
      collapsed: Math.round(document.getElementById('broadsheet').getBoundingClientRect().height) === 0,
      footerH: Math.round(f.getBoundingClientRect().height),
      boardBottom: Math.round(b.getBoundingClientRect().bottom),
      zones: [...document.getElementById('siteNav').children].map(c => c.className) }; })()`);
  ok(cover.mode === 'cover' && cover.head === 'hidden' && cover.skip === 'none',
    '9b.3  at the top of the page the state is `cover` — the HEAD IS INVISIBLE, and the skip link is not rendered',
    `data-mode ${cover.mode}, head ${cover.head}, skip ${cover.skip}`);
  ok(near(cover.gateH, cover.vh, 2) && cover.stageH === cover.vh && cover.boardBottom === cover.vh,
    '9b.4  ...and the gate IS one viewport — no travel, no pin: the sheet and the board still end together on the fold',
    `gate ${cover.gateH} of ${cover.vh}, stage ${cover.stageH}, board bottom ${cover.boardBottom}`);
  ok(near(cover.docH, cover.gateH, 2) && cover.hidden === 4 && cover.collapsed && cover.footerH === 0,
    '9b.4b ...and the DOCUMENT ends there: the four sections and the footer are collapsed to zero and `inert`, so there is nothing below the contents to scroll into',
    `document ${cover.docH}, ${cover.hidden} sections inert, collapsed ${cover.collapsed}, footer ${cover.footerH}px`);
  ok(cover.zones.join(',') === 'head-brand,head-nav,head-actions' && near(cover.hh, 57.8, 1.6),
    '9b.5  and the bar is still three zones in ONE row at --head-h — the state changed, the bar did not',
    `${cover.zones.join(',')} at ${cover.hh}px`);

  // THE WAVE. Five bars in the head's control zone, held at mid-height when motion is off — the
  // same shape the stylesheet paints for a visitor whose script never ran.
  const wave = await cdp.eval(`(() => { const b = document.getElementById('soundToggle');
    return { n: b.querySelectorAll('.wv').length, pressed: b.getAttribute('aria-pressed'),
      inHead: !!b.closest('.head-actions'), inPanel: !!b.closest('#setPanel'),
      label: (b.querySelector('.sound-word') || {}).textContent || '' }; })()`);
  ok(wave.n === 5 && wave.inHead && !wave.inPanel,
    '9b.8  the sound mark is five <rect> bars in the head beside the gear — not a drawer row any more',
    `${wave.n} bars, head ${wave.inHead}, drawer ${wave.inPanel}`);
  ok(wave.label.trim().toLowerCase() === 'sound' && wave.pressed === 'true',
    '9b.9  ...and it keeps its visible word, its id and its aria-pressed contract', `${wave.label} / ${wave.pressed}`);
  await cdp.eval(`document.documentElement.setAttribute('data-motion','off')`);
  await sleep(360);
  const waveHeld = await cdp.eval(`[...document.querySelectorAll('.sound-wave .wv')].map(r => {
    const t = getComputedStyle(r).transform;
    return t === 'none' ? 1 : +new DOMMatrix(t).d.toFixed(2); })`);
  ok(waveHeld.length === 5 && waveHeld.every(v => Math.abs(v - 0.5) < 0.03),
    '9b.10 ...and with Motion off the five bars are HELD at mid-height, not waving and not gone',
    waveHeld.join('/'));
  await cdp.eval(`document.documentElement.setAttribute('data-motion','on')`);
  await sleep(200);

  // ── THE INDEX: AN OWNED PROGRESS INSIDE THE FOLD, AND NO HEIGHT GAINED ──
  // The one property this state machine must not have is a document whose height depends on where
  // the reader is scrolled: a deep link, a restored offset and every absolute measurement below
  // would become a function of scroll state. So the height is measured here, across all three — and
  // since Pass 2D the gate's half-way position is the module's own number, not a scroll offset.
  const docH = await cdp.eval('document.documentElement.scrollHeight');
  await cdp.eval(GATE_P(0.54));
  const idx = await settles(`(() => {
    const g = document.getElementById('gateStage'), h = document.querySelector('.site-head');
    const p = getComputedStyle(g).getPropertyValue('--gate-p').trim();
    const mr = t => t === 'none' ? new DOMMatrix() : new DOMMatrix(t);
    const plates = [...document.querySelectorAll('.index-panel')];
    return { mode: document.documentElement.getAttribute('data-mode'),
      head: getComputedStyle(h).visibility, p: p === '' ? null : +p,
      revealed: document.getElementById('indexPanels').hasAttribute('data-revealed'),
      docH: document.documentElement.scrollHeight,
      fold: document.querySelector('.metroboard').hasAttribute('data-fold'),
      out: plates.map(n => { const m = mr(getComputedStyle(n).transform);
        return { sx: +m.a.toFixed(3), sy: +m.d.toFixed(3) }; }),
      inn: plates.map(n => { const m = mr(getComputedStyle(n.querySelector('.ip-inner')).transform);
        return { sx: +m.a.toFixed(3), sy: +m.d.toFixed(3) }; }) }; })()`,
    v => v.mode === 'index' && v.p !== null);
  ok(idx.mode === 'index' && idx.head === 'hidden',
    '9b.11 part-way into the fold the state is `index` — and the head is still gone', `mode ${idx.mode}`);
  ok(idx.p !== null && idx.p > 0.3 && idx.p < 0.9,
    '9b.12 ...and `--gate-p` is the scrub, part-way between the docked bar and the four plates', `p ${idx.p}`);
  ok(idx.fold,
    '9b.13 ...the docked bar has folded away (`data-fold`) and the four plates are carrying the morph');
  ok(idx.out.length === 4 && idx.out.every(t => Math.abs(t.sx - 1) > 0.02 || Math.abs(t.sy - 1) > 0.02),
    '9b.13b ...as four COMPOSITOR transforms — a scale on each plate, no height and no layout',
    idx.out.map(t => t.sx + 'x' + t.sy).join(' / '));
  ok(idx.inn.length === 4 && idx.out.every((t, i) =>
      Math.abs(t.sx * idx.inn[i].sx - 1) < 0.002 && Math.abs(t.sy * idx.inn[i].sy - 1) < 0.002),
    '9b.13c ...and each plate is counter-scaled on its type by 1/the same numbers, so the product is 1 on the frame it is drawn',
    idx.inn.map(t => t.sx + 'x' + t.sy).join(' / '));
  ok(idx.docH === docH,
    '9b.14 and the index adds no page height at all: a scrub inside the fold, not extra travel',
    `${docH} → ${idx.docH}`);

  // ── THE PANELS ARRIVE AT THE END OF THE SCRUB ──
  await cdp.eval(GATE_END);
  const endFold = await settles(`(() => {
    const p = document.getElementById('indexPanels'), cs = getComputedStyle(p);
    const bd = document.querySelector('.metroboard');
    const mr = t => t === 'none' ? new DOMMatrix() : new DOMMatrix(t);
    return { mode: document.documentElement.getAttribute('data-mode'),
      revealed: p.hasAttribute('data-revealed'), vis: cs.visibility, op: +cs.opacity,
      inert: p.hasAttribute('inert'), pe: cs.pointerEvents,
      fold: bd.hasAttribute('data-fold'), bdVis: getComputedStyle(bd).visibility,
      plates: [...p.querySelectorAll('.index-panel')].map(n => {
        const o = mr(getComputedStyle(n).transform);
        const i = mr(getComputedStyle(n.querySelector('.ip-inner')).transform);
        return { sx: +o.a.toFixed(3), sy: +o.d.toFixed(3), ix: +i.a.toFixed(3), iy: +i.d.toFixed(3) }; }) }; })()`,
    v => v.revealed && v.op > 0.9);
  ok(endFold.revealed && endFold.vis === 'visible' && endFold.op > 0.9 && endFold.pe === 'auto',
    '9b.15 at the end of the scrub the four panels are up and pressable — `visibility`, never `display`',
    `opacity ${endFold.op}, ${endFold.vis}, ${endFold.pe}`);
  ok(!endFold.inert,
    '9b.15b ...and `inert` is lifted on the same frame, so a keyboard is offered the four doors it can see');
  ok(endFold.fold && endFold.bdVis === 'hidden',
    '9b.15c ...while the bar they grew out of is still in the document and no longer drawn: one bottom bar on screen, not two',
    `fold ${endFold.fold}, board ${endFold.bdVis}`);
  ok(endFold.plates.length === 4
    && endFold.plates.every(t => t.sx === 1 && t.sy === 1 && t.ix === 1 && t.iy === 1),
    '9b.15d ...and every plate has finished at identity, with its type at identity inside it',
    endFold.plates.map(t => t.sx + 'x' + t.sy + '/' + t.ix + 'x' + t.iy).join(' / '));

  // ── THE VIEW: A PLACE IS CHOSEN, NOT SCROLLED TO ──
  // §16 — the fold's bottom is no longer a door: past the end of the gate there is nothing at all.
  // A view is entered by pressing a block, so that is what this does.
  await cdp.eval(`document.querySelector('.metro-block[data-nav-for="who"]').click()`);
  const viewMode = await settles(`(() => {
    const h = document.querySelector('.site-head'), nav = document.getElementById('siteNav');
    const r = nav.getBoundingClientRect(), s = document.querySelector('.skip-link');
    const g = document.getElementById('gate');
    const vs = [...document.querySelectorAll('[data-view]')];
    return { mode: document.documentElement.getAttribute('data-mode'),
      head: getComputedStyle(h).visibility, skip: getComputedStyle(s).display,
      gateGone: g.getBoundingClientRect().height === 0 && getComputedStyle(g).display === 'none',
      shown: vs.filter(v => !v.hasAttribute('inert')).map(v => v.dataset.view).join(),
      top: Math.round(r.top), hh: Math.round(r.height * 100) / 100 }; })()`,
    v => v.mode === 'view');
  ok(viewMode.mode === 'view' && viewMode.head === 'visible' && viewMode.skip !== 'none',
    '9b.16 a CHOSEN place is `view`: the head and the skip link are back',
    `mode ${viewMode.mode}, head ${viewMode.head}`);
  ok(viewMode.gateGone && viewMode.shown === 'who',
    '9b.16b ...and the fold is NOT RENDERED — no 250vh block above the section, and exactly one section is laid out',
    `gate gone ${viewMode.gateGone}, laid out: ${viewMode.shown || '(none)'}`);
  ok(viewMode.top === 0 && near(viewMode.hh, 57.8, 1.6),
    '9b.17 ...at the same --head-h and the same y 0 — the bar did not move, it came back',
    `${viewMode.hh}px at y ${viewMode.top}`);
  await enterCover();

  // ── STEP 9c — ONE OBSERVER, EVERY SURFACE ─────────────────────────────────
  group('STEP 9c — ONE OBSERVER LIGHTS EVERY SURFACE THAT NAMES THE SECTION');
  await sleep(320);
  ok((await cdp.eval(`document.querySelectorAll('[data-nav-for][aria-current]').length`)) === 0,
    '9c.1  at scrollY 0 nothing is current — a contents page does not claim to be inside a section');

  await enterView('magazine');
  // the head's square is a 0.2s TRANSITION from the observer's write, so it is settled, not sampled
  await settles(`(() => { const t = getComputedStyle(
      document.querySelector('.head-nav-link[data-nav-for="magazine"]'), '::before').transform;
    const m = /matrix\\(([^)]+)\\)/.exec(t); return m ? +m[1].split(',')[0] : 1; })()`,
    v => Math.abs(v - 1) < 0.02);
  const mag = await cdp.eval(`(() => {
    const all = [...document.querySelectorAll('[data-nav-for="magazine"]')];
    const lit = all.filter(a => a.getAttribute('aria-current') === 'location');
    const stale = [...document.querySelectorAll('[data-nav-for]:not([data-nav-for="magazine"])')].filter(a => a.hasAttribute('aria-current')).length;
    const headLink = document.querySelector('.head-nav-link[data-nav-for="magazine"]');
    const block = document.querySelector('.metro-block[data-nav-for="magazine"]');
    const pseudo = getComputedStyle(headLink, '::before');
    return { n: all.length, lit: lit.length, stale,
      pop: getComputedStyle(headLink).getPropertyValue('--pop').trim(),
      square: pseudo.backgroundColor,
      // READ THE SCALE IN THE PAGE. DOMMatrix is a browser object; the harness runs in Node, and
      // reaching for it out here is a ReferenceError, not an assertion. The matrix is parsed where
      // matrices exist.
      squareScale: (t => t === 'none' ? 1 : +new DOMMatrix(t).a)(pseudo.transform),
      blockBg: getComputedStyle(block).backgroundColor }; })()`);
  ok(mag.n === 2 && mag.lit === 2 && mag.stale === 0,
    '9c.2  in the magazine both of its links are current — the head row and the board block, written by one pass',
    `${mag.lit} of ${mag.n} current, ${mag.stale} stale`);
  ok(mag.square === 'rgb(255, 232, 26)' && Math.abs(mag.squareScale - 1) < 0.02,
    '9c.3  ...and the head\'s square is filled and scaled to 1 in --pop-3 (#FFE81A), the block\'s own ink',
    `${mag.square} at scale ${n2(mag.squareScale)}`);
  ok(mag.blockBg === 'rgb(255, 232, 26)',
    '9c.4  ...the same ink as the block it points at, because both read the same token', mag.blockBg);

  await enterView('who');
  const whoNow = await cdp.eval(`(() => {
    const all = [...document.querySelectorAll('[data-nav-for="who"]')];
    const lit = all.filter(a => a.getAttribute('aria-current') === 'location');
    const stale = [...document.querySelectorAll('[data-nav-for]:not([data-nav-for="who"])')].filter(a => a.hasAttribute('aria-current')).length;
    const pseudo = getComputedStyle(document.querySelector('.head-nav-link[data-nav-for="who"]'), '::before');
    return { n: all.length, lit: lit.length, stale, square: pseudo.backgroundColor }; })()`);
  ok(whoNow.n === 2 && whoNow.lit === 2 && whoNow.stale === 0 && whoNow.square === 'rgb(168, 209, 115)',
    '9c.5  and in #who it is the other pair, in --pop-1 (#A8D173): the observer moves the state, it does not accumulate it',
    `${whoNow.lit}/${whoNow.n} lit, ${whoNow.stale} stale, ${whoNow.square}`);
  note(`B  current section: #magazine ${mag.lit}/${mag.n} lit in ${mag.square}; #who ${whoNow.lit}/${whoNow.n} in ${whoNow.square}`);

  // ── STEP 9d — THE METROBOARD ──────────────────────────────────────────────
  // The board is the sheet's other half: four full-block links, in flow directly after #hero, with
  // the hero's own token subtracted from the viewport so the two add up to exactly one screen.
  group('STEP 9d — THE METROBOARD IS THE FOLD\'S OTHER HALF');
  await enterCover();
  await sleep(500);
  const board = await cdp.eval(`(() => { const b = document.querySelector('.metroboard');
    const r = b.getBoundingClientRect(), hero = document.getElementById('hero').getBoundingClientRect();
    const blocks = [...b.querySelectorAll('.metro-block')];
    return { n: blocks.length, h: Math.round(r.height), top: Math.round(r.top),
      heroH: Math.round(document.getElementById('hero').offsetHeight), vh: window.innerHeight,
      hrefs: blocks.map(a => a.getAttribute('href')),
      inks: blocks.map(a => getComputedStyle(a).getPropertyValue('--pop').trim()),
      bg: blocks.map(a => getComputedStyle(a).backgroundColor),
      fg: blocks.map(a => getComputedStyle(a).color),
      cols: getComputedStyle(b).gridTemplateColumns.split(' ').length,
      gap: getComputedStyle(b).gap, label: b.getAttribute('aria-label'),
      names: blocks.map(a => (a.querySelector('.metro-t') || {}).textContent || ''),
      nums: blocks.map(a => (a.querySelector('.metro-n') || {}).textContent || '') }; })()`);
  ok(board.n === 4 && board.hrefs.join() === '#who,#work,#magazine,#reach',
    '9d.1  four blocks, one per place, in the page\'s own order', board.hrefs.join(' '));
  ok(board.label === 'Sections', '9d.2  the board is a labelled <nav>, not a div of links', String(board.label));
  ok(board.h === 72 && board.heroH + board.h === board.vh,
    '9d.3  hero + board === exactly one viewport (828 + 72 = 900): the fold is a sum, not an approximation',
    `${board.heroH} + ${board.h} = ${board.heroH + board.h} of ${board.vh}`);
  ok(board.top === board.heroH,
    '9d.4  ...and the board starts where the sheet ends — no gap and no overlap', `${board.top} vs ${board.heroH}`);
  ok(board.inks.join() === '#A8D173,#FF4F38,#FFE81A,#9ED8F5',
    '9d.5  four printed inks, in order: --pop-1..4', board.inks.join(' '));
  ok(board.bg.join() === 'rgb(168, 209, 115),rgb(255, 79, 56),rgb(255, 232, 26),rgb(158, 216, 245)',
    '9d.6  ...and each block is painted in its own ink', board.bg.join(' '));
  ok(board.fg.every(c => c === 'rgb(20, 17, 16)'),
    '9d.7  ink type on every pop field — the worst case, #141110 on #A8D173, is 5.5:1',
    [...new Set(board.fg)].join(' '));
  ok(board.cols === 4 && board.gap === '2px',
    '9d.8  four tracks and a 2px gap: the gaps are the dividers, so no block draws a border',
    `${board.cols} tracks, gap ${board.gap}`);
  ok(board.nums.join() === '01,02,*,03' && board.names.join('|') === 'Who|Work|Akcidental Vision|Get in touch',
    '9d.9  every block is a kicker over a title, and the asterisk is a block like the rest',
    `${board.nums.join(' ')} / ${board.names.join(' | ')}`);

  // THE INVERSION. A real pointer move, because :hover cannot be simulated any other way.
  const b0 = await cdp.eval(`(() => { const r = document.querySelector('.metro-block').getBoundingClientRect();
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: b0.x, y: b0.y, button: 'none' });
  // SETTLED, NOT SAMPLED. The inversion is a 0.2s transition, and a fixed 280ms sleep is a race
  // against the compositor's own clock: two runs out of three read a channel 6 steps short of the
  // ink. Poll until the colours have ARRIVED, with the same tolerance the assertion uses.
  const near3 = (str, want) => { const v = (str.match(/\d+/g) || []).map(Number);
    return v.length >= 3 && v.slice(0, 3).every((c, i) => Math.abs(c - want[i]) <= 3); };
  let hover = null;
  for (let i = 0; i < 12; i++){
    await sleep(120);
    hover = await cdp.eval(`(() => { const a = document.querySelector('.metro-block'); const cs = getComputedStyle(a);
      return { bg: cs.backgroundColor, fg: cs.color }; })()`);
    if (near3(hover.bg, [20, 17, 16]) && near3(hover.fg, [168, 209, 115])) break;
  }
  ok(near3(hover.bg, [20, 17, 16]) && near3(hover.fg, [168, 209, 115]),
    '9d.10 under the pointer the block INVERTS — ink field, pop-coloured type',
    `${hover.bg} / ${hover.fg}`);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 4, y: 880, button: 'none' });
  await sleep(280);

  // THE PHONE'S 2x2, and the token that has to agree with #hero's subtraction.
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await sleep(600);
  const board390 = await cdp.eval(`(() => { const b = document.querySelector('.metroboard');
    const cs = getComputedStyle(b), blocks = [...b.querySelectorAll('.metro-block')];
    const hero = document.getElementById('hero').getBoundingClientRect();
    return { cols: cs.gridTemplateColumns.split(' ').length, h: Math.round(b.getBoundingClientRect().height),
      minH: Math.min(...blocks.map(a => Math.round(a.getBoundingClientRect().height))),
      heroH: Math.round(hero.height), vh: window.innerHeight,
      overflow: document.documentElement.scrollWidth > window.innerWidth,
      token: getComputedStyle(document.documentElement).getPropertyValue('--board-h').trim() }; })()`);
  ok(board390.cols === 2 && board390.h === 130 && board390.token === '130px',
    '9d.11 below 640 the board is 2x2 and the --board-h token is restated on :root, so #hero shortens with it',
    `${board390.cols} tracks, board ${board390.h}px, token ${board390.token}`);
  ok(board390.minH >= 64 && !board390.overflow,
    '9d.12 ...each block at least 64px of target, and no horizontal scrollbar at 390',
    `${board390.minH}px blocks, overflow ${board390.overflow}`);
  ok(board390.heroH >= board390.vh - 130 - 2,
    '9d.13 ...and the sheet still claims one screen minus the board as its FLOOR (a phone\'s content may be taller)',
    `hero ${board390.heroH} >= ${board390.vh - 130}`);

  // ── STEP 9e — THE FOLIO LINE ──────────────────────────────────────────────
  // VOL / dateline / clock. The clock is the interesting one: five fixed-width slots, a real
  // <time datetime>, and a spoken label, so the minute tick is a flip and never a reflow.
  group('STEP 9e — THE FOLIO, AND A CLOCK THAT CANNOT JITTER');
  // STEP 9d finished on a 390px phone, where the folio is a two-column stack by design. The folio is
  // measured on the desk, which is the only width where it is the three-zone line it is asserting.
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await cdp.eval('window.scrollTo({top:0,behavior:"instant"})');
  await sleep(520);
  const folio = await cdp.eval(`(() => {
    const f = document.querySelector('.hero__folio');
    if (!f) return { missing: true };
    const r = f.getBoundingClientRect();
    const clock = document.getElementById('folioClock');
    const face = clock.querySelector('.folio-clock-face');
    const dg = [...clock.querySelectorAll('.dg')];
    const w = el => Math.round(el.getBoundingClientRect().width * 100) / 100;
    const widths0 = dg.map(w);
    const texts = dg.map(d => d.textContent);
    dg.forEach(d => d.textContent = '8'); const widths8 = dg.map(w);
    dg.forEach(d => d.textContent = '1'); const widths1 = dg.map(w);
    dg.forEach((d, i) => d.textContent = texts[i]);
    return { top: Math.round(r.top),
      dt: clock.getAttribute('datetime'), sr: document.getElementById('folioClockLabel').textContent.trim(),
      faceHidden: face.getAttribute('aria-hidden'), n: dg.length,
      colons: clock.querySelectorAll('.cl').length,
      widths0, widths8, widths1,
      rules: f.querySelectorAll('.folio-rule').length, seps: f.querySelectorAll('.folio-sep').length,
      vol: (f.querySelector('.folio-vol') || {}).textContent.replace(/\\s+/g, ' ').trim(),
      date: (f.querySelector('.folio-date') || {}).textContent.replace(/\\s+/g, ' ').trim(),
      cols: getComputedStyle(f).gridTemplateColumns.split(' ').length,
      clockFont: getComputedStyle(clock).fontFamily,
      dateFont: getComputedStyle(f.querySelector('.folio-date')).fontFamily }; })()`);
  ok(!folio.missing && folio.cols === 3 && folio.top >= 8 && folio.top <= 56,
    '9e.1  three zones on one grid, pinned to the top edge of the sheet now that no bar is printed over it',
    `top ${folio.top}px, ${folio.cols} columns`);
  ok(/^\d{2}:\d{2}$/.test(folio.dt) && folio.sr === folio.dt,
    '9e.2  the clock is HH:MM on a real <time datetime>, and the spoken label is the same string',
    `${folio.dt} / ${folio.sr}`);
  ok(folio.faceHidden === 'true' && folio.n === 4 && folio.colons === 1,
    '9e.3  ...and the grunge face is five slots — four digits and the one colon — aria-hidden, because a screen reader wants a time, not a printing press',
    `${folio.n} digits + ${folio.colons} colon, face aria-hidden ${folio.faceHidden}`);
  ok(new Set(folio.widths0).size === 1 && new Set(folio.widths8).size === 1 && new Set(folio.widths1).size === 1
    && folio.widths0[0] === folio.widths8[0] && folio.widths0[0] === folio.widths1[0],
    '9e.4  every slot is the SAME width, and stays that width for the widest and the narrowest digit — the tick cannot reflow',
    `${folio.widths0.join('/')} → ${folio.widths8.join('/')} → ${folio.widths1.join('/')}`);
  ok(folio.rules === 2 && folio.seps === 1 && /2026/.test(folio.date) && /first edition/i.test(folio.date),
    '9e.5  the dateline is flanked by two hairlines and separated by a drawn rule, not an em-dash',
    `${folio.rules} rules, ${folio.seps} separator, "${folio.date}"`);
  ok(/Vol\. I/i.test(folio.vol) && /Sharjah/i.test(folio.vol),
    '9e.6  the left rail names the volume and the city', `"${folio.vol}"`);
  ok(/Old Newspaper Types/.test(folio.clockFont) && /The Story of Nothing/.test(folio.dateFont),
    '9e.7  the clock is the grunge face and the dateline the editorial one — both self-hosted, neither preloaded',
    `${folio.clockFont.split(',')[0]} / ${folio.dateFont.split(',')[0]}`);
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await sleep(520);
  const folio390 = await cdp.eval(`(() => { const f = document.querySelector('.hero__folio');
    const cs = getComputedStyle(f);
    return { areas: cs.gridTemplateAreas, cols: cs.gridTemplateColumns.split(' ').length,
      city: getComputedStyle(document.querySelector('.folio-city')).display }; })()`);
  ok(/vol clock/.test(folio390.areas) && /date/.test(folio390.areas) && folio390.cols === 2,
    '9e.8  at 390 the folio is two rows — volume and clock, then the dateline centred under them',
    `${folio390.areas} / ${folio390.cols} columns`);
  ok(folio390.city === 'none',
    '9e.9  ...and "— SHARJAH, UAE" is dropped rather than wrapped', folio390.city);
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await sleep(500);


  group('STEP 9f — THE DRAWER');
  // §16 — THE HEAD IS ONLY THERE IN A VIEW, and the drawer's handle is in the head. So the drawer
  // is measured inside a chosen place, which is the only state where the bar exists at all. The
  // focus-return in 9f.8 is only a real assertion if the gear is focusable when it returns.
  await enterView('who');
  await sleep(350);
  const shutDrawer = await cdp.eval(`(() => { const p = document.getElementById('setPanel');
    return { open: p.open, display: getComputedStyle(p).display,
      exp: document.getElementById('setOpen').getAttribute('aria-expanded') }; })()`);
  ok(!shutDrawer.open && shutDrawer.display === 'none' && shutDrawer.exp === 'false',
    '9f.1  shut, the drawer is not rendered at all — no dead Tab stop behind the page',
    shutDrawer.display);

  await cdp.eval(`document.getElementById('setOpen').click()`);
  await sleep(140);
  const drawerOpen = await cdp.eval(`(() => { const p = document.getElementById('setPanel');
    return { open: p.open, cls: p.classList.contains('is-open'), modal: p.matches(':modal'),
      locked: document.body.dataset.scrollLock === '1',
      exp: document.getElementById('setOpen').getAttribute('aria-expanded'),
      inside: !!document.activeElement && p.contains(document.activeElement),
      which: document.activeElement && document.activeElement.id }; })()`);
  ok(drawerOpen.open && drawerOpen.cls, '9f.2  the gear opens it, and the slide class lands a frame later');
  ok(drawerOpen.modal, '9f.3  it is a modal dialog: the page behind it is inert, not just covered');
  ok(drawerOpen.locked, '9f.4  and it asks for the same scroll lock the wall asks for');
  ok(drawerOpen.exp === 'true' && drawerOpen.inside && drawerOpen.which === 'setClose',
    '9f.5  focus moves in — to the way out, first', drawerOpen.which);

  // the sound mark moved into the drawer with its id and its aria-pressed, so the audio module's
  // binding never had to change: the ring answers here exactly as it did in the bar
  const pressed0 = await cdp.eval(`document.getElementById('soundToggle').getAttribute('aria-pressed')`);
  await cdp.eval(`document.getElementById('soundToggle').click()`);
  await sleep(120);
  const pressed1 = await cdp.eval(`document.getElementById('soundToggle').getAttribute('aria-pressed')`);
  await cdp.eval(`document.getElementById('soundToggle').click()`);
  await sleep(120);
  const pressed2 = await cdp.eval(`document.getElementById('soundToggle').getAttribute('aria-pressed')`);
  ok(pressed1 !== pressed0 && pressed2 === pressed0,
    '9f.6  the sound mark still answers in its new home — and answers back', `${pressed0} → ${pressed1} → ${pressed2}`);

  // twelve Tab presses: more than three times around four controls. The panel must hold all of
  // them; the platform's modal focus ring is what makes that true, not a keydown listener.
  const seen = [];
  for (let i = 0; i < 12; i++){
    await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9 });
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9 });
    await sleep(35);
    seen.push(String(await cdp.eval(`(document.activeElement && (document.activeElement.id || document.activeElement.className)) || '(none)'`)));
  }
  const heldIn = await cdp.eval(`document.getElementById('setPanel').contains(document.activeElement)`);
  ok(heldIn && new Set(seen).size >= 3, '9f.7  twelve Tab presses never leave the panel',
    [...new Set(seen)].join(' → '));

  await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
  await sleep(650);                       // 0.38 s slide + the close task
  const drawerShut = await cdp.eval(`(() => { const p = document.getElementById('setPanel');
    return { open: p.open, cls: p.classList.contains('is-open'),
      display: getComputedStyle(p).display,
      locked: document.body.dataset.scrollLock === '1',
      exp: document.getElementById('setOpen').getAttribute('aria-expanded'),
      focus: document.activeElement && document.activeElement.id }; })()`);
  ok(!drawerShut.open && !drawerShut.cls && drawerShut.display === 'none' && !drawerShut.locked,
    '9f.8  Escape slides it out (cancel is intercepted), then it is gone and the page is released');
  ok(drawerShut.exp === 'false' && drawerShut.focus === 'setOpen',
    '9f.9  and focus comes back to the gear that opened it', drawerShut.focus);
  note(`B  drawer: ${pressed0} sound, 12 Tabs inside; Escape → ${drawerShut.focus}`);

  group('STEP 9g — THE TWO SWITCHES');
  await cdp.eval(`document.getElementById('setOpen').click()`);
  await sleep(220);
  const prefs0 = await cdp.eval(`({ a11y: document.documentElement.getAttribute('data-a11y'),
    motion: document.documentElement.getAttribute('data-motion') })`);
  ok(prefs0.a11y === 'off' && prefs0.motion === 'on',
    '9g.1  a fresh profile is a moving page — both attributes say so', JSON.stringify(prefs0));

  await cdp.eval(`document.getElementById('prefA11y').click()`);
  await sleep(200);
  const accOn = await cdp.eval(`(() => { const h = document.documentElement;
    return { a11y: h.getAttribute('data-a11y'), motion: h.getAttribute('data-motion'),
      check: document.getElementById('prefA11y').getAttribute('aria-checked'),
      mCheck: document.getElementById('prefMotion').getAttribute('aria-checked'),
      mDis: document.getElementById('prefMotion').getAttribute('aria-disabled'),
      stored: localStorage.getItem('ad-a11y'),
      bodyCursor: getComputedStyle(document.body).cursor,
      reticle: getComputedStyle(document.getElementById('cur')).display,
      dur: getComputedStyle(document.getElementById('siteNav')).transitionDuration }; })()`);
  ok(accOn.a11y === 'on' && accOn.check === 'true', '9g.2  Accessibility turns on');
  ok(accOn.motion === 'off' && accOn.mCheck === 'false' && accOn.mDis === 'true',
    '9g.3  and it takes Motion with it — that row stays readable, aria-disabled, out of service');
  ok(accOn.bodyCursor === 'auto', '9g.4  the system cursor comes back', accOn.bodyCursor);
  ok(accOn.reticle === 'none', '9g.5  and the custom mark is gone');
  ok(accOn.stored === 'on', '9g.6  the answer is kept on this device');
  ok(parseFloat(accOn.dur) < 0.01, '9g.7  every duration is cut to nothing', accOn.dur);

  await cdp.eval(`document.getElementById('prefMotion').click()`);
  await sleep(150);
  ok(await cdp.eval(`document.documentElement.getAttribute('data-motion') === 'off'
      && document.getElementById('prefMotion').getAttribute('aria-checked') === 'false'`),
    '9g.8  and the row under it will not switch while the row above owns it');

  await cdp.eval(`document.getElementById('setClose').click()`);
  await sleep(90);
  const quick = await cdp.eval(`({ open: document.getElementById('setPanel').open,
    locked: document.body.dataset.scrollLock === '1' })`);
  ok(!quick.open && !quick.locked,
    '9g.9  with motion off the drawer is gone in one frame, not in 380 ms of transition');

  await cdp.eval(`document.getElementById('setOpen').click()`);
  await sleep(150);
  await cdp.eval(`document.getElementById('prefA11y').click()`);
  await sleep(220);
  const accOff = await cdp.eval(`({ a11y: document.documentElement.getAttribute('data-a11y'),
    motion: document.documentElement.getAttribute('data-motion'),
    mCheck: document.getElementById('prefMotion').getAttribute('aria-checked'),
    mDis: document.getElementById('prefMotion').getAttribute('aria-disabled') })`);
  ok(accOff.a11y === 'off' && accOff.motion === 'on' && accOff.mCheck === 'true' && accOff.mDis === 'false',
    '9g.10 turning it off gives Motion back to its own switch — which was never moved');

  await cdp.eval(`document.getElementById('prefMotion').click()`);
  await sleep(300);
  const mOff = await cdp.eval(`(() => { const h = document.documentElement;
    return { motion: h.getAttribute('data-motion'),
      check: document.getElementById('prefMotion').getAttribute('aria-checked'),
      stored: localStorage.getItem('ad-motion'),
      lenis: h.classList.contains('lenis'),
      behavior: getComputedStyle(h).scrollBehavior }; })()`);
  ok(mOff.motion === 'off' && mOff.check === 'false' && mOff.stored === 'off',
    '9g.11 Motion turns off on its own switch and is remembered');
  ok(!mOff.lenis, '9g.12 and the smoother is destroyed, not merely paused');
  ok(mOff.behavior === 'auto', '9g.13 so a #hash link is a jump, not a glide', mOff.behavior);

  // the drawer closes itself, the page reloads, and the page that comes back is the one the
  // visitor asked for — the switch is a promise across sessions, not a state for this scroll
  await cdp.eval(`document.getElementById('setClose').click()`);
  await sleep(150);
  // §16 — a reload is a fresh boot, and the boot follows the URL. The routes above pushed fragments,
  // so the URL is cleared first: what this reload is testing is the SWITCH being remembered, not a
  // deep link being honoured.
  await cdp.eval(`(() => { try { history.replaceState({}, '', location.pathname + location.search); } catch(e){} })()`);
  consoleErrors.length = 0;               // everything from here on is a fresh boot, three times
  await cdp.send('Page.reload');
  await sleep(1700);
  const afterReload = await cdp.eval(`(() => { const h = document.documentElement;
    return { motion: h.getAttribute('data-motion'), a11y: h.getAttribute('data-a11y'),
      mCheck: document.getElementById('prefMotion').getAttribute('aria-checked'),
      aCheck: document.getElementById('prefA11y').getAttribute('aria-checked'),
      lenis: h.classList.contains('lenis') }; })()`);
  ok(afterReload.motion === 'off' && afterReload.mCheck === 'false',
    '9g.14 a reload keeps the answer');
  ok(afterReload.a11y === 'off' && afterReload.aCheck === 'false', '9g.15 ...both of them');
  ok(!afterReload.lenis, '9g.16 and the smoother is never built on a page that asked for none');

  await cdp.eval(`(() => { try { localStorage.removeItem('ad-a11y'); localStorage.removeItem('ad-motion'); } catch(e){} })()`);
  await cdp.send('Page.reload');
  await sleep(1700);
  const restored = await cdp.eval(`({ motion: document.documentElement.getAttribute('data-motion'),
    lenis: document.documentElement.classList.contains('lenis'),
    smooth: document.documentElement.classList.contains('lenis-smooth') })`);
  ok(restored.motion === 'on' && restored.lenis,
    '9g.17 and clearing it puts the page back the way it shipped — smoother and all');
  note(`B  switches: a11y on → cursor ${accOn.bodyCursor}, duration ${accOn.dur}; motion off → lenis ${mOff.lenis}`);

  // ── STEP 9h — THE PHONE'S HEAD ────────────────────────────────────────────
  // At 390 the head is two zones, not three: the name and the controls. The four places are ON the
  // board, where a thumb can hit them, and the row itself is not drawn at all.
  group('STEP 9h — ON A PHONE THE HEAD IS TWO ZONES, AND THE BOARD CARRIES THE MAP');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await sleep(600);
  // §16 — the same rule as 9f: the bar exists in a view, so the phone is measured in a chosen place.
  await enterView('who');
  await sleep(420);
  const phoneHead = await cdp.eval(`(() => {
    const bar = document.getElementById('siteNav'), br = bar.getBoundingClientRect();
    const row = document.querySelector('.head-nav');
    const brand = document.querySelector('.head-brand'), gr = brand.getBoundingClientRect();
    const gear = document.getElementById('setOpen'), nr = gear.getBoundingClientRect();
    const waveBtn = document.getElementById('soundToggle'), wr = waveBtn.getBoundingClientRect();
    return { row: getComputedStyle(row).display, h: Math.round(br.height),
      brand: getComputedStyle(brand).display, gearRight: Math.round(nr.right), barRight: Math.round(br.right),
      brandLeft: Math.round(gr.left), barLeft: Math.round(br.left),
      hit: document.elementFromPoint(nr.left + nr.width / 2, nr.top + nr.height / 2) === gear,
      waveW: Math.round(wr.width), waveH: Math.round(wr.height),
      overflow: document.documentElement.scrollWidth > window.innerWidth }; })()`);
  ok(phoneHead.row === 'none',
    '9h.1  the four-place row is not drawn at 390 — the board below is the map, and four targets here would be none', phoneHead.row);
  ok(phoneHead.brand !== 'none' && phoneHead.hit && phoneHead.gearRight <= phoneHead.barRight,
    '9h.2  the brand and the gear are both on the bar, and the gear still hit-tests where it is drawn',
    `gear right ${phoneHead.gearRight} of ${phoneHead.barRight}, hit ${phoneHead.hit}`);
  ok(phoneHead.waveW > 20 && phoneHead.waveH > 8 && !phoneHead.overflow,
    '9h.3  the wave keeps its 24x12px box beside the gear, and 390 has no horizontal scrollbar',
    `wave ${phoneHead.waveW}x${phoneHead.waveH}, overflow ${phoneHead.overflow}`);
  // ONE ROW, NOT A PILE. Every control in the bar has to have its own horizontal band: the brand,
  // the sound mark and the gear. (`← INDEX` is not drawn at 390 — the pull-up and BACK TO INDEX are
  // the phone's ways back — and this is the assertion that keeps a third control from returning.)
  const barBoxes = await cdp.eval(`(() => {
    const sels = ['.head-brand', '#soundToggle', '#setOpen', '#headIndex'];
    return sels.map(s => { const el = document.querySelector(s);
      if (!el) return { s, on: false };
      const cs = getComputedStyle(el), r = el.getBoundingClientRect();
      return { s, on: cs.display !== 'none' && cs.visibility !== 'hidden', l: Math.round(r.left), r: Math.round(r.right) }; });
  })()`);
  const shownBar = barBoxes.filter(b => b.on).sort((a, b) => a.l - b.l);
  ok(barBoxes.find(b => b.s === '#headIndex').on === false,
    '9h.3b at 390 `← INDEX` is not drawn — the phone has the pull-up and BACK TO INDEX instead, and a third control made the name illegible',
    shownBar.map(b => `${b.s} ${b.l}-${b.r}`).join(' | '));
  ok(shownBar.every((b, i) => i === 0 || b.l >= shownBar[i - 1].r - 1),
    '9h.3c ...and the controls that ARE drawn never overlap: each one owns its own band of the bar',
    shownBar.map(b => `${b.s} ${b.l}-${b.r}`).join(' | '));

  // THE FIRST TAB STOP IS THE WAY PAST THE HEAD (§08).
  await cdp.eval(`document.activeElement && document.activeElement.blur()`);
  await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9 });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9 });
  await sleep(220);
  const firstTab = await settles(`(() => { const a = document.activeElement;
    const cs = getComputedStyle(a), r = a.getBoundingClientRect();
    return { cls: a.className, href: a.getAttribute('href'), top: Math.round(r.top), h: Math.round(r.height),
      transform: cs.transform, visible: r.height > 4 && r.bottom > 0 }; })()`,
    v => v.visible && v.top >= 0 && v.top < 90);
  ok(firstTab.cls === 'skip-link' && firstTab.href === '#main',
    '9h.4  the first Tab stop is the skip link, and it points at #main', `${firstTab.cls} → ${firstTab.href}`);
  ok(firstTab.visible && firstTab.top >= 0 && firstTab.top < 90,
    '9h.5  ...and on focus it drops into view under the head, where a keyboard visitor can see it',
    `top ${firstTab.top}px, ${firstTab.h}px tall`);

  // §16 — back to the cover, so every step after this one measures the page as it ships.
  await enterCover();
  await cdp.eval(`document.activeElement.blur()`);
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await sleep(500);

  // ── STEP 9i — STATIC: THIS BUILD'S SOURCE ─────────────────────────────────
  // The checks that are cheaper and stricter as text: the tokens, the preload policy, the markup
  // that must be gone, and the literals the motion contract is written in.
  group('STEP 9i — STATIC: TOKENS, PRELOAD POLICY, AND WHAT IS GONE');
  ok(/<a class="skip-link" href="#main">/.test(html) && /<main id="main"/.test(html)
    && html.indexOf('<header class="site-head"') < html.indexOf('<main id="main"')
    && html.indexOf('<nav class="metroboard"') > html.indexOf('<main id="main"'),
    '9i.1  a skip link to a <main> landmark, the head outside it and the board inside — the skip lands on the content, not on the contents page');
  ok(/<link rel="preload" href="fonts\/JSL-Blackletter-Normal.woff2" as="font" type="font\/woff2" crossorigin>/.test(html),
    '9i.2  exactly one face is preloaded — the blackletter — with the crossorigin a font fetch needs');
  ok(!/rel="preload"[^>]*OldNewspaperTypes/.test(html) && !/rel="preload"[^>]*Story of Nothing/.test(html)
    && /OldNewspaperTypes\.woff2/.test(cssText) && /The Story of Nothing\.woff2/.test(cssText),
    '9i.3  the other two faces are declared and NOT preloaded: one line each, off the critical path');
  ok(!/url\([^)]*\.ttf/.test(cssText) && !/(?:href|src)="[^"]*\.ttf/.test(html),
    '9i.4  no TrueType REQUEST survives anywhere in the document — the master file stays in the repo, named once in a comment, never fetched');
  ok(/--muted:#6E6050/.test(cssText) && /--muted-dark:rgba\(237,230,212,0\.62\)/.test(cssText)
    && /--brass:#7D5A1F/.test(cssText),
    '9i.5  the three AA tokens are the re-derived values, not the old ones');
  ok(/--pop-1:#A8D173; --pop-2:#FF4F38; --pop-3:#FFE81A; --pop-4:#9ED8F5;/.test(cssText),
    '9i.6  the four pop inks are declared once, and both surfaces read them');
  ok(/--board-h:72px/.test(cssText) && /--head-h:3\.4rem/.test(cssText),
    '9i.7  --board-h and --head-h are the two lengths the fold is built from');
  ok(!/marquee-h/.test(cssText) && !/marquee/.test(jsText),
    '9i.8  no --marquee-h and no marquee code survives in either file (§8: grep returns nothing)');
  ok(!/hero-crop|reg-crosshair/.test(html) && !/\.hero-crop|\.reg-crosshair/.test(cssText),
    '9i.9  the crop marks and the registration crosshair are gone from the markup and the stylesheet');
  ok(/\.hero-fold\{[^}]*background:rgba\(20,17,16,0\.05\)/.test(cssText)
    && /<span class="hero-fold" aria-hidden="true"><\/span>/.test(html),
    '9i.10 the central fold is one 5%-ink hairline on the sheet, drawn and never hit');
  ok(/\.sticker--aliasgar\{width:86%;aspect-ratio:1905\/461;\}/.test(cssText)
    && /\.sticker--dalal\{width:84%;aspect-ratio:1918\/657;\}/.test(cssText)
    && /width="1905" height="461"/.test(html) && /width="1918" height="657"/.test(html),
    '9i.11 each sticker box takes its own file\'s ratio, and the <img> declares the same numbers (no CLS)');
  ok(/\.sticker-home\{[^}]*left:50%;top:50%;translate:-50% -50%/.test(cssText)
    && /\.sticker\{[^}]*inset:0/.test(cssText)
    && !/\.sticker\{[^}]*aspect-ratio:1\/1/.test(cssText),
    '9i.12 the plate is CENTRED over its word on a node NOTHING tweens (.sticker-home), and the hand (.sticker) simply fills it — two writers, two boxes, so a re-fit and a drag can never fight');
  ok(/\.sticker__plate\{[^}]*rotate:-2\.4deg;translate:3px -2px;/.test(cssText)
    && /\.sticker--dalal \.sticker__plate\{rotate:1\.8deg;translate:-4px 3px;\}/.test(cssText),
    '9i.13 and the resting pose lives on its own plate node: rotate/translate, so drag and jitter never fight it');
  ok(/data-cursor="peel"/.test(html) && /peel:'peel'/.test(jsText),
    '9i.14 the drag cursor says PEEL, through the existing #curWord system');

  group('STEP 10a — STATIC: two pixels, aria-hidden, and no cursor');

  const ppRule = (/\.page-progress\{([^}]*)\}/.exec(cssText) || [, ''])[1];
  const ppFill = (/\.pp-fill\{([^}]*)\}/.exec(cssText) || [, ''])[1];
  const ppSeg  = (/\.pp-seg\{([^}]*)\}/.exec(cssText) || [, ''])[1];
  ok(/class="page-progress" id="pageProgress" aria-hidden="true"/.test(html),
    '10a.1 the rail is aria-hidden in the markup — the breadcrumb is the same answer in words');
  ok(/position:fixed/.test(ppRule) && /width:2px/.test(ppRule)
    && /top:0/.test(ppRule) && /bottom:0/.test(ppRule),
    '10a.2 and it is a fixed 2px column, the height of the viewport', ppRule.slice(0, 46));
  ok(/pointer-events:none/.test(ppRule),
    '10a.3 that takes no pointer events: the edge of the page is still the page');
  ok(/right:var\(--sbw,0px\)/.test(ppRule),
    '10a.4 pinned past the scrollbar the way the bar is, so a scroll lock cannot slide it sideways');
  ok(/transform:scaleY\(/.test(ppFill) && /transform-origin:50% 0/.test(ppFill)
    && !/height:/.test(ppFill) && !/transition/.test(ppFill),
    '10a.5 the fill is a scaleY from its own top edge — no height, and no transition to lag behind',
    ppFill.slice(0, 44));
  ok(/flex:0 1 0/.test(ppSeg) && /rgba\(158,116,40/.test(ppSeg),
    '10a.6 each segment divides the track by flex-grow, drawn in the brass at 22%');
  ok(/const segs = \[\], fills = \[\]/.test(jsText)
    && /const WIN\s+= sections\.map\(\(\) => \(\{ start: 0, len: 1, p: 0 \}\)\)/.test(jsText),
    '10a.7 the segments are built from [data-nav], and the window arithmetic is one entry per section');
  ok(/paintTrack\(completed\);\s*\}/.test(jsText)
    && /if \(stillMotion\(\)\)\{\s*\n\s*if \(completed === shownSteps\) return;/.test(jsText),
    '10a.8 painted from the breadcrumb\'s own frame — and skipped per frame once motion is off');

  // every reading in one call: the rail's box, its five lengths, the five fill values as the
  // matrix the compositor actually has, and the hit test that proves it is not in the way.
  const trackAt = () => cdp.eval(`(() => {
    const t = document.getElementById('pageProgress');
    const r = t.getBoundingClientRect(), cs = getComputedStyle(t);
    const segs = [...t.children];
    const tr = segs.map(s => s.getBoundingClientRect());
    const fills = segs.map(s => { const m = getComputedStyle(s.firstElementChild).transform;
      return m === 'none' ? 1 : +m.slice(m.indexOf('(') + 1, -1).split(',')[3]; });
    return { n: segs.length, ids: segs.map(s => s.dataset.ppFor),
      w: +r.width.toFixed(2), left: Math.round(r.left), right: Math.round(r.right),
      top: Math.round(r.top), h: Math.round(r.height),
      cw: document.documentElement.clientWidth, ih: window.innerHeight,
      sw: document.documentElement.scrollWidth,
      pe: cs.pointerEvents, z: cs.zIndex,
      segH: tr.map(s => Math.round(s.height)),
      fillH: segs.map(s => s.firstElementChild.offsetHeight),
      fills, sum: Math.round(tr.reduce((a, s) => a + s.height, 0)),
      hit: (() => { const e = document.elementFromPoint(r.left + 1, 300);
        return !!e && !e.closest('.page-progress'); })() };
  })()`);

  group('STEP 10b — TWO PIXELS ON THE EDGE, FIVE LENGTHS ON THE PAGE');
  const t0 = await trackAt();
  ok(t0.n === 5 && t0.ids.join() === 'hero,who,work,magazine,reach',
    '10b.1 five segments, in the page\'s own order — hero, who, work, magazine, reach', t0.ids.join());
  ok(t0.w === 2 && t0.right === t0.cw && t0.left === t0.cw - 2,
    '10b.2 two pixels wide, on the right edge of the client box — left of the scrollbar, not under it',
    `${t0.w}px at x ${t0.left}, client ${t0.cw}px`);
  ok(t0.top === 0 && near(t0.h, t0.ih, 1),
    '10b.3 and the whole viewport tall: a rail, not a widget', `${t0.h}px of ${t0.ih}px`);
  ok(t0.pe === 'none' && t0.hit,
    '10b.4 pointer-events:none, so a hit test on its own edge lands on the page behind it');
  ok(+t0.z === 480, '10b.5 under the bar (500) and under every overlay (800/900)', t0.z);
  ok(t0.fills.every(f => f === 0),
    '10b.6 at the top of the page the rail is empty — progress is measured, not started a third in',
    t0.fills.join());

  // THE LENGTHS ARE EQUAL NOW, AND THAT IS THE POINT (§16). Five lengths of travel only exist on a
  // page that IS five sections stacked; the gate made the page one place at a time, so the rail is
  // a MAP of five places with exactly one of them filling — the same answer the head gives in words.
  const segRatio = t0.segH.map(h => h / (t0.segH.reduce((a, b) => a + b, 0) || 1));
  ok(segRatio.length === 5 && segRatio.every(r => Math.abs(r - 0.2) <= 0.01)
    && t0.segH.every(h => h > 0) && t0.sum >= t0.h - 6 && t0.sum <= t0.h,
    '10b.7 the five lengths are equal fifths of the track — a map of five places, not a chart of five heights',
    segRatio.map(n2).join(' / '));

  // ONE READER FOR THE READING LINE. Park a section's top on the line the rail measures against
  // (40% of the viewport), let the observer settle, then ask which place is CURRENT: the answer comes
  // off the head's own row, which is written in the same pass as the board's block and the rail's
  // count — so a disagreement here is a disagreement about the page, not about this helper.
  const atSection = async (sel) => {
    // +1px PAST the boundary. A section's window in the rail ENDS exactly at `top - line`, so
    // landing on the boundary leaves the previous length's `p` at 1 − ε and the navigation count
    // one short. The extra pixel is inside the new section by definition, so the assertion below
    // is still strict: the older lengths must be full and the newer ones empty.
    await cdp.eval(`(() => { const s = document.querySelector('${sel}');
      window.scrollTo({ top: s.getBoundingClientRect().top + window.scrollY - window.innerHeight * 0.4 + 1, behavior: 'instant' }); })()`);
    await sleep(420);
    return cdp.eval(`(() => {
      const cur = [...document.querySelectorAll('.head-nav-link[aria-current="location"]')];
      const l = cur[0] ? cur[0].querySelector('.head-nav-label') : null;
      return { label: (l ? l.textContent : '').trim(), active: cur[0] ? cur[0].getAttribute('data-nav-for') : '',
        rows: document.querySelectorAll('[data-nav-for][aria-current="location"]').length }; })()`);
  };

  group('STEP 10c — THE RAIL FOLLOWS THE SAME READING LINE AS THE BREADCRUMB');
  await enterView('work');
  await sleep(300);
  const sWorkP = await atSection('#work');
  const tw = await trackAt();
  ok(tw.fills[0] === 1 && tw.fills[1] === 1 && tw.fills[2] >= 0 && tw.fills[2] < 0.2
    && tw.fills[3] === 0 && tw.fills[4] === 0,
    '10c.1 at the top of #work the two lengths behind it are full, #work has not started filling, and the rest is empty',
    tw.fills.join() + `  (label: ${sWorkP.label})`);
  ok(tw.fillH.every((h, i) => h === tw.segH[i]),
    '10c.2 ...and the fill is scaled inside its segment, not resized — every box is unchanged',
    `fill ${tw.fillH.join('/')} vs seg ${tw.segH.join('/')}`);

  // halfway down a section taller than the viewport: the number is the line's travel, not the page's
  await cdp.eval(`(() => { const s = document.getElementById('work');
    const r = s.getBoundingClientRect(), top = r.top + window.scrollY, h = r.height;
    window.scrollTo({ top: Math.round(top - window.innerHeight * 0.4 + h / 2), behavior: 'instant' }); })()`);
  await sleep(420);
  const tm = await trackAt();
  ok(near(tm.fills[2], 0.5, 0.03),
    '10c.3 halfway down #work its own length is half full — the reading line is what it measures',
    `scaleY ${tm.fills[2]} in ${tm.segH[2]}px of track`);

  // THE LAST PLACE, AT THE FOOT OF ITS OWN PAGE. §16: the page a view is made of ends on that
  // section's last pixel, so "the bottom of the page" is now the bottom of ONE place — and there
  // the rail must be full and both surfaces must name that place.
  await enterView('reach');
  await cdp.eval('window.scrollTo({top: document.documentElement.scrollHeight, behavior:"instant"})');
  await sleep(460);
  const tb = await trackAt();
  const tbCur = await cdp.eval(`(() => {
    const rows = [...document.querySelectorAll('[data-nav-for][aria-current="location"]')];
    return { n: rows.length, ids: [...new Set(rows.map(r => r.getAttribute('data-nav-for')))].join() }; })()`);
  ok(tb.fills.every(f => f === 1),
    '10c.4 at the foot of the last place all five lengths are full — the rail ends where the page does',
    tb.fills.join());
  ok(tbCur.n === 2 && tbCur.ids === 'reach',
    '10c.5 ...and BOTH surfaces name the last place — one aria-current, written once, from the same frame',
    `${tbCur.n} rows current: ${tbCur.ids}`);
  note(`C  track: ${t0.w}px at x ${t0.left} of ${t0.cw}; lengths ${segRatio.map(n2).join(' / ')}; mid-#work ${tm.fills[2]}`);

  group('STEP 10d — MOTION OFF TURNS THE RAIL INTO A COUNT');
  // the same position the rail was measuring a moment ago, so the change of mode is legible
  await enterView('work');
  await sleep(240);
  await cdp.eval(`(() => { const s = document.getElementById('work');
    const r = s.getBoundingClientRect(), top = r.top + window.scrollY, h = r.height;
    window.scrollTo({ top: Math.round(top - window.innerHeight * 0.4 + h / 2), behavior: 'instant' }); })()`);
  await sleep(420);
  const cont = await trackAt();

  await cdp.eval(`document.getElementById('setOpen').click()`);
  await sleep(180);
  await cdp.eval(`document.getElementById('prefMotion').click()`);
  await sleep(200);
  await cdp.eval(`document.getElementById('setClose').click()`);
  await sleep(420);
  const mOff2 = await cdp.eval(`({ motion: document.documentElement.getAttribute('data-motion'),
    open: document.getElementById('setPanel').open })`);
  ok(mOff2.motion === 'off' && !mOff2.open,
    '10d.1 the drawer switch silences motion, and the drawer is shut again');
  const step1 = await trackAt();
  ok(cont.fills[2] > 0.3 && step1.fills.join() === '1,1,0,0,0',
    '10d.2 with motion off the part-filled length becomes a count: two behind, none fractional',
    `${cont.fills.join()} → ${step1.fills.join()}`);

  // 220px inside the same section: nothing may be written, because nothing has changed
  await cdp.eval('window.scrollBy({top:220,behavior:"instant"})');
  await sleep(420);
  const step2 = await trackAt();
  const stillCur = await cdp.eval(`(() => { const r = document.querySelector('[data-nav-for][aria-current="location"]');
    return r ? r.getAttribute('data-nav-for') : ''; })()`);
  ok(step2.fills.join() === step1.fills.join() && stillCur === 'work',
    '10d.3 scrolling 220px inside one section writes nothing at all',
    `${step1.fills.join()} → ${step2.fills.join()}`);

  // crossing a boundary is one step, not a slide
  await enterView('magazine');
  await sleep(240);
  const sMagP = await atSection('#magazine');
  await sleep(420);
  const step3 = await trackAt();
  ok(step3.fills.join() === '1,1,1,0,0' && sMagP.active === 'magazine',
    '10d.4 crossing into the magazine is one step: three lengths, each one full or empty',
    step3.fills.join());

  await cdp.eval(`document.getElementById('setOpen').click()`);
  await sleep(180);
  await cdp.eval(`document.getElementById('prefMotion').click()`);
  await sleep(200);
  await cdp.eval(`document.getElementById('setClose').click()`);
  await sleep(520);
  const backOn = await cdp.eval(`(() => { const s = document.getElementById('magazine');
    const r = s.getBoundingClientRect(), top = r.top + window.scrollY, h = r.height;
    window.scrollTo({ top: Math.round(top - window.innerHeight * 0.4 + h / 2), behavior: 'instant' });
    return document.documentElement.getAttribute('data-motion'); })()`);
  await sleep(420);
  const cont2 = await trackAt();
  ok(backOn === 'on' && cont2.fills[3] > 0.3 && cont2.fills[3] < 0.7,
    '10d.5 and motion back on restores the measurement — the magazine length is part-filled again',
    cont2.fills.join());

  group('STEP 10e — THE RAIL NEVER GROWS A SCROLLBAR, AT ANY WIDTH');
  const RIDES = [[1440, 900], [1024, 900], [768, 900], [390, 844]];
  for (let i = 0; i < RIDES.length; i++){
    const [w, h] = RIDES[i];
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
    await cdp.eval('window.scrollTo({top:0,behavior:"instant"})');
    await sleep(420);
    const t = await trackAt();
    ok(t.w === 2 && t.right === t.cw && t.left === t.cw - 2 && t.sw <= t.cw + 1
      && t.h <= t.ih + 1 && t.n === 5 && t.pe === 'none',
      `10e.${i + 1}  at ${w}px the rail stays inside the client box and adds no sideways scroll`,
      `x ${t.left}→${t.right} of ${t.cw}, scrollWidth ${t.sw}, ${t.h}px tall`);
  }

  // the scroll lock widens the client box by the scrollbar; --sbw is what keeps the rail still
  const lockBefore = await trackAt();
  await cdp.eval(`document.getElementById('setOpen').click()`);
  await sleep(420);
  const lockOpen = await trackAt();
  ok(lockOpen.cw > lockBefore.cw && lockOpen.right === lockBefore.right,
    '10e.5 the drawer\'s scroll lock widens the viewport and the rail does not slide with it',
    `${lockBefore.right} → ${lockOpen.right} px while the box went ${lockBefore.cw} → ${lockOpen.cw}`);
  await cdp.eval(`document.getElementById('setClose').click()`);
  await sleep(700);
  note(`C  motion off: ${step1.fills.join()} (then ${step3.fills.join()} across the magazine); lock: ${lockBefore.right} → ${lockOpen.right}`);

  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  // §16 — back to the fold before the sheet's own steps: the hero only exists in cover and index.
  await enterCover();
  await sleep(420);

  // ═════════════════════════════════════════════════════════════════════════
  // STEP 11 — PHASE 2, CHAPTER 0: THE PRESS SHEET (hero, plate, signboard)
  //
  // Three surfaces were rebuilt in one pass and they are one object: the hero is the
  // front sheet of a printed monograph, the portrait is printed on it in three passes,
  // and the strip under the fold is the sheet's contents handed to the bar as it docks.
  // Every assertion below is about an EDGE — a crop on the gutter, a line inside its
  // mask, a pass inside the other two, a fade that adds to one with its neighbour.
  // ═════════════════════════════════════════════════════════════════════════
  group('STEP 11a — THE BROADSHEET IN THE SOURCE');
  ok(/isolation:isolate/.test(cssText)
    && /#hero\{[^}]*overflow:hidden/.test(cssText)
    && /#hero\{[^}]*--paper:#EAE7E0/.test(cssText)
    && /#hero\{[^}]*--ink:#141110/.test(cssText)
    && /#hero\{[^}]*--hero-pad:var\(--pad\)/.test(cssText)
    && /#hero\{[^}]*min-height:calc\(100svh - var\(--board-h\)\)/.test(cssText)
    && /#hero\{grid-template-columns:var\(--frame-cols\);padding-left:0;--hero-pad:var\(--gutter\);height:calc\(100vh - var\(--board-h\)\)/.test(cssText),
    '11a.1  #hero is a sheet of paper: its own stacking context, clipped, its palette SCOPED to itself, and a height that is the viewport minus the BOARD',
    'paper/ink are declared on #hero (not :root — --ink there is the navy chrome token), --hero-pad:var(--pad) → var(--gutter) at 1200, and --board-h is the one token the sheet and the board both read');

  ok(/\.hero-paper\{[^}]*filter:url\(#paperGrain\)/.test(cssText)
    && /<filter id="paperGrain"[\s\S]*?type="fractalNoise"[\s\S]*?type="saturate" values="0"[\s\S]*?slope="0.62"[\s\S]*?<\/filter>/.test(html)
    && !/tintHeavy/.test(html),
    '11a.2  the paper is one SVG filter — fractalNoise, neutralised, ramped to alpha — and the old #tintHeavy is gone',
    'filter region is the element\'s own box, so a 2560px sheet never repeats a 280px tile');

  ok(!/hero-crop/.test(html) && !/\.hero-crop/.test(cssText)
    && (html.match(/class="hero-fold"/g) || []).length === 1
    && /\.hero-fold\{[^}]*background:rgba\(20,17,16,0\.05\)/.test(cssText)
    && /\.hero-fold\{[^}]*box-shadow:1px 0 0 var\(--paper\)/.test(cssText),
    '11a.3  the four crop marks are GONE; the sheet\'s own furniture is the fold — one drawn hairline plus the stock\'s shadow, and no hit area at all',
    'two 1px lines down the whole sheet, which is what a broadsheet actually shows where it was folded');

  ok(/<a class="skip-link" href="#main">Skip to content<\/a>/.test(html)
    && /<main id="main" tabindex="-1">/.test(html)
    && html.indexOf('class="skip-link"') < html.indexOf('<header class="site-head"')
    && /\.skip-link\{[^}]*position:fixed/.test(cssText)
    && /\.skip-link:focus/.test(cssText)
    && !/reg-crosshair/.test(html + cssText),
    '11a.4  the first thing in the body is the way PAST the head: a skip link to <main id="main" tabindex="-1">, and the registration crosshair it replaced is gone from both files',
    'first in the DOM, first in the tab ring, and it targets the sheet rather than the top of the page');

  ok(/<link rel="preload" href="fonts\/JSL-Blackletter-Normal\.woff2" as="font" type="font\/woff2" crossorigin>/.test(html)
    && /@font-face\{[\s\S]{0,240}?font-family:'JSL Blackletter'[\s\S]{0,240}?src:url\('fonts\/JSL-Blackletter-Normal\.woff2'\) format\('woff2'\)[\s\S]{0,160}?font-display:swap/.test(cssText)
    && !/url\([^)]*\.ttf/.test(cssText)
    && !/Blackletter-Normal\.ttf/.test(html)
    && /--serif-gothic:'JSL Blackletter'/.test(cssText),
    '11a.5  the masthead face is self-hosted and WOFF2-ONLY: preloaded WITH crossorigin (a font is always fetched CORS-mode, so a preload without it is a second download), swapped in, named by a token, and never backed by a TrueType URL',
    'fonts/JSL-Blackletter-Normal.woff2 — 84,716 B, −58% on the 200,152 B .ttf master that stays in the repo unconsumed; no font CDN in the critical path');

  ok(/\.name-line\{[^}]*font-family:var\(--serif-gothic\)/.test(cssText)
    && /\.sticker-group\{[^}]*display:inline-block/.test(cssText)
    && /\.small-caps\{[^}]*font-variant-caps:small-caps/.test(cssText)
    && /<span class="small-caps">DALAL<\/span>/.test(html)
    && !/<h1[^>]*>[^<]*text-transform:uppercase/.test(html),
    '11a.6  the name is the blackletter, each word rides in a shrink-to-fit group, and the second word is SMALL CAPS — the source says DALAL, the renderer decides the case',
    'the inline-block group is what makes each word a measurable box, which is what the sticker\'s percentages are percentages of');

  ok(!/class="hero-ticker"/.test(html) && !/\.hero-ticker\{/.test(cssText)
    && !/class="hero-asterisk"/.test(html) && !/\.hero-asterisk\{/.test(cssText)
    && !/class="hero-rule"|class="hero-tagline"/.test(html)
    && !/class="sp sp1"/.test(html)
    && (html.match(/class="hero-gear-asterisk hero-asterisk-mark"/g) || []).length === 1
    && /\.hero-asterisk-mark\{[^}]*font-family:var\(--serif-grunge\)/.test(cssText),
    '11a.7  the slug, the accent hairline, the tagline and the dust specks are all GONE — and the one asterisk that stayed is the RATCHET: the masthead\'s own glyph, in the GRUNGE, set as the colophon',
    'four elements and five rules removed; the mark left behind is the one that turns on the page\'s progress, and it wears the newsprint face the folio already speaks in rather than the thin gothic it used to borrow');

  ok(/\.hero-line\{[^}]*clip-path:inset\(-25% -12% 0 -12%\)/.test(cssText)
    && /\.hero-line > \.name-line\{transform:translateY\(110%\)/.test(cssText)
    && !/\.char\b/.test(cssText) && !/charUp/.test(cssText),
    '11a.8  each line is a clip-path mask with the type parked below its baseline, and the per-character apparatus is gone',
    'the sides and the top stay open: a 0.92 line box would shave an ascender');

  const plateHTML = html.slice(html.indexOf('<div class="riso-portrait"'),
    html.indexOf('</div>', html.indexOf('<div class="riso-portrait"')));
  ok((html.match(/class="rp-layer /g) || []).length === 4
    && (html.match(/src="images\/hero-photo-new\.png"/g) || []).length === 4
    && (plateHTML.match(/class="rp-layer /g) || []).length === 4
    && /\.rp-layer\{[^}]*mix-blend-mode:multiply/.test(cssText)
    && /\.rp-key\{filter:url\(#riso-ink-bleed\)[^}]*brightness\(1\.34\)/.test(cssText)
    && /\.rp-red\{filter:url\(#riso-ink-bleed\)[^}]*saturate\(2\.4\)/.test(cssText)
    && /\.rp-blue\{filter:url\(#riso-ink-bleed\)[^}]*saturate\(3\.2\)/.test(cssText)
    && /\.rp-shadow\{filter:brightness\(0\) blur\(11px\)/.test(cssText)
    && plateHTML.indexOf('rp-shadow') < plateHTML.indexOf('rp-red')
    && plateHTML.indexOf('rp-red') < plateHTML.indexOf('rp-blue')
    && plateHTML.indexOf('rp-blue') < plateHTML.indexOf('rp-key')
    && !/\.portrait-stack|\.pp-layer|\.pp-base|\.pp-halftone/.test(cssText + html),
    '11a.9  FOUR passes of ONE photograph, in printing order: the cut-out silhouette, vermilion, cobalt, then the key — each multiplied over the stock, each carrying its own bleed',
    'the same 699×532 file four times: one fetch, one silhouette, two drums, one key — and the DOM order IS the paint order');

  ok(/<filter id="riso-ink-bleed" x="-18%" y="-18%" width="136%" height="136%"/.test(html)
    && /<feTurbulence type="turbulence" baseFrequency="0\.022 0\.028" numOctaves="4"/.test(html)
    && /<feDisplacementMap in="SourceGraphic" in2="wobble" scale="2\.4"/.test(html),
    '11a.10  the ink bleed is one SVG filter — a low-frequency wobble field displacing the plate edge — with a region WIDER than the plate so the displacement is never clipped at its own box',
    'x −18% / width 136%: the default −10%/120% cuts the sample into a hard band exactly where the bleed must be');

  ok((html.match(/<button type="button" class="sticker/g) || []).length === 2
    && (html.match(/class="sticker__plate"/g) || []).length === 2
    && (html.match(/class="sticker__shadow"/g) || []).length === 2
    && (html.match(/class="sticker__gloss"/g) || []).length === 2
    && /images\/sticker-aliasgar\.png/.test(html) && /images\/sticker-dalal\.png/.test(html),
    '11a.11  two vinyl plates, FOUR layers each — pose, shadow, body, gloss — one per word',
    'a <button> with tabindex=-1 and aria-hidden: a drag toy with no keyboard equivalent is decoration, not a control');

  ok(/\.sticker-group\{[^}]*display:inline-block/.test(cssText)
    && /\.sticker-slot\{[^}]*position:absolute/.test(cssText)
    && /\.sticker-home\{[^}]*left:50%;top:50%;translate:-50% -50%/.test(cssText)
    && /\.sticker--aliasgar\{width:86%;aspect-ratio:1905\/461/.test(cssText)
    && /\.sticker--dalal\{width:84%;aspect-ratio:1918\/657/.test(cssText)
    && /\.sticker__plate\{[^}]*rotate:-2\.4deg/.test(cssText)
    && /\.sticker--dalal \.sticker__plate\{[^}]*rotate:1\.8deg/.test(cssText)
    && /\.sticker__gloss\{[^}]*mix-blend-mode:screen/.test(cssText)
    && /#hero\{[^}]*touch-action:pan-y/.test(cssText)
    && /\.sticker\{[^}]*touch-action:none/.test(cssText),
    '11a.12  each plate is a percentage OF ITS WORD at the word\'s OWN RATIO — 86% of ALIASGAR at 1905:461, 84% of DALAL at 1918:657 — centred by a translate on a layout node, posed on a plate node, and dragged on a third',
    'three writers, three nodes: .sticker-home owns left/top/translate, .sticker owns what Draggable tweens, .sticker__plate owns rotate/translate — no matrix is ever written by two of them; gloss is a screen-blended bubble, not a photograph of a highlight');

  ok(/<script src="js\/Draggable\.min\.js"><\/script>/.test(html)
    && html.indexOf('<script src="js/Draggable.min.js">') < html.indexOf('<script src="js/main.js">'),
    '11a.13  Draggable is vendored and loaded BEFORE main.js — a plugin that is not on window at parse time is a plugin the hero never sees',
    '35,762 B in the repo, so the drag works offline and inside the harness');

  ok(/\.metroboard\{[^}]*grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/.test(cssText)
    && /\.metroboard\{[^}]*height:var\(--board-h\)/.test(cssText)
    && /--board-h:72px/.test(cssText)
    && /:root\{--board-h:130px;\}/.test(cssText)
    && /\.metro-block\{[^}]*background:var\(--pop\)/.test(cssText)
    && /\.site-head\{position:fixed;top:0;left:0;right:0;z-index:510/.test(cssText)
    && !/marquee-toc|marquee-track|@keyframes marquee/.test(cssText + html),
    '11a.14  the board is four full-block links in flow, its height is the SAME TOKEN the sheet subtracts, and the head sits exactly one layer above it',
    '72px of four 44px targets on the desk, restated to 130px where the board becomes 2×2 — no strip, no loop, no second list');

  ok((html.match(/class="metro-block" href="#(?:who|work|magazine|reach)"/g) || []).length === 4
    && (html.match(/class="metro-n">(?:01|02|03|&#42;)</g) || []).length === 4
    && (html.match(/class="metro-t">(?:Who|Work|Akcidental Vision|Get in touch)</g) || []).length === 4
    && (html.match(/class="marquee-link"/g) || []).length === 0
    && !/marqueeToc|marqueeTrack/.test(html),
    '11a.15  ...and the contents is FOUR names, printed as a board: 01 WHO / 02 WORK / * AKCIDENTAL VISION / 03 GET IN TOUCH',
    `${(html.match(/class="metro-block"/g) || []).length} blocks, ${(html.match(/class="marquee-link"/g) || []).length} marquee rows — the strip and its track are gone from both files`);

  ok(/html\[data-motion="off"\] #hero,\s*html\[data-motion="off"\] #hero \[data-parallax-speed\],\s*html\[data-motion="off"\] \.hero-gear-asterisk,\s*html\[data-motion="off"\] \.rp-layer\{transform:none !important;\}/.test(cssText)
    && /html\[data-motion="off"\] \.hero-line > \.name-line\{transform:none !important;\}/.test(cssText)
    && /html\[data-motion="off"\] \.sound-wave \.wv\{transform:scaleY\(0\.5\) !important;\}/.test(cssText)
    && /@media \(prefers-reduced-motion: reduce\)\{[\s\S]*?#hero \[data-parallax-speed\],\s*#hero,\s*\.hero-gear-asterisk,\s*\.rp-layer\{transform:none!important\}/.test(cssText),
    '11a.16  both off-switches the motion owes — and every inline-transform writer names ITSELF, because a stylesheet `!important` is the only thing that can take back a GSAP write',
    'the sheet, its four parallax nodes, the ratchet and the three drums go to none, and the wave is HELD at mid-height rather than killed');

  group('STEP 11b — THE SHEET MEASURES THE FRAME MINUS THE STRIP, AT THREE WIDTHS');
  const HERO_AT = `(() => {
    const px = v => Math.round(v * 100) / 100;
    const R = el => { const r = el.getBoundingClientRect();
      return { l: px(r.left), r: px(r.right), t: px(r.top), b: px(r.bottom), w: px(r.width), h: px(r.height) }; };
    const q = s => document.querySelector(s), cs = el => getComputedStyle(el);
    const hero = q('#hero'), st = q('.riso-portrait'), board = q('.metroboard');
    const W = document.documentElement.clientWidth, VW = window.innerWidth;
    const g = px(Math.max(VW * 0.05, (W - 1280) / 2));
    return {
      W, VW, g,
      hero: R(hero), heroH: cs(hero).height, cols: cs(hero).gridTemplateColumns,
      padL: px(parseFloat(cs(hero).paddingLeft)),
      stack: R(st), gear: R(q('.hero-gear-asterisk')), board: R(board), boardH: cs(board).height,
      folio: R(q('.hero__folio')), head: R(q('.head-bar')),
      overflow: document.documentElement.scrollWidth - W,
    };
  })()`;
  const SHEETS = [[1200, 900], [1440, 900], [2560, 900]];
  const sheetNote = [];
  for (let i = 0; i < SHEETS.length; i++){
    const [w, h] = SHEETS[i];
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
    await cdp.eval('window.scrollTo({top:0,behavior:"instant"})');
    await sleep(420);
    const s = await cdp.eval(HERO_AT);
    const inner = s.W - 2 * s.g;
    const tracks = (s.cols.match(/-?[\d.]+px/g) || []).map(parseFloat);
    ok(near(s.hero.h, h - s.board.h, 1.5) && tracks.length === 3
      && near(tracks[0], s.g, 0.6) && near(tracks[2], s.g, 0.6) && near(tracks[1], inner, 0.6)
      && s.padL === 0,
      `11b.${i + 1}  at ${w}px the sheet IS the viewport minus the BOARD, and its three tracks are gutter | frame | gutter`,
      `${s.heroH} tall (viewport ${h} − board ${n2(s.board.h)}), tracks ${s.cols} (gutter ${s.g}, inner ${n2(inner)}), padding-left ${s.padL}`);
    ok(near(s.board.t, s.hero.b, 1.5) && near(s.stack.r, s.W, 0.6)
      && s.stack.t > 0 && s.folio.t >= 0.5 && s.folio.b <= s.stack.t && s.folio.r <= s.W - s.g + 1
      && s.gear.r <= s.W - s.g + 0.6 && s.gear.b <= s.hero.b - 4 && s.overflow === 0,
      `11b.${i + 1}b ...and the furniture follows it: the board starts exactly where the sheet ends, the plate is anchored high and runs off the right edge, and the folio line is pinned to the sheet's own top edge above it`,
      `board at y ${n2(s.board.t)} (sheet ends ${n2(s.hero.b)}), plate ${n2(s.stack.w)}×${n2(s.stack.h)} x ${n2(s.stack.l)}→${n2(s.stack.r)} from y ${n2(s.stack.t)}, folio ${n2(s.folio.l)}→${n2(s.folio.r)} from y ${n2(s.folio.t)}, gear to ${n2(s.gear.r)}, overflow ${s.overflow}`);
    sheetNote.push(`${w}: ${tracks.map(n2).join('/')} tracks, hero ${n2(s.hero.h)} + board ${n2(s.board.h)}, plate ${n2(s.stack.w)}×${n2(s.stack.h)} at x ${n2(s.stack.l)}→${n2(s.stack.r)}`);
  }
  note(`D  sheet: ${sheetNote.join(' | ')}`);

  group('STEP 11c — THE SAME SHEET ON A NARROW PHONE FITS ITS OWN MARKUP');
  const NARROW = [[768, 900], [390, 844]];
  const narrowNote = [];
  for (let i = 0; i < NARROW.length; i++){
    const [w, h] = NARROW[i];
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
    await cdp.eval('window.scrollTo({top:0,behavior:"instant"})');
    await sleep(420);
    const s = await cdp.eval(HERO_AT);
    ok(s.hero.h >= h - s.board.h - 1.5 && near(s.board.t, s.hero.b, 1.5)
      && s.stack.r <= s.W + 0.6 && s.gear.r <= s.W - 0.5 && s.overflow === 0,
      `11c.${i + 1}  at ${w}px the sheet is at least a screen minus the board, the board starts exactly under it, and the plate still fits the width`,
      `hero ${n2(s.hero.h)} of ${h} (board ${n2(s.board.h)} at y ${n2(s.board.t)}), plate ${n2(s.stack.w)}×${n2(s.stack.h)} at x ${n2(s.stack.l)}, gear to ${n2(s.gear.r)} of ${s.W}, overflow ${s.overflow}`);
    narrowNote.push(`${w}: hero ${n2(s.hero.h)} of ${h}, board ${n2(s.board.h)} at ${n2(s.board.t)}, plate ${n2(s.stack.w)}×${n2(s.stack.h)} at x ${n2(s.stack.l)}`);
  }
  note(`D  narrow: ${narrowNote.join(' | ')}`);

  group('STEP 11d — THE NAME LANDS, AND IT LANDS INSIDE ITS OWN MASK');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await cdp.eval('window.scrollTo({top:0,behavior:"instant"})');
  await sleep(420);
  const REV = await cdp.eval(`(() => {
    const ls = [...document.querySelectorAll('.hero-line > .name-line')];
    const ms = [...document.querySelectorAll('.hero-line')];
    const at0 = t => { if (!t || t === 'none') return true; const m = t.match(/matrix\\(([^)]+)\\)/);
      if (!m) return false; const v = m[1].split(',').map(Number);
      return Math.abs(v[4]) < 0.5 && Math.abs(v[5]) < 0.5; };
    return {
      n: ls.length,
      tfs: ls.map(l => getComputedStyle(l).transform),
      landed: ls.every(l => at0(getComputedStyle(l).transform)),
      live: window.gsap ? ls.reduce((a, l) => a + gsap.getTweensOf(l).filter(t => t.progress() < 1).length, 0) : 0,
      op: getComputedStyle(document.getElementById('nameBlock')).opacity,
      clips: ms.map(m => getComputedStyle(m).clipPath),
      boxes: ls.map((l, i) => { const a = l.getBoundingClientRect(), b = ms[i].getBoundingClientRect();
        return { over: Math.round(a.bottom - b.bottom), h: Math.round(b.height), top: Math.round(a.top - b.top) }; }),
    };
  })()`);
  ok(REV.n === 2 && REV.landed,
    '11d.1  both lines finish at translate(0,0) — the cached y is zeroed in BOTH vars, so the percentage is the only thing that moves',
    REV.tfs.join('  '));
  ok(REV.live === 0 && REV.op === '1',
    '11d.2 ...and then the sheet is still: no tween is open and the name block is fully inked',
    `${REV.live} live tween(s), name opacity ${REV.op}`);
  ok(REV.clips.every(c => /inset/.test(c)) && REV.boxes.every(b => b.over <= 1 && b.top >= -1 && b.h > 40),
    '11d.3 ...inside its own clip: each line sits in the mask with nothing shaved off the top and nothing left below the baseline',
    REV.boxes.map(b => `${b.h}px mask, line ${b.top}→${b.over}`).join('; '));

  group('STEP 11e — THE PLATE IS THREE SPOT INKS ON ONE PHOTOGRAPH');
  const PLATE = await cdp.eval(`(() => {
    const ls = [...document.querySelectorAll('.rp-layer')], cs = el => getComputedStyle(el);
    const par = ls[0] && ls[0].parentElement;
    return {
      n: ls.length, srcs: [...new Set(ls.map(l => l.getAttribute('src')))],
      wh: [...new Set(ls.map(l => l.getAttribute('width') + 'x' + l.getAttribute('height')))],
      alt: ls.map(l => l.getAttribute('alt')), hid: ls.map(l => l.getAttribute('aria-hidden')),
      pe: [...new Set(ls.map(l => cs(l).pointerEvents))], fit: [...new Set(ls.map(l => cs(l).objectFit))],
      blend: [...new Set(ls.map(l => cs(l).mixBlendMode))],
      bleed: ls.map(l => /riso-ink-bleed/.test(cs(l).filter)),
      parFilter: cs(par).filter, parTag: par.tagName, role: par.getAttribute('role'),
      tab: par.getAttribute('tabindex'), label: par.getAttribute('aria-label'),
      order: ls.map(l => l.className.replace('rp-layer ', '')),
    };
  })()`);
  ok(PLATE.n === 4 && PLATE.srcs.length === 1 && PLATE.wh.length === 1 && PLATE.wh[0] === '699x532'
    && PLATE.alt.slice(0, 3).every(t => t === '') && PLATE.alt[3] === 'Aliasgar Dalal'
    && PLATE.hid.slice(0, 3).every(h => h === 'true') && PLATE.hid[3] === null
    && PLATE.pe.length === 1 && PLATE.pe[0] === 'none' && PLATE.fit[0] === 'contain',
    '11e.1  one file, FOUR passes: the silhouette and the two colour drums are silent and none of them takes a pointer; the key names the man',
    `${PLATE.n} layers of ${PLATE.srcs[0]} at ${PLATE.wh[0]}, pointer-events ${PLATE.pe[0]}, object-fit ${PLATE.fit[0]}`);

  ok(PLATE.blend.length === 1 && PLATE.blend[0] === 'multiply'
    && PLATE.bleed.slice(1).every(Boolean) && PLATE.bleed[0] === false
    && PLATE.parFilter === 'none'
    && PLATE.order.join(',') === 'rp-shadow,rp-red,rp-blue,rp-key'
    && PLATE.parTag === 'DIV' && PLATE.role === 'button' && PLATE.tab === '0' && !!PLATE.label,
    '11e.2  every ink multiplies with the stock and carries the ink bleed ITSELF — the filter is on the layers, never on the stack: a filter on the parent isolates the group, and each child would then multiply against transparency instead of paper',
    `blend ${PLATE.blend[0]}, bleed ${PLATE.bleed.join('/')}, parent filter ${PLATE.parFilter}, order ${PLATE.order.join('→')}, ${PLATE.role}/${PLATE.tab}`);

  const plateBox = await cdp.eval(`(() => { const r = document.getElementById('risoPortrait').getBoundingClientRect();
    return { l: Math.round(r.left), r: Math.round(r.right), c: Math.round(r.left + r.width / 2),
      y: Math.round(r.top + r.height / 2) }; })()`);
  // THE RIGHT EDGE, NOT THE LEFT: the "Aliasgar" sticker hangs off the word and reaches into the
  // plate's left half at 1440 (z 6, and it takes the pointer), so a move there would land on vinyl.
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: plateBox.r - 30, y: plateBox.y, button: 'none' });
  await sleep(900);
  // THE FIRST LAYER IS THE SILHOUETTE and it never moves, so the two drums are 1 and 2, the key 3.
  const deep = await cdp.eval(`[...document.querySelectorAll('.rp-layer')].map(x => {
    const m = getComputedStyle(x).transform.match(/matrix\\(([^)]+)\\)/);
    const v = m ? m[1].split(',').map(Number) : [0, 0, 0, 0, 0, 0];
    return { x: +v[4].toFixed(2), y: +v[5].toFixed(2) }; })`);
  ok(Math.abs(deep[1].x) > 1.5 && deep[2].x * deep[1].x < 0
    && Math.abs(deep[3].x) < 0.6 && Math.abs(deep[0].x) < 0.6,
    '11e.3  a pointer on the plate\'s outer edge pulls the two colour drums APART — vermilion one way, cobalt the other — and neither the key nor the silhouette moves, because they are what the drums register against',
    deep.map(o => `${o.x},${o.y}`).join('  '));


  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: plateBox.c, y: plateBox.y, button: 'none' });
  let rest = null;
  for (let i = 0; i < 10; i++){
    await sleep(400);
    rest = await cdp.eval(`[...document.querySelectorAll('.rp-layer')].map(x => {
      const m = getComputedStyle(x).transform.match(/matrix\\(([^)]+)\\)/);
      return m ? Math.abs(parseFloat(m[1].split(',')[4])) : 0; })`);
    if (rest.every(v => v < 0.6)) break;
  }
  ok(rest.every(v => v < 1.5),
    '11e.4 ...and at the plate\'s centre all four come back to register, because the loop stops once it has caught up',
    rest.map(v => n2(v)).join(' / '));

  const inkBefore = await cdp.eval(`document.getElementById('risoPortrait').querySelector('.rp-layer:not(.rp-shadow)').className`);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: plateBox.c, y: plateBox.y, button: 'left', clickCount: 1 });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: plateBox.c, y: plateBox.y, button: 'left', clickCount: 1 });
  await sleep(1300);
  const inkAfter = await cdp.eval(`(() => { const p = document.getElementById('risoPortrait');
    const drums = [...p.querySelectorAll('.rp-layer:not(.rp-shadow)')];
    return { first: drums[0].className, n: p.querySelectorAll('.rp-layer').length,
      shadowFirst: p.firstElementChild.classList.contains('rp-shadow'),
      op: drums.map(l => +getComputedStyle(l).opacity) }; })()`);
  ok(inkAfter.first !== inkBefore && inkAfter.n === 4 && inkAfter.shadowFirst && inkAfter.op.every(o => o > 0.5),
    '11e.5 ...and a click re-runs the colour: the drum that was on top is pushed to the FRONT of the inked stack, because paint order IS DOM order — and the silhouette stays underneath, where it is not a drum',
    `${inkBefore} → ${inkAfter.first}, opacities ${inkAfter.op.join('/')}, silhouette first ${inkAfter.shadowFirst}`);
  note(`D  plate: ${PLATE.n} passes of ${PLATE.srcs[0]} at ${PLATE.wh[0]}; pointer at the edge ${deep.map(o => o.x).join('/')} px, at centre ${rest.map(n2).join('/')}, stack ${inkBefore} → ${inkAfter.first}`);

  group('STEP 11f — THE MASTHEAD AND ITS TWO STICKERS');
  const MAST = await cdp.eval(`(() => {
    const cs = el => getComputedStyle(el);
    const t = document.getElementById('nameBlock');
    const l1 = document.getElementById('line1'), l2 = document.getElementById('line2');
    const words = [...document.querySelectorAll('.sticker-group')].map(g => g.getBoundingClientRect().width);
    const st = [...document.querySelectorAll('.sticker')].map(b => {
      const r = b.getBoundingClientRect();
      const m = cs(b).transform.match(/matrix\\(([^)]+)\\)/);
      const v = m ? m[1].split(',').map(Number) : [0, 0, 1, 0, 0, 0];
      return { w: +r.width.toFixed(1), x: +v[4].toFixed(2), y: +v[5].toFixed(2),
        rot: +(Math.atan2(v[1], v[0]) * 180 / Math.PI).toFixed(2),
        l: +r.left.toFixed(1), r: +r.right.toFixed(1), t: +r.top.toFixed(1), b: +r.bottom.toFixed(1) };
    });
    const hr = document.getElementById('hero').getBoundingClientRect();
    return { font: cs(l1).fontFamily, f1: parseFloat(cs(l1).fontSize), f2: parseFloat(cs(l2).fontSize),
      w1: +l1.getBoundingClientRect().width.toFixed(1), blockW: t.clientWidth,
      words, st, hero: { l: hr.left, r: hr.right, t: hr.top, b: hr.bottom },
      caps: cs(document.querySelector('.small-caps')).fontVariantCaps };
  })()`);
  ok(/JSL Blackletter/.test(MAST.font) && MAST.caps === 'small-caps',
    '11f.1  the masthead is the blackletter and the second word is set in small caps — not uppercased, not faux-sized by a transform',
    `${MAST.font.split(',')[0]}, font-variant-caps ${MAST.caps}`);
  ok(Math.abs(MAST.f1 - MAST.f2) < 0.5 && MAST.w1 <= MAST.blockW + 1,
    '11f.2  both words are the same size, and the wider one still fits its own block — the 0.62 second-line factor went with the italic that needed it',
    `${n2(MAST.f1)}px / ${n2(MAST.f2)}px, widest word ${n2(MAST.w1)} inside ${n2(MAST.blockW)}`);
  ok(MAST.st.length === 2 && MAST.st.every((s, i) => s.w > MAST.words[i] * 0.45 && s.w < MAST.words[i] * 0.95),
    '11f.3  each sticker is sized off ITS word (45–95% of it), not off the hero: a percentage of an inline-block is a percentage of the letters',
    MAST.st.map((s, i) => `${n2(s.w)} of ${n2(MAST.words[i])}`).join(' / '));
  // NO JITTER, AND THAT IS THE FIX. The re-roll that used to live here wrote a random x/y/rotation
  // onto the SAME node that carries the CSS centring, so every re-fit (fonts, resize, the name
  // re-measuring itself) baked the last roll into a fresh offset and the plate crept. The hand is
  // now already in the print: `.sticker__plate` holds -2.4° / +1.8° in CSS, which 9i.13 and 11a.12
  // assert, and this node spawns square at exactly zero. What still must hold is the containment:
  // a plate can never be thrown off the sheet, however wide its word is.
  ok(MAST.st.every(s => Math.abs(s.rot) < 0.01 && Math.abs(s.x) < 0.01 && Math.abs(s.y) < 0.01),
    '11f.4 ...and every plate spawns SQUARE — zero, zero, zero on the dragged node — because the hand is already in the print on .sticker__plate; the re-rolled jitter is gone with the node conflict that made it drift',
    MAST.st.map(s => `${n2(s.x)},${n2(s.y)} ${n2(s.rot)}°`).join('  '));
  ok(MAST.st.every(s => s.l >= MAST.hero.l - 0.5 && s.r <= MAST.hero.r + 0.5
      && s.t >= MAST.hero.t - 0.5 && s.b <= MAST.hero.b + 0.5),
    '11f.5 ...and the clamp holds: no plate is allowed off the sheet, however wide its word is',
    MAST.st.map(s => `x ${n2(s.l)}→${n2(s.r)} of ${n2(MAST.hero.l)}→${n2(MAST.hero.r)}, y ${n2(s.t)}→${n2(s.b)} of ${n2(MAST.hero.t)}→${n2(MAST.hero.b)}`).join(' | '));
  note(`D  masthead: ${n2(MAST.f1)}px blackletter, words ${MAST.words.map(n2).join('/')}, stickers ${MAST.st.map(s => n2(s.w)).join('/')} at ${MAST.st.map(s => n2(s.rot) + '°').join('/')}`);

  // ── STEP 11g — THE HEAD IS THE ONE SURFACE ────────────────────────────────
  // §05 unfixed the bar, so there is no handoff left to measure. What used to be "which surface is
  // at the top, at this scroll position" is now the opposite claim: the head is at the top at EVERY
  // position, and the board is the thing that comes and goes beneath it.
  group('STEP 11g — THE HEAD IS THE ONE SURFACE, AT EVERY SCROLL POSITION');
  const HAND = `(() => {
    const cs = el => getComputedStyle(el);
    const n = document.getElementById('siteNav'), nr = n.getBoundingClientRect();
    const links = [...document.querySelectorAll('.head-nav-link, .metro-block')];
    return { nav: +cs(n).opacity, y: Math.round(window.scrollY), top: Math.round(nr.top),
      phase: document.documentElement.getAttribute('data-phase'),
      drawer: document.getElementById('setPanel').open,
      inBar: n.contains(document.activeElement),
      active: document.activeElement.id || document.activeElement.tagName,
      tabs: links.filter(a => a.tabIndex >= 0).length,
      dead: links.map(a => a.getAttribute('href')).filter(h => !document.querySelector(h)).length,
      links: links.length };
  })()`;
  // A CLEAN ROOM FIRST. A modal drawer (or a keyboard's focus inside the bar) is the one state that
  // is allowed to change how the bar looks, and it is asserted where it belongs (11i.2); here it
  // would only mask the reading.
  await cdp.eval(`(() => {
    if (document.getElementById('setPanel').open) document.getElementById('setClose').click();
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  })()`);
  await sleep(700);
  // §16 — THE BAR IS A VIEW'S CHROME, NOT THE PAGE'S. In the cover and the index there is no page
  // under it (a poster and its contents, and the stylesheet says so), so the head is invisible; the
  // moment a place is chosen it is there at y 0 — and it stays there for every scroll position of
  // that place.
  await enterView('who');
  await sleep(400);
  const h0 = await cdp.eval(HAND);
  ok(h0.nav === 1 && h0.top === 0 && h0.phase === 'sheet' && !h0.drawer && !h0.inBar,
    '11g.1  a view opens with the bar at y 0 ON PAPER — the sheet is not behind it, so the phase is `sheet`',
    `bar ${h0.nav} at y ${h0.top}, phase ${h0.phase}, drawer ${h0.drawer}, focus ${h0.active}`);

  await cdp.eval('window.scrollTo({top:1400,behavior:"instant"})');
  await sleep(400);
  const hd = await cdp.eval(HAND);
  ok(hd.nav === 1 && hd.top === 0 && hd.phase === 'sheet',
    '11g.2  and 1400px down the view it is in exactly the same place — a bar that never leaves has nothing to hand over to',
    `bar ${hd.nav} at y ${hd.top}, phase ${hd.phase}, y ${hd.y}`);

  await cdp.eval(`window.scrollTo({top: document.documentElement.scrollHeight, behavior:'instant'})`);
  await sleep(500);
  const hb = await cdp.eval(HAND);
  ok(hb.nav === 1 && hb.top === 0,
    '11g.3  ...and at the foot of it too: there is no scroll position in a view at which the bar is absent',
    `bar ${hb.nav} at y ${hb.top}, y ${hb.y}`);

  ok(hd.links === 8 && hd.tabs === 8 && hd.dead === 0,
    '11g.4  ...and the four places are printed TWICE — the head row and the board: eight links, all in the tab ring, every one a real destination',
    `${hd.links} links, ${hd.tabs} focusable, ${hd.dead} dead hrefs`);
  note(`D  head: y ${h0.top} → ${h0.nav}/${h0.phase}, y ${hd.y} → ${hd.nav}/${hd.phase}, y ${hb.y} → ${hb.nav}; ${hd.links} links`);

  group('STEP 11h — MOTION OFF TURNS THE SHEET INTO A STILL');
  // §16 — the sheet only exists in cover and index, so the still-reading is taken there.
  await enterCover();
  await sleep(340);
  // Move the sheet FIRST, so "off" is measured against a baseline that really was moving: the
  // parallax, the skew, the ratchet and the ink drift are all inline GSAP writes, and only a
  // stylesheet `!important` can take them back.
  await cdp.eval('window.scrollTo({top:240,behavior:"instant"})');
  await sleep(280);
  await cdp.eval('window.scrollTo({top:0,behavior:"instant"})');
  await sleep(280);
  await cdp.eval(`document.getElementById('setOpen').click()`);
  await sleep(240);
  await cdp.eval(`document.getElementById('prefMotion').click()`);
  await sleep(280);
  await cdp.eval(`document.getElementById('setClose').click()`);
  await sleep(760);
  const OFF1 = await cdp.eval(`(() => {
    const tf = el => getComputedStyle(el).transform;
    const ls = [...document.querySelectorAll('.hero-line > .name-line')];
    return { motion: document.documentElement.getAttribute('data-motion'),
      tf: ls.map(tf),
      hero: tf(document.getElementById('hero')),
      pars: [...document.querySelectorAll('#hero [data-parallax-speed]')].map(tf),
      layers: [...document.querySelectorAll('.rp-layer')].map(tf),
      gear: tf(document.querySelector('.hero-gear-asterisk')),
      wave: [...document.querySelectorAll('.sound-wave .wv')].map(tf) }; })()`);
  await sleep(1300);
  const OFF2 = await cdp.eval(`(() => { const tf = el => getComputedStyle(el).transform;
    return { hero: tf(document.getElementById('hero')),
      pars: [...document.querySelectorAll('#hero [data-parallax-speed]')].map(tf),
      layers: [...document.querySelectorAll('.rp-layer')].map(tf),
      gear: tf(document.querySelector('.hero-gear-asterisk')) }; })()`);
  ok(OFF1.motion === 'off' && OFF1.tf.every(t => t === 'none'),
    '11h.1 with Motion off both lines compute to none — the stylesheet\'s own promise, not a script undoing a tween',
    `data-motion ${OFF1.motion}, ${OFF1.tf.join(' / ')}`);
  ok(OFF1.hero === 'none' && OFF2.hero === 'none' && OFF1.pars.every(t => t === 'none'),
    '11h.2 ...the whole sheet and every node it parallaxes are straight — and still straight 1.3s later, because there is no lean left to relax out',
    `hero ${OFF1.hero} → ${OFF2.hero}, ${OFF1.pars.length} parallax nodes`);
  ok(OFF1.gear === 'none' && OFF1.gear === OFF2.gear && OFF1.layers.every(t => t === 'none'),
    '11h.3 ...the ratchet stops between detents and the four passes hold their marks, so the plate is a print again and not a press',
    `ratchet ${OFF1.gear} → ${OFF2.gear}, passes ${OFF1.layers.join(' / ')}`);
  ok(OFF1.wave.length === 5 && OFF1.wave.every(t => /matrix\(1, 0, 0, 0\.5/.test(t)),
    '11h.4 ...and the wave is HELD at mid-height — the instrument with the motion taken out, which is also the shape a JS-off visitor gets',
    OFF1.wave.join(' / '));

  await cdp.eval(`document.getElementById('setOpen').click()`);
  await sleep(240);
  await cdp.eval(`document.getElementById('prefMotion').click()`);
  await sleep(280);
  await cdp.eval(`document.getElementById('setClose').click()`);
  await sleep(700);
  await cdp.eval(`window.__ad.gate.setProgress(Math.min(1, 300 / (document.getElementById('hero').offsetHeight || 900)))`);
  await sleep(700);
  const ON = await cdp.eval(`(() => { const t = getComputedStyle(document.querySelector('.hero-gear-asterisk')).transform;
    const m = t.match(/matrix\\(([^)]+)\\)/);
    const v = m ? m[1].split(',').map(Number) : [1, 0];
    const deg = Math.atan2(v[1], v[0]) * 180 / Math.PI;
    return { motion: document.documentElement.getAttribute('data-motion'),
      deg: +((((deg % 360) + 360) % 360)).toFixed(1) }; })()`);
  ok(ON.motion === 'on' && ON.deg > 10 && Math.abs(ON.deg % 15) < 6,
    '11h.5 ...and Motion back on starts the ratchet again, in whole 15° detents, off the same progress the sheet reads',
    `${ON.motion}: ratchet ${ON.deg}° at p 300/${await cdp.eval(`document.getElementById('hero').offsetHeight`)}`);
  await cdp.eval('window.__ad.cover()');
  await sleep(300);

  const MX = `(() => {
    // ASK GSAP, NOT THE MATRIX, for the skew. skewY is a SHEAR: it lands in the matrix's c and d
    // entries and leaves a and b (the rotation) untouched, so atan2(b,a) measures exactly nothing of
    // it. GSAP owns these writes, so its own cache is the honest source for skew and for translate.
    const g = window.gsap;
    const num = (el, p) => (g && el) ? (+g.getProperty(el, p) || 0) : 0;
    const ang = el => { const m = getComputedStyle(el).transform.match(/matrix\\(([^)]+)\\)/);
      if (!m) return 0; const v = m[1].split(',').map(Number);
      return Math.atan2(v[1], v[0]) * 180 / Math.PI; };
    const q = s => document.querySelector(s);
    const hero = document.getElementById('hero'), plate = q('.riso-portrait');
    return {
      hero: +num(hero, 'skewY').toFixed(3),
      plate: +num(plate, 'skewY').toFixed(3),
      sticker: +num(q('.sticker'), 'skewY').toFixed(3),
      paperY: +num(q('.hero-paper'), 'y').toFixed(2),
      titleY: +num(q('#nameBlock'), 'y').toFixed(2),
      plateY: +num(plate, 'y').toFixed(2),
      slotsY: [...document.querySelectorAll('.sticker-slot')].map(e => +num(e, 'y').toFixed(2)),
      gear: +((((ang(q('.hero-gear-asterisk')) % 360) + 360) % 360)).toFixed(2),
      y: Math.round(window.scrollY),
      gateP: window.__adGateP, mode: window.__ad.mode(),
    };
  })()`;
  group('STEP 11k — A FAST SCROLL LEANS THE SHEET, AND IT SETTLES');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await cdp.eval('window.__ad.cover()');
  // CALIBRATE ON A SHEET THAT IS ACTUALLY SQUARE. The rest reading is the SUBTRAHEND of both numbers
  // below, so it has to be a real rest and not a frame caught mid-tween: the instant jump from y 300
  // starts its own 0.5s skew decay, and a fixed 420ms sampled that decay as −0.35° — which then made
  // the "settled" diff a constant 0.35° that no amount of waiting could retire. Asked as a crossing,
  // the same probe returns 0 and both assertions become honest.
  const calmK = await settles(MX, v => v.y === 0 && Math.abs(v.hero) < 0.05);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 720, y: 450, deltaX: 0, deltaY: 900 });
  let lean = 0, leanPlate = 0, leanSticker = 0;
  for (let i = 0; i < 10; i++){
    await sleep(80);
    const s = await cdp.eval(MX);
    if (Math.abs(s.hero - calmK.hero) > Math.abs(lean)) lean = s.hero - calmK.hero;
    if (Math.abs(s.plate - calmK.plate) > Math.abs(leanPlate)) leanPlate = s.plate - calmK.plate;
    if (Math.abs(s.sticker - calmK.sticker) > Math.abs(leanSticker)) leanSticker = s.sticker - calmK.sticker;
  }
  ok(Math.abs(lean) > 0.15 && Math.abs(leanPlate) < 0.05 && Math.abs(leanSticker) < 0.05,
    '11k.1  a wheel flick leans the SHEET — one damped skewY on #hero, so the masthead, the plate and the stickers lean together and not one of them carries a skew of its own',
    `peak skew: #hero ${n2(lean)}°, plate ${n2(leanPlate)}°, sticker ${n2(leanSticker)}°`);
  // THE LEAN IS DAMPED TOWARD ZERO, SO "SETTLED" IS A CROSSING, NOT A TIMESTAMP. Probed on this page,
  // the decay reads 0.46° at 663ms, 0.055° at 992ms and 0.023° at 1101ms — so 1.5s of polling is the
  // whole crossing on a quiet box and still two frames of headroom on a loaded one. The threshold the
  // assertion uses is untouched at 0.25°; the poll just stops asking once it is comfortably inside it.
  const atRest = await settles(MX, v => Math.abs(v.hero - calmK.hero) < 0.05, 15, 100);
  ok(Math.abs(atRest.hero - calmK.hero) < 0.25,
    '11k.2 ...and it settles back to straight once the page stops, because the velocity is damped toward zero and not toward the last flick',
    `settled skew: ${n2(atRest.hero - calmK.hero)}°`);

  group('STEP 11l — FOUR DEPTHS AND A RATCHET, ALL READ OFF ONE PROGRESS');
  await cdp.eval('window.__ad.cover()');
  await sleep(700);
  const p0 = await cdp.eval(MX);
  // 300px OF SHEET IS ONE THIRD OF THE PROGRESS — the same distance the old scroll used to give it
  await cdp.eval(`window.__ad.gate.setProgress(300 / (document.getElementById('hero').offsetHeight || 900))`);
  await sleep(700);
  const p3 = await cdp.eval(MX);
  const dy = (a, b) => +(b - a).toFixed(2);
  const dAng = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };
  ok(near(dy(p0.paperY, p3.paperY), 60, 8) && Math.abs(dy(p0.titleY, p3.titleY)) < 6,
    '11l.1  at 300px the stock has lagged 60px behind the page (speed 0.8) while the masthead has stayed with it (speed 1.0)',
    `stock ${dy(p0.paperY, p3.paperY)}px, masthead ${dy(p0.titleY, p3.titleY)}px at y ${p3.y}`);
  ok(near(dy(p0.plateY, p3.plateY), -60, 8)
    && p3.slotsY.every((v, i) => near(v - p0.slotsY[i], -150, 16)),
    '11l.2 ...the plate has run 60px AHEAD of it (1.2) and both stickers 150px ahead (1.5), so the sheet has four readable depths and none of them is a filter',
    `plate ${dy(p0.plateY, p3.plateY)}px, stickers ${p3.slotsY.map((v, i) => dy(p0.slotsY[i], v)).join('/')}px`);
  ok(dAng(p0.gear, 0) < 2 && dAng(p3.gear, 30) < 14 && Math.abs(p3.gear % 15) < 2,
    '11l.3 ...and the ratchet has CLICKED twice: 30° through a third of the sheet, in whole 15° steps, because the mark is bolted to the page\'s progress and not to a clock',
    `${n2(p0.gear)}° at p ${p0.gateP}/${p0.mode} → ${n2(p3.gear)}° at p ${p3.gateP}/${p3.mode}`);

  group('STEP 11m — THE HAND: DRAG, RELEASE, AND THE GLOSS THAT FOLLOWS IT');
  await cdp.eval('window.__ad.cover()');
  await sleep(700);
  // THE FOLEY IS LISTENED FOR, NOT HEARD. The harness cannot put its ear to a speaker, but the
  // interaction side of it is a bus of its own: every module that wants a voice fires `ad:voice` on
  // the document and the audio module decides. So the probe records what the page ASKED for, which
  // is exactly the part a regression breaks — a press that stops asking is a press that stopped
  // sounding, whatever the graph downstream does.
  await cdp.eval(`(() => { window.__voiceLog = [];
    document.addEventListener('ad:voice', e => window.__voiceLog.push(
      typeof e.detail === 'string' ? e.detail : (e.detail && e.detail.voice)));
    return true; })()`);
  const box = await cdp.eval(`(() => { const b = document.querySelector('.sticker');
    const r = b.getBoundingClientRect();
    const m = getComputedStyle(b).transform.match(/matrix\\(([^)]+)\\)/);
    const v = m ? m[1].split(',').map(Number) : [0, 0, 1, 0, 0, 0];
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2),
      tx: +v[4].toFixed(2), ty: +v[5].toFixed(2) }; })()`);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: box.x, y: box.y, button: 'none' });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', buttons: 1, clickCount: 1 });
  for (let i = 1; i <= 5; i++){
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: box.x - i * 12, y: box.y + i * 6, button: 'left', buttons: 1 });
    await sleep(40);
  }
  const held = await cdp.eval(`(() => { const b = document.querySelector('.sticker');
    const v = (getComputedStyle(b).transform.match(/matrix\\(([^)]+)\\)/) || [, '1,0'])[1].split(',').map(Number);
    return { drag: b.classList.contains('dragging'), scale: +Math.hypot(v[0], v[1]).toFixed(3) }; })()`);
  ok(held.drag && held.scale > 1.06,
    '11m.1  pressing the sticker lifts it — the class the shadow reads and a 10% scale, which is the whole difference between a printed plate and a vinyl one',
    `dragging ${held.drag}, scale ${held.scale}`);
  // THE PLATE DOES NOT STAY WHERE IT IS DROPPED. It hangs there for two beats (STICKER_BEAT × 2) so
  // the hand can let go and read the result, and then it slaps back to zero with `back.in(1.7)`. So
  // this samples twice: once inside the hold, where the offset must still be real, and once past the
  // return, where the node must be exactly where it started.
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x - 60, y: box.y + 30, button: 'left', buttons: 0, clickCount: 1 });
  await sleep(500);
  const dropped = await cdp.eval(`(() => { const b = document.querySelector('.sticker');
    const m = getComputedStyle(b).transform.match(/matrix\\(([^)]+)\\)/);
    const v = m ? m[1].split(',').map(Number) : [0, 0, 1, 0, 0, 0];
    const hr = document.getElementById('hero').getBoundingClientRect(), r = b.getBoundingClientRect();
    return { tx: +v[4].toFixed(2), ty: +v[5].toFixed(2), drag: b.classList.contains('dragging'),
      scale: +Math.hypot(v[0], v[1]).toFixed(3),
      inside: r.left >= hr.left - 0.5 && r.right <= hr.right + 0.5 && r.top >= hr.top - 0.5 && r.bottom <= hr.bottom + 0.5 }; })()`);
  ok(!dropped.drag && Math.abs(dropped.tx - box.tx) > 20 && Math.abs(dropped.ty - box.ty) > 5
    && dropped.inside && Math.abs(dropped.scale - 1) < 0.02,
    '11m.2 ...and a 60px drag takes it with the hand and LEAVES IT THERE — for two beats the plate is still where it was dropped, the scale has sprung back to 1, and nothing has left the sheet',
    `${box.tx},${box.ty} → ${dropped.tx},${dropped.ty}, scale ${dropped.scale}, inside ${dropped.inside}`);
  await sleep(1600);
  const back = await cdp.eval(`(() => { const b = document.querySelector('.sticker');
    const m = getComputedStyle(b).transform.match(/matrix\\(([^)]+)\\)/);
    const v = m ? m[1].split(',').map(Number) : [0, 0, 1, 0, 0, 0];
    return { tx: +v[4].toFixed(2), ty: +v[5].toFixed(2),
      scale: +Math.hypot(v[0], v[1]).toFixed(3) }; })()`);
  ok(Math.abs(back.tx) < 0.5 && Math.abs(back.ty) < 0.5 && Math.abs(back.scale - 1) < 0.02,
    '11m.3 ...and then it slaps back: two beats after the release the node returns to exactly zero on its own, with a back-in ease — the plate is not left lying on the word for the next reader to find',
    `back to ${back.tx},${back.ty}, scale ${back.scale}`);

  const gAt = await cdp.eval(`(() => {
    const b = document.querySelector('.sticker');
    const r = b.getBoundingClientRect(), hr = document.getElementById('hero').getBoundingClientRect();
    const l = Math.max(r.left, hr.left), rr = Math.min(r.right, hr.right);
    const tp = Math.max(r.top, hr.top), bt = Math.min(r.bottom, hr.bottom);
    // SAMPLE THE VISIBLE BOX, don't trust its centre: the plate is rotated, #hero clips it, and the
    // first point that really hit-tests to this button is the only point worth moving to.
    for (let iy = 1; iy <= 5; iy++) for (let ix = 1; ix <= 5; ix++){
      const x = l + (rr - l) * ix / 6, y = tp + (bt - tp) * iy / 6;
      const el = document.elementFromPoint(x, y);
      if (el && (el === b || b.contains(el))) return { x: Math.round(x), y: Math.round(y), hit: true };
    }
    const el = document.elementFromPoint((l + rr) / 2, (tp + bt) / 2);
    return { x: Math.round((l + rr) / 2), y: Math.round((tp + bt) / 2), hit: false,
      at: el ? (el.className || el.tagName) : 'null',
      box: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)] };
  })()`);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: gAt.x, y: gAt.y, button: 'none' });
  await sleep(120);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: gAt.x + 1, y: gAt.y, button: 'none' });
  await sleep(220);
  const bubble = await cdp.eval(`(() => { const g = document.querySelector('.sticker__gloss');
    const s = getComputedStyle(g);
    return { x: s.getPropertyValue('--bubble-x').trim(), y: s.getPropertyValue('--bubble-y').trim(),
      a: s.getPropertyValue('--sheen-a').trim(), bg: s.backgroundImage, blend: s.mixBlendMode,
      filter: s.filter }; })()`);
  ok(gAt.hit && /px$/.test(bubble.x) && Math.abs(parseFloat(bubble.x)) > 3 && bubble.blend === 'screen'
    && /radial-gradient/.test(bubble.bg) && /conic-gradient/.test(bubble.bg)
    && /^[\d.-]+deg$/.test(bubble.a) && /glossWarp/.test(bubble.filter),
    '11m.4 ...and the gloss is TWO layers, not one: a radial bubble that tracks the pointer and a conic streak that turns with it — both written as CSS VARIABLES, so they never touch the transform GSAP owns, and both warped by one SVG filter',
    `point ${gAt.x},${gAt.y} (hit ${gAt.hit}${gAt.at ? ', over ' + gAt.at : ''}), --bubble-x ${bubble.x} ${bubble.y}, --sheen-a ${bubble.a}, blend ${bubble.blend}, filter ${bubble.filter}`);

  // ── THE FILTER IS REAL, NOT A NAME IN A STRING ────────────────────────────
  // A `filter:url(#glossWarp)` that points at nothing renders as `none` and the gloss goes flat, so
  // the assertion above only means something if the filter is actually in the document with the
  // displacements that make a laminate look like one.
  const WARP = await cdp.eval(`(() => {
    const f = document.getElementById('glossWarp');
    if (!f) return { missing: true };
    const turb = f.querySelector('feTurbulence'), disp = f.querySelector('feDisplacementMap');
    const g = document.querySelector('.sticker__gloss');
    return { tag: f.tagName, region: [...f.querySelectorAll('feGaussianBlur, feTurbulence, feDisplacementMap')].length,
      oct: turb && turb.getAttribute('numOctaves'), bf: turb && turb.getAttribute('baseFrequency'),
      scale: disp && disp.getAttribute('scale'),
      chIn: disp && disp.getAttribute('in'), chIn2: disp && disp.getAttribute('in2'),
      urls: [...document.querySelectorAll('svg filter')].map(x => x.id),
      live: getComputedStyle(g).filter }; })()`);
  ok(!WARP.missing && WARP.tag === 'filter' && WARP.oct === '1' && /^0\.8/.test(WARP.bf || '')
    && WARP.scale === '5' && WARP.chIn === 'SourceGraphic' && WARP.chIn2 !== WARP.chIn
    && WARP.urls.includes('glossWarp') && /glossWarp/.test(WARP.live),
    '11m.5 ...and #glossWarp is a real filter in the document — one octave of high-frequency noise displacing the SOURCE against its own noise, which is what makes a flat streak read as wrinkled film instead of a gradient',
    `filter ${WARP.missing ? 'MISSING' : WARP.tag}, octaves ${WARP.oct} at ${WARP.bf}, scale ${WARP.scale}, ${WARP.chIn}/${WARP.chIn2}, in the page: ${WARP.urls.join(',')}`);

  // ── AND IT MAKES A SOUND, WITHOUT ANYONE HAVING TO HEAR IT ────────────────────────────────
  // The press and the release above already went through the real gesture path, so the log is the
  // page's own account of what it asked for: a peel on the grab, a restick when the plate lands.
  const grabbed = await cdp.eval(`window.__voiceLog.slice()`);
  ok(grabbed.includes('peel') && grabbed.includes('restick') && !grabbed.includes('tap'),
    '11m.6 ...and the gesture SPEAKS: a press on the plate asks for peel, the slap-back home asks for restick fifty milliseconds later, and neither asks for the UI tap — a third voice would have made the sticker sound like a button',
    grabbed.join(' → ') || '(nothing)');

  // THE RATCHET BELONGS TO THE STEP, NOT TO THE SCROLL. One wheel flick crosses several 15° stops
  // and must tick once per stop; holding still between stops must tick zero times. The angle is
  // quantised in the page, so this can drive it exactly. 400px × 0.12 ÷ 15 = 3.2 → the third stop.
  await cdp.eval(`window.__ad.cover()`);
  await sleep(400);
  await cdp.eval(`window.__voiceLog.length = 0`);
  await cdp.eval(`window.__ad.gate.setProgress(400 / (document.getElementById('hero').offsetHeight || 900))`);
  await sleep(500);
  const ticks = await cdp.eval(`(() => {
    const a = document.querySelector('.hero-gear-asterisk');
    const m = getComputedStyle(a).transform.match(/matrix\\(([^)]+)\\)/);
    const v = m ? m[1].split(',').map(Number) : [1, 0];
    return { log: window.__voiceLog.slice(), rot: +(Math.atan2(v[1], v[0]) * 180 / Math.PI).toFixed(1) }; })()`);
  ok(ticks.log.includes('ratchet'),
    '11m.7 ...and the asterisk clicks as it indexes: 400px of scroll is 3.2 stops of 15°, so the mark turns to 45° and asks for a ratchet on the way — a tick per STEP, never a tick per scroll event',
    `rot ${ticks.rot}, voices ${ticks.log.join('/') || '(none)'}`);

  // THE TWO GATES, ASSERTED WHERE THEY LIVE. A sound that ignores the mute switch is a bug even if
  // it is a nice sound, and a page that ticks at a reader who asked for no motion is the same bug
  // wearing a different hat. `audible()` is the single place both are answered.
  ok(/const audible = \(\) => live\(\) && !stillMotion\(\)/.test(jsText)
    && (jsText.match(/if \(!audible\(\)\) return;/g) || []).length === 3
    && /const VOICE = \{ tap, breath, snap, glide, peel, restick, ratchet \};/.test(jsText),
    '11m.8 ...and all three answer to ONE gate: `audible()` is `live()` plus `!stillMotion()`, so mute and reduced motion both silence them at the source instead of being reminded per voice — and the VOICE table has no entry they could reach around it',
    `${(jsText.match(/if \(!audible\(\)\) return;/g) || []).length} gated voices`);

  await cdp.eval(`window.scrollTo({top:0,behavior:"instant"})`);
  await sleep(400);

  group('STEP 11i — THE GEAR IS A COG, AND THE RETICLE FOLLOWS IT INTO THE TOP LAYER');
  const GEAR = await cdp.eval(`(() => {
    const s = document.querySelector('#setOpen svg');
    const r = [...s.querySelectorAll('circle')].map(c => +c.getAttribute('r'));
    const d = s.querySelector('path').getAttribute('d');
    return { r, teeth: (d.match(/M/g) || []).length, vb: s.getAttribute('viewBox'),
      hidden: s.getAttribute('aria-hidden'), label: document.getElementById('setOpen').getAttribute('aria-label') };
  })()`);
  ok(GEAR.r.length === 2 && GEAR.r[0] === 2.5 && GEAR.r[1] === 6.5 && GEAR.teeth === 8
    && GEAR.vb === '0 0 24 24' && GEAR.hidden === 'true' && GEAR.label === 'Settings',
    '11i.1  the handle is a cog — a hub inside a rim with eight teeth standing outside it — not the site\'s own asterisk',
    `r ${GEAR.r.join('/')}, ${GEAR.teeth} teeth, viewBox ${GEAR.vb}, "${GEAR.label}"`);

  // §16 — the gear is in the head and the head is in a view: press it where it exists, so 11i.3's
  // focus-return is measured against a node that can actually take focus.
  await enterView('who');
  await cdp.eval(`document.getElementById('setOpen').click()`);
  await sleep(560);
  const open = await cdp.eval(`(() => { const p = document.getElementById('setPanel'), c = document.getElementById('cur');
    return { open: p.open, inPanel: p.contains(c), parent: c.parentNode.id || c.parentNode.tagName,
      expanded: document.getElementById('setOpen').getAttribute('aria-expanded'),
      nav: +getComputedStyle(document.getElementById('siteNav')).opacity,
      pos: getComputedStyle(c).position }; })()`);
  ok(open.open && open.inPanel && open.expanded === 'true' && open.nav === 1 && open.pos === 'fixed',
    '11i.2 open, the reticle is re-parented INTO the dialog\'s top layer, and the bar is held at 1 so its gear stays visible',
    `inside panel: ${open.inPanel} (parent ${open.parent}), aria-expanded ${open.expanded}, bar ${open.nav}, cursor ${open.pos}`);

  await cdp.eval(`document.getElementById('setClose').click()`);
  await sleep(820);
  const shutCog = await cdp.eval(`(() => { const p = document.getElementById('setPanel'), c = document.getElementById('cur');
    return { open: p.open, parent: c.parentNode.tagName, focus: document.activeElement.id,
      nav: +getComputedStyle(document.getElementById('siteNav')).opacity }; })()`);
  ok(!shutCog.open && shutCog.parent === 'BODY' && shutCog.focus === 'setOpen' && shutCog.nav === 1,
    '11i.3 ...and closed, the mark goes home to the body, focus returns to the gear, and the bar waits for it',
    `parent ${shutCog.parent}, focus ${shutCog.focus}, bar ${shutCog.nav}`);

  group('STEP 11j — THE SHEET CAME AND WENT WITHOUT A WORD');
  ok(consoleErrors.length === 0,
    '11j.1  building, parallaxing, ticking, handing over and opening the drawer raised no console error',
    consoleErrors.slice(0, 3).join(' | '));

  await cdp.eval(`document.activeElement && document.activeElement.blur && document.activeElement.blur()`);
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await cdp.eval('window.scrollTo({top:0,behavior:"instant"})');
  await sleep(420);

  // the second "quiet" pass: STEP 11j reads the console after the sheet has been dragged, skewed and
  // shuffled, and this one reads it again after the reloads. Two gates, two moments, one counter.
  group('STEP 11j (cont.) — THE PAGE THAT COMES BACK IS QUIET');
  ok(consoleErrors.length === 0,
    '11j.2  three reloads re-ran every module — audio, smoother, head, board, drawer, both switches, the rail — and said nothing',
    consoleErrors.slice(0, 3).join(' | '));

  // ── optional: the measured table (for docs, not for assertions) ─────────
  if (process.argv.includes('--report')) {
    const pad = (v, n) => String(v).padStart(n);
    console.log('\n   W    gutter  inner  workT0  workT1  workT2  caseBand  campGrid  wallRoom   prose  air L/R');
    for (const w of WIDTHS) {
      const s = S.get(w);
      const t = s.workTracks.length === 3 ? s.workTracks : [null, null, null];
      const p = s.whoP[0];
      console.log('  ' + [
        pad(w, 5), pad(n2(s.gutter), 6), pad(n2(s.inner), 6),
        pad(t[0] === null ? '—' : n2(t[0]), 6), pad(t[1] === null ? '—' : n2(t[1]), 6),
        pad(t[2] === null ? '—' : n2(t[2]), 6),
        pad(n2(s.caseRight[0] - s.caseLeft[0]), 8),
        pad(n2(s.vis['.camp-grid']?.w ?? '—'), 9), pad(n2(s.vis['.wall-room']?.w ?? '—'), 9),
        pad(p ? n2(p.w) : '—', 8), pad(p ? `${n2(p.airL)}/${n2(p.airR)}` : '—', 12),
      ].join(' '));
    }
    // the Eid sheet is the one block measured on its block axis: its view() timeline's length
    // IS its height, so the depth has to be quoted next to the progress it produces
    for (const H of [900, 768]) {
      await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: H, deviceScaleFactor: 1, mobile: false });
      await sleep(220);
      const m = await cdp.eval(`(() => {
        const r = document.getElementById('eidImg').getBoundingClientRect();
        const c = document.querySelector('.camp-grid');
        return { h: Math.round(r.height * 100) / 100, w: Math.round(r.width * 100) / 100,
          tracks: getComputedStyle(c).gridTemplateColumns, frame: c.getBoundingClientRect().width };
      })()`);
      console.log(`   1440x${H}  the Eid sheet ${m.w}x${m.h}   camp-grid ${m.frame} (${m.tracks})   ` +
        `reveal at full entry ${n2((0.9 * m.h) / (0.4 * m.h + 0.5 * H))}`);
    }
  }

  // ── optional evidence ───────────────────────────────────────────────────
  // §16 — a screenshot of "#who" now means "open the place and shoot it": in the cover the
  // broadsheet is folded to zero and a scroll to a section's offset would land on the gate. So the
  // evidence follows the same door the reader does, one state at a time.
  if (SHOTS) {
    await fsp.mkdir(SHOTDIR, { recursive: true });
    const shotAt = async (w, h, name, go) => {
      await cdp.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 800 });
      await sleep(320);
      if (go) await go();
      await sleep(460);
      const shot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      await fsp.writeFile(path.join(SHOTDIR, name + '.png'), Buffer.from(shot.data, 'base64'));
    };
    await shotAt(1440, 900, '1440-cover', () => enterCover());
    await shotAt(1440, 900, '1440-index-mid', async () => {
      await enterCover();
      await cdp.eval(`window.__ad.scrollTo(${Math.round((await cdp.eval(`document.getElementById('gate').offsetHeight - window.innerHeight`)) * 0.5)})`);
    });
    await shotAt(1440, 900, '1440-index-end', async () => { await enterIndex(); });
    await shotAt(1440, 900, '1440-who', () => enterView('who'));
    await shotAt(1440, 900, '1440-work', () => enterView('work'));
    await shotAt(1440, 900, '1440-magazine', () => enterView('magazine'));
    await shotAt(1440, 900, '1440-reach', () => enterView('reach'));
    await shotAt(390, 844, '390-cover', () => enterCover());
    await shotAt(390, 844, '390-index', () => enterIndex());
    await shotAt(390, 844, '390-who', () => enterView('who'));
    console.log('   shots → ' + SHOTDIR);
  }

  // ═════════════════════════════════════════════════════════════════════════
  // §16 — THE GATE. Three states, one attribute, and the ink that carries one into the next.
  // ═════════════════════════════════════════════════════════════════════════
  const ledgerText = await fsp.readFile(path.join(ROOT, 'js', 'ledger.js'), 'utf8');

  group('STEP SA — STATIC: ONE BLOCK, ONE ATTRIBUTE, THREE STATES');
  const gateAt = html.indexOf('<section class="gate" id="gate"');
  const heroAt = html.indexOf('<section id="hero"');
  const boardAt = html.indexOf('<nav class="metroboard"');
  const gateEnd = html.indexOf('</section><!-- /gate -->');
  ok(gateAt > 0 && heroAt > gateAt && boardAt > heroAt && gateEnd > boardAt,
    'SA.1  the gate WRAPS the sheet and the board — one block, one stage, and the fold is its own object in the source',
    `gate ${gateAt} < hero ${heroAt} < board ${boardAt} < /gate ${gateEnd}`);
  ok((html.match(/class="index-panel"/g) || []).length === 4
    && (html.match(/class="ip-frame"/g) || []).length === 4
    && (html.match(/class="ip-inner"/g) || []).length === 4
    && (html.match(/class="ip-seam ip-seam-v"/g) || []).length === 1
    && (html.match(/class="ip-seam ip-seam-h"/g) || []).length === 1
    && (html.match(/<div id="flood"/g) || []).length === 1
    && (html.match(/id="pullPeek"/g) || []).length === 1
    && (html.match(/id="headIndex"/g) || []).length === 1
    && (html.match(/data-back-index/g) || []).length === 4,
    'SA.2  four plates (each a frame and a type box), two register marks, one flood, one pull-up, one ← INDEX, and a BACK TO INDEX at the foot of every section',
    `${(html.match(/class="index-panel"/g) || []).length} plates / ${(html.match(/class="ip-inner"/g) || []).length} type boxes / ${(html.match(/data-back-index/g) || []).length} doors`);
  ok(!/data-view="(?:who|work|magazine|reach)"[^>]*\shidden/.test(html),
    'SA.3  NO STATIC `hidden` ON A VIEW. With no script there is no state to be in, so the four sections ship visible and stacked');
  ok((html.match(/data-view="(?:who|work|magazine|reach)"/g) || []).length === 4
    && !/data-view="hero"/.test(html),
    'SA.4  the four places carry `data-view`, and the sheet does not — the cover is not a place the index can route to');
  ok(/html\[data-mode="cover"\] \.site-head,\s*\nhtml\[data-mode="index"\] \.site-head\{visibility:hidden;pointer-events:none;\}/.test(cssText)
    && /html\[data-mode="cover"\] \.skip-link,\s*\nhtml\[data-mode="index"\] \.skip-link\{display:none;\}/.test(cssText),
    'SA.5  the head is taken out of the tab ring and the a11y tree in EXACTLY the two states that have no page under them — and by `visibility`, so its box can still be measured');
  ok(!/gate-plane/.test(html) && !/gate-plane/.test(cssText) && !/gate-plane/.test(jsText),
    'SA.6  the four crossfading `.gate-plane` inks are gone from the stylesheet, the markup AND the script — the index is one object now, not two');
  ok(/\.metroboard\[data-fold\]\{visibility:hidden;pointer-events:none;\}/.test(cssText)
    && !/html\[data-mode="index"\] \.metroboard\[data-fold\]/.test(cssText)
    && /\.index-panel\{[^}]*transform-origin:0 0/.test(cssText)
    && /\.ip-inner\{[^}]*transform-origin:0 0/.test(cssText),
    'SA.6b ...because the docked bar folds away (`data-fold`) and each plate scales from its OWN top-left corner — the same corner as the block it grew out of — and the fold is an attribute of the MORPH, not of the mode, so the bar cannot vanish on the frame a state changes nor flash on the way back');
  ok(/1 \/ sX/.test(jsText) && /const MORPH_START = 0\.30/.test(jsText)
    && /const MORPH_END\s+= 0\.78/.test(jsText),
    'SA.6c ...with `1/` the same two numbers written on the type box, so the words are exactly their printed size on every frame of the morph',
    'MORPH 0.30 → 0.78');
  ok(!/--index-h/.test(cssText) && !/--bleach/.test(cssText)
    && /\.gate\{position:relative;height:100vh;height:100svh;background:#141110;\}/.test(cssText)
    && /\.gate-stage\{position:relative;height:100%;overflow:clip;\}/.test(cssText)
    && /html\[data-mode="cover"\],\s*\nhtml\[data-mode="index"\]\{overscroll-behavior:none;\}/.test(cssText),
    'SA.7  the gate is EXACTLY one screen — `100vh` then `100svh`, a `position:relative` stage and `overflow:clip` — with no travel token and no sticky pin left, so no scroll position means anything inside it; and `overscroll-behavior:none` in its two states stops a wheel at the fold from chaining to the browser',
    '100svh gate, relative stage, no --index-h, no --bleach');
  ok(/#flood\{position:fixed;inset:0;z-index:640;pointer-events:none;/.test(cssText)
    && /transform:scaleY\(0\);transform-origin:50% 100%/.test(cssText.split('#flood{')[1] || '')
    && /#floodProxy\{position:fixed;inset:0;z-index:641/.test(cssText),
    'SA.7b ...and the flood is still a fixed, untouchable plane, with a full-viewport PROXY one layer above it to be the destination rect of its Flip',
    'flood 640 / proxy 641');
  ok(/html\[data-mode="view"\] \.gate\{display:none;\}/.test(cssText)
    && /#gate\[hidden\]\{display:none !important;\}/.test(cssText)
    && /html\[data-mode="cover"\] #broadsheet,\s*\nhtml\[data-mode="index"\] #broadsheet\{height:0;overflow:clip;pointer-events:none;\}/.test(cssText)
    && /height:0;padding-block:0;margin-top:0;border-top-width:0;/.test(cssText)
    && /html\[data-mode="view"\] #broadsheet > \[data-view\]\[inert\]\{display:none;\}/.test(cssText),
    'SA.7c the HARD STOP is a height: in a view the gate is not rendered, and in the gate\'s two states the broadsheet is collapsed to zero and clipped instead of being deleted',
    'gate reset + collapsed broadsheet');
  ok(/html\[data-mode="view"\] \[data-view\]\{padding-top:calc\(var\(--head-h\) \+ clamp\(1\.5rem,3vh,2\.5rem\)\);\}/.test(cssText),
    'SA.7d ...and a chosen section reserves the fixed bar itself, stated once for every place instead of a guess per section');
  ok(/--arrow-up:url\("data:image\/svg\+xml,/.test(cssText) && /--arrow-left:url\("data:image\/svg\+xml,/.test(cssText)
    && /\.back-index::before\{content:"";flex:none;width:0\.72rem/.test(cssText)
    && !/content:"\\2191"|content:"\\2190"/.test(cssText),
    'SA.7e both arrows are DRAWN (an inline SVG in a mask, filled with `currentColor`) — no codepoint the faces of this sheet do not carry',
    'two SVG masks');
  ok(/\[data-view\]\[hidden\]\{display:none !important;\}/.test(cssText),
    'SA.8  the one reset that puts the UA rule back on top of `#work{display:grid}` — declared once, scoped to `[data-view]`');
  ok((jsText.match(/setAttribute\('data-mode'/g) || []).length === 1,
    'SA.9  ONE writer for the state: a single setAttribute in the whole module, so no second path can disagree with the stylesheet',
    `${(jsText.match(/setAttribute\('data-mode'/g) || []).length} writer(s)`);
  ok(/const my = \+\+gen;/.test(jsText) && /if \(my !== gen\) return;/.test(jsText)
    && /g\.killTweensOf\(floodEl\)/.test(jsText),
    'SA.10 the route token: a generation is taken before the flood and the swap refuses to run if a newer route has begun');
  ok(/#headIndex,\.back-index,\.pull-peek\{display:none!important\}/.test(html),
    'SA.11 no-script: the three gate controls are state changes, so they are hidden with the state machine that would answer them');
  ok(/CustomEvent\('ad:layout'/.test(ledgerText)
    && (jsText.match(/addEventListener\('ad:layout', schedule\)/g) || []).length === 2,
    'SA.12 a row on the wall changes the page\'s height, and both readers of it — the rail and the gate — are told, once, by name',
    `${(jsText.match(/addEventListener\('ad:layout', schedule\)/g) || []).length} listeners`);

  group('STEP SB — LIVE: THE THREE STATES, AND THE INK BETWEEN THEM');
  await enterCover();
  await sleep(360);
  const sb0 = await cdp.eval(`(() => ({ mode: window.__ad.mode(),
    head: getComputedStyle(document.querySelector('.site-head')).visibility,
    gateH: Math.round(document.getElementById('gate').getBoundingClientRect().height),
    hash: location.hash }))()`);
  ok(sb0.mode === 'cover' && sb0.head === 'hidden' && sb0.hash === '',
    'SB.1  at scrollY 0 the machine says `cover`, the head is invisible, and the URL carries no fragment',
    `${sb0.mode} / ${sb0.head} / "${sb0.hash}"`);

  // 1 — route to a place from the BOARD, exactly as a reader would
  await cdp.eval(`document.querySelector('.metro-block[data-nav-for="work"]').click()`);
  const sbView = await settles(`(() => { const f = document.getElementById('flood');
    const w = document.getElementById('work');
    return { mode: window.__ad.mode(), place: window.__ad.place(), y: Math.round(window.scrollY),
      head: getComputedStyle(document.querySelector('.site-head')).visibility,
      workTop: Math.round(w.getBoundingClientRect().top),
      gateGone: document.getElementById('gate').getBoundingClientRect().height === 0,
      fill: getComputedStyle(f).backgroundColor, z: getComputedStyle(f).zIndex,
      curZ: getComputedStyle(document.getElementById('cur')).zIndex, hash: location.hash }; })()`,
    v => v.mode === 'view' && v.place === 'work');
  ok(sbView.mode === 'view' && sbView.head === 'visible' && sbView.hash === '#work',
    'SB.2  pressing the WORK block routes to `view`, the head is back, and the place is in the URL',
    `${sbView.mode}, head ${sbView.head}, "${sbView.hash}"`);
  ok(sbView.y === 0 && sbView.workTop === 0,
    'SB.3  ...and the chosen section IS the document: parked at y 0 with its own top on the origin',
    `y ${sbView.y}, #work top ${sbView.workTop}`);
  ok(sbView.fill === 'rgb(255, 79, 56)',
    'SB.4  the flood was filled from the BLOCK\'S OWN --pop (--pop-2 = #FF4F38), not from a palette in the script',
    sbView.fill);
  ok(+sbView.z > 510 && +sbView.curZ > +sbView.z,
    'SB.5  ...and it covers the head (510) while the reticle (9999) stays the top layer',
    `flood ${sbView.z}, reticle ${sbView.curZ}`);
  ok(sbView.gateGone,
    'SB.6  and the FOLD IS GONE in a view — no full-screen block sitting above the place you asked for',
    `gate height 0: ${sbView.gateGone}`);

  // 2 — the head's ← INDEX, from the view
  await cdp.eval(`document.getElementById('headIndex').click()`);
  const sbIndex = await settles(`(() => ({
    mode: window.__ad.mode(),
    revealed: document.getElementById('indexPanels').hasAttribute('data-revealed'),
    head: getComputedStyle(document.querySelector('.site-head')).visibility,
    gateH: Math.round(document.getElementById('gate').getBoundingClientRect().height),
    hash: location.hash,
    focus: (document.activeElement && document.activeElement.dataset)
      ? (document.activeElement.dataset.openView || '') : '' }))()`,
    v => v.mode === 'index' && v.revealed);
  ok(sbIndex.mode === 'index' && sbIndex.head === 'hidden' && sbIndex.hash === '#index',
    'SB.7  ← INDEX goes back to the index, the head goes with it, and the URL says where it went',
    `${sbIndex.mode} / ${sbIndex.head} / "${sbIndex.hash}"`);
  ok(sbIndex.focus === 'work',
    'SB.8  ...landing at the end of the scrub with the panels up and focus back on the door that was pressed',
    `focus ${sbIndex.focus || '(none)'}`);
  ok(sbIndex.gateH === sb0.gateH,
    'SB.9  and ← INDEX restores the SAME one-screen gate — the fold is the object it was before the route, at y 0 rather than at the end of a pin',
    `${sbIndex.gateH}`);

  // 3 — a panel is a route too
  await cdp.eval(`document.querySelector('.index-panel[data-open-view="magazine"]').click()`);
  const sbPan = await settles(`({ mode: window.__ad.mode(), place: window.__ad.place() })`,
    v => v.mode === 'view' && v.place === 'magazine');
  ok(sbPan.place === 'magazine', 'SB.10 a panel routes like a block does', sbPan.place);

  // 4 — the door at the foot of a section
  await cdp.eval(`document.querySelector('#magazine .back-index').scrollIntoView({ block: 'center' })`);
  await sleep(380);
  const sbBackAt = await cdp.eval(`(() => { const b = document.querySelector('#magazine .back-index');
    return b ? Math.round(b.getBoundingClientRect().top) : -1; })()`);
  await cdp.eval(`document.querySelector('#magazine .back-index').click()`);
  const sbBack = await settles(`({ mode: window.__ad.mode(), revealed: document.getElementById('indexPanels').hasAttribute('data-revealed') })`,
    v => v.mode === 'index');
  ok(sbBackAt >= 0 && sbBack.mode === 'index' && sbBack.revealed,
    'SB.11 BACK TO INDEX at the foot of a section returns to the panels — the door is where the reader left it',
    `button at y ${sbBackAt}, mode ${sbBack.mode}`);

  // 5 — Escape is the view's second door
  await cdp.eval(`window.__ad.view('reach')`);
  await settles(`window.__ad.mode()`, v => v === 'view');
  await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
  ok((await settles(`window.__ad.mode()`, v => v === 'index')) === 'index',
    'SB.12 Escape in a view returns to the index');

  // 6 — the brand means the cover
  await cdp.eval(`window.__ad.view('who')`);
  await settles(`window.__ad.mode()`, v => v === 'view');
  await cdp.eval(`document.querySelector('.head-brand').click()`);
  const sbCover = await settles(`(() => ({ mode: window.__ad.mode(), y: Math.round(window.scrollY),
    head: getComputedStyle(document.querySelector('.site-head')).visibility, hash: location.hash }))()`,
    v => v.mode === 'cover');
  ok(sbCover.mode === 'cover' && sbCover.y === 0 && sbCover.head === 'hidden' && sbCover.hash === '',
    'SB.13 the name on the left means the COVER — back to the fold, the bar gone, the URL clean',
    `${sbCover.mode} at y ${sbCover.y}, "${sbCover.hash}"`);

  // ── THE PULL-UP: A PHONE'S ESCAPE KEY ─────────────────────────────────────
  group('STEP SC — THE PULL-UP IS THE PHONE\'S SECOND DOOR');
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
  await cdp.eval(`window.__ad.view('reach')`);
  await settles(`window.__ad.mode()`, v => v === 'view');
  await cdp.eval('window.scrollTo({top: document.documentElement.scrollHeight, behavior:"instant"})');
  await sleep(380);
  const scArmed = await cdp.eval(`(() => { const p = document.getElementById('pullPeek');
    return { armed: p.hasAttribute('data-armed'), op: +getComputedStyle(p).opacity,
      pe: getComputedStyle(p).pointerEvents, hidden: p.getAttribute('aria-hidden') }; })()`);
  ok(scArmed.armed && scArmed.pe === 'none' && scArmed.hidden === 'true',
    'SC.1  at the foot of a view the hint is ARMED — and it is still an instruction, not a control: no press, no announcement',
    `armed ${scArmed.armed}, pointer-events ${scArmed.pe}`);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 195, y: 720 }] });
  await sleep(40);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 195, y: 600 }] });
  await sleep(40);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  ok((await settles(`window.__ad.mode()`, v => v === 'index')) === 'index',
    'SC.2  120px of thumb upward at the end of the page returns to the index — the gesture, not a button');
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: false });
  await cdp.eval('window.scrollTo({top:0,behavior:"instant"})');
  await settles(`window.__ad.mode()`, v => v === 'cover');

  // ── MOTION OFF: THE INDEX IS A PAGE, NOT A TWIST ─────────────────────────
  group('STEP SD — MOTION OFF TURNS THE INDEX INTO A PAGE');
  await cdp.eval(`document.documentElement.setAttribute('data-motion','off')`);
  await cdp.eval(GATE_P(0.55));
  // the pointer is parked and the focus dropped, so the reading is of the plates at rest
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 4, y: 4 });
  await cdp.eval(`document.activeElement && document.activeElement.blur && document.activeElement.blur()`);
  await sleep(420);
  const sd = await cdp.eval(`(() => { const s = document.getElementById('gateStage');
    const mr = t => t === 'none' ? new DOMMatrix() : new DOMMatrix(t);
    const bd = document.querySelector('.metroboard');
    return { mode: window.__ad.mode(), p: s.style.getPropertyValue('--gate-p'),
      fold: bd.hasAttribute('data-fold'),
      plates: [...document.querySelectorAll('.index-panel')].map((n, i) => {
        const o = mr(getComputedStyle(n).transform);
        const i2 = mr(getComputedStyle(n.querySelector('.ip-inner')).transform);
        // THE INK AT REST IS THE PLATE'S OWN --pop (§16d) — a background, not a bleached layer —
        // and the block it grew out of wears the same one, which is the whole point of "one object".
        const blk = bd.querySelectorAll('.metro-block')[i];
        // the token is a hex string; resolve it through a probe so the comparison is like for like
        const probe = document.createElement('i');
        probe.style.color = getComputedStyle(blk).getPropertyValue('--pop').trim();
        document.body.appendChild(probe);
        const pop = getComputedStyle(probe).color;
        probe.remove();
        return { sx: +o.a.toFixed(3), sy: +o.d.toFixed(3), ix: +i2.a.toFixed(3),
                 bg: getComputedStyle(n).backgroundColor, pop }; }) }; })()`);
  ok(sd.mode === 'index' && sd.p === '' && sd.fold
    && sd.plates.length === 4
    && sd.plates.every(t => t.sx === 1 && t.sy === 1 && t.ix === 1)
    && restInk(sd.plates),
    'SD.1  with Motion off no `--gate-p` is written, the four plates are simply THERE — identity box, no travel — and each one RESTS in the exact `--pop` its block wears (the one under the pointer is the only one inverted), because the morph has one ink and one object',
    `p "${sd.p}", fold ${sd.fold}, plates ${sd.plates.map(t => t.sx + 'x' + t.sy + '/' + t.ix + '@' + (t.bg === t.pop ? 'pop' : t.bg)).join(' / ')}`);
  await cdp.eval(GATE_END);
  ok((await settles(`window.__ad.revealed()`, v => v === true)) === true,
    'SD.2  ...and the four panels still arrive at the end of it: a state is not a movement');
  await cdp.eval(`document.documentElement.setAttribute('data-motion','on')`);
  await enterCover();

  // ── THE PANELS THEMSELVES, AT BOTH ENDS OF THE RANGE ─────────────────────
  group('STEP SE — THE INDEX PANELS FIT THE FOLD AT 390 AND AT 1440');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await sleep(520);
  await cdp.eval(GATE_END);
  await settles(`document.getElementById('indexPanels').hasAttribute('data-revealed')`, v => v === true);
  // THE REVEAL IS A TRANSFORM, so the rect is still translated by up to 1.4rem while it runs. The
  // attribute lands on the first frame; the geometry is only true once the 0.42s transition is over.
  await sleep(520);
  const panelsAt = () => cdp.eval(`(() => {
    const p = document.getElementById('indexPanels'), cs = getComputedStyle(p);
    const cells = [...p.querySelectorAll('.index-panel')].map(c => c.getBoundingClientRect());
    const bd = document.querySelector('.metroboard');
    const board = bd.getBoundingClientRect();
    const pr = p.getBoundingClientRect();
    // THE PLATES TILE THE WHOLE STAGE, so their box IS the stage's box: measured against the
    // padding edge, which is what the grid actually fills.
    const contentBottom = Math.round(pr.bottom - parseFloat(cs.paddingBottom));
    const t = p.querySelector('.ip-teaser'), ts = getComputedStyle(t);
    return { mode: window.__ad.mode(), cols: cs.gridTemplateColumns.split(' ').length,
      rows: cs.gridTemplateRows.split(' ').length,
      n: cells.length, minW: Math.round(Math.min(...cells.map(r => r.width))),
      minH: Math.round(Math.min(...cells.map(r => r.height))),
      left: Math.round(Math.min(...cells.map(r => r.left))),
      right: Math.round(Math.max(...cells.map(r => r.right))),
      contentBottom: contentBottom, stageH: Math.round(pr.height),
      boardTop: Math.round(board.top), boardVis: getComputedStyle(bd).visibility,
      fold: bd.hasAttribute('data-fold'),
      clamp: ts.webkitLineClamp, teaserOvf: ts.overflow,
      cw: document.documentElement.clientWidth,
      ovf: document.documentElement.scrollWidth - document.documentElement.clientWidth }; })()`);
  const p390 = await panelsAt();
  ok(p390.mode === 'index' && p390.cols === 1 && p390.rows === 4 && p390.n === 4,
    'SE.1  at 390 the four plates are FOUR BANDS — one column, four equal rows, each the width of the sheet',
    `${p390.n} panels, ${p390.cols} column / ${p390.rows} rows`);
  ok(p390.minW > 250 && p390.minH >= 44 && p390.left >= 0 && p390.right <= p390.cw,
    'SE.2  ...each one wide enough to read and tall enough to press, and inside the viewport',
    `${p390.minW}x${p390.minH}, x ${p390.left}→${p390.right} of ${p390.cw}`);
  ok(p390.fold && p390.boardVis === 'hidden' && p390.contentBottom >= p390.boardTop - 1,
    'SE.3  ...and they own the WHOLE fold: the bar they grew out of is still in the document and no longer drawn (`data-fold`), so nothing is duplicated over them',
    `content ends ${p390.contentBottom}, board starts ${p390.boardTop}, ${p390.boardVis}`);
  ok(p390.clamp === '1' && p390.teaserOvf === 'hidden',
    'SE.3b ...with one line of the work on a phone, clamped rather than allowed to push the title off the band',
    `line-clamp ${p390.clamp}, overflow ${p390.teaserOvf}`);
  ok(p390.ovf <= 0, 'SE.4  and a 390 phone with the index up has no horizontal scrollbar', `overflow ${p390.ovf}`);

  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await sleep(520);
  // the gate's travel is a function of the viewport (§16), so a resize re-aims it: the end is a
  // different scroll position at 900 than it was at 844
  await cdp.eval(GATE_END);
  await settles(`document.getElementById('indexPanels').hasAttribute('data-revealed')`, v => v === true);
  await sleep(520);
  const p1440 = await panelsAt();
  ok(p1440.mode === 'index' && p1440.cols === 2 && p1440.minH >= 44 && p1440.contentBottom >= p1440.boardTop - 1,
    'SE.5  at 1440 the same four cells, now two tracks of two, still tiling the whole fold over the folded-away bar',
    `${p1440.minW}x${p1440.minH}, content ends ${p1440.contentBottom} of board ${p1440.boardTop} (${p1440.boardVis})`);
  ok(p1440.clamp === 'none',
    'SE.5b ...and the sentence is no longer clamped: a plate is big enough to hold all of it at this size',
    `line-clamp ${p1440.clamp}`);
  ok(p1440.ovf <= 0, 'SE.6  and no horizontal overflow at 1440 either', `overflow ${p1440.ovf}`);
  // ═══════════════════════════════════════════════════════════════════════════
  // STEP SM — THE MORPH (one object: the docked bar IS the contents page)
  //
  // The index used to crossfade TWO objects: four inks grew behind the pinned sheet and four cards
  // faded in over them, which is a thing the reader has to be told about. It is a MOVE now, and what
  // is measured below is the move itself — the plates are absent under the fold, they begin on the
  // board's OWN rectangles and in the board's OWN colour, they finish on their own quarters, and the
  // type is exactly its printed size at every point in between because the plate's scale is answered
  // by `1/s` on its type box.
  // ═══════════════════════════════════════════════════════════════════════════
  group('STEP SM — THE INDEX IS ONE MORPH: BLOCK → PLATE → QUARTER, AND THE TYPE NEVER STRETCHES');
  // THE POSITION IS THE MODULE'S OWN NUMBER (§16d). There is no scroll travel to divide up any more,
  // so `atP` parks the gate at `p` through `__ad.gate.setProgress` — the same machine a tween writes
  // to — and reads the frame after it has been painted.
  const atP = async f => {
    await cdp.eval(f <= 0 ? `window.__ad.cover()` : GATE_P(f));
    // the plates are written on the module's own frame: wait for two of them, and park the pointer so
    // the reading is of the plates AT REST (one of the four is always hovered when they tile the
    // screen, and the hover is a 0.18s background transition — hence the longer settle)
    await cdp.eval('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(1))))');
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 4, y: 4 });
    await sleep(260);
    return cdp.eval(`(() => {
      const p = document.getElementById('indexPanels'), pr = p.getBoundingClientRect();
      const bd = document.querySelector('.metroboard');
      const plates = [...p.querySelectorAll('.index-panel')];
      const md = t => { const m = t === 'none' ? new DOMMatrix() : new DOMMatrix(t); return { a: +m.a.toFixed(4), d: +m.d.toFixed(4) }; };
      const box = r => ({ x: r.left - pr.left, y: r.top - pr.top, w: r.width, h: r.height });
      const pv = getComputedStyle(document.getElementById('gateStage')).getPropertyValue('--gate-p').trim();
      const num = document.querySelector('.index-panel .ip-num'), nr = num.getBoundingClientRect();
      return { p: pv === '' ? null : +pv, mode: window.__ad.mode(),
        fold: bd.hasAttribute('data-fold'), boardVis: getComputedStyle(bd).visibility,
        panelsVis: getComputedStyle(p).visibility,
        // THE INK IS A BACKGROUND NOW: each plate rests in its own --pop, and the block it grew out
        // of wears the same one. That equality is what "one object, one ink" means on a frame. The
        // token is hex and the background is rgb, so the token is resolved through a probe first.
        ink: plates.map((n, i) => {
          const probe = document.createElement('i');
          probe.style.color = getComputedStyle(bd.querySelectorAll('.metro-block')[i]).getPropertyValue('--pop').trim();
          document.body.appendChild(probe);
          const pop = getComputedStyle(probe).color;
          probe.remove();
          return { bg: getComputedStyle(n).backgroundColor, pop };
        }),
        src: [...bd.querySelectorAll('.metro-block')].map(b => box(b.getBoundingClientRect())),
        dst: plates.map(n => ({ x: n.offsetLeft, y: n.offsetTop, w: n.offsetWidth, h: n.offsetHeight })),
        got: plates.map(n => box(n.getBoundingClientRect())),
        out: plates.map(n => md(getComputedStyle(n).transform)),
        inn: plates.map(n => md(getComputedStyle(n.querySelector('.ip-inner')).transform)),
        num: { drawn: +nr.height.toFixed(2), printed: num.offsetHeight },
        stage: { w: Math.round(pr.width), h: Math.round(pr.height) } }; })()`);
  };
  // the largest disagreement between two boxes, so one number says "the same rectangle"
  const far = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y),
                                 Math.abs(a.w - b.w), Math.abs(a.h - b.h));
  const pair = d => d.map(t => t.a.toFixed(2) + 'x' + t.d.toFixed(2)).join(' ');

  const mUnder = await atP(0.15);
  ok(mUnder.mode === 'index' && !mUnder.fold && mUnder.boardVis === 'visible'
    && mUnder.panelsVis === 'hidden'
    && mUnder.out.every(o => o.a === 1 && o.d === 1),
    'SM.1  under the fold the docked bar is docked and the four plates are not drawn at all — laid out, so they can be measured, invisible, and with no transform written on them',
    `fold ${mUnder.fold}, board ${mUnder.boardVis}, plates ${mUnder.panelsVis}`);
  const mFold = await atP(0.31);
  ok(mFold.fold && mFold.boardVis === 'hidden' && mFold.panelsVis === 'visible'
    && mFold.got.length === 4 && mFold.got.every((g, i) => far(g, mFold.src[i]) <= 3)
    && restInk(mFold.ink)
    && Math.abs(mFold.num.drawn - mFold.num.printed) <= 1,
    'SM.2  at 0.30 the bar folds and the four plates take over IN ITS OWN RECTANGLES and its OWN colour — the same four boxes, so crossing the line moves nothing',
    mFold.got.map((g, i) => `${Math.round(g.x)},${Math.round(g.y)} ${Math.round(g.w)}x${Math.round(g.h)} vs ${Math.round(mFold.src[i].x)},${Math.round(mFold.src[i].y)} ${Math.round(mFold.src[i].w)}x${Math.round(mFold.src[i].h)}`).join(' | ') + ` ink ${mFold.ink[0].bg === mFold.ink[0].pop ? 'block --pop' : mFold.ink[0].bg + ' vs ' + mFold.ink[0].pop}`);
  const mMid = await atP(0.54);
  ok(mMid.out.every((o, i) => Math.abs(o.a * mMid.inn[i].a - 1) < 0.003
      && Math.abs(o.d * mMid.inn[i].d - 1) < 0.003)
    && mMid.out.every(o => o.a < 0.95 && o.d < 0.95)
    && mMid.inn.every(t => t.a > 1.05 && t.d > 1.05),
    'SM.3  half-way the boxes are between the two and the type box is counter-scaled by exactly 1/s — `s × 1/s` is 1 on the frame it is drawn, all four, both axes',
    `outer ${pair(mMid.out)} / inner ${pair(mMid.inn)}`);
  ok(mMid.got.every((g, i) => g.h < mMid.dst[i].h - 8 && far(g, mMid.dst[i]) > 8)
    && Math.abs(mMid.num.drawn - mMid.num.printed) <= 1,
    'SM.4  ...so the BOX is in transit while the TYPE is already its printed size: the plate is nothing like its quarter yet and the words inside it have not moved a hair',
    `plate h ${mMid.got.map(g => Math.round(g.h)).join('/')} → ${mMid.dst.map(d => Math.round(d.h)).join('/')}, numeral drawn ${mMid.num.drawn} on ${mMid.num.printed}`);
  const mEnd = await atP(1);
  // the hover LIFTS a plate by 2px, and one of the four is always under the pointer, so the box a
  // plate occupies at the end is its quarter or its quarter lifted — 3px of tolerance says both
  ok(mEnd.got.every((g, i) => far(g, mEnd.dst[i]) <= 3)
    && mEnd.dst.every(d => Math.abs(d.w * 2 - mEnd.stage.w) <= 2
      && Math.abs(d.h * 2 - mEnd.stage.h) <= 2),
    'SM.5  at 1 each plate IS its quarter, and the four of them tile the whole fold: no gutter between them and no rim left over',
    `quarters ${mEnd.dst.map(d => `${Math.round(d.w)}x${Math.round(d.h)}`).join(' ')} of ${mEnd.stage.w}x${mEnd.stage.h}`);
  note('morph: block ' + mFold.src.map(b => `${Math.round(b.w)}x${Math.round(b.h)}`).join('/')
    + ' → quarter ' + mEnd.dst.map(d => `${Math.round(d.w)}x${Math.round(d.h)}`).join('/')
    + ` at ${mEnd.stage.w}x${mEnd.stage.h}; mid outer ${pair(mMid.out)} and inner ${pair(mMid.inn)}`);
  ok(mEnd.out.every(o => o.a === 1 && o.d === 1) && mEnd.inn.every(o => o.a === 1 && o.d === 1),
    'SM.6  ...and both transforms are identity there — the inverse is exact, so the morph leaves nothing written on the type',
    `outer ${pair(mEnd.out)} / inner ${pair(mEnd.inn)}`);
  ok(restInk(mEnd.ink) && restInk(mMid.ink),
    'SM.7  and the ground never changes on the way: at the fold, half-way through the flight and at rest, the plates are their blocks\' own `--pop` (the one under the pointer inverts, exactly as it does at rest) — a background, not a layer a script has to bleach — so the only thing the morph moves is the size',
    `${mFold.ink.map(t => t.bg).join(' ')} → ${mMid.ink.map(t => t.bg).join(' ')} → ${mEnd.ink.map(t => t.bg).join(' ')}`);
  const mBack = await atP(0);
  ok(mBack.mode === 'cover' && !mBack.fold && mBack.boardVis === 'visible'
    && mBack.panelsVis === 'hidden' && restInk(mBack.ink)
    && mBack.out.every(o => o.a === 1 && o.d === 1),
    'SM.8  and the whole thing runs backwards: back at the cover the plates are put away, reset to identity — their resting ink untouched — and the docked bar is the contents again',
    `mode ${mBack.mode}, fold ${mBack.fold}, board ${mBack.boardVis}`);
  await enterCover();
  await sleep(200);

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP SF — ONE SCREEN, AND THE SCREEN DOES NOT MOVE
  //
  // The three things that made this pass necessary: the gate had no real transition, a state leaked
  // into another, and the folio was offset for a bar that was not there. Pass 2D retired the 250vh
  // pin entirely — the gate is one screen and owns its own progress — so what is measured here is
  // that nothing on the page moves while the plates cross it, and that the number they are driven by
  // is the module's own, not a scroll offset.
  // ═══════════════════════════════════════════════════════════════════════════
  group('STEP SF — THE GATE IS ONE SCREEN, AND THE SCREEN DOES NOT MOVE');
  const pinned = await cdp.eval(`(() => {
    const st = document.getElementById('gateStage');
    const g = document.getElementById('gate');
    return { pos: getComputedStyle(st).position,
      h: Math.round(st.getBoundingClientRect().height), vh: window.innerHeight,
      gateH: Math.round(g.getBoundingClientRect().height),
      overflow: getComputedStyle(g).overflow + '/' + getComputedStyle(document.getElementById('main')).overflow,
      docH: document.documentElement.scrollHeight };
  })()`);
  ok(pinned.pos === 'relative' && pinned.h === pinned.vh && near(pinned.gateH, pinned.vh, 2),
    'SF.1  `.gate` and `.gate-stage` are BOTH exactly one viewport and the stage is `position:relative` — there is no 250vh block and no pin left to fake, because the gate has no scroll travel at all',
    `${pinned.pos}, ${pinned.h}px of ${pinned.vh}; gate ${pinned.gateH}px`);
  ok(!/hidden|auto|scroll/.test(pinned.overflow),
    'SF.2  ...and nothing on the ancestor chain declares a scrolling overflow, so the sheet is clipped to the fold by `overflow:clip` and never by a scroll container',
    pinned.overflow);
  ok(pinned.docH <= pinned.vh + 1,
    'SF.2b ...and the DOCUMENT in the cover is one screen too: there is nothing below the fold to scroll into, so no wheel can move the page',
    `document ${pinned.docH}px of ${pinned.vh}px`);

  const sfAtP = async (f, cover) => {
    await cdp.eval(cover ? `window.__ad.cover()` : GATE_P(f));
    // the plates are written on the module's own frame: wait for two of them, then read
    await cdp.eval('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(1))))');
    await sleep(90);
    return cdp.eval(`(() => { const h = document.getElementById('hero');
      const p = getComputedStyle(document.getElementById('gateStage')).getPropertyValue('--gate-p').trim();
      const mr = t => t === 'none' ? new DOMMatrix() : new DOMMatrix(t);
      const plates = [...document.querySelectorAll('.index-panel')].map(n => {
        const o = mr(getComputedStyle(n).transform);
        const i = mr(getComputedStyle(n.querySelector('.ip-inner')).transform);
        return { sx: +o.a.toFixed(4), sy: +o.d.toFixed(4), ix: +i.a.toFixed(4), iy: +i.d.toFixed(4) }; });
      return { mode: window.__ad.mode(),
        // THE STAGE, not #hero: the sheet carries a live skew while it is travelling, and a skew
        // inflates the transformed bounds by a couple of pixels. The stage is the box that must not move.
        pinTop: Math.round(document.getElementById('gateStage').getBoundingClientRect().top),
        heroInStage: h.offsetTop, plates: plates,
        p: p === '' ? null : +p, y: Math.round(window.scrollY) }; })()`);
  };
  const s0 = await sfAtP(0, true);
  const sMid = await sfAtP(0.5);
  const sEnd = await sfAtP(1);
  ok(s0.pinTop === 0 && sMid.pinTop === 0 && sEnd.pinTop === 0
    && s0.heroInStage === 0 && sMid.heroInStage === 0 && sEnd.heroInStage === 0,
    'SF.3  the screen does not move: the stage sits at y 0 at the cover, half-way through the morph and at the contents, with the sheet on its own origin — the four plates are the only thing that travels',
    `stage tops ${s0.pinTop}/${sMid.pinTop}/${sEnd.pinTop}, hero offset ${s0.heroInStage}/${sMid.heroInStage}/${sEnd.heroInStage}`);
  ok(s0.p === 0 && sMid.p !== null && near(sMid.p, 0.5, 0.02) && sEnd.p === 1,
    'SF.4  ...and `--gate-p` IS the morph: 0 at the cover, 0.5 half-way, 1 at the contents — written from the module\'s own `state.p`, never read back off a scroll position',
    `${s0.p} → ${sMid.p} → ${sEnd.p} at y ${s0.y}/${sMid.y}/${sEnd.y}`);
  const inv = pts => pts.length === 4 && pts.every(t =>
    Math.abs(t.sx * t.ix - 1) < 0.003 && Math.abs(t.sy * t.iy - 1) < 0.003);
  ok(inv(sMid.plates) && sMid.plates.some(t => t.sy < 0.99)
    && sEnd.plates.every(t => near(t.sx, 1, 0.001) && near(t.sy, 1, 0.001)) && inv(sEnd.plates),
    'SF.5  ...and the four plates ARE that number: each scaled from its own block toward its own quarter with 1/the same scale on the type, so the product is 1 at the middle and at the end',
    `mid ${sMid.plates.map(t => t.sx + 'x' + t.sy + '·' + t.ix + 'x' + t.iy).join(' / ')}`);
  ok(s0.mode === 'cover' && sMid.mode === 'index' && sEnd.mode === 'index',
    'SF.6  and the mode is the module\'s own state, never a position: `cover` at 0 and `index` at every point inside the morph and at its end — a scroll offset cannot change it at all now',
    `${s0.mode} / ${sMid.mode} / ${sEnd.mode}`);
  const beyond = await cdp.eval(`(() => { document.documentElement.scrollTop = 4000;
    return Math.round(document.documentElement.scrollTop); })()`);
  await sleep(220);
  const atMax = await settles(`window.__ad.mode()`, v => !!v);
  ok(beyond === 0 && atMax !== 'view',
    'SF.7  and there is no scroll to reach the end of: the document is one screen in both gate states, so a forced offset is discarded and no position can ever be a view',
    `scrollTop ${beyond} (asked 4000), mode ${atMax}`);
  await enterCover();

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP SG — ONE PLACE IS THE PAGE (no state leaks into another)
  // ═══════════════════════════════════════════════════════════════════════════
  group('STEP SG — A VIEW IS ONE PLACE, AND NOTHING ELSE IS IN THE DOCUMENT');
  await enterView('work');
  const iso = await cdp.eval(`(() => {
    const vs = [...document.querySelectorAll('[data-view]')];
    const seen = vs.filter(v => getComputedStyle(v).display !== 'none');
    const w = document.getElementById('work'), f = document.querySelector('.footer');
    const g = document.getElementById('gate'), b = document.getElementById('broadsheet');
    const fr = f.getBoundingClientRect();
    return { laid: seen.map(v => v.dataset.view).join(), n: seen.length,
      gateGone: getComputedStyle(g).display === 'none',
      docH: document.documentElement.scrollHeight,
      sum: Math.round(b.getBoundingClientRect().height + fr.height),
      docEnd: Math.round(fr.bottom + window.scrollY),
      bsH: Math.round(b.getBoundingClientRect().height), workH: Math.round(w.getBoundingClientRect().height),
      footerH: Math.round(fr.height),
      inert: vs.filter(v => v.hasAttribute('inert')).map(v => v.dataset.view).join(),
      padTop: Math.round(parseFloat(getComputedStyle(w).paddingTop)),
      headH: Math.round(document.getElementById('siteNav').getBoundingClientRect().bottom) };
  })()`);
  ok(iso.n === 1 && iso.laid === 'work' && iso.gateGone,
    'SG.1  a view lays out exactly ONE place, and the 250vh fold is not rendered above it',
    `${iso.n} laid out (${iso.laid}), gate gone ${iso.gateGone}`);
  ok(iso.inert === 'who,magazine,reach',
    'SG.2  ...the other three are `inert` — out of the tab ring and the accessibility tree, not merely unseen',
    iso.inert || '(none)');
  ok(near(iso.docH, iso.docEnd, 2) && near(iso.bsH, iso.workH, 1),
    'SG.3  and the DOCUMENT ends on the last pixel of that one place plus the footer: no hidden travel, no stacked broadsheet behind it',
    `document ${iso.docH}, last pixel ${iso.docEnd} (${iso.bsH} + ${iso.footerH})`);
  ok(iso.padTop >= iso.headH - 1,
    'SG.4  ...whose first line clears the fixed bar — the section reserves `--head-h` itself instead of being scrolled under it',
    `padding-top ${iso.padTop} vs head bottom ${iso.headH}`);

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP SH — THE FLOOD LEAVES THE THING YOU PRESSED
  // ═══════════════════════════════════════════════════════════════════════════
  group('STEP SH — THE FLOOD HAS AN ORIGIN, AND IT IS THE BLOCK');
  ok(/Flip\.fit\(floodEl, proxyEl, \{ scale: true, duration: 0\.45/.test(jsText)
    && /visibility: 'visible', opacity: 1, transformOrigin: '0 0',/.test(jsText),
    'SH.1  the plane is seeded to the pressed block rect and Flip-fit to the viewport — the ink leaves the door instead of rising from the page edge',
    'Flip.fit(floodEl, proxyEl)');
  ok(/clearProps: 'all'/.test(jsText),
    'SH.2  ...and handed back to the stylesheet afterwards, so the next flood starts from a full-viewport box and not the last route leftovers');
  await enterCover();
  const prox = await cdp.eval(`(() => { const p = document.getElementById('floodProxy');
    const r = p.getBoundingClientRect(), cs = getComputedStyle(p);
    return { w: Math.round(r.width), h: Math.round(r.height),
      cw: document.documentElement.clientWidth, vh: window.innerHeight,
      vis: cs.visibility, z: +cs.zIndex, pe: cs.pointerEvents, bg: cs.backgroundImage }; })()`);
  ok(prox.w === prox.cw && prox.h === prox.vh && prox.vis === 'hidden' && prox.pe === 'none'
    && prox.z === 641 && prox.bg === 'none',
    'SH.3  the destination is a real full-client box that paints nothing, takes nothing, and sits one layer above the plane it describes',
    `${prox.w}×${prox.h} of ${prox.cw}×${prox.vh} at z ${prox.z}, ${prox.vis}, bg ${prox.bg}`);

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP SI — THE PULL-UP IS A DRAWER, AND ITS THRESHOLD IS A DISTANCE
  // ═══════════════════════════════════════════════════════════════════════════
  group('STEP SI — THE PULL-UP DRAWS ITSELF FROM THE THUMB, AND COMMITS ON DISTANCE');
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
  await enterView('reach');
  await cdp.eval('window.scrollTo({top: document.documentElement.scrollHeight, behavior:"instant"})');
  await sleep(320);
  const pullAt = async (fromY, toY) => {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 195, y: fromY }] });
    await sleep(30);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 195, y: toY }] });
    await sleep(60);
    const s = await cdp.eval(`(() => { const p = document.getElementById('pullPeek');
      const v = p.style.getPropertyValue('--pull');
      return { pull: v === '' ? null : +v, prompt: p.getAttribute('data-prompt'),
        live: p.hasAttribute('data-live'), mode: window.__ad.mode() }; })()`);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await sleep(60);
    return s;
  };
  const short = await pullAt(700, 640);          // 60px of thumb: a third of the way, no commit
  ok(short.pull !== null && near(short.pull, 0.32, 0.04) && short.prompt === 'rest' && short.mode === 'view',
    'SI.1  60px of thumb moves the drawer about a third of the way through a rubber band — and opens nothing',
    `--pull ${short.pull} (drawer ${Math.round((short.pull || 0) * 100)}%), prompt "${short.prompt}", mode ${short.mode}`);
  const half = await pullAt(700, 635);           // 65px ≥ 0.55 x 110: the words change first
  ok(half.prompt === 'armed' && half.mode === 'view',
    'SI.2  ...past 55% of the commit distance the WORDS have already said "release", while the door is still shut',
    `prompt "${half.prompt}" at ${half.pull}`);
  const gone = await cdp.eval(`(() => { const p = document.getElementById('pullPeek');
    return { pull: p.style.getPropertyValue('--pull'), prompt: p.getAttribute('data-prompt'),
      live: p.hasAttribute('data-live'), armed: p.hasAttribute('data-armed') }; })()`);
  ok(gone.pull === '' && gone.prompt === null && !gone.live && gone.armed,
    'SI.3  and a finger that lifts early puts the drawer back, leaving the hint armed — an unfinished gesture is not a door',
    `pull "${gone.pull}", prompt ${gone.prompt}, armed ${gone.armed}`);
  await pullAt(700, 570);                        // 130px: a commit
  const committed = await settles(`window.__ad.mode()`, v => v === 'index');
  ok(committed === 'index',
    'SI.4  130px of thumb commits: the index, from the gesture, with no button anywhere in the path',
    `mode ${committed}`);
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: false });
  await enterCover();

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP SJ — THE BROWSER DOES NOT FIGHT THE MACHINE FOR THE SCROLL POSITION
  // ═══════════════════════════════════════════════════════════════════════════
  group('STEP SJ — SCROLL RESTORATION IS MANUAL, BECAUSE THE STATES ARE HEIGHTS');
  ok(await cdp.eval(`history.scrollRestoration`) === 'manual',
    'SJ.1  `history.scrollRestoration` is `manual` — the module is the only writer of a scroll position, so a restore can never land in a document of the wrong length');
  ok(/<script>try\{history\.scrollRestoration='manual';\}catch\(e\)\{\}<\/script>/.test(html)
    && html.indexOf('scrollRestoration') < html.indexOf('<style>'),
    'SJ.2  ...and it is set inline in the head, before the stylesheet and long before the first paint');

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP SK — ONE TICK IS ONE DECISION (and a thumb is not a wheel)
  //
  // Since Pass 2D the gate has no scroll travel at all: it is exactly one screen, and the move
  // between the cover and the contents is a decision the module performs itself. `Observer` gives
  // the module the two things a scroll handler cannot: WHICH WAY a gesture went, and whether the
  // event behind it was a finger. What is measured here is that ONE notch commits, that the cooldown
  // swallows the rest of a throw, that the sign is flipped for a finger — the one direction a
  // wheel-driven suite cannot reach — and that a view is left entirely alone.
  // ═══════════════════════════════════════════════════════════════════════════
  group('STEP SK — ONE TICK IS ONE DECISION; A THUMB IS NOT A WHEEL');
  await enterCover();
  await sleep(700);            // a fresh intent, well clear of any cooldown a step above spent

  // 1 — the number the sheet reads, and the function that publishes it
  await cdp.eval(GATE_P(0.5));
  await cdp.eval('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(1))))');
  await sleep(120);
  const pos = await cdp.eval(`(() => { const h = document.getElementById('hero').offsetHeight;
    return { pub: window.__adGateP, fn: window.__ad.sheetPos(), px: window.__ad.sheetPos(h), h,
      shown: +window.__ad.progress(), mode: window.__ad.mode() }; })()`);
  ok(typeof pos.pub === 'number' && Math.abs(pos.pub - 0.5) < 0.01
    && pos.fn === pos.pub && Math.abs(pos.shown - pos.pub) <= 0.001
    && Math.abs(pos.px - pos.pub * pos.h) <= 1,
    'SK.1  `window.__adGateP` is written by `paint()` on every frame and `sheetPos()` returns that same number — one published position, not a second derivation the sheet could disagree with — while `sheetPos(heroH)` is that fraction in the PIXELS the sheet\'s depths were calibrated in',
    `published ${pos.pub}, sheetPos ${pos.fn}, pixels ${pos.px} of ${pos.h}, --gate-p ${pos.shown}, mode ${pos.mode}`);

  // 2 — the tag, and the digest it is pinned to
  const OBS_SRI = 'sha512-28pasLrvjfeQ4EOKQVk6Iihr5mAlO0XhAfbbSgmXT711p3e20uZQRPjcaWt7PXNaNmp9tI67S66K+l38/x8ZCQ==';
  const obsTag = (html.match(/<script[^>]*Observer\.min\.js[^>]*><\/script>/) || [''])[0];
  ok(obsTag.indexOf('https://cdnjs.cloudflare.com/ajax/libs/gsap/3.15.0/Observer.min.js') > 0
    && obsTag.indexOf('integrity="' + OBS_SRI + '"') > 0
    && /crossorigin="anonymous"/.test(obsTag) && /referrerpolicy="no-referrer"/.test(obsTag),
    'SK.2  Observer 3.15.0 is pinned to the digest of the bytes this page actually fetches — SHA-512 base64 recomputed from the file and cross-checked against cdnjs\'s own published SRI, not a copied snippet',
    obsTag ? obsTag.slice(0, 86) + '…' : '(no Observer tag)');
  ok(html.indexOf('Observer.min.js') > html.indexOf('gsap.min.js')
    && html.indexOf('Observer.min.js') < html.indexOf('<script src="js/main.js">'),
    'SK.3  ...and it arrives after the core it registers with and before the module that feature-detects it');

  // 3 — the layer, in the source
  ok(/if \(window\.gsap && window\.Observer\)\{/.test(jsText)
    && /window\.gsap\.registerPlugin\(window\.Observer\)/.test(jsText)
    && /target: gate,[\s\S]{0,220}?type: 'wheel,touch',/.test(jsText)
    && /preventDefault: true,/.test(jsText) && /allowClicks: true,/.test(jsText)
    && /tolerance: 8,/.test(jsText) && /wheelSpeed: 1,/.test(jsText)
    && !/type: '[^']*pointer/.test(jsText),
    'SK.4  the intent layer is ONE feature-detected Observer on the GATE itself, registered with the core, CLAIMING its own gestures (`preventDefault:true`) while still letting a press through (`allowClicks:true`), scoped to wheel and touch — no `pointer`, so the stickers keep the stream Draggable already owns');
  const flip = jsText.match(/const isTouch = !!\(ev && \(\(ev\.type && ev\.type\.indexOf\('touch'\) === 0\) \|\| ev\.pointerType === 'touch'\)\)/g) || [];
  ok(flip.length === 2
    && /onDown\(self\)\{[\s\S]{0,400}?gateIntent\(isTouch \? -1 : 1\)/.test(jsText)
    && /onUp\(self\)\{[\s\S]{0,400}?gateIntent\(isTouch \? 1 : -1\)/.test(jsText),
    'SK.5  the touch test is written once per handler and the sign is FLIPPED for a finger: wheel-down and thumb-up both call `gateIntent(1)` → `commit(\'index\')`, wheel-up and thumb-down call `gateIntent(-1)` → `commit(\'cover\')` — and a finger is a `touch*` event OR a pointer whose `pointerType` says so, because Observer wires "touch" through the pointer stream on a device that has one',
    `${flip.length} isTouch test(s)`);
  ok(/const INTENT_COOLDOWN = 650;/.test(jsText)
    && /function gateIntent\(d\)\{[\s\S]{0,900}?mode === 'view' \|\| state\.transitioning \|\| busy\(\)/.test(jsText)
    && /if \(mode === to\) return;/.test(jsText)
    && /if \(now - lastIntent < INTENT_COOLDOWN\) return;/.test(jsText)
    && /commit\(to\);/.test(jsText)
    && /const state = \{ p: 0, transitioning: false, token: 0, proxy: \{ p: 0 \} \};/.test(jsText)
    && !/FLICK_MOVES|FLICK_MS|fFrom/.test(jsText),
    'SK.6  ...and ONE tick is the whole decision: no burst to assemble, because there is no half-open index left to protect — `gateIntent` refuses a view, a commit in flight and an open overlay, drops a direction the gate is already in, and spends one 650ms cooldown so a trackpad\'s inertia cannot open and close the contents on one throw', `COOLDOWN 650, one tick`);

  // 4 — the plugin that shipped, not one that merely appears in the markup
  const obsLib = await cdp.eval(`({ lib: typeof window.Observer,
    make: typeof (window.Observer && window.Observer.create),
    v: (window.Observer && window.Observer.version) || '',
    gsapV: (window.gsap && window.gsap.version) || '' })`);
  ok(obsLib.lib === 'function' && obsLib.make === 'function'
    && obsLib.v === '3.15.0' && obsLib.gsapV === '3.15.0',
    'SK.7  the plugin really arrived and is the version the tag pins, beside the core it registered with — so the layer under test is the layer that shipped',
    `Observer ${obsLib.v}, gsap ${obsLib.gsapV}`);

  // 5 — ONE NOTCH COMMITS
  await enterCover();
  await sleep(700);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 720, y: 450, deltaX: 0, deltaY: 120 });
  await sleep(260);
  const commitAt = await cdp.eval(`({ mode: window.__ad.mode(), p: window.__adGateP,
    moving: window.__ad.gate.state.transitioning })`);
  ok(commitAt.mode === 'index' && commitAt.moving && commitAt.p < 0.9,
    'SK.8  ONE notch at the poster opens the contents — and `data-mode` commits on the FIRST frame while the plates are still travelling, which is the whole difference between a decision and a scroll',
    `mode ${commitAt.mode}, p ${commitAt.p}, transitioning ${commitAt.moving}`);

  // 6 — THE REST OF A THROW IS NOT A SECOND DECISION
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 720, y: 450, deltaX: 0, deltaY: -120 });
  await sleep(160);
  const inertia = await cdp.eval(`({ mode: window.__ad.mode(), p: window.__adGateP,
    y: Math.round(window.scrollY) })`);
  ok(inertia.mode === 'index' && inertia.p >= commitAt.p && inertia.y === 0,
    'SK.9  the tick that follows a throw is INERTIA, not a second decision: while the plates are crossing, the flight owns the screen and the opposite wheel is refused — so one flick cannot open and close the contents on its own momentum',
    `p ${commitAt.p} → ${inertia.p}, mode ${inertia.mode}, y ${inertia.y}`);

  const notch = await settles(`(() => ({ y: Math.round(window.scrollY), p: window.__adGateP,
    mode: window.__ad.mode(),
    revealed: document.getElementById('indexPanels').hasAttribute('data-revealed') }))()`,
    v => v.mode === 'index' && v.revealed && v.p === 1, 60, 60);
  ok(notch.mode === 'index' && notch.revealed && notch.y === 0 && notch.p === 1,
    'SK.9b ...and the flight finishes where every other road does: the four plates up, `--gateP` 1, `data-revealed` written, and the page at y 0 — the gate has no other position to be at',
    `mode ${notch.mode}, revealed ${notch.revealed}, y ${notch.y}, p ${notch.p}`);

  // 7 — the same door backwards, one coalesced tick later
  await sleep(700);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 720, y: 450, deltaX: 0, deltaY: -120 });
  const flickOut = await settles(`(() => ({ mode: window.__ad.mode(), y: Math.round(window.scrollY),
    p: window.__adGateP, fold: document.querySelector('.metroboard').hasAttribute('data-fold'),
    board: getComputedStyle(document.querySelector('.metroboard')).visibility }))()`,
    v => v.mode === 'cover' && v.p === 0 && v.board === 'visible', 60, 60);
  ok(flickOut.mode === 'cover' && flickOut.y === 0 && flickOut.p === 0
    && flickOut.board === 'visible' && !flickOut.fold,
    'SK.10 ...and it is the same door backwards: one wheel turned up plays the same 0.85s from the same machine, the plates fold back into the four blocks and the docked bar is the contents again — at y 0, which is the only y the gate has',
    `mode ${flickOut.mode} at y ${flickOut.y}, p ${flickOut.p}, board ${flickOut.board}`);

  // 8 — a place keeps its own scroll
  await sleep(1000);
  await enterView('work');
  for (let i = 0; i < 4; i++){
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 720, y: 450, deltaX: 0, deltaY: 240 });
    await sleep(40);
  }
  await sleep(700);
  const inView = await cdp.eval(`({ mode: window.__ad.mode(), place: window.__ad.place(),
    y: Math.round(window.scrollY) })`);
  ok(inView.mode === 'view' && inView.place === 'work' && inView.y > 0,
    'SK.11 A VIEW IS NOT THE GATE: the same burst inside a place moves the section and nothing else — no state change, no flood, exactly the scroll the reader asked for',
    `${inView.mode}/${inView.place} at y ${inView.y}`);

  // 9 — A THUMB IS NOT A WHEEL (the sign flip, live)
  //
  // Observer decides ONCE, as the plugin loads, whether this device has a finger at all
  // (`Observer.isTouch`) and therefore which stream it listens on — and a desktop Chrome, even one
  // being driven by a finger, has neither (`isTouch` 0, `pointerdown,…`). Waving synthetic touches at
  // that build would exercise nothing but the native scroll, so the page is re-loaded UNDER the
  // emulation: only then is the touch path wired, and only then does this step measure the layer
  // that shipped.
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
  const reloaded = cdp.once('Page.loadEventFired');
  await cdp.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/index.html` });
  await reloaded;
  const finger = await settles(`(() => (window.Observer && window.Observer.isTouch ? {
    touch: window.Observer.isTouch, types: window.Observer.eventTypes.join(','),
    loaded: !!(window.__ad && window.__ad.mode) } : null))()`,
    v => v && v.loaded, 80, 100);
  await sleep(300);
  // one thumb, straight up the poster and straight back down it — the same gesture reversed, so the
  // two directions of the mapping are measured and not just the one a mouse can make
  const thumbSwipe = async (fromY, toY) => {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 195, y: fromY }] });
    await sleep(24);
    const step = (toY - fromY) / 8;
    for (let i = 1; i <= 8; i++){
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 195, y: Math.round(fromY + step * i) }] });
      await sleep(24);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  await enterCover();
  await sleep(700);
  await thumbSwipe(700, 380);
  const thumb = await settles(`(() => ({ mode: window.__ad.mode(),
    revealed: document.getElementById('indexPanels').hasAttribute('data-revealed'),
    p: window.__adGateP, y: Math.round(window.scrollY) }))()`,
    v => v.mode === 'index' && v.revealed, 40, 60);
  ok(finger && finger.touch > 0 && /touchstart/.test(finger.types)
    && thumb.mode === 'index' && thumb.revealed && thumb.y === 0 && thumb.p === 1,
    'SK.12 a thumb thrown UP the poster is the same request as a wheel turned down — the sign is flipped for a finger, and the reader lands on the contents without a pixel of scroll. This is the direction a wheel-driven suite cannot see, which is why it is measured with a touch — and on a build LOADED with a finger, since that is the only build Observer wires one into',
    `isTouch ${finger && finger.touch} (${finger && finger.types}), mode ${thumb.mode}, revealed ${thumb.revealed}, p ${thumb.p}, y ${thumb.y}`);
  await sleep(700);
  await thumbSwipe(380, 700);
  const thumbBack = await settles(`({ mode: window.__ad.mode(), p: window.__adGateP })`,
    v => v.mode === 'cover', 40, 60);
  ok(thumbBack.mode === 'cover' && thumbBack.p === 0,
    'SK.12b ...and a thumb pulled DOWN at the contents closes them: the two directions are one mapping (`isTouch` flips the sign in both handlers), not a special case for whichever one the mouse happens to be able to make',
    `mode ${thumbBack.mode}, p ${thumbBack.p}`);
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: false });
  await enterCover();

  group('RESULT');
  console.log(`   ${pass} passed, ${failures.length} failed`);
  if (failures.length) failures.forEach(f => console.log('   · ' + f));




} catch (err) {
  console.error('\nHARNESS ERROR: ' + (err && err.stack || err));
  failures.push('harness threw: ' + (err && err.message || err));
} finally {
  try { ws?.ws.close(); } catch { /* already gone */ }
  try { chrome.kill(); } catch { /* already gone */ }
  server.close();
  await sleep(250);
  try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch { /* chrome still holds it */ }
}

process.exit(failures.length ? 1 : 0);


