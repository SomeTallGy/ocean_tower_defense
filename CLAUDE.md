# Tidewatch — CLAUDE.md

This file is the source of truth for Tidewatch. Do not change any value in this file without being explicitly asked to. Do not rebalance stats, rename things, or adjust costs between sessions.

---

## Game identity

- **Name:** Tidewatch
- **Genre:** Tower defense
- **Theme:** Ocean cleanup — stop trash from reaching the sea
- **Target player:** Kids (8–10), fun for adults too
- **Tone:** Bright, playful, slightly cartoon-y. Characters have personality. Winning feels celebratory.

---

## Grid & map

| Property | Value |
|---|---|
| Grid dimensions | 16 × 12 tiles |
| Tile size | 64 × 64 px |
| Canvas size | 1024 × 768 px |
| Path | Pre-set, winding, top → bottom |
| Buildable tiles | Sand tiles flanking the path |
| Non-buildable | Path tiles, water tiles |
| Lives | 3 |

Path is stored as an ordered array of `[col, row]` waypoints. Enemies lerp between waypoints each frame.

---

## Currency

| Currency | Earned by | Spent on |
|---|---|---|
| Coins | Stopping trash (+ 150 starting) | Towers, upgrades, clams |
| Seashells | Clam consolation prize | One-use powerups (held in inventory) |

---

## Tower types

| Tower | Base cost | Base range (tiles) | Base damage | Fire rate (shots/sec) | Upgrade 1 (50 coins) | Upgrade 2 (100 coins) |
|---|---|---|---|---|---|---|
| Net launcher | 50 | 2.5 | 0 (slows only) | — (burst fire, see below) | Slow duration: 2s → 4s | Slow radius: 2.5 → 4 tiles |
| Seagull squad | 75 | 2 | 15 | 1.75 | Targets 1 → 2 enemies at once | Damage: 15 → 25 |
| Whale spout | 100 | 3 | 40 (AoE) | 0.5 | AoE radius: 1 → 2 tiles | Damage: 40 → 70 |

### Net Launcher burst mechanic
- Fires 5 shots, then enters a 4-second reload state
- During reload: tower circle turns grey, a teal progress bar fills beneath it
- `burstShots` and `reloadTimer` are reset to 0 at the start of each wave
- Slow percentage (50%) and range are unchanged

- Towers placed by dragging from the bottom panel onto a buildable tile
- Click a placed tower to open upgrade/sell popup
- Sell value: 50% of total coins spent on that tower

---

## Animal companions (gacha)

Animals are placeable units earned through the clam shop. They fight automatically like towers but have unique character-driven abilities.

### Clam shop

- **Clam cost:** 75 coins
- **Unlocks:** After wave 3 completes
- **Roll odds:** 50% animal, 50% seashell powerup
- **Duplicate rule:** Rolling an animal already owned auto-upgrades it to level 2 for free (or level 3 if already level 2)
- **Which animal:** Uniform random from animals not yet at max level; if all maxed, gives a seashell instead

### Animal roster

| Animal | Ability | Base damage | Cooldown | Upgrade 1 (50 coins) | Upgrade 2 (100 coins) |
|---|---|---|---|---|---|
| Swordfish | Charges forward, spears one trash piece, flings it off the path | 60 | 3s | Damage: 60 → 90 | Charge pierces 2 enemies |
| Octopus | Grabs up to 3 nearby trash pieces, holds them for 3s | 0 (CC only) | 6s | Hold duration: 3s → 5s | Grabs up to 5 enemies |
| Pufferfish | Explodes in a ring AoE, then recharges | 50 (AoE) | 8s | Damage: 50 → 80 | Explosion radius +50% |
| Sea turtle | Blocks path — trash that reaches it is pushed back 2 tiles | 0 (blocker) | — | HP: 150 → 250 | Push-back distance: 2 → 4 tiles |

- Animals placed from the Animals tab in the bottom panel
- Only animals you own appear there
- Same upgrade/sell popup as towers

---

## Seashell powerups

Stored as an inventory (max 3 held at once). Tap icon in HUD to activate mid-wave.

| Powerup | Effect | Duration |
|---|---|---|
| Tidal wave | Slows all enemies on path by 60% | 5s |
| Coin current | Doubles coin drops | Rest of current wave |
| Sea foam | Restores 1 lost life | Instant |

Seashell drop is random uniform across the three types.

---

## Trash enemy types

| Enemy | HP | Shield HP | Speed (tiles/sec) | Coin reward | Introduced |
|---|---|---|---|---|---|
| Plastic bag | 40 | 0 | 2.5 | 10 | Wave 1 |
| Soda can | 120 | 40 | 1.8 | 20 | Wave 2 |
| Old tire | 500 | 150 | 1.0 | 40 | Wave 6 |
| Trash bag (boss) | 1200 | 300 | 0.8 | 100 | Wave 5 |

### Shield system
- Soda Can, Old Tire, and Trash Bag carry a shield HP layer. Incoming damage depletes the shield before touching real HP.
- When the shield breaks, a white burst/pop effect fires at the enemy position.
- Shield ring color lerps: red (full) → white (50%) → transparent (0%) — drawn as a ring just outside the sprite.
- Plastic Bag has no shield.
- Damage is routed through `applyDamage(e, amount)` — do not write `e.hp -=` directly anywhere else.

