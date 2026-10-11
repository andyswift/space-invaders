import { SPRITES } from './sprites'

export const W = 480
export const H = 560

const COLS = 11
export const ROWS = 5
const CELL_W = 34
const CELL_H = 28
const INV_SCALE = 2
const INV_H = 16
const STEP = 10
const EDGE = 8
const ROW_TYPES = ['squid', 'crab', 'crab', 'octopus', 'octopus']
const POINTS = { squid: 30, crab: 20, octopus: 10 }
export const COLORS = { squid: '#ff5af0', crab: '#5ad7ff', octopus: '#9dff5a' }
export const COLORS_UNDER = { squid: '#b48cff', crab: '#ff9f5a', octopus: '#6dffd1' }

// The world flips between the surface and the underground every so often.
const FLIP_TIME = 0.9 // seconds for the card-turn; play is paused while it runs
const WARN_TIME = 2 // rumble this long before a flip
const SURFACE_FOR = [26, 34]
const UNDER_FOR = [18, 24]

export const PLAYER_Y = 500
const PLAYER_SCALE = 3
export const PLAYER_W = SPRITES.player[0][0].length * PLAYER_SCALE
export const PLAYER_H = SPRITES.player[0].length * PLAYER_SCALE
const PLAYER_SPEED = 230

const UFO_SCALE = 2
export const UFO_W = SPRITES.ufo[0][0].length * UFO_SCALE
export const UFO_H = SPRITES.ufo[0].length * UFO_SCALE
export const UFO_Y = 52

export const SH_COLS = 20
export const SH_ROWS = 14
export const SH_BLOCK = 3
const SH_Y = 420

const rand = (a, b) => a + Math.random() * (b - a)

function makeShield(x) {
  const cells = new Uint8Array(SH_COLS * SH_ROWS)
  for (let r = 0; r < SH_ROWS; r++) {
    for (let c = 0; c < SH_COLS; c++) {
      const cutCorner = c < 4 - 2 * r || c >= SH_COLS - (4 - 2 * r)
      const cutArch = (r >= 10 && c >= 7 && c < 13) || (r === 9 && c >= 8 && c < 12)
      cells[r * SH_COLS + c] = cutCorner || cutArch ? 0 : 1
    }
  }
  return { x, y: SH_Y, cells }
}

function setupLevel(s) {
  s.invaders = []
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) s.invaders.push({ type: ROW_TYPES[r], r, c, alive: true })
  }
  s.alive = ROWS * COLS
  s.offX = 0
  s.offY = Math.min(s.level - 1, 5) * 12
  s.dir = 1
  s.frame = 0
  s.march = 0
  s.stepTimer = 0
  s.bombTimer = 1
  s.bombs = []
  s.pBullet = null
  s.ufo = null
  s.ufoTimer = rand(12, 20)
  s.shields = [0, 1, 2, 3].map((i) => makeShield(45 + i * 110))
}

export function newGame(hi = 0) {
  const s = {
    score: 0,
    hi,
    lives: 3,
    level: 1,
    playerX: W / 2,
    keys: { left: false, right: false, fire: false },
    particles: [],
    events: [],
    deadTimer: 0,
    shake: 0,
    realm: 'above', // 'above' | 'under'
    realmLen: 0,
    realmTimer: 0,
    realmBanner: 0,
    flip: 0, // 0 = not flipping, else progress 0..1
    warned: false,
    banner: 0,
    over: false,
  }
  setupLevel(s)
  armRealmTimer(s)
  return s
}

function armRealmTimer(s) {
  const [a, b] = s.realm === 'under' ? UNDER_FOR : SURFACE_FOR
  s.realmLen = rand(a, b)
  s.realmTimer = s.realmLen
  s.warned = false
}

const startX = (W - COLS * CELL_W) / 2

export function invRect(s, inv) {
  const w = SPRITES[inv.type][0][0].length * INV_SCALE
  return {
    x: startX + inv.c * CELL_W + s.offX + (24 - w) / 2,
    y: 70 + inv.r * CELL_H + s.offY,
    w,
    h: INV_H,
  }
}

const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y

function burst(s, x, y, color, n = 12, speed = 90) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2
    const v = rand(20, speed)
    s.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rand(0.3, 0.7), color })
  }
}

function erode(sh, lx, ly) {
  sh.dirty = true
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const d = dx * dx + dy * dy
      const x = lx + dx
      const y = ly + dy
      if (x < 0 || y < 0 || x >= SH_COLS || y >= SH_ROWS) continue
      if (d <= 4 || (d <= 8 && Math.random() < 0.5)) sh.cells[y * SH_COLS + x] = 0
    }
  }
}

