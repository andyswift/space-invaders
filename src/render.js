import { SPRITES } from './sprites'
import {
  W, H, invRect,
  PLAYER_Y, PLAYER_W, PLAYER_H, UFO_W, UFO_H, UFO_Y,
  SH_COLS, SH_ROWS, SH_BLOCK,
} from './engine'

// Performance approach: every sprite, both backdrops and each shield are baked into offscreen
// canvases once. A frame is then just drawImage calls: no per-frame gradients, paths or shadowBlur.
// The surface/underground flip is a vertical squash of that same scene, so it costs nothing extra.

const DPR = Math.min(window.devicePixelRatio || 1, 2)
const FONT = '"Space Mono", ui-monospace, Menlo, Consolas, monospace'
const TAU = Math.PI * 2
const VOID = '#05030a'
const RED = '#ff2a3d'
const HORIZON = 250

const PALETTE = {
  above: {
    squid: '#ff5af0', crab: '#5ad7ff', octopus: '#9dff5a',
    ship: '#f2ead8', cockpit: RED, flame: 'rgba(255,179,71,.85)',
    beam: RED, bomb: '#ffd24d', bombGlow: '#ffb347', ufo: '#ff4d4d',
    eye: RED, hi: '#ff5af0', shield: '#12a58c', shieldTop: '#7dffe9',
    warn: RED, seam: '#ffd0d4', label: '#f2ead8',
  },
  under: {
    squid: '#b48cff', crab: '#ff9f5a', octopus: '#6dffd1',
    ship: '#efe8ff', cockpit: '#3ff0d0', flame: 'rgba(63,240,208,.85)',
    beam: '#3ff0d0', bomb: '#9dff5a', bombGlow: '#9dff5a', ufo: '#ff8a3d',
    eye: '#3ff0d0', hi: '#ff8a3d', shield: '#4e4036', shieldTop: '#a58f77',
    warn: '#ff8a3d', seam: '#d7fff6', label: '#efe8ff',
  },
}

function bake(w, h, pad, paint) {
  const c = document.createElement('canvas')
  c.width = Math.ceil((w + pad * 2) * DPR)
  c.height = Math.ceil((h + pad * 2) * DPR)
  const g = c.getContext('2d')
  g.scale(DPR, DPR)
  g.translate(pad, pad)
  paint(g)
  return { c, w, h, pad }
}

function put(ctx, spr, cx, cy, k = 1) {
  const w = (spr.w + spr.pad * 2) * k
  const h = (spr.h + spr.pad * 2) * k
  ctx.drawImage(spr.c, cx - w / 2, cy - h / 2, w, h)
}

const glow = (g, color, blur) => {
  g.shadowColor = color
  g.shadowBlur = blur * DPR
}

// Small seeded generator so the cave looks the same on every load.
function seeded(seed) {
  let v = seed
  return () => {
    v = (v * 16807) % 2147483647
    return v / 2147483647
  }
}

// --- creature paint functions (40-unit design space, matching the Design canvas) ---

function jelly(g, c, f) {
  g.fillStyle = c
  g.strokeStyle = c
  g.lineWidth = 2.4
  g.lineCap = 'round'
  g.beginPath()
  g.moveTo(5, 23)
  g.bezierCurveTo(5, 6, 35, 6, 35, 23)
  g.closePath()
  g.fill()
  const d = f ? -3 : 3
  for (const x of [11, 17, 23, 29]) {
    g.beginPath()
    g.moveTo(x, 23)
    g.quadraticCurveTo(x + d, 28, x, 32)
    g.quadraticCurveTo(x - d, 36, x, 39)
    g.stroke()
  }
  g.shadowBlur = 0
  g.fillStyle = VOID
  for (const x of [15, 25]) {
    g.beginPath()
    g.arc(x, 18, 2.6, 0, TAU)
    g.fill()
  }
}

