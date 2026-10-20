// ═══════════════════════════════════════════════════
// VISITOR LEDGER — the guestbook inside the museum wall.
// A static page with a global signature book: Supabase holds the rows, the publishable key
// in this file can only read them and insert approved ones, and a realtime socket makes a
// signature land for everyone without a reload. Four rules hold it up:
//   1. NOTHING LOADS UNTIL THE ROOM OPENS. The SDK is injected on the first `ad:wall`, so a
//      visitor who never opens the wall downloads none of it and the page makes no
//      third-party request at load time.
//   2. A SIGNATURE IS TEXT, NEVER MARKUP. Rows are built with createElement and written with
//      textContent; there is no innerHTML in this file, so a stranger's `<img onerror>` is a
//      string of characters in a ledger, not an event.
//   3. THE SOUND OF SIGNING IS THE SNAP. The row lands, then main.js is asked for the
//      folio's own voice over a DOM event, so this file never reaches into that closure —
//      and a press that fails announces nothing.
//   4. A FAILED CALL IS A STATE, NOT AN EXCEPTION. The table, the network and the socket are
//      all allowed to be missing; the ledger says so once, in one sentence, records why in
//      `data-error`, and never throws into the console.
// ═══════════════════════════════════════════════════
(function () {
  'use strict';

  // ── CONFIG ────────────────────────────────────────────────────────────────
  // The key is *publishable*: it is meant to ship in the page, and it can only do what the
  // table's row-level policies allow — select approved rows, insert an approved row. It is
  // not a secret and cannot be treated as one on a static site. The SDK is pinned to an
  // exact version rather than floating on @2: a CDN that can silently change the bytes of a
  // file that reads a database is not a dependency, it is a hazard.
  const PROJECT = 'https://jukhhiplmoslqxazclrb.supabase.co';
  const KEY     = 'sb_publishable_EoErAMJwego8sPcuy3Wg7Q_7fVBzC0k';
  const SDK     = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.118.0/dist/umd/supabase.js';
  const TABLE   = 'ledger';
  const FEED    = 8;                          // rows on the wall
  const MAX     = { name: 40, note: 240 };    // mirrored in SQL, so a client cannot earn a 400
  const COOLDOWN = 30000;                     // ms between signatures from one browser
  const LOCK    = 'ad-ledger-signed';
  const OFFLINE = 'The ledger is not answering. Nothing has been saved — try again in a moment.';

  const section   = document.getElementById('artLedger');
  if (!section) return;                        // the ledger is markup; without it there is no work
  const form      = document.getElementById('ledgerForm');
  const nameEl    = document.getElementById('ledgerName');
  const noteEl    = document.getElementById('ledgerNote');
  const trapEl    = document.getElementById('ledgerWeb');
  const submitEl  = document.getElementById('ledgerSubmit');
  const statusEl  = document.getElementById('ledgerStatus');
  const countEl   = document.getElementById('ledgerCount');
  const feedEl    = document.getElementById('ledgerFeed');
  const feedCount = document.getElementById('ledgerFeedCount');
  const emptyEl   = document.getElementById('ledgerEmpty');
  const liveEl    = document.getElementById('ledgerLive');
  if (!form || !nameEl || !noteEl || !submitEl || !feedEl) return;

  let api = null, booting = null, busy = false, total = 0;
  const seen = new Set();                      // ids already painted, so an echo cannot double-insert

  // ── STATE + COPY ──────────────────────────────────────────────────────────
  // `data-state` is the whole contract with the outside world: idle before the room opens,
  // loading while the SDK and the first read are in flight, ready once rows can arrive,
  // error when nothing can be reached. The stylesheet and the test suite both read it, and
  // neither has to guess from pixels.
  const state = s => { section.dataset.state = s; };
  function say(text, tone){
    if (!statusEl) return;
    statusEl.textContent = text || '';
    if (tone) statusEl.dataset.tone = tone; else statusEl.removeAttribute('data-tone');
  }
  function live(on){
    if (liveEl) liveEl.hidden = !on;
    const kicker = section.querySelector('.ledger-kicker');
    if (kicker) kicker.classList.toggle('is-live', on);
  }

  // ── VALIDATION — the same limits the table enforces ───────────────────────
  // Whitespace is squashed before length is measured: a note of twelve newlines is not a
  // note, and the SQL check is on the length of what the database is actually given.
  const squash = s => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  function read(){
    const v = { name: squash(nameEl.value), note: squash(noteEl.value), errs: [] };
    if (!v.name) v.errs.push('A name is needed — initials are enough.');
    else if (v.name.length > MAX.name) v.errs.push('Names stop at ' + MAX.name + ' characters.');
    if (v.note.length < 3) v.errs.push('Say a little more than that.');
    else if (v.note.length > MAX.note) v.errs.push('Notes stop at ' + MAX.note + ' characters.');
    return v;
  }
  function mark(){
    const n = squash(noteEl.value).length;
    nameEl.setAttribute('aria-invalid', squash(nameEl.value) ? 'false' : 'true');
    noteEl.setAttribute('aria-invalid', n >= 3 && n <= MAX.note ? 'false' : 'true');
  }
  function clear(){
    nameEl.removeAttribute('aria-invalid');
    noteEl.removeAttribute('aria-invalid');
  }
  function count(){
    if (countEl) countEl.textContent = noteEl.value.length + ' / ' + MAX.note;
  }
  // ── RENDER — one row, built from nodes and text ───────────────────────────
  // A signature is data and is never parsed: the date is formatted from a Date, and the two
  // strings a stranger writes are assigned with textContent, which cannot create an element
  // however many angle brackets they arrive with.
  const MONTH = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  function when(iso){
    const d = new Date(iso || '');
    if (isNaN(d.getTime())) return '—';
    return String(d.getUTCDate()).padStart(2, '0') + ' ' + MONTH[d.getUTCMonth()];
  }
  function row(entry){
    const li = document.createElement('li');
    li.className = 'ledger-row';
    li.dataset.id = entry.id;
    const date = document.createElement('span');
    date.className = 'ledger-date';
    date.textContent = when(entry.created_at);
    const sig = document.createElement('span');
    sig.className = 'ledger-sig';
    const name = document.createElement('span');
    name.className = 'ledger-name';
    name.textContent = entry.name;
    const note = document.createElement('span');
    note.className = 'ledger-note';
    note.textContent = entry.note;
    sig.appendChild(name);
    sig.appendChild(note);
    li.appendChild(date);
    li.appendChild(sig);
    return li;
  }
  function paint(){
    if (feedCount){
      feedCount.hidden = total < 1;
      feedCount.textContent = total === 1 ? '1 signature' : total + ' signatures';
    }
    if (emptyEl) emptyEl.hidden = feedEl.children.length > 0;
  }

  // `origin` is what the row is: "seed" (the first read, already counted by the server's
  // exact count), "self" (this visitor's insert) or "live" (someone else's, off the socket).
  // All three paint the same; only the count differs, because the socket echoes our own row
  // back at us and the seed's total must not be counted twice.
  function commit(entry, origin){
    if (!entry || !entry.id || seen.has(entry.id)) return false;
    seen.add(entry.id);
    feedEl.prepend(row(entry));
    while (feedEl.children.length > FEED){
      const last = feedEl.lastElementChild;
      seen.delete(last.dataset.id);
      last.remove();
    }
    if (origin !== 'seed') total += 1;
    paint();
    return true;
  }

  // ── THE SDK, ON DEMAND ────────────────────────────────────────────────────
  // Injected once, on the first open, and never at load. crossOrigin is set because the CDN
  // serves CORS headers, and a classic script fetched from a third party should ask for them.
  function sdk(){
    if (window.supabase && typeof window.supabase.createClient === 'function'){
      return Promise.resolve(window.supabase);
    }
    return new Promise(function (resolve, reject){
      const tag = document.createElement('script');
      tag.src = SDK;
      tag.async = true;
      tag.crossOrigin = 'anonymous';
      const bail = setTimeout(function (){ reject(new Error('sdk timeout')); }, 12000);
      tag.onload = function (){
        clearTimeout(bail);
        if (window.supabase && typeof window.supabase.createClient === 'function') resolve(window.supabase);
        else reject(new Error('sdk shape'));
      };
      tag.onerror = function (){ clearTimeout(bail); reject(new Error('sdk blocked')); };
      document.head.appendChild(tag);
    });
  }

  // ── REALTIME — opened only after a read has succeeded ─────────────────────
  // If the read failed the table is not there, and a handshake would only fail into the
  // console for no one's benefit. `replica identity full` on the table is what makes
  // payload.new carry the whole row rather than an id.
  function listen(client){
    try {
      client
        .channel('visitor-ledger')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: TABLE }, function (payload){
          if (payload && payload.new) commit(payload.new, 'live');
        })
        .subscribe(function (status){ live(status === 'SUBSCRIBED'); });
    } catch (e){
      live(false);
    }
  }
  // ── BOOT — idempotent, and only ever from an open wall ────────────────────
  function boot(){
    if (booting) return booting;
    state('loading');
    booting = sdk()
      .then(function (ns){
        const client = ns.createClient(PROJECT, KEY, {
          // no session, no refresh, no URL parsing: a guestbook has no login, and a stale
          // auth token left in localStorage would turn a public table into a 401
          auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
        });
        return client
          .from(TABLE)
          .select('id,name,note,created_at', { count: 'exact' })
          .order('created_at', { ascending: false })
          .limit(FEED)
          .then(function (res){
            if (res.error) throw res.error;
            // newest first from the server, so the seed is painted oldest-first and the list
            // ends up exactly the way the socket will keep it
            (res.data || []).slice().reverse().forEach(function (entry){ commit(entry, 'seed'); });
            total = typeof res.count === 'number' ? res.count : (res.data || []).length;
            paint();
            listen(client);
            return {
              insert: function (name, note){
                return client
                  .from(TABLE)
                  .insert({ name: name, note: note })
                  .select('id,name,note,created_at')
                  .single()
                  .then(function (r){
                    if (r.error) throw r.error;
                    return r.data;
                  });
              }
            };
          });
      })
      .then(function (transport){
        api = transport;
        state('ready');
        return transport;
      })
      .catch(function (err){
        // one sentence for the visitor, one attribute for whoever is debugging: the sentence
        // must not leak a Postgres error, and the attribute must — a silent failure here is a
        // guestbook that looks empty when it is actually unreachable
        section.dataset.error = String((err && (err.message || err.code)) || err).slice(0, 140);
        state('error');
        say(OFFLINE, 'error');
        return null;
      });
    return booting;
  }
  // ── SIGN ──────────────────────────────────────────────────────────────────
  async function sign(event){
    event.preventDefault();
    if (busy) return;
    if (trapEl && trapEl.value){
      // a filled honeypot is a form-filler, not a visitor: answer as though it worked and
      // write nothing. No snap either — no row landed, and the wall does not lie about that.
      say('Signed. Thank you.');
      form.reset(); count(); clear();
      return;
    }
    const v = read();
    mark();
    if (v.errs.length){
      say(v.errs[0], 'error');
      (v.name ? noteEl : nameEl).focus({ preventScroll: true });
      return;
    }
    const until = Number(store(LOCK) || 0) + COOLDOWN;
    if (Date.now() < until){
      say('One signature per visitor every half minute — the wall is patient.', 'error');
      return;
    }
    if (!api) await boot();
    if (!api){ say(OFFLINE, 'error'); return; }

    busy = true;
    submitEl.disabled = true;
    submitEl.setAttribute('aria-busy', 'true');
    submitEl.textContent = 'Signing';
    say('Signing');
    try {
      const entry = await api.insert(v.name, v.note);
      commit(entry, 'self');
      store(LOCK, String(Date.now()));
      form.reset(); count(); clear();
      say('Signed. Thank you.');
      // the row landed, so the wall makes its own sound — one snap, by name
      document.dispatchEvent(new CustomEvent('ad:voice', { detail: 'snap' }));
    } catch (err){
      section.dataset.error = String((err && (err.message || err.code)) || err).slice(0, 140);
      say('Nothing was saved — the ledger did not answer. Try again in a moment.', 'error');
    } finally {
      busy = false;
      submitEl.disabled = false;
      submitEl.removeAttribute('aria-busy');
      submitEl.textContent = 'Sign the ledger';
    }
  }

  // ── WIRING ────────────────────────────────────────────────────────────────
  function store(key, value){
    try {
      if (value === undefined) return localStorage.getItem(key);
      localStorage.setItem(key, value);
      return value;
    } catch (e){ return null; }   // private mode: a cooldown is a courtesy, not a gate
  }

  form.addEventListener('submit', sign);
  noteEl.addEventListener('input', function (){
    count();
    if (noteEl.getAttribute('aria-invalid')) noteEl.setAttribute('aria-invalid', 'false');
  });
  nameEl.addEventListener('input', function (){
    if (nameEl.getAttribute('aria-invalid')) nameEl.setAttribute('aria-invalid', 'false');
  });

  // THE ROOM OPENS ⇒ THE REGISTER IS WORTH LOADING. main.js dispatches this instead of
  // calling in here, so neither file has to know that the other exists.
  document.addEventListener('ad:wall', function (e){
    if (e && e.detail === 'open') boot();
  });

  // a dialog restored as open (a reload mid-session) still needs its register
  const overlay = document.getElementById('artOverlay');
  if (overlay && overlay.classList.contains('open')) boot(); else state('idle');

  count();
  paint();
})();
