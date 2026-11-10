// 05.7.1-11 (D-01/D-03, COMBAT-01): wave/tempo invariants with the final tuned DATA.
// Over a 120 s sim of each biome's LAST combat room (invulnerable player, enemies culled on a
// fixed cadence so waves keep advancing):
//   - every follow-up wave spawns only once alive <= ceil(lastWaveSize * nextWaveAt) (overlap),
//   - ROOMS.aliveCount() never exceeds DATA.WAVES.maxAlive,
//   - no ENEMY_TG violations (no tell shorter than its minimum, no unarmed damage).
// Static: nextWaveAt in [0.4, 0.6], waveDelay <= 0.5.
'use strict';
module.exports = function ({ R, check }) {
  const W = R(`({ nextWaveAt: DATA.WAVES.nextWaveAt, waveDelay: DATA.WAVES.waveDelay, maxAlive: DATA.WAVES.maxAlive })`);
  check(`DATA.WAVES.nextWaveAt in [0.4, 0.6] (${W.nextWaveAt})`, W.nextWaveAt >= 0.4 && W.nextWaveAt <= 0.6);
  check(`DATA.WAVES.waveDelay <= 0.5 (${W.waveDelay})`, W.waveDelay <= 0.5);

  const res = R(`(() => {
    const DT = 1 / 60, out = [];
    for (let bi = 0; bi < DATA.BIOMES.length; bi++) {
      GAME.godMode = false;
      INPUT.ax = 0; INPUT.ay = 0; INPUT.lmb = false; INPUT.keys = {};
      GAME.startRun();
      U.seed(500 + bi);
      GAME.biomeIdx = bi; GAME.biome = DATA.BIOMES[bi];
      GAME.roomIdx = GAME.biome.rooms - 1;            // enterRoom's combat path increments it
      ENEMY_TG.clear();
      const spawns = [];
      const _sw = ROOMS.spawnWave;
      ROOMS.spawnWave = function (arg) {
        spawns.push({ alive: ROOMS.aliveCount(), thr: ROOMS.nextWaveThreshold(), last: GAME.lastWaveSize, t: GAME.time });
        return _sw.apply(this, arguments);
      };
      let maxAlive = 0, wavesPlanned = 0, cleared = false;
      try {
        ROOMS.enterRoom('mudra');
        wavesPlanned = GAME.waves.length + 1;
        const P = GAME.player;
        P.maxhp = 1e9; P.hp = 1e9;
        let killT = 0;
        for (let f = 0; f < 120 * 60 && GAME.state === 'combat'; f++) {
          INPUT.ax = 0; INPUT.ay = 0; INPUT.lmb = false;
          P.hp = 1e9;
          GAME.time += DT;
          GAME.update(DT);
          maxAlive = Math.max(maxAlive, ROOMS.aliveCount());
          // cull one living, spawned-in enemy every 0.25 s so the room keeps moving
          killT += DT;
          if (killT >= 0.25) {
            killT = 0;
            const e = GAME.enemies.find(x => !x.dead && !(x.spawnT > 0));
            if (e) { e.hp = 0; killEnemy(e); }
          }
        }
        cleared = GAME.state === 'cleared' || GAME.state === 'choosing';
      } finally { ROOMS.spawnWave = _sw; }
      // the first spawnWave call is the room's opening wave (no previous wave yet)
      const follow = spawns.slice(1);
      out.push({
        id: GAME.biome.id, roomIdx: GAME.roomIdx, wavesPlanned, spawned: spawns.length, cleared, maxAlive,
        badOverlap: follow.filter(s => s.alive > s.thr).map(s => s.alive + '>' + s.thr),
        overlapped: follow.filter(s => s.alive > 0).length,
        viol: ENEMY_TG.violations.slice(0, 5), nViol: ENEMY_TG.violations.length, winds: ENEMY_TG.windLog.length,
      });
    }
    return JSON.parse(JSON.stringify(out));
  })()`);

  for (const b of res) {
    check(`${b.id} last room (${b.roomIdx}): all ${b.wavesPlanned} waves spawned within 120 s (${b.spawned})`, b.spawned === b.wavesPlanned);
    check(`${b.id}: every follow-up wave spawned at alive <= ceil(lastWaveSize x nextWaveAt)`
      + (b.badOverlap.length ? ' — ' + b.badOverlap.join(', ') : ''), b.badOverlap.length === 0);
    check(`${b.id}: waves overlap (${b.overlapped}/${b.spawned - 1} follow-ups spawned with enemies still alive)`,
      b.spawned < 2 || b.overlapped >= 1);
    check(`${b.id}: aliveCount never exceeds maxAlive ${W.maxAlive} (peak ${b.maxAlive})`, b.maxAlive <= W.maxAlive);
    check(`${b.id}: enemies wound up attacks during the sim (${b.winds} wind-ups)`, b.winds > 0);
    check(`${b.id}: no ENEMY_TG violations over the sim (${b.nViol})` + (b.nViol ? ' — ' + b.viol.join(', ') : ''), b.nViol === 0);
  }
};