function demogorgon(g, c, f) {
  g.fillStyle = c
  for (let i = 0; i < 5; i++) {
    g.save()
    g.translate(20, 20)
    g.rotate((i * TAU) / 5 + (f ? 0.14 : 0))
    g.globalAlpha = 0.92
    g.beginPath()
    g.ellipse(0, -11, 5.5, f ? 11 : 9.5, 0, 0, TAU)
    g.fill()
    g.restore()
  }
  g.shadowBlur = 0
  g.fillStyle = VOID
  g.beginPath()
  g.arc(20, 20, 7, 0, TAU)
  g.fill()
  g.fillStyle = c
  g.beginPath()
  g.arc(20, 20, 3.2, 0, TAU)
  g.fill()
}

function spider(g, c, f) {
  g.fillStyle = c
  g.strokeStyle = c
  g.lineWidth = 2.5
  g.lineCap = 'round'
  g.beginPath()
  g.ellipse(24, 15, 10, 8.5, 0, 0, TAU)
  g.fill()
  const o = f ? 3 : 0
  const legs = [
    [16, 13, 6, 4 + o, 2, 13],
    [15, 17, 4, 17, 3, 28 - o],
    [17, 21, 10, 27, 10, 35 - o],
  ]
  for (const [x, y, cx, cy, ex, ey] of legs) {
    for (const m of [1, -1]) {
      const fx = (v) => (m > 0 ? v : 48 - v)
      g.beginPath()
      g.moveTo(fx(x), y)
      g.quadraticCurveTo(fx(cx), cy, fx(ex), ey)
      g.stroke()
    }
  }
  g.shadowBlur = 0
  g.fillStyle = VOID
  for (const x of [20, 28]) {
    g.beginPath()
    g.arc(x, 14, 2, 0, TAU)
    g.fill()
  }
}

function ship(g, p) {
  g.fillStyle = p.ship
  g.beginPath()
  g.moveTo(30, 2)
  g.lineTo(37, 19)
  g.lineTo(56, 33)
  g.lineTo(56, 38)
  g.lineTo(40, 34)
  g.lineTo(30, 38)
  g.lineTo(20, 34)
  g.lineTo(4, 38)
  g.lineTo(4, 33)
  g.lineTo(23, 19)
  g.closePath()
  g.fill()
  g.shadowBlur = 0
  g.fillStyle = p.cockpit
  g.beginPath()
  g.ellipse(30, 18, 2.8, 6, 0, 0, TAU)
  g.fill()
}

function saucer(g, color) {
  g.fillStyle = color
  g.beginPath()
  g.ellipse(30, 16, 28, 7, 0, 0, TAU)
  g.fill()
  g.globalAlpha = 0.75
  g.beginPath()
  g.moveTo(16, 14)
  g.quadraticCurveTo(30, -6, 44, 14)
  g.closePath()
  g.fill()
  g.shadowBlur = 0
  g.globalAlpha = 0.6
  g.fillStyle = VOID
  for (let i = 0; i < 5; i++) {
    g.beginPath()
    g.arc(12 + i * 9, 16, 1.8, 0, TAU)
    g.fill()
  }
}

function creature(paint, color, frame, w, h, k) {
  return bake(w, h, 10, (g) => {
    g.scale(k, k)
    glow(g, color, 9 / k)
    paint(g, color, frame)
  })
}

// The classic arcade invaders for the surface: the original pixel art, two walk frames each.
const PX = 2
function classic(type, color) {
  return SPRITES[type].map((rows) =>
    bake(rows[0].length * PX, rows.length * PX, 8, (g) => {
      glow(g, color, 5)
      g.fillStyle = color
      for (let r = 0; r < rows.length; r++) {
        for (let c = 0; c < rows[r].length; c++) if (rows[r][c] === '#') g.fillRect(c * PX, r * PX, PX, PX)
      }
    }),
  )
}

