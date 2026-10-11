import { useCallback, useEffect, useRef, useState } from 'react'
import { W, H, newGame, update } from './engine'
import { createRenderer } from './render'
import { createAudio } from './audio'

const KEY_MAP = {
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  Space: 'fire', ArrowUp: 'fire', KeyW: 'fire',
}

function loadHi() {
  try {
    return Number(localStorage.getItem('invaders-hi')) || 0
  } catch {
    return 0
  }
}

export default function Game() {
  const canvasRef = useRef(null)
  const stateRef = useRef(newGame(loadHi()))
  const statusRef = useRef('start')
  const audio = useRef(null)
  audio.current ??= createAudio()
  const [status, setStatusState] = useState('start') // start | playing | paused | over
  const [result, setResult] = useState({ score: 0, level: 1, newHi: false })
  const [muted, setMuted] = useState(false)

  const setStatus = useCallback((v) => {
    statusRef.current = v
    setStatusState(v)
  }, [])

  const start = useCallback(() => {
    stateRef.current = newGame(loadHi())
    setStatus('playing')
  }, [setStatus])

  const toggleMute = useCallback(() => setMuted(audio.current.toggleMute()), [])

  // Input
  useEffect(() => {
    const unlock = () => audio.current.unlock()
    const down = (e) => {
      unlock()
      if (e.repeat && e.code !== 'Space') return
      if (e.code === 'KeyM') return toggleMute()
      if (e.code === 'KeyP' || e.code === 'Escape') {
        if (statusRef.current === 'playing') setStatus('paused')
        else if (statusRef.current === 'paused') setStatus('playing')
        return
      }
      if ((e.code === 'Enter' || e.code === 'Space') && (statusRef.current === 'start' || statusRef.current === 'over')) {
        e.preventDefault()
        return start()
      }
      const k = KEY_MAP[e.code]
      if (k) {
        e.preventDefault()
        stateRef.current.keys[k] = true
      }
    }
    const up = (e) => {
      const k = KEY_MAP[e.code]
      if (k) stateRef.current.keys[k] = false
    }
    const blur = () => {
      Object.assign(stateRef.current.keys, { left: false, right: false, fire: false })
      if (statusRef.current === 'playing') setStatus('paused')
    }
    window.addEventListener('pointerdown', unlock)
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', blur)
    return () => {
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', blur)
    }
  }, [start, setStatus, toggleMute])

  // Game loop: fixed 60 Hz simulation (identical speed on 60/120/144 Hz displays), render every frame.
  useEffect(() => {
    const draw = createRenderer(canvasRef.current)
    const STEP = 1 / 60
    let acc = 0
    let last = performance.now()
    let raf
    const frame = (now) => {
      acc += Math.min((now - last) / 1000, 0.1)
      last = now
      const s = stateRef.current
      if (statusRef.current === 'playing') {
        let steps = 0
        while (acc >= STEP && steps < 5 && !s.over) {
          update(s, STEP)
          acc -= STEP
          steps++
        }
        if (steps === 5) acc = 0
        for (const [name, arg] of s.events) audio.current.play(name, arg)
        s.events.length = 0
        if (s.over) {
          let newHi = false
          try {
            const prev = Number(localStorage.getItem('invaders-hi')) || 0
            if (s.score > prev) {
              localStorage.setItem('invaders-hi', String(s.score))
              newHi = s.score > 0
            }
          } catch {}
          setResult({ score: s.score, level: s.level, newHi })
          setStatus('over')
        }
      } else {
        acc = 0
      }
      draw(s, now)
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [setStatus])

  const hold = (key) => ({
    onPointerDown: (e) => {
      e.preventDefault()
      stateRef.current.keys[key] = true
    },
    onPointerUp: () => (stateRef.current.keys[key] = false),
    onPointerLeave: () => (stateRef.current.keys[key] = false),
    onPointerCancel: () => (stateRef.current.keys[key] = false),
  })

  return (
    <main className="app">
      <header className="lockup">
        <span className="kicker">SPACE</span>
        <h1 className="title">INVADERS</h1>
        <span className="sub">THE UPSIDE DOWN ODYSSEY</span>
      </header>
      <div className="stage">
        <canvas ref={canvasRef} width={W} height={H} />
        {status !== 'playing' && (
          <div className="overlay">
            {status === 'start' && (
              <>
                <h2 className="glow">READY?</h2>
                <ul className="points">
                  <li><b style={{ color: '#ff5af0' }}>30</b> pts</li>
                  <li><b style={{ color: '#5ad7ff' }}>20</b> pts</li>
                  <li><b style={{ color: '#9dff5a' }}>10</b> pts</li>
                  <li><b style={{ color: '#ff4d4d' }}>???</b> UFO</li>
                </ul>
                <button className="blink" onClick={start}>PRESS START</button>
                <p className="hint">← → move · Space fire · P pause · M mute</p>
                <p className="hint">Every so often the gate opens and the world flips.</p>
              </>
            )}
            {status === 'paused' && (
              <>
                <h2>PAUSED</h2>
                <button onClick={() => setStatus('playing')}>RESUME</button>
              </>
            )}
            {status === 'over' && (
              <>
                <h2 className="glow">GAME OVER</h2>
                <p>Score <b>{result.score}</b> · Level <b>{result.level}</b></p>
                {result.newHi && <p className="hi">★ NEW HIGH SCORE ★</p>}
                <button onClick={start}>PLAY AGAIN</button>
              </>
            )}
          </div>
        )}
      </div>
      <div className="controls">
        <button className="pad" {...hold('left')} aria-label="Move left">◀</button>
        <button className="pad fire" {...hold('fire')} aria-label="Fire">FIRE</button>
        <button className="pad" {...hold('right')} aria-label="Move right">▶</button>
      </div>
      <div className="foot">
        <a className="home" href="../">← moaswift.no</a>
        <a className="home" href="../invaders-3d/index.html">Try the 3D version</a>
        <button className="mute" onClick={toggleMute}>{muted ? '🔇 Sound off' : '🔊 Sound on'}</button>
      </div>
    </main>
  )
}
