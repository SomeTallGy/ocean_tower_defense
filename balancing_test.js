// Tidewatch — Balancing Simulation
// Run: node balancing_test.js
// Simulates all 10 waves with a fixed "reasonable player" tower build and reports per-wave stats.

// ─── Constants ────────────────────────────────────────────────────────────────
const TILE = 64;
const DT = 1 / 60; // simulate at 60fps

const PATH_WAYPOINTS = [
  [3,0],[3,1],[3,2],[3,3],[3,4],
  [4,4],[5,4],[6,4],[7,4],
  [7,5],[7,6],[7,7],[7,8],
  [6,8],[5,8],[4,8],[3,8],[2,8],[1,8],
  [1,9],[1,10],[1,11],
  [2,11],[3,11],[4,11],[5,11],[6,11],[7,11],[8,11],[9,11],[10,11],
  [10,10],[10,9],[10,8],[10,7],[10,6],[10,5],[10,4],[10,3],
  [11,3],[12,3],[13,3],[14,3],
  [14,4],[14,5],[14,6],[14,7],[14,8],[14,9],[14,10],[14,11]
];
const PATH_SET = new Set(PATH_WAYPOINTS.map(([c,r]) => `${c},${r}`));

function isWater(col, row) {
  return col === 0 || col === 15 || row === 0 || row === 11;
}
function isBuildable(col, row) {
  return !PATH_SET.has(`${col},${row}`) && !isWater(col, row)
      && col >= 0 && col < 16 && row >= 0 && row < 12;
}

// ─── Definitions ──────────────────────────────────────────────────────────────
const ENEMY_DEFS = {
  bag:  { hp:40,  speed:2.5, reward:10,  name:'Plastic bag' },
  can:  { hp:120, speed:1.8, reward:20,  name:'Soda can' },
  tire: { hp:500, speed:1.0, reward:40,  name:'Old tire' },
  boss: { hp:1200, speed:0.8, reward:100, name:'Trash bag boss', boss:true },
};

const TOWER_DEFS = {
  net:     { name:'Net Launcher',  cost:50,  range:2.5, damage:0,  slowDuration:2000, fireRate:0,   emoji:'N' },
  seagull: { name:'Seagull Squad', cost:75,  range:2,   damage:20, fireRate:1.5,       emoji:'S' },
  whale:   { name:'Whale Spout',   cost:100, range:3,   damage:40, fireRate:0.5, aoeRadius:1, emoji:'W' },
};

const WAVES = [
  { enemies: [{type:'bag', count:8}] },
  { enemies: [{type:'bag', count:12}] },
  { enemies: [{type:'bag', count:10},{type:'can', count:5}] },
  { enemies: [{type:'bag', count:8},{type:'can', count:10}] },
  { enemies: [{type:'bag', count:15},{type:'can', count:5},{type:'boss', count:1}] },
  { enemies: [{type:'bag', count:5},{type:'can', count:15},{type:'tire', count:2}] },
  { enemies: [{type:'can', count:10},{type:'tire', count:4}] },
  { enemies: [{type:'bag', count:20},{type:'can', count:8},{type:'tire', count:4}] },
  { enemies: [{type:'bag', count:10},{type:'can', count:15},{type:'tire', count:6}] },
  { enemies: [{type:'bag', count:20},{type:'can', count:10},{type:'tire', count:6},{type:'boss', count:2}] },
];

// ─── Tower placement strategy ─────────────────────────────────────────────────
// "Reasonable player": places towers flanking the path at high-traffic corners.
// Spends starting 150 coins, then spends earned coins each wave on more towers.
// Priority: seagull → whale → net, placed at best available spots near path bends.