function buildSet(realm) {
  const p = PALETTE[realm]
  const pair = (paint, color, w, h, k) => [0, 1].map((f) => creature(paint, color, f, w, h, k))
  const modern = realm === 'under'
  return {
    squid: modern ? pair(jelly, p.squid, 30, 30, 0.75) : classic('squid', p.squid),
    crab: modern ? pair(demogorgon, p.crab, 30, 30, 0.75) : classic('crab', p.crab),
    octopus: modern ? pair(spider, p.octopus, 36, 27, 0.75) : classic('octopus', p.octopus),
    ship: bake(42, 28, 10, (g) => {
      g.scale(0.7, 0.7)
      glow(g, 'rgba(255,235,210,.7)', 10 / 0.7)
      ship(g, p)
    }),
    ufo: bake(39, 16, 10, (g) => {
      g.scale(0.65, 0.65)
      glow(g, p.ufo, 12 / 0.65)
      saucer(g, p.ufo)
    }),
    bullet: bake(3, 14, 8, (g) => {
      glow(g, p.beam, 8)
      const grad = g.createLinearGradient(0, 0, 0, 14)
      grad.addColorStop(0, '#ffffff')
      grad.addColorStop(1, p.beam)
      g.fillStyle = grad
      g.fillRect(0, 0, 3, 14)
    }),
    bombs: [-2, 2].map((zig) =>
      bake(7, 10, 6, (g) => {
        glow(g, p.bombGlow, 6)
        g.fillStyle = p.bomb
        g.fillRect(2, 0, 3, 4)
        g.fillRect(2 + zig, 4, 3, 3)
        g.fillRect(2, 7, 3, 3)
      }),
    ),
    eye: bake(24, 24, 10, (g) => {
      glow(g, p.eye, 10)
      const grad = g.createRadialGradient(12, 12, 0, 12, 12, 11)
      grad.addColorStop(0, '#fff2c8')
      grad.addColorStop(0.2, '#fff2c8')
      grad.addColorStop(0.28, p.eye)
      grad.addColorStop(0.8, '#14040a')
      grad.addColorStop(1, '#14040a')
      g.fillStyle = grad
      g.beginPath()
      g.arc(12, 12, 11, 0, TAU)
      g.fill()
    }),
    // pulsing edge glow for the rumble before a flip
    edge: bake(W, H, 0, (g) => {
      const grad = g.createRadialGradient(W / 2, H / 2, H * 0.28, W / 2, H / 2, H * 0.72)
      grad.addColorStop(0, 'rgba(0,0,0,0)')
      grad.addColorStop(1, p.warn)
      g.fillStyle = grad
      g.fillRect(0, 0, W, H)
    }),
    // the bright seam the scene squashes into at the midpoint of a flip
    seam: bake(W, 60, 0, (g) => {
      const grad = g.createLinearGradient(0, 0, 0, 60)
      grad.addColorStop(0, 'rgba(255,255,255,0)')
      grad.addColorStop(0.5, p.seam)
      grad.addColorStop(1, 'rgba(255,255,255,0)')
      g.fillStyle = grad
      g.fillRect(0, 0, W, 60)
      glow(g, p.seam, 12)
      g.fillStyle = '#ffffff'
      g.fillRect(0, 28.5, W, 3)
    }),
  }
}

function vignette(g) {
  const vig = g.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.8)
  vig.addColorStop(0, 'rgba(0,0,0,0)')
  vig.addColorStop(1, 'rgba(0,0,0,.6)')
  g.fillStyle = vig
  g.fillRect(0, 0, W, H)
}

