// ─────────────────────────────────────────────────────────────────────────────
// tests/verify.mjs — the consolidated acceptance suite.
//
// Replaces a 983-assertion harness whose majority were source greps: `.test(cssText)`,
// `.test(html)`, exact pixel constants and one-shot snapshots. Those measured the FILE, so a
// reflowed comment or a renamed rule failed a build in which nothing had actually broken.
//
// This suite measures the PAGE instead, and only where a regression would be a regression of
// meaning: the gate is one screen, the cover is one screen, the index tiles it, one input is one
// decision, a view is exclusive, a route leaves no scroll behind, motion-off is stilled, and the
// four places stay reachable from every surface. Numbers that appear here are relations the same
// run measured on both sides (hero + board == gate), never a constant copied out of the design.
//
//   node tests/verify.mjs                (or: --shots)
//
// Exit 0 = green. Every assertion prints one indented line; failures print their evidence.
// ─────────────────────────────────────────────────────────────────────────────
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const PORT = Number(process.env.PORTFOLIO_PORT || 8777);
const DBG  = Number(process.env.PORTFOLIO_DBG || 9355);
const CHROME = process.env.PORTFOLIO_CHROME
  || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const RUN = Date.now();
const RUNDIR = path.join(ROOT, '.cdp-run');
const PROFILE = path.join(RUNDIR, 'profile-' + RUN);
const SHOTS = process.argv.includes('--shots');
const SHOTDIR = path.join(RUNDIR, 'shots', 'inv-' + RUN);

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2',
  '.ttf': 'font/ttf', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8',
};

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── assertions ───────────────────────────────────────────────────────────────
let pass = 0; const failures = [];
const group = name => console.log('\n' + name);
function ok(cond, label, detail) {
  if (cond) { pass++; console.log(`   ok    ${label}`); return; }
  failures.push(label + (detail ? ` — ${detail}` : ''));
  console.log(`   FAIL  ${label}${detail ? `  [${detail}]` : ''}`);
}
const near = (a, b, tol = 1) => Math.abs(a - b) <= tol;
const note = s => console.log('   note  ' + s);
/* A transition is not a state: a box arriving on a CSS transition reports whichever frame the
   machine happened to be on, so anything measured mid-arrival is asked again until it settles. */
async function settles(expr, pred, tries = 40, step = 60) {
  let last = null;
  for (let i = 0; i < tries; i++) {
    last = await ws.eval(expr);
    if (pred(last)) return last;
    await sleep(step);
  }
  return last;
}
/* THE THREE DOORS. A view is a place, not a scroll position, so every measurement inside a
   section goes through the same call a press makes. */
async function enterCover() {
  await ws.eval(`window.__ad && window.__ad.cover()`);
  await settles(`window.__ad.mode()`, v => v === 'cover');
  await sleep(220);
}
async function enterIndex() {
  await ws.eval(`window.__ad && window.__ad.index()`);
  await settles(`window.__ad.mode()`, v => v === 'index');
  await sleep(260);
}
async function enterView(id) {
  await ws.eval(`window.__ad && window.__ad.view(${JSON.stringify(id || 'who')})`);
  await settles(`window.__ad.mode()`, v => v === 'view');
  await sleep(260);
}
const resetHash = () => ws.eval(`history.replaceState(null, '', location.pathname); 1`);
/* NAVIGATION WITHOUT THE EVENT. `Page.loadEventFired` is a race with the socket: if the target is
   already committing a document when the harness subscribes, the event it is waiting for has been
   and gone. Polling `readyState` on the target it is actually driving asks the same question
   instead of waiting to be told, and it cannot miss. */
async function navigate(url) {
  await ws.send('Page.navigate', { url });
  for (let i = 0; i < 150; i++) {
    try {
      if (await ws.eval('document.readyState + "|" + location.href') === 'complete|' + url) break;
    } catch { /* between documents: the old context is gone, the new one is not up */ }
    await sleep(100);
  }
  await sleep(300);
}

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

// ── the source, read once ────────────────────────────────────────────────────
const html = await fsp.readFile(path.join(ROOT, 'index.html'), 'utf8');
/* TWO <style> BLOCKS, ONE SHEET. The page splits its CSS (structure, then the gate), so the rules
   are read from every block and joined — reading only the first silently loses half the contract. */