// Good spots interleaved across path sections so the bot spreads coverage
// rather than stacking at the start. Order = one from each section, then fill.
const GOOD_SPOTS = [
  [4,3],    // near path start (top-left bend)
  [8,6],    // mid-path (middle vertical)
  [6,10],   // lower-middle (bottom horizontal)
  [11,5],   // right vertical (upper)
  [2,4],    // top-left fill
  [8,5],
  [9,8],
  [7,10],
  [2,3],
  [8,7],
  [5,10],
  [9,5],
  [6,5],
  [2,9],
  [8,10],
  [11,6],
  [6,6],
  [2,10],
  [9,10],
  [11,4],
  [9,4],
  [9,6],
  [9,7],
  [11,7],
  [13,2],
  [13,4],
].filter(([c,r]) => isBuildable(c,r));

// ─── Simulation helpers ───────────────────────────────────────────────────────
function spawnEnemy(type, waypointIndex = 0) {
  const [sc, sr] = PATH_WAYPOINTS[waypointIndex];
  const def = ENEMY_DEFS[type];
  return {
    type, hp: def.hp, maxHp: def.hp,
    speed: def.speed, reward: def.reward,
    x: sc * TILE + TILE/2, y: sr * TILE + TILE/2,
    waypointIndex, slowTimer: 0,
    dead: false, reached: false,
  };
}

function makeTower(type, col, row) {
  const def = TOWER_DEFS[type];
  return {
    type, col, row,
    range: def.range,
    damage: def.damage,
    slowDuration: def.slowDuration || 2000,
    aoeRadius: def.aoeRadius || 0,
    multiTarget: 1,
    cooldown: 0,
    upgradeLevel: 0,
    totalSpent: def.cost,
  };
}

function buildSpawnQueue(waveDef) {
  const q = [];
  for (const g of waveDef.enemies)
    for (let i = 0; i < g.count; i++) q.push(g.type);
  // shuffle
  for (let i = q.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i+1));
    [q[i], q[j]] = [q[j], q[i]];
  }
  return q;
}

// Buy towers greedily: try seagull → whale → net at next available good spot
function buyTowers(state) {
  const occupied = new Set(state.towers.map(t => `${t.col},${t.row}`));
  const available = GOOD_SPOTS.filter(([c,r]) => !occupied.has(`${c},${r}`));
  const priority = ['seagull','whale','net','seagull','whale','seagull'];
  for (const spot of available) {
    for (const type of priority) {
      const cost = TOWER_DEFS[type].cost;
      if (state.coins >= cost) {
        state.towers.push(makeTower(type, spot[0], spot[1]));
        state.coins -= cost;
        break;
      }
    }
    if (state.coins < 50) break; // cheapest tower is net at 50
  }
}