// Sky, stars, perspective floor receding to a distant monolith, ground line, vignette.
function buildSurface() {
  return bake(W, H, 0, (g) => {
    const sky = g.createLinearGradient(0, 0, 0, H)
    sky.addColorStop(0, VOID)
    sky.addColorStop(0.38, '#12060f')
    sky.addColorStop(0.62, '#2a0b16')
    sky.addColorStop(1, '#0a0308')
    g.fillStyle = sky
    g.fillRect(0, 0, W, H)

    for (let i = 0; i < 70; i++) {
      g.fillStyle = `rgba(255,235,215,${0.2 + Math.random() * 0.5})`
      const s = Math.random() < 0.18 ? 2 : 1
      g.fillRect(Math.random() * W, Math.random() * (HORIZON + 40), s, s)
    }

    const halo = g.createRadialGradient(W / 2, HORIZON, 0, W / 2, HORIZON, W * 0.62)
    halo.addColorStop(0, 'rgba(255,42,61,.4)')
    halo.addColorStop(1, 'rgba(255,42,61,0)')
    g.fillStyle = halo
    g.fillRect(0, HORIZON - 150, W, 300)

    // floor grid in perspective
    g.lineWidth = 1
    for (let k = 1; k <= 14; k++) {
      const t = k / 14
      const y = HORIZON + (H - HORIZON) * t * t
      g.strokeStyle = `rgba(255,42,61,${0.04 + 0.18 * t})`
      g.beginPath()
      g.moveTo(0, y)
      g.lineTo(W, y)
      g.stroke()
    }
    const fan = g.createLinearGradient(0, HORIZON, 0, H)
    fan.addColorStop(0, 'rgba(255,42,61,0)')
    fan.addColorStop(1, 'rgba(255,42,61,.22)')
    g.strokeStyle = fan
    for (let i = -10; i <= 10; i++) {
      g.beginPath()
      g.moveTo(W / 2 + i * 5, HORIZON)
      g.lineTo(W / 2 + i * 62, H)
      g.stroke()
    }
    const line = g.createLinearGradient(0, 0, W, 0)
    line.addColorStop(0, 'rgba(255,42,61,0)')
    line.addColorStop(0.5, RED)
    line.addColorStop(1, 'rgba(255,42,61,0)')
    g.fillStyle = line
    g.fillRect(0, HORIZON, W, 1.5)

    // faint distant ridge, low contrast so nothing on the horizon pulls the eye
    const rnd = seeded(7)
    g.beginPath()
    g.moveTo(0, HORIZON + 1)
    for (let x = 0; x <= W; x += 10) {
      const hill = 10 + 8 * Math.sin(x / 61) + 6 * Math.sin(x / 23 + 1)
      g.lineTo(x, HORIZON - Math.max(2, hill + rnd() * 5))
    }
    g.lineTo(W, HORIZON + 1)
    g.closePath()
    g.fillStyle = 'rgba(40,8,20,.55)'
    g.fill()

    // ground line
    glow(g, '#3cff6b', 8)
    g.fillStyle = '#3cff6b'
    g.fillRect(0, 542, W, 2)
    g.shadowBlur = 0

    vignette(g)
  })
}

function stalactites(g, rnd, base, hMin, hMax, wMin, wMax, fill, rim) {
  g.beginPath()
  g.moveTo(0, 0)
  g.lineTo(W, 0)
  g.lineTo(W, base)
  let x = W
  while (x > 0) {
    const w = wMin + rnd() * (wMax - wMin)
    const h = hMin + rnd() * (hMax - hMin)
    g.lineTo(x - w * 0.12, base)
    g.lineTo(x - w / 2, base + h)
    g.lineTo(x - w * 0.88, base)
    x -= w
  }
  g.lineTo(0, base)
  g.closePath()
  g.fillStyle = fill
  g.fill()
  if (rim) {
    g.strokeStyle = rim
    g.lineWidth = 1
    g.stroke()
  }
}

function caveFloor(g, rnd, base, fill, rim) {
  g.beginPath()
  g.moveTo(0, H)
  g.lineTo(0, base)
  for (let x = 0; x <= W; x += 16) g.lineTo(x, base - 3 + rnd() * 8)
  g.lineTo(W, H)
  g.closePath()
  g.fillStyle = fill
  g.fill()
  if (rim) {
    g.strokeStyle = rim
    g.lineWidth = 1
    g.stroke()
  }
}

