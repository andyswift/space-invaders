// Tiny WebAudio synth so the game needs no audio assets.
export function createAudio() {
  let ctx = null
  let muted = false
  const march = [55, 49, 44, 41]

  // Must be called from a user gesture (key press / click) so the browser allows audio.
  function unlock() {
    ctx ??= new (window.AudioContext || window.webkitAudioContext)()
    if (ctx.state !== 'running') ctx.resume().catch(() => {})
  }

  function tone(type, f0, f1, dur, vol = 0.12) {
    if (muted || !ctx || ctx.state !== 'running') return
    const t = ctx.currentTime
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(f0, t)
    osc.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t + dur)
    gain.gain.setValueAtTime(vol, t)
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur)
    osc.connect(gain).connect(ctx.destination)
    osc.start(t)
    osc.stop(t + dur)
  }

  return {
    unlock,
    toggleMute() {
      muted = !muted
      return muted
    },
    play(event, arg = 0) {
      switch (event) {
        case 'shoot': return tone('square', 880, 200, 0.12)
        case 'hit': return tone('sawtooth', 300, 40, 0.2)
        case 'ufoHit': return tone('sawtooth', 900, 100, 0.4)
        case 'die': return tone('sawtooth', 260, 30, 0.7, 0.18)
        case 'march': return tone('square', march[arg % 4], march[arg % 4] * 0.9, 0.09, 0.15)
        case 'ufo': return tone('sine', 700, 500, 0.3, 0.05)
        case 'level': return tone('square', 440, 880, 0.4)
        case 'rumble': return tone('sawtooth', 70, 38, 1.8, 0.1)
        case 'flip':
          tone('sawtooth', 220, 40, 0.45, 0.16)
          setTimeout(() => tone('sawtooth', 40, 330, 0.45, 0.16), 450)
          return
      }
    },
  }
}