// ─── Core simulation tick ─────────────────────────────────────────────────────
function simulateWave(waveIndex, state) {
  const queue = buildSpawnQueue(WAVES[waveIndex]);
  let spawnTimer = 0;
  const projectiles = [];
  let livesLostThisWave = 0;
  let coinsEarnedThisWave = 0;
  let ticks = 0;
  const MAX_TICKS = 60 * 300; // 5 minute safety cap

  while (ticks++ < MAX_TICKS) {
    // Spawn
    if (queue.length > 0) {
      spawnTimer -= DT * 1000;
      if (spawnTimer <= 0) {
        state.enemies.push(spawnEnemy(queue.shift()));
        spawnTimer = 800;
      }
    }

    // Move enemies
    for (const e of state.enemies) {
      if (e.dead || e.reached) continue;
      const effectiveSpeed = e.slowTimer > 0 ? e.speed * 0.5 : e.speed;
      let dist = effectiveSpeed * TILE * DT;
      e.slowTimer = Math.max(0, e.slowTimer - DT * 1000);

      while (dist > 0 && e.waypointIndex < PATH_WAYPOINTS.length - 1) {
        const [tc, tr] = PATH_WAYPOINTS[e.waypointIndex + 1];
        const tx = tc * TILE + TILE/2, ty = tr * TILE + TILE/2;
        const dx = tx - e.x, dy = ty - e.y;
        const rem = Math.hypot(dx, dy);
        if (dist >= rem) {
          e.x = tx; e.y = ty; e.waypointIndex++; dist -= rem;
        } else {
          e.x += (dx/rem)*dist; e.y += (dy/rem)*dist; dist = 0;
        }
      }

      if (e.waypointIndex >= PATH_WAYPOINTS.length - 1) {
        e.reached = true;
        state.lives = Math.max(0, state.lives - 1);
        livesLostThisWave++;
        if (state.lives === 0) return { livesLost: livesLostThisWave, coinsEarned: coinsEarnedThisWave, wiped: true };
      }
    }

    // Tower firing
    for (const t of state.towers) {
      t.cooldown = Math.max(0, t.cooldown - DT * 1000);
      if (t.cooldown > 0) continue;
      const cx = t.col * TILE + TILE/2, cy = t.row * TILE + TILE/2;

      let nearest = null, nearestDist = Infinity;
      for (const e of state.enemies) {
        if (e.dead || e.reached) continue;
        const d = Math.hypot(e.x - cx, e.y - cy);
        if (d <= t.range * TILE && d < nearestDist) { nearest = e; nearestDist = d; }
      }
      if (!nearest) continue;

      if (t.type === 'net') {
        for (const e of state.enemies) {
          if (e.dead || e.reached) continue;
          if (Math.hypot(e.x - cx, e.y - cy) <= t.range * TILE) e.slowTimer = t.slowDuration;
        }
        t.cooldown = 2000;
      } else if (t.type === 'seagull') {
        projectiles.push({ x: cx, y: cy, target: nearest, damage: t.damage, speed: 400, type: 'seagull' });
        t.cooldown = 667;
      } else if (t.type === 'whale') {
        projectiles.push({ x: cx, y: cy, target: nearest, damage: t.damage, aoeRadius: t.aoeRadius, speed: 250, type: 'whale' });
        t.cooldown = 2000;
      }
    }

    // Move projectiles
    for (let i = projectiles.length - 1; i >= 0; i--) {
      const p = projectiles[i];
      if (!p.target || p.target.dead || p.target.reached) { projectiles.splice(i,1); continue; }
      const dx = p.target.x - p.x, dy = p.target.y - p.y;
      const dist = Math.hypot(dx, dy);
      const step = p.speed * DT;
      if (step >= dist || dist < 6) {
        if (p.type === 'whale') {
          for (const e of state.enemies) {
            if (e.dead || e.reached) continue;
            if (Math.hypot(e.x - p.target.x, e.y - p.target.y) <= p.aoeRadius * TILE) {
              e.hp -= p.damage;
              if (e.hp <= 0) e.dead = true;
            }
          }
        } else {
          p.target.hp -= p.damage;
          if (p.target.hp <= 0) p.target.dead = true;
        }
        projectiles.splice(i,1);
      } else {
        p.x += (dx/dist)*step; p.y += (dy/dist)*step;
      }
    }

    // Award coins & boss spawns
    for (const e of state.enemies) {
      if (e.dead) {
        state.coins += e.reward;
        coinsEarnedThisWave += e.reward;
        if (e.type === 'boss') {
          state.enemies.push(spawnEnemy('bag', e.waypointIndex));
          state.enemies.push(spawnEnemy('bag', e.waypointIndex));
        }
      }
    }
    state.enemies = state.enemies.filter(e => !e.dead && !e.reached);

    // Wave done?
    if (queue.length === 0 && state.enemies.length === 0 && projectiles.length === 0) break;
  }

  return { livesLost: livesLostThisWave, coinsEarned: coinsEarnedThisWave, wiped: false };
}

// ─── Run simulation ───────────────────────────────────────────────────────────
const RUNS = 5; // average over multiple runs (shuffle randomness)