// The underground: rock ceiling with roots, an ember gate on the horizon, strata, glowing fungus.
function buildCave() {
  return bake(W, H, 0, (g) => {
    const rnd = seeded(41)
    const sky = g.createLinearGradient(0, 0, 0, H)
    sky.addColorStop(0, '#07050e')
    sky.addColorStop(0.38, '#140d26')
    sky.addColorStop(0.68, '#251430')
    sky.addColorStop(1, '#0a0610')
    g.fillStyle = sky
    g.fillRect(0, 0, W, H)

    const halo = g.createRadialGradient(W / 2, HORIZON + 10, 0, W / 2, HORIZON + 10, W * 0.62)
    halo.addColorStop(0, 'rgba(255,138,61,.4)')
    halo.addColorStop(1, 'rgba(255,138,61,0)')
    g.fillStyle = halo
    g.fillRect(0, HORIZON - 150, W, 320)

    // the gate back to the surface
    const core = g.createRadialGradient(W / 2, HORIZON, 0, W / 2, HORIZON, 24)
    core.addColorStop(0, 'rgba(255,200,140,.5)')
    core.addColorStop(1, 'rgba(255,138,61,0)')
    g.fillStyle = core
    g.beginPath()
    g.arc(W / 2, HORIZON, 24, 0, TAU)
    g.fill()
    glow(g, '#ff8a3d', 14)
    g.strokeStyle = '#ff8a3d'
    g.lineWidth = 2.5
    g.beginPath()
    g.arc(W / 2, HORIZON, 22, 0, TAU)
    g.stroke()
    g.shadowBlur = 0

    // rock strata instead of the surface grid
    g.lineWidth = 1.5
    for (let k = 0; k < 5; k++) {
      const y = 320 + k * 42
      g.strokeStyle = `rgba(90,60,130,${0.2 + k * 0.06})`
      g.beginPath()
      g.moveTo(0, y)
      g.quadraticCurveTo(W * 0.25, y - 10, W * 0.5, y + 4)
      g.quadraticCurveTo(W * 0.75, y + 14, W, y - 2)
      g.stroke()
    }

    caveFloor(g, rnd, 530, '#1a1028', null)
    caveFloor(g, rnd, 544, '#0b0712', '#3a2455')

    // glowing fungus along the floor
    const cols = ['#3ff0d0', '#6dffd1', '#b48cff', '#9dff5a']
    for (let i = 0; i < 18; i++) {
      const c = cols[i % cols.length]
      glow(g, c, 12)
      g.fillStyle = c
      g.beginPath()
      g.arc(10 + rnd() * (W - 20), 540 + rnd() * 16, 2 + rnd() * 2.4, 0, TAU)
      g.fill()
    }
    g.shadowBlur = 0

    // ceiling, roots and their glowing tips
    stalactites(g, rnd, 22, 14, 42, 20, 40, '#1b1230', null)
    stalactites(g, rnd, 14, 10, 28, 16, 34, VOID, '#3a2455')
    g.strokeStyle = '#3a2455'
    g.lineWidth = 1.5
    g.lineCap = 'round'
    const roots = [[64, 30, 56, 62], [160, 30, 168, 58], [326, 30, 318, 66], [418, 30, 424, 54]]
    for (const [x, y, cx, ey] of roots) {
      g.beginPath()
      g.moveTo(x, y)
      g.bezierCurveTo(cx, y + 20, x + 14, ey - 16, x + 4, ey)
      g.stroke()
      glow(g, '#3ff0d0', 6)
      g.fillStyle = '#3ff0d0'
      g.beginPath()
      g.arc(x + 4, ey, 2, 0, TAU)
      g.fill()
      g.shadowBlur = 0
    }

    vignette(g)
  })
}

const shieldCache = new WeakMap()

