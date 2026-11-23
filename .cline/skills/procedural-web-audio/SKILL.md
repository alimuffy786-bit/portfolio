---
name: procedural-web-audio
description: "Use for the sound wave (§05d): synthesised Web Audio, no audio files. Gesture-started AudioContext, one graph, gain ramps without clicks, respect data-sound/ad-sound, and never claim an audible result you could not hear."
---

# Procedural sound, stated honestly

The page's sound is **synthesised** — there is no `<audio>` element and no audio asset in this tree.
The owner is `§05d` (the wave) plus the sound logic in `js/main.js`; the preference is the
`data-sound` attribute, persisted under the `ad-sound` storage key. Read the actual §05d block before
changing behaviour; this skill states the rules, not the current internals.

## Rules of the graph

- **One `AudioContext`**, created lazily. Never create one per interaction; browsers cap them and the
  old ones stay suspended forever.
- Start or resume only from a real user gesture (a click/keydown handler). A context created on load
  is `suspended` and any promise you ignore becomes a console error — which fails harness group 13.
- Route everything through one master `GainNode`. The preference mutes that node; it does not tear
  the graph down and rebuild it.
- Ramp gains (`setTargetAtTime`, `linearRampToValueAtTime`) — never assign `gain.value` straight to
  audibility. Steps produce clicks, and a click is the loudest thing on the page.
- Disconnect and stop one-shot nodes when they end (`osc.onended = () => osc.disconnect()`); a leak
  here is a leak per gesture.
- Oscillator type and frequency choice is a design decision (a wave, not a melody): keep it low,
  short, and quieter than speech. Nothing loops while the reader is reading.
- No `AnalyserNode` polling loop driving visuals unless a state change needs it; if you keep one,
  pause it when the document is hidden.

## Preferences and permissions

- `data-sound` off means silent *and* cheap: suspend the context, cancel scheduled sources, and do
  not keep a timer running.
- Respect the storage key `ad-sound` as the only persistence. Do not add a second key or a session
  flag that disagrees with it.
- Reduced motion or `data-a11y` does not imply mute, and mute does not imply reduced motion — read
  each switch for its own job.
- Never autoplay. Never resume on scroll. Never make sound the only feedback for an action.

## Verifying

- You can verify the **graph** (`AudioContext.state`, node connections, gain values) through CDP
  `evaluate` or `window.__ad` hooks; that is a real measurement.
- You cannot verify **how it sounds** in a headless run, and a muted VM proves nothing. Say
  "graph verified, listening UNVERIFIED" rather than "sound works".
- Watch the console: an unhandled resume rejection or a disconnected-node error will surface as a
  group-13 failure long after the sound code "worked".