function runFullGame() {
  const state = {
    coins: 150,
    lives: 3,
    towers: [],
    enemies: [],
  };

  const results = [];

  for (let w = 0; w < WAVES.length; w++) {
    buyTowers(state); // spend available coins before wave
    const towerSnapshot = state.towers.map(t => `${t.type}@(${t.col},${t.row})`);
    const result = simulateWave(w, state);

    const waveEnemyCount = WAVES[w].enemies.reduce((s,g) => s + g.count, 0);
    results.push({
      wave: w + 1,
      towers: state.towers.length,
      towerTypes: state.towers.reduce((acc, t) => { acc[t.type] = (acc[t.type]||0)+1; return acc; }, {}),
      livesLost: result.livesLost,
      livesRemaining: state.lives,
      coinsEarned: result.coinsEarned,
      coinsAfter: state.coins,
      enemyCount: waveEnemyCount,
      wiped: result.wiped,
    });

    if (result.wiped) break;
  }

  return results;
}

// Average across RUNS
const allRuns = Array.from({ length: RUNS }, () => runFullGame());

// Merge results wave by wave
console.log('\n══════════════════════════════════════════════════════════');
console.log('  TIDEWATCH — BALANCE SIMULATION REPORT');
console.log(`  ${RUNS} runs averaged  |  Fixed tower build (seagull → whale → net priority)`);
console.log('══════════════════════════════════════════════════════════\n');

const maxWaves = Math.max(...allRuns.map(r => r.length));

for (let w = 0; w < maxWaves; w++) {
  const waveRuns = allRuns.map(r => r[w]).filter(Boolean);
  const avgLivesLost   = (waveRuns.reduce((s,r) => s + r.livesLost, 0) / waveRuns.length).toFixed(2);
  const avgLivesLeft   = (waveRuns.reduce((s,r) => s + r.livesRemaining, 0) / waveRuns.length).toFixed(1);
  const avgCoinsEarned = Math.round(waveRuns.reduce((s,r) => s + r.coinsEarned, 0) / waveRuns.length);
  const avgCoinsAfter  = Math.round(waveRuns.reduce((s,r) => s + r.coinsAfter, 0) / waveRuns.length);
  const wipeCount      = waveRuns.filter(r => r.wiped).length;
  const towers         = waveRuns[0]?.towerTypes ?? {};
  const towerStr       = Object.entries(towers).map(([k,v]) => `${v}×${k}`).join(', ');
  const enemies        = waveRuns[0]?.enemyCount ?? '?';

  const danger = Number(avgLivesLost) >= 2 ? '⚠️  DANGER' : Number(avgLivesLost) >= 1 ? '⚡ tense' : '✅ fine';

  console.log(`Wave ${String(w+1).padStart(2,' ')}  [${enemies} enemies]  towers: ${towerStr}`);
  console.log(`        lives lost: ${avgLivesLost} avg  |  lives remaining: ${avgLivesLeft}  |  ${danger}`);
  console.log(`        coins earned: ${avgCoinsEarned}  |  coins after wave: ${avgCoinsAfter}`);
  if (wipeCount > 0) console.log(`        ☠️  WIPED in ${wipeCount}/${RUNS} runs`);
  console.log();
}

// Summary
const survivedAll = allRuns.filter(r => r.length === 10 && !r[9]?.wiped).length;
console.log('══════════════════════════════════════════════════════════');
console.log(`  Completed all 10 waves: ${survivedAll}/${RUNS} runs`);
console.log('══════════════════════════════════════════════════════════\n');

console.log('BALANCING NOTES:');
for (let w = 0; w < maxWaves; w++) {
  const waveRuns = allRuns.map(r => r[w]).filter(Boolean);
  const avgLivesLost = waveRuns.reduce((s,r) => s + r.livesLost, 0) / waveRuns.length;
  const avgCoinsAfter = waveRuns.reduce((s,r) => s + r.coinsAfter, 0) / waveRuns.length;
  if (avgLivesLost === 0 && avgCoinsAfter > 300)
    console.log(`  Wave ${w+1}: too easy — player hoarding ${Math.round(avgCoinsAfter)} coins, 0 lives lost`);
  if (avgLivesLost >= 1.5)
    console.log(`  Wave ${w+1}: very hard — ${avgLivesLost.toFixed(1)} lives lost on average`);
}
console.log();