function shieldCanvas(sh, realm) {
  let e = shieldCache.get(sh)
  if (!e) {
    const c = document.createElement('canvas')
    c.width = SH_COLS * SH_BLOCK * DPR
    c.height = SH_ROWS * SH_BLOCK * DPR
    e = { c, realm: null }
    shieldCache.set(sh, e)
  }
  if (sh.dirty || e.realm !== realm) {
    const p = PALETTE[realm]
    const g = e.c.getContext('2d')
    g.setTransform(DPR, 0, 0, DPR, 0, 0)
    g.clearRect(0, 0, SH_COLS * SH_BLOCK, SH_ROWS * SH_BLOCK)
    for (let y = 0; y < SH_ROWS; y++) {
      for (let x = 0; x < SH_COLS; x++) {
        if (!sh.cells[y * SH_COLS + x]) continue
        g.fillStyle = p.shield
        g.fillRect(x * SH_BLOCK, y * SH_BLOCK, SH_BLOCK, SH_BLOCK)
        if (y === 0 || !sh.cells[(y - 1) * SH_COLS + x]) {
          g.fillStyle = p.shieldTop
          g.fillRect(x * SH_BLOCK, y * SH_BLOCK, SH_BLOCK, 1)
        }
      }
    }
    sh.dirty = false
    e.realm = realm
  }
  return e.c
}

const pad6 = (n) => String(n).padStart(6, '0')