// Sweep a projectile's leading edge from y0 to y1 so fast shots can't tunnel through shields.
function sweepShields(s, x, y0, y1) {
  const dir = Math.sign(y1 - y0) || 1
  for (let y = y0; dir > 0 ? y <= y1 : y >= y1; y += 2 * dir) {
    for (const sh of s.shields) {
      const lx = Math.floor((x - sh.x) / SH_BLOCK)
      const ly = Math.floor((y - sh.y) / SH_BLOCK)
      if (lx < 0 || ly < 0 || lx >= SH_COLS || ly >= SH_ROWS) continue
      if (sh.cells[ly * SH_COLS + lx]) {
        erode(sh, lx, ly)
        burst(s, x, y, s.realm === 'under' ? '#a58f77' : '#3cff6b', 5, 50)
        return true
      }
    }
  }
  return false
}

function stepInvaders(s) {
  let minX = Infinity
  let maxX = -Infinity
  for (const inv of s.invaders) {
    if (!inv.alive) continue
    const r = invRect(s, inv)
    minX = Math.min(minX, r.x)
    maxX = Math.max(maxX, r.x + r.w)
  }
  if (minX + s.dir * STEP < EDGE || maxX + s.dir * STEP > W - EDGE) {
    s.dir *= -1
    s.offY += 16
  } else {
    s.offX += s.dir * STEP
  }
  s.frame ^= 1
  s.events.push(['march', s.march++])

  // Invaders crush shield blocks they touch.
  for (const inv of s.invaders) {
    if (!inv.alive) continue
    const r = invRect(s, inv)
    for (const sh of s.shields) {
      if (!overlap(r, { x: sh.x, y: sh.y, w: SH_COLS * SH_BLOCK, h: SH_ROWS * SH_BLOCK })) continue
      for (let ly = 0; ly < SH_ROWS; ly++) {
        for (let lx = 0; lx < SH_COLS; lx++) {
          const cell = { x: sh.x + lx * SH_BLOCK, y: sh.y + ly * SH_BLOCK, w: SH_BLOCK, h: SH_BLOCK }
          if (overlap(r, cell)) {
            sh.cells[ly * SH_COLS + lx] = 0
            sh.dirty = true
          }
        }
      }
    }
    if (r.y + r.h >= PLAYER_Y) s.over = true
  }
}

function spawnBomb(s) {
  const cols = []
  for (let c = 0; c < COLS; c++) {
    let low = null
    for (const inv of s.invaders) if (inv.alive && inv.c === c && (!low || inv.r > low.r)) low = inv
    if (low) cols.push(low)
  }
  if (!cols.length) return
  const inv = cols[Math.floor(Math.random() * cols.length)]
  const r = invRect(s, inv)
  s.bombs.push({ x: r.x + r.w / 2, y: r.y + r.h })
}

function killPlayer(s) {
  s.lives--
  s.events.push(['die'])
  s.shake = 0.5
  burst(s, s.playerX, PLAYER_Y + PLAYER_H / 2, '#ffffff', 30, 160)
  s.bombs = []
  s.pBullet = null
  if (s.lives <= 0) s.over = true
  else s.deadTimer = 1.4
}

function startFlip(s) {
  s.flip = 0.0001
  s.warned = false
  s.events.push(['flip'])
}

// Card-turn: the realm swaps at the midpoint, when the scene is squashed to a seam.
function advanceFlip(s, dt) {
  const before = s.flip
  s.flip += dt / FLIP_TIME
  if (before < 0.5 && s.flip >= 0.5) s.realm = s.realm === 'above' ? 'under' : 'above'
  if (s.flip >= 1) {
    s.flip = 0
    s.realmBanner = 1.8
    armRealmTimer(s)
  }
}