### Boss death burst scaling
- Wave 1–5: spawns 2 Plastic Bags on death
- Wave 6–8: spawns 2 Soda Cans on death
- Wave 9+: spawns 1 Soda Can + 1 Old Tire on death
- Burst-spawned enemies carry `fromBurst: true` and cannot themselves trigger a death burst.

---

## Wave structure

| Wave | Enemies | Notes |
|---|---|---|
| 1 | 8 plastic bags | Tutorial wave, no clam shop yet |
| 2 | 12 plastic bags | |
| 3 | 10 bags + 5 cans | Clam shop unlocks after this wave |
| 4 | 8 bags + 10 cans | |
| 5 | 15 bags + 5 cans + 1 trash bag boss | First boss |
| 6 | 5 bags + 15 cans + 2 tires | Old tire introduced |
| 7 | 10 cans + 4 tires | |
| 8 | 20 bags + 8 cans + 4 tires | |
| 9 | 10 bags + 15 cans + 6 tires | |
| 10 | 20 bags + 10 cans + 6 tires + 2 trash bag bosses | Final wave |

- 10-second countdown between waves
- "Send now" button skips the countdown
- Enemies spawn from the top of the path; spawn gap varies by wave (see pack composition below)

### Pack composition
- Waves 1–3: enemies shuffled randomly, 800ms between each spawn
- Waves 4–5: same-type clusters of 2–3 (300ms within cluster, 900ms between clusters)
- Waves 6–10: mixed-type clusters of 2–3 (350ms within cluster, 900ms between clusters)
- Spawn queue entries are `{ type, gapAfter }` objects; logic lives in `buildSpawnQueue(waveDef, waveIndex)`

---

## UI & HUD

- **Top bar:** Coin count | Lives (3 ocean icons) | Wave counter
- **Bottom panel — Towers tab:** Net launcher, Seagull squad, Whale spout (drag to place)
- **Bottom panel — Animals tab:** Owned animals (drag to place) + Clam shop button
- **Clam shop button:** Shows coin cost (75), disabled if insufficient coins
- **Clam reveal:** Animated crack-open sequence before showing win/consolation result
- **Placed unit click:** Upgrade options (greyed out if insufficient coins), sell button
- **Seashell HUD:** Up to 3 seashell icons top-right, tap to activate
- **Between waves:** Countdown timer + "Send now" button
- **Win screen:** Wave cleared, score, total coins earned, restart button
- **Lose screen (0 lives):** "The ocean needs you!" message, final score, restart button
- **Version badge:** `v1.1` in the bottom-right corner of the canvas (always visible, low opacity)
- **What's New button:** Prominent full-width button at the top of the How to Play modal; opens a separate `#whats-new-modal` with v1.1 patch notes

---

## Art direction

- Bright, saturated ocean palette: teal water, sandy beige tiles, coral path accents
- Enemies are clearly readable — large, distinct silhouettes
- Each animal has a personality animation when idle (swordfish flicks tail, octopus waves tentacles)
- Tower upgrade visuals: level 2 adds a glow, level 3 adds a particle effect
- Clam crack animation: shell shakes → splits → animal or seashell bursts out with a pop

---

## Tech constraints

- Pure HTML5, no external game engine
- Single `index.html` for Sprint 1; refactor into modules before Sprint 3
- Canvas for game field; HTML/CSS for HUD and panels
- Game loop: `requestAnimationFrame`
- Enemy movement: lerp between path waypoints each frame
- Tower targeting: nearest enemy within range radius, recalculated each tick
- Gacha roll: `Math.random() < 0.5` for win/loss; `Math.random()` to pick which animal from eligible pool
- Animal collection state: `{ swordfish: 0, octopus: 0, pufferfish: 0, seaTurtle: 0 }` (value = upgrade level, 0 = not owned)
- Deploy target: GitHub Pages (static, no backend)
- Playwright output (screenshots, traces, test results): `.playwright-output/` (gitignored)

---

## Known pitfalls (do not repeat)

- **Wave overlay must not block the grid.** The `#wave-overlay` is positioned `top: 12px; left: 50%; transform: translateX(-50%)` — a compact banner at the top of the canvas. Do not revert it to `top: 50% / transform: translate(-50%, -50%)` (centered), as that blocks tower placement.
- **Wave 1 prep window.** Before wave 1 starts, the player gets a 10-second countdown during which they can place towers. The overlay button reads "Place towers, then Start ▶" and triggers the countdown — it must not skip straight to `startWave()`.
- **Canvas `fillStyle` alpha leaks into emoji.** After drawing semi-transparent shapes (e.g. the enemy shadow at `rgba(0,0,0,0.2)`), always reset `ctx.fillStyle` to an opaque color before calling `ctx.fillText`. Some browsers inherit the alpha from `fillStyle` when rendering emoji, making them nearly invisible.
- **Do not write `e.hp -=` directly.** All enemy damage must go through `applyDamage(e, amount)` so the shield layer is respected. The only `e.hp -=` in the codebase should be inside that function.
- **Burst-spawned enemies must not chain.** Enemies created by boss death bursts carry `fromBurst: true`. The death handler checks this flag before triggering another burst — do not remove it.

---

## Sprint plan

| Sprint | Goal |
|---|---|
| 1 | Grid, path, one tower (Net launcher), one enemy (plastic bag), coin + lives HUD |
| 2 | Remaining towers, all enemy types, wave manager, upgrade system, win/lose screen |
| 3 | Clam shop, gacha roll + reveal animation, seashell powerups, all 4 animals |