export function createRenderer(canvas) {
  canvas.width = W * DPR
  canvas.height = H * DPR
  const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true })
  const backdrops = { above: buildSurface(), under: buildCave() }
  const sets = { above: buildSet('above'), under: buildSet('under') }

  // Touch every baked image once up front so the browser uploads them to the GPU now,
  // not as a one-frame hitch the first time a flip reveals them.
  ctx.globalAlpha = 0.01
  for (const r of ['above', 'under']) {
    ctx.drawImage(backdrops[r].c, 0, 0, 1, 1)
    const set = sets[r]
    const imgs = [set.ship, set.ufo, set.bullet, set.eye, set.edge, set.seam, ...set.bombs, ...set.squid, ...set.crab, ...set.octopus]
    for (const spr of imgs) ctx.drawImage(spr.c, 0, 0, 1, 1)
  }
  ctx.globalAlpha = 1

  function text(str, x, y, size, color, align = 'left', weight = 'bold') {
    ctx.font = `${weight} ${size}px ${FONT}`
    ctx.fillStyle = color
    ctx.textAlign = align
    ctx.fillText(str, x, y)
  }

  return function draw(s, now) {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0)
    ctx.globalAlpha = 1
    const realm = s.realm
    const p = PALETTE[realm]
    const spr = sets[realm]
    const flipping = s.flip > 0
    const squash = flipping ? Math.max(0.02, Math.abs(Math.cos(Math.PI * s.flip))) : 1

    ctx.save()
    if (flipping) {
      // card-turn: the whole scene squashes to a seam around the screen's midline, then opens again
      ctx.fillStyle = VOID
      ctx.fillRect(0, 0, W, H)
      ctx.translate(0, H / 2)
      ctx.scale(1, squash)
      ctx.translate(0, -H / 2)
    }
    ctx.drawImage(backdrops[realm].c, 0, 0, W, H)

    ctx.save()
    if (s.shake > 0) {
      const m = s.shake * 14
      ctx.translate((Math.random() - 0.5) * m, (Math.random() - 0.5) * m)
    } else if (s.warned && !flipping) {
      ctx.translate((Math.random() - 0.5) * 2.2, (Math.random() - 0.5) * 2.2) // the ground rumbles
    }

    for (const sh of s.shields) ctx.drawImage(shieldCanvas(sh, realm), sh.x, sh.y, SH_COLS * SH_BLOCK, SH_ROWS * SH_BLOCK)

    // Classic sprites are drawn 1:1 with their hitboxes. The underground creatures are scaled
    // down a little in the upper rows: cheap depth without touching hitboxes.
    for (const inv of s.invaders) {
      if (!inv.alive) continue
      const r = invRect(s, inv)
      put(ctx, spr[inv.type][s.frame], r.x + r.w / 2, r.y + r.h / 2, realm === 'under' ? 0.8 + 0.04 * inv.r : 1)
    }

    if (s.ufo) put(ctx, spr.ufo, s.ufo.x + UFO_W / 2, UFO_Y + UFO_H / 2 + Math.sin(now / 160) * 1.5)

    if (s.deadTimer <= 0 && !s.over) {
      const cy = PLAYER_Y + PLAYER_H / 2
      ctx.fillStyle = p.flame
      ctx.fillRect(s.playerX - 2, cy + 10, 4, 3 + Math.random() * 5)
      put(ctx, spr.ship, s.playerX, cy - 1)
    }

    if (s.pBullet) put(ctx, spr.bullet, s.pBullet.x, s.pBullet.y + 7)
    const zig = Math.floor(now / 100) % 2
    for (const bomb of s.bombs) put(ctx, spr.bombs[zig], bomb.x, bomb.y + 5)

    for (const pt of s.particles) {
      ctx.globalAlpha = Math.min(1, pt.life * 2)
      ctx.fillStyle = pt.color
      ctx.fillRect(pt.x, pt.y, 3, 3)
    }
    ctx.globalAlpha = 1
    ctx.restore()
    ctx.restore()

    if (flipping) {
      ctx.globalAlpha = 1 - squash
      ctx.drawImage(spr.seam.c, 0, H / 2 - 30, W, 60)
      ctx.globalAlpha = 1
    }

    for (const f of s.floaters ?? []) text(String(f.text), f.x + UFO_W / 2, f.y, 14, '#ffffff', 'center')

    if (s.shake > 0.2) {
      ctx.fillStyle = `rgba(255,42,61,${(s.shake - 0.2) * 0.5})`
      ctx.fillRect(0, 0, W, H)
    }

    // rumble warning before a flip
    if (s.warned && !flipping) {
      ctx.globalAlpha = 0.3 + 0.3 * Math.sin(now / 90)
      ctx.drawImage(spr.edge.c, 0, 0, W, H)
      ctx.globalAlpha = Math.sin(now / 130) > -0.3 ? 1 : 0.35
      text(realm === 'above' ? 'THE GATE IS OPENING' : 'RETURNING TO THE SURFACE', W / 2, 300, 16, p.warn, 'center')
      ctx.globalAlpha = 1
    }

    // HUD
    text('SCORE', 14, 16, 10, 'rgba(242,234,216,.6)', 'left', 'normal')
    text(pad6(s.score), 14, 40, 22, p.label)
    text('HI-SCORE', W - 14, 16, 10, 'rgba(242,234,216,.6)', 'right', 'normal')
    text(pad6(s.hi), W - 14, 40, 22, p.hi, 'right')
    const wave = String(s.level).padStart(2, '0')
    if (realm === 'above') {
      ctx.globalAlpha = 0.75 + 0.25 * Math.sin(now / 380)
      put(ctx, spr.eye, W / 2, 20)
      ctx.globalAlpha = 1
      text(`WAVE ${wave}`, W / 2, 48, 10, 'rgba(242,234,216,.75)', 'center', 'normal')
    } else {
      text(`UNDERGROUND · WAVE ${wave}`, W / 2, 16, 10, '#3ff0d0', 'center')
      const frac = Math.max(0, Math.min(1, s.realmTimer / (s.realmLen || 1)))
      ctx.fillStyle = '#2a1b45'
      ctx.fillRect(W / 2 - 60, 24, 120, 5)
      ctx.fillStyle = '#ff8a3d'
      ctx.fillRect(W / 2 - 60, 24, 120 * frac, 5)
      text(`SURFACING IN ${Math.max(0, Math.ceil(s.realmTimer))}s`, W / 2, 46, 9, 'rgba(239,232,255,.75)', 'center', 'normal')
    }
    for (let i = 0; i < s.lives; i++) put(ctx, spr.ship, 28 + i * 32, 551, 0.6)

    if (s.banner > 0) text(`WAVE ${s.level}`, W / 2, 300, 34, p.label, 'center')
    if (s.realmBanner > 0 && !flipping) {
      ctx.globalAlpha = Math.min(1, s.realmBanner)
      text(realm === 'under' ? 'THE UNDERGROUND' : 'THE SURFACE', W / 2, 346, 24, realm === 'under' ? '#3ff0d0' : p.label, 'center')
      ctx.globalAlpha = 1
    }
  }
}