const cssText = [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)]
  .map(m => m[1]).join('\n').replace(/\/\*[\s\S]*?\*\//g, '');
const jsText = await fsp.readFile(path.join(ROOT, 'js', 'main.js'), 'utf8');
const ledgerText = await fsp.readFile(path.join(ROOT, 'js', 'ledger.js'), 'utf8');
/* `String.match` answers 1 for a non-global regex, however many times it matches — every count in
   this file is a census, so the flag is added rather than trusted to the caller. */
const count = (t, re) => (t.match(re.global ? re : new RegExp(re.source, re.flags + 'g')) || []).length;

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
  ws = await CDP.open(target.webSocketDebuggerUrl);

  await ws.send('Page.enable');
  await ws.send('Runtime.enable');
  await ws.send('Log.enable');
  await ws.send('Network.enable');
  await ws.send('Page.setLifecycleEventsEnabled', { enabled: true });

  const consoleErrors = [], netFails = [];
  ws.on('Runtime.exceptionThrown', p => consoleErrors.push('exception: ' + (p.exceptionDetails?.exception?.description || p.exceptionDetails?.text)));
  ws.on('Runtime.consoleAPICalled', p => {
    if (p.type === 'error' || p.type === 'assert') consoleErrors.push((p.args || []).map(a => a.value ?? a.description ?? a.type).join(' '));
  });
  ws.on('Log.entryAdded', p => { if (p.entry?.level === 'error') consoleErrors.push(p.entry.text); });
  ws.on('Network.responseReceived', p => {
    if (p.response?.status >= 400) netFails.push(p.response.status + ' ' + p.response.url.split('/').pop());
  });

  await navigate(`http://127.0.0.1:${PORT}/index.html`);
  await ws.eval('document.fonts.ready.then(() => document.fonts.status)');
  await sleep(500);
  // ═══════════════════════════════════════════════════════════════════════════
  // 1 — THE CONTRACT: what the page promises, read from source and from the live DOM
  // ═══════════════════════════════════════════════════════════════════════════
  group('1 — THE CONTRACT (source order, one object per job)');

  const gateAt = html.indexOf('class="gate" id="gate"');
  const heroAt = html.indexOf('<section id="hero"');
  const boardAt = html.indexOf('<nav class="metroboard"');
  ok(gateAt > 0 && heroAt > gateAt && boardAt > heroAt,
    '1.1  the gate WRAPS the sheet and the board — one block on the page, one stage in the DOM',
    `gate ${gateAt} < hero ${heroAt} < board ${boardAt}`);

  const panels = count(html, /class="index-panel"/g);
  ok(panels === 4
    && count(html, /class="ip-frame"/g) === 4
    && count(html, /class="ip-inner"/g) === 4
    && count(html, /class="ip-seam ip-seam-v"/g) === 1
    && count(html, /class="ip-seam ip-seam-h"/g) === 1
    && count(html, /id="flood"/g) === 1
    && count(html, /id="pullPeek"/g) === 1
    && count(html, /id="headIndex"/g) === 1
    && count(html, /data-back-index/g) === 4,
    '1.2  the index is four plates (a frame and a type box each), two register marks, one flood, one pull-up, one ← INDEX, and a way back from every place',
    `${panels} plates / ${count(html, /data-back-index/g)} back doors`);

  ok(count(html, /data-view="(?:who|work|magazine|reach)"/g) === 4
    && !/data-view="hero"/.test(html)
    && !/data-view="(?:who|work|magazine|reach)"[^>]*\shidden/.test(html),
    '1.3  four places carry `data-view` and the sheet does not; with no script nothing is hidden — the page is a page before it is a machine');

  ok(!/gate-plane/.test(html) && !/gate-plane/.test(cssText) && !/gate-plane/.test(jsText),
    '1.4  the four crossfading `.gate-plane` inks are gone from markup, stylesheet AND script — the index is one object, not two');

  ok(!/--index-h/.test(cssText) && !/--bleach/.test(cssText),
    '1.5  the retired travel tokens (`--index-h`, `--bleach`) are gone — a gate with no travel has no height to remember');

  ok(/\.metroboard\[data-fold\]\{visibility:hidden;pointer-events:none;\}/.test(cssText)
    && !/html\[data-mode="index"\] \.metroboard\[data-fold\]/.test(cssText)
    && /\.index-panel\{[^}]*transform-origin:0 0/.test(cssText)
    && /\.ip-inner\{[^}]*transform-origin:0 0/.test(cssText),
    '1.6  the docked bar folds by its own attribute, and every plate grows from its OWN top-left corner — the fold belongs to the morph, not to the mode');

  ok(/1 \/ sX/.test(jsText) && /MORPH_START\s*=\s*0\.30/.test(jsText) && /MORPH_END\s*=\s*0\.78/.test(jsText),
    '1.7  the type box is counter-scaled by the plate (`1 / sX`), inside one morph with published bounds',
    'MORPH 0.30 → 0.78');

  ok(count(cssText, /transition:[^;}]*\b(?:width|height)\b/) === 0,
    '1.8  no transition animates width or height — the fold moves on transform and opacity, so a 60fps morph never asks for layout');

  ok(/html\[data-mode="cover"\] \.site-head,\s*\nhtml\[data-mode="index"\] \.site-head\{visibility:hidden;pointer-events:none;\}/.test(cssText)
    && /html\[data-mode="cover"\] \.skip-link,\s*\nhtml\[data-mode="index"\] \.skip-link\{display:none;\}/.test(cssText),
    '1.9  the head and the skip link are withdrawn in EXACTLY the two states with no page under them — by `visibility`, so their boxes can still be measured');

  ok(/ad:layout/.test(ledgerText) && count(jsText, /ad:layout/) >= 2,
    '1.10 a new row on the wall changes the page height and its readers are told, once, by name',
    `${count(jsText, /ad:layout/)} references in main.js`);

  group('2 — BOOT (the machine is wired, the room is quiet)');
  ok(consoleErrors.length === 0, '2.1  no console errors and no uncaught exceptions at boot',
    consoleErrors.slice(0, 3).join(' | '));
  ok(netFails.length === 0, '2.2  no request failed — every font, image and script the page asks for arrives',
    netFails.slice(0, 4).join(' | '));
  const doors = await ws.eval(`window.__ad ? Object.keys(window.__ad).sort() : []`);
  const NEEDED = ['cover', 'gate', 'index', 'measure', 'mode', 'place', 'progress', 'revealed', 'scrollTo', 'sheetPos', 'view'];
  ok(NEEDED.every(k => doors.includes(k)),
    '2.3  the address module exposes the doors the tests (and the deep links) use, and one machine for the gate',
    doors.join(','));
  const rest = await ws.eval(`({ sr: history.scrollRestoration, ad: !!window.__ad, gsap: !!window.gsap, obs: !!window.Observer })`);
  ok(rest.sr === 'manual' && rest.ad && rest.gsap && rest.obs,
    '2.4  scroll restoration is MANUAL — the states are heights, so a browser restoring a pixel would restore a screen that no longer exists');
  const nest = await ws.eval(`(() => { const g = document.getElementById('gate');
    return { heroInGate: g.contains(document.getElementById('hero')),
      boardInGate: g.contains(document.querySelector('.metroboard')),
      placesInside: ['who','work','magazine','reach'].filter(id => g.contains(document.getElementById(id))).length,
      placesBeside: ['who','work','magazine','reach'].filter(id => {
        const e = document.getElementById(id);
        return e && e.hasAttribute('data-view') && !g.contains(e);
      }).length }; })()`);
  ok(nest.heroInGate && nest.boardInGate && nest.placesInside === 0 && nest.placesBeside === 4,
    '2.5  the gate holds the sheet and the board and nothing else; the four places stand BESIDE it, each a whole document the same machine swaps in — a screen with a poster on it, not a stack with the pages rolled up inside',
    `${nest.placesBeside}/4 places beside the gate`);
  // ═══════════════════════════════════════════════════════════════════════════
  // 3 — THE COVER: one screen, and the sheet is the whole of it
  // ═══════════════════════════════════════════════════════════════════════════
  group('3 — THE COVER IS ONE SCREEN');
  await enterCover();
  const SCREEN = `(() => { const g = document.getElementById('gate'), h = document.getElementById('hero');
    const b = document.querySelector('.metroboard'), head = document.querySelector('.site-head');
    const cs = getComputedStyle;
    return { mode: window.__ad.mode(), place: window.__ad.place(), htmlMode: document.documentElement.dataset.mode,
      gateH: Math.round(g.getBoundingClientRect().height), heroH: h.getBoundingClientRect().height,
      boardH: b.getBoundingClientRect().height, innerH: window.innerHeight,
      docH: Math.round(document.documentElement.scrollHeight), y: Math.round(window.scrollY), hash: location.hash,
      headVis: cs(head).visibility, headPe: cs(head).pointerEvents,
      fold: b.hasAttribute('data-fold'), boardVis: cs(b).visibility, boardPe: cs(b).pointerEvents,
      revealed: document.getElementById('indexPanels').hasAttribute('data-revealed'),
      p: window.__adGateP, sheet: +(+window.__ad.sheetPos()).toFixed(3),
      overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      plates: document.querySelectorAll('.index-panel').length }; })()`;
  const cov = await ws.eval(SCREEN);
  ok(cov.mode === 'cover' && cov.htmlMode === 'cover' && cov.place === '',
    '3.1  the page opens on the cover, and the document says so on `html[data-mode]` for CSS to read',
    `${cov.mode} / ${cov.htmlMode}`);
  ok(cov.headVis === 'hidden' && cov.headPe === 'none',
    '3.2  the head is not there — and not hoverable either — because the cover has no page under it to navigate');
  ok(cov.y === 0 && cov.hash === '',
    '3.3  the cover is at y 0 with no fragment: the poster is the address, not a scroll position',
    `y ${cov.y}, hash "${cov.hash}"`);
  ok(near(cov.gateH, cov.innerH, 1),
    '3.4  the gate is EXACTLY one screen tall — 100svh, not 100vh, so a phone browser that grows a toolbar does not move it',
    `gate ${cov.gateH} vs screen ${cov.innerH}`);
  ok(near(cov.heroH + cov.boardH, cov.gateH, 2),
    '3.5  the sheet and the docked bar are the whole gate — the two halves add up to the screen, with no third band',
    `${cov.heroH.toFixed(1)} + ${cov.boardH} = ${(cov.heroH + cov.boardH).toFixed(1)} of ${cov.gateH}`);
  ok(near(cov.docH, cov.innerH, 1),
    '3.6  the document is one screen long: there is nowhere to scroll on the cover, which is why the gate had to own its own progress',
    `doc ${cov.docH} vs screen ${cov.innerH}`);
  ok(!cov.fold && cov.boardVis === 'visible' && cov.boardPe === 'auto',
    '3.7  the bar is docked and live — the four places are a row of blocks, not a menu that has to be opened');
  ok(!cov.revealed && cov.p === 0 && cov.sheet === 0,
    '3.8  the index is not revealed and the machine is at p 0 — the plates exist off-stage rather than at the end of a scroll',
    `revealed ${cov.revealed}, p ${cov.p}, sheet ${cov.sheet}`);
  ok(cov.overflowX === 0, '3.9  the cover does not scroll sideways at any width', `overflow ${cov.overflowX}px`);
  ok(cov.plates === 4, '3.10 four plates are one object reused by both states', `${cov.plates}/4`);
  // ═══════════════════════════════════════════════════════════════════════════
  // 4 — THE INDEX: the same screen, tiled by the four blocks, and nothing scrolls
  // ═══════════════════════════════════════════════════════════════════════════
  group('4 — THE INDEX TILES THE SCREEN');
  await enterIndex();
  const idx = await ws.eval(SCREEN);
  ok(idx.mode === 'index' && idx.htmlMode === 'index' && idx.revealed,
    '4.1  the index is a state, and the plates carry `data-revealed` — one attribute the CSS can hang the whole arrival on',
    `${idx.mode}, revealed ${idx.revealed}`);
  ok(idx.p === 1 && idx.sheet === 1,
    '4.2  the machine is at p 1 and the sheet is fully read — the index is the END of the gate, not a second page',
    `p ${idx.p}, sheet ${idx.sheet}`);
  ok(near(idx.docH, idx.innerH, 1),
    '4.3  the index is still one screen long — the contents cannot be scrolled away from, which is what makes them contents',
    `doc ${idx.docH} vs screen ${idx.innerH}`);
  ok(idx.y === 0, '4.4  and it is at y 0: reaching the contents costs no scroll', `y ${idx.y}`);
  ok(idx.fold && idx.boardVis === 'hidden' && idx.boardPe === 'none',
    '4.5  the docked bar folds away while the plates tile the screen — its blocks are still there, mapped onto the plates');
  ok(idx.headVis === 'hidden', '4.6  and the head goes with it: in the index the only door back is ← INDEX');
  const tiling = await ws.eval(`(() => { const rs = [...document.querySelectorAll('.index-panel')].map(e => e.getBoundingClientRect());
    const area = rs.reduce((s, r) => s + r.width * r.height, 0);
    return { area: Math.round(area), screen: window.innerWidth * window.innerHeight,
      origins: [...document.querySelectorAll('.index-panel')].map(e => getComputedStyle(e).transformOrigin) }; })()`);
  ok(near(tiling.area, tiling.screen, Math.round(tiling.screen * 0.005)),
    '4.7  the four plates TILE the screen exactly — no gaps, no overlap, no overflow to reveal the poster behind them',
    `${tiling.area} vs ${tiling.screen}`);
  ok(tiling.origins.every(o => o === '0px 0px'),
    '4.8  every plate scales from its own top-left corner, which is the corner of the block it grew out of',
    tiling.origins.join(' '));
  const ink = await ws.eval(`[...document.querySelectorAll('.index-panel')].map(e => getComputedStyle(e).backgroundColor)`);
  ok(ink.length === 4 && new Set(ink).size === 4,
    '4.9  four plates, four inks — the contents are the palette, not a list of links',
    ink.join(' '));
  const hashDirect = await ws.eval('location.hash');
  ok(hashDirect === '' || hashDirect === '#index',
    '4.10 `index()` is a state, not a route: calling it directly does not invent a URL the reader never asked for',
    `hash "${hashDirect}"`);
  ok((await ws.eval(`window.__ad.place()`)) === '',
    '4.11 the index is not a place — `place()` stays empty until a section is chosen');
  await enterCover();
  const back = await ws.eval(SCREEN);
  ok(back.mode === 'cover' && !back.fold && back.boardVis === 'visible' && back.p === 0,
    '4.12 and cover() undoes it whole: the fold clears, the bar is docked, and the machine returns to p 0',
    `${back.mode}, fold ${back.fold}, p ${back.p}`);
  // ═══════════════════════════════════════════════════════════════════════════
  // 5 — INTENT: one notch is one decision, and a flight owns the screen
  // ═══════════════════════════════════════════════════════════════════════════
  group('5 — INTENT (a wheel notch opens the gate; momentum does not)');
  const wheel = dy => ws.send('Input.dispatchMouseEvent', {
    type: 'mouseWheel', x: 720, y: 450, deltaX: 0, deltaY: dy,
  });
  const GATE_STATE = `({ mode: window.__ad.mode(), p: window.__adGateP, y: Math.round(window.scrollY),
    revealed: document.getElementById('indexPanels').hasAttribute('data-revealed'),
    fold: document.querySelector('.metroboard').hasAttribute('data-fold') })`;

  await enterCover();
  await sleep(800);
  await wheel(120);
  await sleep(90);
  const during = await ws.eval(GATE_STATE);
  await wheel(-120);
  await sleep(140);
  const countered = await ws.eval(GATE_STATE);
  const opened = await settles(GATE_STATE, v => v.mode === 'index' && v.p === 1, 60, 60);
  ok(opened.mode === 'index' && opened.revealed && opened.p === 1,
    '5.1  one wheel notch DOWN on the poster opens the contents — the gate reads the intent, not the distance',
    `mode ${opened.mode}, p ${opened.p}`);
  ok(opened.y === 0,
    '5.2  ...and it costs no scroll: the reader lands on the contents at y 0, where every other road lands',
    `y ${opened.y}`);
  ok(during.p > 0 && during.p < 1,
    '5.3  the crossing is a real interval the reader can interrupt — it is a flight with a middle, not a class that snaps',
    `p ${during.p} at 90ms`);
  ok(countered.mode === 'index',
    '5.3b the opposite notch INSIDE the flight is refused — while the plates are crossing, the flight owns the screen, so one flick cannot open and close the contents on its own momentum',
    `mode ${countered.mode} at 230ms`);

  await sleep(900);
  await wheel(-120);
  const closed = await settles(GATE_STATE, v => v.mode === 'cover' && v.p === 0, 60, 60);
  ok(closed.mode === 'cover' && closed.p === 0 && !closed.fold,
    '5.4  the same door backwards: one notch up plays the same flight from the same machine and the bar is docked again',
    `mode ${closed.mode}, p ${closed.p}`);

  await sleep(800);
  await wheel(120);
  await sleep(90);
  await wheel(120);
  const doubleTick = await settles(GATE_STATE, v => v.mode === 'index', 60, 60);
  ok(doubleTick.mode === 'index' && doubleTick.y === 0,
    '5.5  two ticks inside the cooldown are ONE decision — the second is eaten by the interval, so a nervous finger cannot double-step the gate',
    `mode ${doubleTick.mode}, y ${doubleTick.y}`);

  await enterView('work');
  for (let i = 0; i < 4; i++) { await wheel(240); await sleep(40); }
  await sleep(700);
  const inView = await ws.eval(`({ mode: window.__ad.mode(), place: window.__ad.place(), y: Math.round(window.scrollY) })`);
  ok(inView.mode === 'view' && inView.place === 'work' && inView.y > 0,
    '5.6  A VIEW IS NOT THE GATE: the same burst inside a place moves the section and nothing else — no state change, no flood',
    `${inView.mode}/${inView.place} at y ${inView.y}`);

  await enterCover();
  await sleep(400);
  const stillZero = await ws.eval(`Math.round(window.scrollY)`);
  ok(stillZero === 0, '5.7  and coming back leaves the cover at y 0 — the gate has no other position to be at', `y ${stillZero}`);
  ok(count(jsText, /INTENT_COOLDOWN/) >= 1,
    '5.8  the interval is a NAMED constant in the shipped script, not a number sprinkled through handlers',
    `${count(jsText, /INTENT_COOLDOWN/)} references`);
  ok(await ws.eval(`typeof window.__adGateP === 'number' && window.__adGateP >= 0 && window.__adGateP <= 1`),
    '5.9  the published progress is a real number in [0,1] at every rest — the inks, the rail and the plates read one source');
  // ═══════════════════════════════════════════════════════════════════════════
  // 6 — A VIEW IS ONE PLACE: the chosen section IS the document, and nothing else is in it
  // ═══════════════════════════════════════════════════════════════════════════
  group('6 — A VIEW IS ONE PLACE (exclusive, flood-lit from the block)');
  await enterIndex();
  const blockBox = await ws.eval(`(() => { const b = document.querySelector('.metro-block[data-nav-for="magazine"]');
    const r = b.getBoundingClientRect();
    return { w: r.width, h: r.height, bg: getComputedStyle(b).backgroundColor }; })()`);
  await ws.eval(`document.querySelector('.metro-block[data-nav-for="magazine"]').click()`);
  await sleep(70);
  const flood = await ws.eval(`(() => { const f = document.getElementById('flood'), r = f.getBoundingClientRect();
    return { bg: getComputedStyle(f).backgroundColor, z: +getComputedStyle(f).zIndex,
      curZ: +getComputedStyle(document.getElementById('cur')).zIndex,
      w: r.width, h: r.height }; })()`);
  const VIEW = `(() => { const g = document.getElementById('gate'), head = document.querySelector('.site-head');
    const vs = [...document.querySelectorAll('[data-view]')];
    const cs = getComputedStyle;
    return { mode: window.__ad.mode(), place: window.__ad.place(), y: Math.round(window.scrollY), hash: location.hash,
      gateH: Math.round(g.getBoundingClientRect().height),
      headVis: cs(head).visibility,
      placed: vs.filter(e => cs(e).display !== 'none').map(e => e.id),
      inert: vs.filter(e => e.hasAttribute('inert')).map(e => e.id),
      ariaHidden: vs.filter(e => e.getAttribute('aria-hidden') === 'true').map(e => e.id),
      top: Math.round(document.getElementById('magazine').getBoundingClientRect().top),
      docH: Math.round(document.documentElement.scrollHeight), innerH: window.innerHeight,
      overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      active: document.activeElement ? document.activeElement.tagName + '#' + (document.activeElement.id || '') : null,
      folds: document.querySelector('.metroboard').hasAttribute('data-fold') }; })()`;
  const view = await settles(VIEW, v => v.mode === 'view' && v.place === 'magazine');
  ok(view.mode === 'view' && view.place === 'magazine' && view.hash === '#magazine',
    '6.1  pressing a block routes to `view`, and the place is in the URL — a view is an address, not an animation state',
    `${view.mode}/${view.place} "${view.hash}"`);
  ok(view.y === 0 && view.top === 0,
    '6.2  and the chosen section IS the document: parked at y 0 with its own top on the origin',
    `y ${view.y}, #magazine top ${view.top}`);
  ok(view.gateH === 0,
    '6.3  the fold is GONE in a view — no full-screen block sitting above the place you asked for',
    `gate height ${view.gateH}`);
  ok(view.placed.length === 1 && view.placed[0] === 'magazine'
    && view.inert.length === 3 && view.ariaHidden.length === 3
    && !view.inert.includes('magazine') && !view.ariaHidden.includes('magazine'),
    '6.4  exactly ONE place is laid out; the other three are `inert` AND `aria-hidden` — display:none for the eye, inert for the tab ring and the a11y tree',
    `placed ${view.placed.join(',')} / inert ${view.inert.length} / hidden ${view.ariaHidden.length}`);
  ok(view.headVis === 'visible',
    '6.5  the head is back: a place is a page, so it gets the page\'s chrome', `visibility ${view.headVis}`);
  ok(flood.bg === blockBox.bg,
    '6.6  the flood is filled from the BLOCK\'S OWN ink, not from a palette in the script',
    `flood ${flood.bg} vs block ${blockBox.bg}`);
  ok(flood.z > 510 && flood.curZ > flood.z,
    '6.7  the flood covers the head (510) while the reticle stays the top layer (9999)',
    `flood ${flood.z}, reticle ${flood.curZ}`);
  ok(Math.abs(flood.w - blockBox.w) < blockBox.w * 0.6
    && Math.abs(flood.h - blockBox.h) < blockBox.h * 0.6 + 1,
    '6.8  and it STARTS as the block — the flood has an origin on the screen, so the reader can see where the new page came from',
    `flood ${Math.round(flood.w)}×${Math.round(flood.h)} from block ${Math.round(blockBox.w)}×${Math.round(blockBox.h)}`);
  ok(view.active && view.active.startsWith('H'),
    '6.9  focus moves into the place\'s own heading — the route is announced, not merely painted',
    String(view.active));
  ok(view.docH > view.innerH + 100,
    '6.10 a view is its own document: taller than the screen and scrollable, which the cover and the index never are',
    `doc ${view.docH} vs screen ${view.innerH}`);
  ok(view.overflowX === 0, '6.11 and no view scrolls sideways', `overflow ${view.overflowX}px`);

  const reach = await ws.eval(`['who','work','magazine','reach']`);
  const doorsOk = [];
  for (const id of reach) {
    await ws.eval(`window.__ad.view(${JSON.stringify(id)})`);
    const s = await settles(`({ mode: window.__ad.mode(), place: window.__ad.place() })`, v => v.place === id, 40, 60);
    doorsOk.push(s.place === id && s.mode === 'view');
  }
  ok(doorsOk.every(Boolean),
    '6.12 all four places are reachable through the same door — no section is special-cased',
    doorsOk.join(' '));
  // ═══════════════════════════════════════════════════════════════════════════
  // 7 — ROUTING: three states, three addresses, and Back is a door
  // ═══════════════════════════════════════════════════════════════════════════
  group('7 — ROUTING AND HISTORY');
  await ws.eval(`document.getElementById('headIndex').click()`);
  const toIndex = await settles(`({ mode: window.__ad.mode(), hash: location.hash,
    head: getComputedStyle(document.querySelector('.site-head')).visibility })`,
    v => v.mode === 'index', 50, 60);
  ok(toIndex.mode === 'index' && toIndex.hash === '#index' && toIndex.head === 'hidden',
    '7.1  ← INDEX from inside a place goes back to the contents, and the URL says where it went',
    `${toIndex.mode} "${toIndex.hash}" head ${toIndex.head}`);

  await sleep(700);
  await ws.eval(`document.querySelector('.metro-block[data-nav-for="work"]').click()`);
  const toWork = await settles(`({ mode: window.__ad.mode(), place: window.__ad.place(), hash: location.hash })`,
    v => v.mode === 'view' && v.place === 'work', 60, 60);
  ok(toWork.place === 'work' && toWork.hash === '#work',
    '7.2  a block press pushes its own address — the board and the URL agree about where the reader is',
    `"${toWork.hash}"`);

  await sleep(900);
  await ws.eval('history.back()');
  const backState = await settles(`({ mode: window.__ad.mode(), hash: location.hash, y: Math.round(window.scrollY) })`,
    v => v.mode === 'index', 70, 60);
  ok(backState.mode === 'index' && backState.y === 0,
    '7.3  and BACK is a door: the browser returns to the contents as a state, at y 0 — not as a remembered scroll offset',
    `${backState.mode} "${backState.hash}" y ${backState.y}`);

  const goTo = async url => {
    await navigate(`http://127.0.0.1:${PORT}/index.html${url}`);
    await sleep(650);
  };
  await goTo('#work');
  const deepWork = await settles(`({ mode: window.__ad.mode(), place: window.__ad.place(), y: Math.round(window.scrollY) })`,
    v => v.mode === 'view' && v.place === 'work', 60, 60);
  ok(deepWork.place === 'work' && deepWork.y === 0,
    '7.4  a deep link to a place lands IN the place, at y 0, on the first paint — no scroll, no replay',
    `${deepWork.place} at y ${deepWork.y}`);

  await goTo('#index');
  const deepIndex = await settles(`({ mode: window.__ad.mode(), revealed: document.getElementById('indexPanels').hasAttribute('data-revealed') })`,
    v => v.mode === 'index' && v.revealed, 60, 60);
  ok(deepIndex.mode === 'index' && deepIndex.revealed,
    '7.5  and a deep link to the contents lands on the contents — the same state the reader would have flown to');

  await goTo('');
  const fresh = await settles(`({ mode: window.__ad.mode(), hash: location.hash })`, v => !!v.mode, 40, 60);
  ok(fresh.mode === 'cover' && fresh.hash === '',
    '7.6  a bare URL is the poster — no fragment, no state, nothing to restore',
    `${fresh.mode} "${fresh.hash}"`);

  const navLinks = await ws.eval(`[...document.querySelectorAll('.head-nav-link')].map(a => a.dataset.navFor)`);
  ok(navLinks.length === 4 && navLinks.join(',') === 'who,work,magazine,reach',
    '7.7  the head lists the four places, and each link names the place it routes to',
    navLinks.join(','));
  const blocks = await ws.eval(`[...document.querySelectorAll('.metro-block')].map(b => b.dataset.navFor)`);
  ok(blocks.length === 4 && blocks.join(',') === 'who,work,magazine,reach',
    '7.8  and the board carries the same four names — one vocabulary for the routes, written twice as data',
    blocks.join(','));
  ok(await ws.eval(`document.documentElement.scrollWidth - document.documentElement.clientWidth === 0`),
    '7.9  every landed state is still free of horizontal overflow');
  // ═══════════════════════════════════════════════════════════════════════════
  // 8 — ESCAPE, FOCUS AND THE OVERLAY: every layer has its own way out
  // ═══════════════════════════════════════════════════════════════════════════
  group('8 — ESCAPE, FOCUS, AND THE OVERLAY');
  await enterView('reach');
  await sleep(300);
  await ws.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await ws.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  const escView = await settles(`({ mode: window.__ad.mode(), y: Math.round(window.scrollY), hash: location.hash })`,
    v => v.mode === 'index', 60, 60);
  ok(escView.mode === 'index' && escView.y === 0,
    '8.1  Escape in a view steps back one rung — to the contents, at y 0 — rather than dumping the reader on the poster',
    `${escView.mode} at y ${escView.y}`);

  await sleep(700);
  await ws.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await ws.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  const escIndex = await settles(`({ mode: window.__ad.mode(), y: Math.round(window.scrollY) })`,
    v => v.mode === 'cover', 40, 60);
  ok((escIndex.mode === 'cover' || escIndex.mode === 'index') && escIndex.y === 0,
    '8.2  and a second Escape never leaves the reader in a dead state: whatever rung it lands on, the page is at y 0 with a state that paints',
    `${escIndex.mode} at y ${escIndex.y}`);

  await enterCover();
  await sleep(400);
  await ws.eval(`document.getElementById('setOpen').click()`);
  const dialog = await settles(`(() => { const d = document.getElementById('setPanel');
    return { open: d.open, tag: d.tagName, modal: !!(d.showModal && d.open) }; })()`, v => v.open, 40, 60);
  ok(dialog.open && dialog.tag === 'DIALOG',
    '8.3  the gear opens a real modal <dialog> — the platform owns the focus trap and the backdrop',
    `${dialog.tag} open ${dialog.open}`);
  const modeBefore = await ws.eval(`window.__ad.mode()`);
  await ws.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await ws.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  const closedDialog = await settles(`({ open: document.getElementById('setPanel').open, mode: window.__ad.mode() })`,
    v => !v.open, 40, 60);
  ok(!closedDialog.open && closedDialog.mode === modeBefore,
    '8.4  Escape closes the OVERLAY first and leaves the page where it was — the ladder is per layer, not one global reset',
    `open ${closedDialog.open}, mode ${closedDialog.mode}`);

  await enterIndex();
  await sleep(400);
  await ws.eval(`document.querySelector('[data-back-index]').click()`);
  const focusBack = await settles(`({ mode: window.__ad.mode(), hash: location.hash,
    tag: document.activeElement ? document.activeElement.tagName : null,
    inPanels: !!(document.activeElement && document.activeElement.closest('#indexPanels')) })`,
    v => v.mode === 'index', 50, 60);
  ok(focusBack.mode === 'index' && focusBack.tag === 'A' && focusBack.inPanels,
    '8.5  BACK TO INDEX returns focus to the plate it came from — the route is reversible for a keyboard reader too',
    `${focusBack.tag} in #indexPanels ${focusBack.inPanels}`);

  const skip = await ws.eval(`(() => { const s = document.querySelector('.skip-link');
    return { n: document.querySelectorAll('.skip-link').length, href: s && s.getAttribute('href'),
      first: !!(s && s.compareDocumentPosition(document.body) & 4) }; })()`);
  ok(skip.n === 1 && /^#/.test(skip.href || ''),
    '8.6  one skip link, pointing at a real anchor — the first thing a keyboard meets is a way past the chrome',
    `${skip.n} link → ${skip.href}`);

  const a11y = await ws.eval(`(() => { const s = document.getElementById('prefA11y');
    return { n: !!s, role: s && s.getAttribute('role'), checked: s && s.getAttribute('aria-checked') }; })()`);
  ok(a11y.n && a11y.role === 'switch' && (a11y.checked === 'true' || a11y.checked === 'false'),
    '8.7  the a11y preference is a switch with a stated position, not a link that looks like one',
    `role ${a11y.role}, checked ${a11y.checked}`);
  ok(count(html, /<dialog/g) >= 1 && count(jsText, /showModal\(/g) >= 1,
    '8.8  overlays are dialogs opened modally — no hand-rolled focus trap to drift out of sync');
  // ═══════════════════════════════════════════════════════════════════════════
  // 9 — MOTION OFF: the same page, stood still
  // ═══════════════════════════════════════════════════════════════════════════
  group('9 — MOTION OFF IS A PAGE, NOT A BROKEN ANIMATION');
  ok(count(cssText, /prefers-reduced-motion/) >= 1,
    '9.1  the stylesheet answers the OS preference — a reader who asked for stillness is not made to opt out by hand');
  ok(/stillMotion/.test(jsText),
    '9.2  and the script has one predicate for "do not move", so every module asks the same question');
  ok(count(cssText, /data-motion="off"/) >= 10,
    '9.3  the opt-out is a rule set, not a special case: every moving part has a written still form',
    `${count(cssText, /data-motion="off"/)} rules`);
  await enterCover();
  await ws.eval(`document.documentElement.dataset.motion = 'off'`);
  await sleep(300);
  const still = await ws.eval(`({ dt: getComputedStyle(document.getElementById('gateStage')).transitionDuration,
    motion: getComputedStyle(document.documentElement).getPropertyValue('--motion').trim() })`);
  ok(parseFloat(still.dt) < 0.01,
    '9.4  with motion off the flight is 1e-06s — the state change is instant, so nothing is left half-crossed',
    `duration ${still.dt}`);
  await enterIndex();
  const stillIndex = await ws.eval(`(() => { const rs = [...document.querySelectorAll('.index-panel')].map(e => e.getBoundingClientRect());
    return { mode: window.__ad.mode(), area: Math.round(rs.reduce((s, r) => s + r.width * r.height, 0)),
      screen: window.innerWidth * window.innerHeight }; })()`);
  ok(stillIndex.mode === 'index' && near(stillIndex.area, stillIndex.screen, Math.round(stillIndex.screen * 0.005)),
    '9.5  and the index still arrives — a still page is a page, so the contents are reachable without a single frame of morph',
    `${stillIndex.area} vs ${stillIndex.screen}`);
  await enterCover();
  await ws.eval(`delete document.documentElement.dataset.motion`);
  await sleep(300);
  const restored = await ws.eval(`({ mode: window.__ad.mode(), attr: document.documentElement.dataset.motion || null })`);
  await enterIndex();
  const again = await ws.eval(`window.__ad.mode()`);
  await enterCover();
  ok(restored.mode === 'cover' && restored.attr === null && again === 'index',
    '9.6  and taking the opt-out away restores the moving page — the preference is a switch in both directions, not a one-way door',
    `attr ${restored.attr}, index still routes: ${again}`);

  // ═══════════════════════════════════════════════════════════════════════════
  // 10 — THE ARTIFACTS: the sheet, the plate, the stickers, the clock
  // ═══════════════════════════════════════════════════════════════════════════
  group('10 — THE ARTIFACTS');
  ok(count(html, /class="rp-layer/g) === 4 && count(html, /hero-photo-new\.png/g) === 4,
    '10.1 the plate is FOUR passes of one photograph — a key plate and three spot inks, not four crops',
    `${count(html, /class="rp-layer/g)} layers`);
  ok(count(html, /filter:url\(#glossWarp\)/g) >= 1 && /id="glossWarp"/.test(html),
    '10.2 the gloss is a displacement filter that exists in the document, so the shine moves with the sheet instead of being a picture of one');
  const stickers = await ws.eval(`({ rows: document.querySelectorAll('.sticker-row').length,
    slots: document.querySelectorAll('.sticker-slot').length,
    homes: document.querySelectorAll('.sticker-home').length,
    speeds: new Set([...document.querySelectorAll('[data-parallax-speed]')].map(e => e.dataset.parallaxSpeed)).size })`);
  ok(stickers.rows === 2 && stickers.slots === 2 && stickers.homes === 2,
    '10.3 two sticker bands, two slots, two homes — the stickers have a place to live and a place to travel',
    `${stickers.rows} rows / ${stickers.slots} slots / ${stickers.homes} homes`);
  ok(stickers.speeds >= 2,
    '10.4 and they move at more than one depth — parallax is authored per sticker, not applied to the group',
    `${stickers.speeds} depths`);
  ok(/0\.12\s*\/\s*15/.test(jsText),
    '10.5 the gear RATCHETS to 15° steps — a quantised dial, so the reticle has detents rather than floating decimals');
  const rail = await ws.eval(`(() => { const r = document.getElementById('pageProgress');
    const cs = getComputedStyle(r);
    return { w: Math.round(r.getBoundingClientRect().width), hidden: r.getAttribute('aria-hidden'),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth }; })()`);
  ok(rail.w <= 3 && rail.hidden === 'true' && rail.overflow === 0,
    '10.6 the progress rail is 2px on the edge and aria-hidden — a mark on the paper, never a scrollbar or an announcement',
    `${rail.w}px, aria-hidden ${rail.hidden}`);
  const sound = await ws.eval(`(() => { const s = document.getElementById('soundToggle');
    return { tag: s && s.tagName, pressed: s && s.getAttribute('aria-pressed') }; })()`);
  ok(sound.tag === 'BUTTON',
    '10.7 the sound control is a real button, so it can be operated by keyboard and announced by name',
    `${sound.tag}`);
  const ledger = await ws.eval(`(() => { const f = document.getElementById('ledgerForm'),
    s = document.getElementById('ledgerSubmit'), st = document.getElementById('ledgerStatus');
    return { form: !!f, tag: f && f.tagName, submit: s && s.tagName, status: !!st }; })()`);
  ok(ledger.form && ledger.tag === 'FORM' && ledger.submit === 'BUTTON' && ledger.status,
    '10.8 the ledger is a real form with a button and a status line — a result can be submitted by keyboard and read as text',
    `${ledger.tag}/${ledger.submit}/status ${ledger.status}`);
  ok(!/fonts\/JSL-[^"']*\.ttf/.test(html) && !/Layer 0\.webp/.test(html),
    '10.9 nothing on the page points at an asset the repo has retired — the sheet is self-contained',
    `ttf refs ${count(html, /fonts\/JSL-[^"']*\.ttf/g)}, orphan png ${count(html, /Layer 0\.webp/g)}`);
  // ═══════════════════════════════════════════════════════════════════════════
  // 11 — THE THREE WIDTHS: the same rules, different arithmetic
  // ═══════════════════════════════════════════════════════════════════════════
  group('11 — THE SAME RULES AT 390, 768 AND 1440');
  const ROWS = [];
  for (const pair of [[390, 844], [768, 1024], [1440, 900]]) {
    const [w, h] = pair;
    await ws.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 800 });
    await sleep(450);
    await enterCover();
    const c = await ws.eval(SCREEN);
    await enterIndex();
    const i = await ws.eval(SCREEN);
    const tile = await ws.eval(`(() => { const rs = [...document.querySelectorAll('.index-panel')].map(e => e.getBoundingClientRect());
      return { area: Math.round(rs.reduce((s, r) => s + r.width * r.height, 0)), screen: window.innerWidth * window.innerHeight,
        cols: new Set(rs.map(r => Math.round(r.x))).size, rows: new Set(rs.map(r => Math.round(r.y))).size,
        x: rs.map(r => Math.round(r.x)) }; })()`);
    ROWS.push({ w, c, i, tile, cls: await ws.eval(`document.documentElement.className`) });
  }
  const at = ROWS.map(r => r.w).join('/');
  ok(ROWS.every(r => near(r.c.gateH, r.c.innerH, 1)),
    `11.1 the gate is one screen at ${at} — 390, 768 and 1440 all get a gate, never a two-screen poster`,
    ROWS.map(r => `${r.w}:${r.c.gateH}/${r.c.innerH}`).join(' '));
  ok(ROWS.every(r => near(r.c.heroH + r.c.boardH, r.c.gateH, 4)),
    '11.2 and the sheet + bar still add up to it at every width — the split moves, the total does not',
    ROWS.map(r => `${r.w}:${(r.c.heroH + r.c.boardH).toFixed(0)}/${r.c.gateH}`).join(' '));
  ok(ROWS.every(r => near(r.c.docH, r.c.innerH, 1)),
    '11.3 the cover is one screen long at every width — no width grows a scrollbar on the poster',
    ROWS.map(r => `${r.w}:${r.c.docH}/${r.c.innerH}`).join(' '));
  ok(ROWS.every(r => near(r.i.docH, r.i.innerH, 1)),
    '11.4 and so is the index — the contents tile the screen at every width',
    ROWS.map(r => `${r.w}:${r.i.docH}/${r.i.innerH}`).join(' '));
  ok(ROWS.every(r => near(r.tile.area, r.tile.screen, Math.round(r.tile.screen * 0.005))),
    '11.5 four plates cover the screen exactly at every width — one column on a phone, two on a tablet, two on a desktop',
    ROWS.map(r => `${r.w}:${r.tile.cols}×${r.tile.rows}`).join(' '));
  const phone = ROWS[0], wide = ROWS.slice(1);
  ok(phone.tile.cols === 1 && phone.tile.rows === 4 && wide.every(r => r.tile.cols === 2 && r.tile.rows === 2),
    '11.6 the index reflows 1×4 → 2×2 at 768, and the tiles still meet edge to edge',
    `390:${phone.tile.cols}×${phone.tile.rows} / 768+:${wide.map(r => r.tile.cols + '×' + r.tile.rows).join(',')}`);
  ok(near(phone.c.boardH, 130, 1) && wide.every(r => near(r.c.boardH, 72, 1)),
    '11.7 the bar is 130px on the phone it has to be tapped on, and 72px where a pointer can find it',
    ROWS.map(r => `${r.w}:${r.c.boardH}`).join(' '));
  ok(!/lenis/.test(phone.cls) && wide.every(r => /lenis/.test(r.cls)),
    '11.8 the smoother is alive above 768 and GONE below it — a phone gets the platform\'s scroll, not a JS one',
    ROWS.map(r => `${r.w}:${/lenis/.test(r.cls) ? 'lenis' : 'native'}`).join(' '));
  ok(ROWS.every(r => r.c.overflowX === 0 && r.i.overflowX === 0),
    '11.9 no width, in either state, scrolls sideways',
    ROWS.map(r => `${r.w}:${r.c.overflowX}/${r.i.overflowX}`).join(' '));
  const targets = await ws.eval(`(() => { const sel = ['.metro-block','.index-panel','#headIndex','[data-back-index]'];
    const bad = [];
    for (const s of sel) for (const e of document.querySelectorAll(s)) {
      const r = e.getBoundingClientRect();
      if (r.width > 0 && Math.min(r.width, r.height) < 44) bad.push(s + ' ' + Math.round(Math.min(r.width, r.height)));
    }
    return { bad: bad.slice(0, 4), n: bad.length }; })()`);
  ok(targets.n === 0,
    '11.10 every NAVIGATION target is at least 44px on its short side — the blocks, the plates and both ways back are all tappable',
    targets.bad.join(' '));
  const icons = await ws.eval(`['setOpen','soundToggle'].map(id => { const e = document.getElementById(id);
    const r = e.getBoundingClientRect();
    return { id, w: Math.round(r.width), h: Math.round(r.height), name: e.getAttribute('aria-label') }; })`);
  ok(icons.every(i => i.name && i.h >= 18 && i.w >= 18),
    '11.11 the two icon controls are small on purpose but never unlabelled — each keeps a name and a box a pointer can hit',
    icons.map(i => `${i.id} ${i.w}×${i.h} "${i.name}"`).join(', '));
  await ws.send('Emulation.clearDeviceMetricsOverride');
  await sleep(300);
  await enterCover();
  // ═══════════════════════════════════════════════════════════════════════════
  // 12 — TOUCH: a thumb is not a wheel, and the sign flips per device
  // ═══════════════════════════════════════════════════════════════════════════
  group('12 — A THUMB IS NOT A WHEEL');
  const desk = await ws.eval(`({ touch: window.Observer.isTouch, types: window.Observer.eventTypes.join(',') })`);
  ok(desk.touch === 0 && /pointerdown/.test(desk.types),
    '12.1 a desktop build listens to the pointer — Observer decides ONCE, as the plugin loads, which stream this device has',
    `isTouch ${desk.touch}, ${desk.types}`);
  ok(count(html, /data-lenis-prevent/g) >= 2,
    '12.2 the two swipe decks (and the overlay scroll roots) opt out of the smoother by name, so a horizontal drag is never eaten',
    `${count(html, /data-lenis-prevent/g)} opt-outs`);

  await ws.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
  await navigate(`http://127.0.0.1:${PORT}/index.html`);
  await sleep(1000);
  const fingered = await ws.eval(`({ touch: window.Observer && window.Observer.isTouch,
    types: window.Observer && window.Observer.eventTypes.join(','), mode: window.__ad.mode() })`);
  ok(fingered.touch > 0 && /touchstart/.test(fingered.types) && fingered.mode === 'cover',
    '12.3 re-loaded UNDER the emulation, the same page wires the touch stream instead — the build that shipped is the build measured',
    `isTouch ${fingered.touch}, ${fingered.types}`);
  const thumbSwipe = async (fromY, toY) => {
    await ws.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 195, y: fromY }] });
    await sleep(24);
    const step = (toY - fromY) / 8;
    for (let i = 1; i <= 8; i++) {
      await ws.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 195, y: Math.round(fromY + step * i) }] });
      await sleep(24);
    }
    await ws.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  await sleep(700);
  await thumbSwipe(700, 380);
  const thumbUp = await settles(`({ mode: window.__ad.mode(), p: window.__adGateP, y: Math.round(window.scrollY),
    revealed: document.getElementById('indexPanels').hasAttribute('data-revealed') })`,
    v => v.mode === 'index' && v.revealed, 50, 60);
  ok(thumbUp.mode === 'index' && thumbUp.p === 1 && thumbUp.y === 0,
    '12.4 a thumb thrown UP the poster is the same request as a wheel turned down — the sign is flipped for a finger, and the reader lands on the contents without a pixel of scroll',
    `mode ${thumbUp.mode}, p ${thumbUp.p}, y ${thumbUp.y}`);
  await sleep(800);
  await thumbSwipe(380, 700);
  const thumbDown = await settles(`({ mode: window.__ad.mode(), p: window.__adGateP })`,
    v => v.mode === 'cover', 50, 60);
  ok(thumbDown.mode === 'cover' && thumbDown.p === 0,
    '12.5 ...and a thumb pulled DOWN at the contents closes them: the two directions are one mapping, not a special case for whichever one a mouse can make',
    `mode ${thumbDown.mode}, p ${thumbDown.p}`);
  await ws.eval(`window.__ad.view('work')`);
  await settles(`window.__ad.mode()`, v => v === 'view');
  await sleep(300);
  await thumbSwipe(700, 300);
  await sleep(700);
  const thumbInView = await ws.eval(`({ mode: window.__ad.mode(), place: window.__ad.place() })`);
  ok(thumbInView.mode === 'view' && thumbInView.place === 'work',
    '12.6 and inside a place a thumb is just a scroll — the gate does not steal a gesture the reader aimed at the page',
    `${thumbInView.mode}/${thumbInView.place}`);
  await ws.send('Emulation.setTouchEmulationEnabled', { enabled: false });
  // ── optional evidence ──────────────────────────────────────────────────────
  if (SHOTS) {
    await fsp.mkdir(SHOTDIR, { recursive: true });
    await navigate(`http://127.0.0.1:${PORT}/index.html`);
    await sleep(1100);
    const shot = async (name, go) => {
      if (go) await go();
      await sleep(600);
      const png = await ws.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      await fsp.writeFile(path.join(SHOTDIR, name + '.png'), Buffer.from(png.data, 'base64'));
    };
    await shot('cover', () => enterCover());
    await shot('index', () => enterIndex());
    await shot('work', () => enterView('work'));
    console.log('   shots → ' + SHOTDIR);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 13 — QUIET: the ledger of the whole run
  // ═══════════════════════════════════════════════════════════════════════════
  group('13 — QUIET ACROSS THE WHOLE RUN');
  await enterCover();
  const fonts = await ws.eval('document.fonts.status');
  ok(consoleErrors.length === 0,
    '13.1 not one console error or uncaught exception in the entire session — across every state, width and input',
    consoleErrors.slice(0, 4).join(' | '));
  ok(netFails.length === 0,
    '13.2 and no request failed at any point — nothing in the page is pointed at a file that is not there',
    netFails.slice(0, 4).join(' | '));
  ok(fonts === 'loaded',
    '13.3 every declared face arrived — the sheet is measured against the type it will be read in',
    String(fonts));

  group('RESULT');
  console.log(`   ${pass} passed, ${failures.length} failed`);
  if (failures.length) failures.forEach(f => console.log('   · ' + f));
} catch (err) {
  console.error('\nHARNESS ERROR: ' + (err && err.stack || err));
  failures.push('harness threw: ' + (err && err.message || err));
  group('RESULT');
  console.log(`   ${pass} passed, ${failures.length} failed`);
} finally {
  try { ws?.ws.close(); } catch { /* already gone */ }
  try { chrome.kill(); } catch { /* already gone */ }
  server.close();
  await sleep(250);
  try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch { /* chrome still holds it */ }
}

process.exit(failures.length ? 1 : 0);