export function update(s, dt) {
  s.shake = Math.max(0, s.shake - dt)
  s.realmBanner = Math.max(0, s.realmBanner - dt)
  for (const p of s.particles) {
    p.x += p.vx * dt
    p.y += p.vy * dt
    p.life -= dt
  }
  s.particles = s.particles.filter((p) => p.life > 0)
  if (s.over) return

  if (s.deadTimer > 0) {
    s.deadTimer -= dt
    if (s.deadTimer <= 0) s.playerX = W / 2
    return
  }
  if (s.banner > 0) {
    s.banner -= dt
    return
  }
  if (s.flip > 0) {
    advanceFlip(s, dt)
    return
  }
  s.realmTimer -= dt
  if (s.realmTimer <= WARN_TIME && !s.warned) {
    s.warned = true
    s.events.push(['rumble'])
  }
  if (s.realmTimer <= 0) {
    startFlip(s)
    return
  }

  // Player
  const move = (s.keys.right ? 1 : 0) - (s.keys.left ? 1 : 0)
  s.playerX = Math.max(PLAYER_W / 2 + 4, Math.min(W - PLAYER_W / 2 - 4, s.playerX + move * PLAYER_SPEED * dt))
  if (s.keys.fire && !s.pBullet) {
    s.pBullet = { x: s.playerX, y: PLAYER_Y - 6 }
    s.events.push(['shoot'])
  }

  // Player bullet
  const b = s.pBullet
  if (b) {
    const oldY = b.y
    b.y -= 520 * dt
    const rect = { x: b.x - 1.5, y: b.y, w: 3, h: 12 }
    let gone = b.y < 40 - 12
    for (const inv of s.invaders) {
      if (gone) break
      if (!inv.alive) continue
      const r = invRect(s, inv)
      if (overlap(rect, r)) {
        inv.alive = false
        s.alive--
        s.score += POINTS[inv.type]
        burst(s, r.x + r.w / 2, r.y + r.h / 2, (s.realm === 'under' ? COLORS_UNDER : COLORS)[inv.type])
        s.events.push(['hit'])
        gone = true
      }
    }
    if (!gone && s.ufo && overlap(rect, { x: s.ufo.x, y: UFO_Y, w: UFO_W, h: UFO_H })) {
      const pts = [50, 100, 150, 300][Math.floor(Math.random() * 4)]
      s.score += pts
      s.floaters = [{ x: s.ufo.x, y: UFO_Y, text: String(pts), life: 1 }]
      burst(s, s.ufo.x + UFO_W / 2, UFO_Y + UFO_H / 2, s.realm === 'under' ? '#ff8a3d' : '#ff4d4d', 20, 120)
      s.events.push(['ufoHit'])
      s.ufo = null
      gone = true
    }
    if (!gone && sweepShields(s, b.x, oldY, b.y)) gone = true
    if (gone) s.pBullet = null
  }
  s.hi = Math.max(s.hi, s.score)

  // Invader march
  s.stepTimer += dt
  const interval = (0.04 + 0.46 * (s.alive / (ROWS * COLS))) / (1 + 0.08 * (s.level - 1))
  if (s.stepTimer >= interval) {
    s.stepTimer = 0
    stepInvaders(s)
    if (s.over) return
  }

  // Bombs
  s.bombTimer -= dt
  if (s.bombTimer <= 0 && s.bombs.length < 3 + Math.floor(s.level / 2)) {
    spawnBomb(s)
    s.bombTimer = rand(0.4, 1.1) / (1 + 0.1 * (s.level - 1))
  }
  const playerRect = { x: s.playerX - PLAYER_W / 2, y: PLAYER_Y, w: PLAYER_W, h: PLAYER_H }
  const speed = 200 + s.level * 15
  for (const bomb of s.bombs) {
    const oldTip = bomb.y + 10
    bomb.y += speed * dt
    if (sweepShields(s, bomb.x, oldTip, bomb.y + 10)) bomb.dead = true
    else if (overlap({ x: bomb.x - 1.5, y: bomb.y, w: 3, h: 10 }, playerRect)) {
      killPlayer(s)
      return
    } else if (bomb.y > 540) {
      burst(s, bomb.x, 540, '#ffb347', 5, 40)
      bomb.dead = true
    }
  }
  s.bombs = s.bombs.filter((bomb) => !bomb.dead)

  // UFO
  s.ufoTimer -= dt
  if (s.ufoTimer <= 0 && !s.ufo && s.alive > 8) {
    const right = Math.random() < 0.5
    s.ufo = { x: right ? -UFO_W : W, vx: right ? 90 : -90 }
    s.ufoTimer = rand(15, 25)
    s.events.push(['ufo'])
  }
  if (s.ufo) {
    s.ufo.x += s.ufo.vx * dt
    if (s.ufo.x < -UFO_W - 4 || s.ufo.x > W + 4) s.ufo = null
  }
  if (s.floaters) {
    for (const f of s.floaters) {
      f.life -= dt
      f.y -= 10 * dt
    }
    s.floaters = s.floaters.filter((f) => f.life > 0)
  }

  // Level cleared
  if (s.alive === 0) {
    s.level++
    s.lives = Math.min(s.lives + 1, 5)
    setupLevel(s)
    s.banner = 1.6
    s.events.push(['level'])
  }
}
