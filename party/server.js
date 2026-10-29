// Escape Tsunami For Money — multiplayer authoritative world server.
//
// Phase 1B: server owns coins, tsunamis, and the storm cycle. Clients render
// what the server tells them; coin pickups race through the server so first
// player to claim wins.
//
// Phase 2 (this file): account auth. Username/password registration via HTTP,
// HMAC-signed session token, WebSocket connections must auth before joining.
// Profile (custom + progress) is persisted server-side keyed by userId, so
// players can log in on any device and impersonation is blocked.

const RUNWAY_LEN     = 2000;
const RUNWAY_HALF_W  = 20;
const ZONE_LEN       = 200;
const NUM_ZONES      = 10;
const HILL_START_Z   = 4;
const COIN_RESPAWN_MS = 30_000;   // was 60s — half the wait so cap fills faster
const POWERUP_RESPAWN_MS = 45_000;
const BIG_TREASURE_RESPAWN_MS = 600_000;   // 10 minutes
const BIG_TREASURE_VALUE = 50;
const BIG_TREASURE_Z = -1000;             // boundary of old map / start of new content

const TOKEN_EXPIRY_MS = 90 * 24 * 60 * 60 * 1000;   // 90 days
const PRE_AUTH_TIMEOUT_MS = 15_000;                  // drop connections that don't auth quickly
const PBKDF2_ITERATIONS = 100_000;   // Cloudflare Workers caps PBKDF2 at 100k
// Spike-wall race rewards (index.html, the race → POST /race_reward)
const RACE_MAX_REWARD = 120;         // coins per finished run, at most
const RACE_MIN_GAP_MS = 30_000;      // a run takes ~50 s+, so 30 s between claims is generous
const RACE_MIN_TIME_S = 25;          // faster than this isn't a real run (best-time sanity)
// Race leaderboards (one per level): rank by time, then misses. Each player
// keeps only their best run. Plausibility floor per level: below full sprint
// the whole way, which stamina makes impossible (530 m / 430 m at 16.2 m/s).
const RACE_BOARD_SIZE = 50;
const RACE_LEVEL_MIN_TIME = { 1: 33, 2: 27 };
// Achievements per game (ids must match the clients). Everyone keeps the union
// of what they've unlocked; holding ALL of a game's = a 👑 on that game's board.
// Keep in sync: race/race.src.html LEVEL1.achievements, family/gluenight.src.html ACHIEVEMENTS.
const ACH_IDS = {
  race1: ['skater', 'perfect', 'flash', 'untouch', 'sweeper', 'laundry', 'homerun', 'shopper', 'rich', 'iron', 'glue', 'tipsy', 'buddy', 'snitch'],
  glue:  ['ninja', 'artist', 'gamer', 'tuber', 'hanger', 'all3', 'max', 'saint', 'flipper', 'reader', 'manager'],
};
function mergeAch(user, game, ids){
  const valid = ACH_IDS[game]; if (!valid) return false;
  user.ach = user.ach || {};
  const have = new Set(user.ach[game] || []);
  for (const id of (Array.isArray(ids) ? ids : []).slice(0, 60)) if (valid.includes(id)) have.add(id);
  user.ach[game] = [...have];
  return valid.every(id => have.has(id));
}
// 恐怖考前複習夜 (gluenight.html → POST /glue_score): rank by mood, then fewer hits
const GLUE_MAX_MOOD = 450;           // well above the best bot runs (~230)
const GLUE_MAX_REWARD = 200;
const GLUE_MIN_GAP_MS = 120_000;     // a night is 150 s
const GLUE_BOARD_SIZE = 50;
const glueBetter = (a, b) => a.mood > b.mood || (a.mood === b.mood && a.hits < b.hits);
const glueSort = (a, b) => b.mood - a.mood || a.hits - b.hits;
// 土星之家 (index.html): each account's home lives here, and so do the PRICES —
// the client only shows them. Keep in sync with home/home.src.html (FURN, FLOORS, WALLS, LEVELS).
const HOME_FURN = { sofa: [120, 2, 1], bed: [150, 2, 1], desk: [100, 2, 1], tv: [180, 2, 1], shelf: [90, 1, 1], table: [60, 1, 1],
                    chair: [30, 1, 1], rug: [50, 2, 2], plant: [25, 1, 1], lamp: [40, 1, 1], saturn: [70, 1, 1] };   // [price, w, d]
const HOME_FLOORS = { wood: 0, tile: 80, mint: 80, check: 120 };
const HOME_WALLS = { cream: 0, sky: 60, pink: 60, stars: 150 };
const HOME_LEVELS = { 1: { size: 8 }, 2: { size: 10, price: 600 } };   // next: 3 = 艾迪的房間 (two rooms)
const HOME_GIFT = 777;
// 101 跑酷 (tower.html): +10 per floor, no faster than ~1.2 s a floor
const TOWER_FLOORS = 101, TOWER_COINS_PER_FLOOR = 10, TOWER_MIN_SECS_PER_FLOOR = 1.2;               // once per account, the first time the home opens
function newHome(){
  return { level: 1, own: { sofa: 1, table: 1, chair: 2, plant: 1 }, floors: ['wood'], walls: ['cream'], floor: 'wood', wall: 'cream', name: '',
           placed: [{ uid: 1, id: 'sofa', x: 1, z: 1, rot: 0 }, { uid: 2, id: 'table', x: 3, z: 3, rot: 0 }, { uid: 3, id: 'chair', x: 4, z: 3, rot: 3 }, { uid: 4, id: 'plant', x: 0, z: 0, rot: 0 }] };
}
function cleanHomeName(n){ return String(n || '').replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 12); }
const raceBetter = (a, b) => a.time < b.time || (a.time === b.time && a.misses < b.misses);
const raceSort = (a, b) => a.time - b.time || a.misses - b.misses;
// Visit log for the admin page: per-user counters on the user record plus a
// short shared feed of recent events (register / visit / race start / finish).
const ACTIVITY_MAX = 300;
const VISIT_GAP_MS = 30 * 60 * 1000;      // coming back within 30 min = same visit
const START_LOG_GAP_MS = 2 * 60 * 1000;   // restarts in a row show once in the feed

// Heights kept in sync with the client; server only uses speedMul / width
// for spawn calculations.
const WAVE_TYPES = [
  // Heights tuned so 95%+ of waves are jumpable only AT Lv 10 jump.
  // Titan (h=50, needs Lv 15) stays as the rare uncrossable wave.
  { id:'green',  height:8,  width:14, speedMul:1.0,  weight:22, storm:false },
  { id:'blue',   height:18, width:18, speedMul:1.0,  weight:30, storm:false },
  { id:'red',    height:18, width:14, speedMul:1.4,  weight:18, storm:false },
  { id:'wide',   height:18, width:32, speedMul:0.85, weight:14, storm:false },
  { id:'purple', height:28, width:RUNWAY_HALF_W*2 + 12, speedMul:0.7, weight:4, storm:true },
  { id:'titan',  height:50, width:RUNWAY_HALF_W*2 + 12, speedMul:0.5, weight:1, storm:true },
  { id:'surf',   height:6,  width:10, speedMul:0.9,  weight:14, storm:false },
];
function pickWaveType(stormBoost){
  let total = 0;
  for (const w of WAVE_TYPES) total += w.weight * (stormBoost && w.storm ? 3.5 : 1);
  let r = Math.random() * total;
  for (const w of WAVE_TYPES){
    r -= w.weight * (stormBoost && w.storm ? 3.5 : 1);
    if (r <= 0) return w;
  }
  return WAVE_TYPES[1];
}
// Seconds until the next wave. Waves now live 1–2 min on the runway (they
// used to vanish in ~10 s), so the old 1.2–4 s cadence stacked into a wall.
// One wave per ~10 s gives warn → dodge → breathe → collect. Keep in sync
// with nextWaveGap in island.html.
function nextWaveGap(storm){
  if (storm) return 4 + Math.random() * 2;          // storm: 4–6 s
  return Math.random() < 0.15
    ? 15 + Math.random() * 10                       // calm spell: 15–25 s
    : 7 + Math.random() * 6;                        // usual: 7–13 s
}
const TWIN_CHANCE = 0.15, TWIN_CHANCE_STORM = 0.25;

// ============================================================
// AUTH HELPERS
// ============================================================

function normalizeUsername(s){
  return String(s || '').trim().toLowerCase();
}
function isValidUsername(s){
  return /^[a-z0-9_]{3,16}$/.test(s);
}
function isValidDisplayName(s){
  if (typeof s !== 'string') return false;
  const t = s.trim();
  return t.length >= 1 && t.length <= 16;
}
function isValidPassword(s){
  return typeof s === 'string' && s.length >= 6 && s.length <= 128;
}

function bytesToB64(bytes){
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}
function b64ToBytes(b64){
  const padded = b64 + '==='.slice((b64.length + 3) % 4);
  const s = atob(padded);
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
  return bytes;
}
function b64url(b64){
  return b64.replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}
function b64urlToStd(s){
  return s.replace(/-/g, '+').replace(/_/g, '/');
}

async function hashPassword(password, saltB64){
  const enc = new TextEncoder();
  const salt = saltB64 ? b64ToBytes(b64urlToStd(saltB64))
                       : crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial, 256
  );
  return {
    hash: b64url(bytesToB64(new Uint8Array(bits))),
    salt: b64url(bytesToB64(salt)),
  };
}

async function getHmacKey(secret){
  return await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']
  );
}

async function signToken(userId, secret){
  const payload = { u: userId, e: Date.now() + TOKEN_EXPIRY_MS };
  const payloadB64 = b64url(bytesToB64(new TextEncoder().encode(JSON.stringify(payload))));
  const key = await getHmacKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payloadB64));
  return payloadB64 + '.' + b64url(bytesToB64(new Uint8Array(sig)));
}

async function verifyToken(token, secret){
  if (!token || typeof token !== 'string' || token.indexOf('.') < 0) return null;
  const [payloadB64, sigB64] = token.split('.');
  if (!payloadB64 || !sigB64) return null;
  try {
    const key = await getHmacKey(secret);
    const ok = await crypto.subtle.verify(
      'HMAC', key,
      b64ToBytes(b64urlToStd(sigB64)),
      new TextEncoder().encode(payloadB64)
    );
    if (!ok) return null;
    const payloadJson = new TextDecoder().decode(b64ToBytes(b64urlToStd(payloadB64)));
    const payload = JSON.parse(payloadJson);
    if (!payload || !payload.u) return null;
    if (payload.e && payload.e < Date.now()) return null;
    return payload.u;
  } catch (e) {
    return null;
  }
}

function getSecret(room){
  const env = (room && room.env)
           || (room && room.context && room.context.env)
           || (typeof process !== 'undefined' && process.env);
  const s = env && env.AUTH_SECRET;
  if (s) return s;
  console.warn('AUTH_SECRET not set — using insecure default. Run `partykit env push AUTH_SECRET` to fix.');
  return 'dev-insecure-secret-please-replace';
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
};
function jsonResponse(obj, status){
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

export default class WorldServer {
  constructor(room){
    this.room = room;
    this.players = new Map();

    // Persistent world (in-memory; resets when the Durable Object hibernates)
    this.coins = [];
    this.waves = [];
    this.nextWaveId = 1;
    this.spawnAccum = 0;
    this.nextSpawnIn = 4;
    this.storm = false;
    this.stormUntil = 0;
    this.stormCooldownUntil = Date.now() + 25_000;

    this.spawnInitialCoins();
    this.powerups = [];
    this.spawnInitialPowerups();
    // Death chests dropped on player death (shared — any player can grab)
    this.chests = [];
    this.nextChestId = 1;
    // Big treasure (one global instance, 10-min respawn, $50)
    this.bigTreasure = {
      available: true,
      respawnAt: 0,
      x: 0, z: BIG_TREASURE_Z,
      value: BIG_TREASURE_VALUE,
    };
    // Plots: 9-tile grid behind the base. ownerId is the userId (stable across
    // sessions) of the owner, or null if for sale.
    this.plots = [];
    {
      let pid = 1;
      for (let row = 0; row < 3; row++){
        for (let col = 0; col < 3; col++){
          this.plots.push({
            id: 'plot' + pid++,
            x: -16 + col * 16,
            z: 28 + row * 18,
            ownerId: null,
            ownerName: '',
            build: { floor:'', walls:'', roof:'', furniture:'', decoration:'' },
          });
        }
      }
    }
    // Leaderboard (persisted in DO storage). New format keys on userId so
    // names can change without losing your slot, and impostors can't poach
    // someone else's row. Old name-keyed format is discarded on load.
    this.scoreboard = [];
    this.scoreboardDirty = false;
    this.scoreboardLastSave = 0;
    if (this.room && this.room.storage){
      try {
        Promise.resolve(this.room.storage.get('scoreboard')).then(s => {
          if (Array.isArray(s) && s.every(e => e && typeof e.userId === 'string')){
            this.scoreboard = s;
            this.broadcast({ type: 'scoreboard_update', scoreboard: this.scoreboard });
          } else if (Array.isArray(s) && s.length > 0){
            // Legacy entries — clear them now that auth is required
            try { this.room.storage.delete('scoreboard'); } catch(e){}
          }
        }).catch(() => {});
        // Also load plot ownership (now keyed by userId so it survives reconnects)
        Promise.resolve(this.room.storage.get('plots')).then(p => {
          if (Array.isArray(p)){
            for (const saved of p){
              const plot = this.plots.find(x => x.id === saved.id);
              if (plot && saved.ownerId){
                plot.ownerId = saved.ownerId;
                plot.ownerName = saved.ownerName || '';
                plot.build = saved.build || plot.build;
              }
            }
          }
        }).catch(() => {});
      } catch(e) {}
    }
    this.plotsDirty = false;
    this.plotsLastSave = 0;
    this.lastTick = Date.now();
    this.tickHandle = setInterval(() => this.tick(), 50);
  }

  // ============================================================
  // HTTP: register / login / me
  // ============================================================
  async onRequest(req){
    try {
      return await this._onRequest(req);
    } catch (e) {
      console.error('[onRequest crash]', e && (e.stack || e.message || e));
      return jsonResponse({
        error: 'server_crash',
        message: String((e && e.message) || e || 'unknown'),
      }, 500);
    }
  }
  async _onRequest(req){
    if (req.method === 'OPTIONS'){
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    const url = new URL(req.url);
    const last = url.pathname.split('/').filter(Boolean).pop() || '';
    const secret = getSecret(this.room);

    if (last === 'register' && req.method === 'POST'){
      let body;
      try { body = await req.json(); }
      catch(e){ return jsonResponse({ error:'bad_json', message:'資料格式錯誤' }, 400); }
      const username = normalizeUsername(body.username);
      const rawDisplay = String(body.displayName || body.username || '').trim();
      const displayName = rawDisplay.slice(0, 16);
      const password = String(body.password || '');
      if (!isValidUsername(username))
        return jsonResponse({ error:'username_invalid', message:'帳號只能用 3-16 個英數字或底線' }, 400);
      if (!isValidDisplayName(displayName))
        return jsonResponse({ error:'displayname_invalid', message:'顯示名稱要 1-16 字' }, 400);
      if (!isValidPassword(password))
        return jsonResponse({ error:'password_invalid', message:'密碼至少 6 字' }, 400);

      const existing = await this.room.storage.get('user:' + username);
      if (existing)
        return jsonResponse({ error:'username_taken', message:'這個帳號已被註冊' }, 409);

      const { hash, salt } = await hashPassword(password);
      const userData = {
        username, displayName, hash, salt,
        createdAt: Date.now(),
        profile: null,
      };
      await this.room.storage.put('user:' + username, userData);
      await this.logActivity(userData, 'register');
      const token = await signToken(username, secret);
      return jsonResponse({ ok:true, token, username, displayName });
    }

    if (last === 'login' && req.method === 'POST'){
      let body;
      try { body = await req.json(); }
      catch(e){ return jsonResponse({ error:'bad_json', message:'資料格式錯誤' }, 400); }
      const username = normalizeUsername(body.username);
      const password = String(body.password || '');
      if (!username || !password)
        return jsonResponse({ error:'missing', message:'請輸入帳號和密碼' }, 400);
      const user = await this.room.storage.get('user:' + username);
      if (!user)
        return jsonResponse({ error:'bad_credentials', message:'帳號或密碼錯誤' }, 401);
      const { hash } = await hashPassword(password, user.salt);
      if (hash !== user.hash)
        return jsonResponse({ error:'bad_credentials', message:'帳號或密碼錯誤' }, 401);
      const token = await signToken(username, secret);
      return jsonResponse({ ok:true, token, username, displayName: user.displayName });
    }

    if (last === 'me' && req.method === 'GET'){
      const auth = req.headers.get('authorization') || '';
      const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
      const userId = await verifyToken(token, secret);
      if (!userId) return jsonResponse({ error:'bad_token' }, 401);
      const user = await this.room.storage.get('user:' + userId);
      if (!user) return jsonResponse({ error:'no_user' }, 404);
      const dev = url.searchParams.get('device');
      if (await this.markSeen(user, 'race', dev === 'phone' || dev === 'pc' ? dev : null)) await this.room.storage.put('user:' + userId, user);
      return jsonResponse({
        ok: true, username: user.username, displayName: user.displayName,
        profile: user.profile || null,
      });
    }

    // POST /race_reward — spike-wall race finished: ADD coins to the saved
    // money (never overwrite the whole profile, which the island may be
    // saving at the same time). Clamped and rate-limited so it can't be farmed.
    if (last === 'race_reward' && req.method === 'POST'){
      const auth = req.headers.get('authorization') || '';
      const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
      const userId = await verifyToken(token, secret);
      if (!userId) return jsonResponse({ error:'bad_token' }, 401);
      let body; try { body = await req.json(); } catch(e){ return jsonResponse({ error:'bad_json' }, 400); }
      const user = await this.room.storage.get('user:' + userId);
      if (!user) return jsonResponse({ error:'no_user' }, 404);
      const now = Date.now();
      if (user.lastRaceAt && now - user.lastRaceAt < RACE_MIN_GAP_MS)
        return jsonResponse({ error:'too_soon', message:'跑太快了，休息一下再領' }, 429);
      const coins = Math.max(0, Math.min(RACE_MAX_REWARD, Math.floor(Number(body.coins) || 0)));
      const time = Number(body.time);
      user.profile = user.profile || { custom: null, progress: null };
      const progress = user.profile.progress || {};
      progress.money = (progress.money || 0) + coins;
      if (Number.isFinite(time) && time >= RACE_MIN_TIME_S && (!progress.raceBest || time < progress.raceBest)) progress.raceBest = +time.toFixed(1);
      user.profile.progress = progress;
      user.lastRaceAt = now;
      const st = user.stats || (user.stats = {});
      st.raceFinishes = (st.raceFinishes || 0) + 1; st.lastSeenAt = now;
      await this.room.storage.put('user:' + userId, user);
      await this.logActivity(user, 'race_finish', { level: Math.floor(Number(body.level) || 0) || null,
        time: Number.isFinite(time) ? +time.toFixed(1) : null, misses: Math.max(0, Math.floor(Number(body.misses) || 0)) });
      // leaderboard (only plausible runs on a known level)
      const level = Math.floor(Number(body.level) || 0);
      const misses = Math.max(0, Math.min(999, Math.floor(Number(body.misses) || 0)));
      let rank = null, improved = false, board = null;
      const crown = level === 1 ? mergeAch(user, 'race1', body.ach) : false;
      if (level === 1) await this.room.storage.put('user:' + userId, user);
      if (RACE_LEVEL_MIN_TIME[level] && Number.isFinite(time) && time >= RACE_LEVEL_MIN_TIME[level] && time < 3600){
        const key = 'race_board_' + level;
        board = (await this.room.storage.get(key)) || [];
        const entry = { userId, name: user.displayName || user.username, time: +time.toFixed(1), misses,
                        device: body.device === 'phone' ? 'phone' : 'pc', at: now, crown };
        const i = board.findIndex(r => r.userId === userId);
        let dirty = false;
        if (i < 0 || raceBetter(entry, board[i])){ if (i >= 0) board.splice(i, 1); board.push(entry); improved = dirty = true; }
        else if (crown && !board[i].crown){ board[i].crown = true; dirty = true; }   // crown earned on a slower run still shows
        board.sort(raceSort);
        board = board.slice(0, RACE_BOARD_SIZE);
        if (dirty) await this.room.storage.put(key, board);
        const mine = board.findIndex(r => r.userId === userId);
        rank = mine >= 0 ? mine + 1 : null;
        board = board.slice(0, 10).map(({ userId: _u, ...r }) => r);
      }
      // Tell an open island session (same account) so its next save keeps the coins
      for (const [cid, p] of this.players){
        if (p.userId !== userId) continue;
        const conns = this.room.getConnections ? Array.from(this.room.getConnections()) : [];
        for (const c of conns) if (c.id === cid){ try { c.send(JSON.stringify({ type: 'race_reward', coins, money: progress.money })); } catch(e){} }
      }
      return jsonResponse({ ok: true, coins, money: progress.money, raceBest: progress.raceBest || null, rank, improved, board });
    }

    // POST /race_start — a run began (counted for the admin page)
    if (last === 'race_start' && req.method === 'POST'){
      const auth = req.headers.get('authorization') || '';
      const userId = await verifyToken(auth.startsWith('Bearer ') ? auth.slice(7) : '', secret);
      if (!userId) return jsonResponse({ error:'bad_token' }, 401);
      let body = {}; try { body = await req.json(); } catch(e){}
      const user = await this.room.storage.get('user:' + userId);
      if (!user) return jsonResponse({ error:'no_user' }, 404);
      const st = user.stats || (user.stats = {}), now = Date.now();
      st.raceStarts = (st.raceStarts || 0) + 1;
      const level = Math.floor(Number(body.level) || 0) || null;
      if (!st.lastStartLogAt || now - st.lastStartLogAt > START_LOG_GAP_MS){ st.lastStartLogAt = now; await this.logActivity(user, 'race_start', { level }); }
      st.lastSeenAt = now;
      await this.room.storage.put('user:' + userId, user);
      return jsonResponse({ ok: true });
    }

    // POST /tower_reward — 101 跑酷: +10 coins per new floor climbed this run ({from, to, secs})
    if (last === 'tower_reward' && req.method === 'POST'){
      const auth = req.headers.get('authorization') || '';
      const userId = await verifyToken(auth.startsWith('Bearer ') ? auth.slice(7) : '', secret);
      if (!userId) return jsonResponse({ error:'bad_token' }, 401);
      let body; try { body = await req.json(); } catch(e){ return jsonResponse({ error:'bad_json' }, 400); }
      const user = await this.room.storage.get('user:' + userId);
      if (!user) return jsonResponse({ error:'no_user' }, 404);
      const from = Math.floor(Number(body.from)), to = Math.floor(Number(body.to)), secs = Number(body.secs) || 0;
      if (!(from >= 0 && to > from && to <= TOWER_FLOORS)) return jsonResponse({ error:'bad_floor' }, 400);
      if (secs < (to - from) * TOWER_MIN_SECS_PER_FLOOR) return jsonResponse({ error:'too_fast', message:'爬太快了，金幣沒算' }, 400);
      const coins = (to - from) * TOWER_COINS_PER_FLOOR;
      user.profile = user.profile || { custom: null, progress: null };
      const progress = user.profile.progress || (user.profile.progress = {});
      progress.money = (progress.money || 0) + coins;
      const tw = user.tower || (user.tower = { best: 0, climbs: 0 });
      tw.best = Math.max(tw.best || 0, to); if (to === TOWER_FLOORS) tw.climbs = (tw.climbs || 0) + 1;
      await this.room.storage.put('user:' + userId, user);
      await this.logActivity(user, 'tower', { from, to });
      return jsonResponse({ ok: true, coins, money: progress.money, best: tw.best });
    }

    // ---------- 土星之家 ----------
    if ((last === 'home' && req.method === 'GET') || ((last === 'home_save' || last === 'home_buy') && req.method === 'POST')){
      const auth = req.headers.get('authorization') || '';
      const userId = await verifyToken(auth.startsWith('Bearer ') ? auth.slice(7) : '', secret);
      if (!userId) return jsonResponse({ error:'bad_token' }, 401);
      const user = await this.room.storage.get('user:' + userId);
      if (!user) return jsonResponse({ error:'no_user' }, 404);
      user.profile = user.profile || { custom: null, progress: null };
      const progress = user.profile.progress || (user.profile.progress = {});
      if (!user.home) user.home = newHome();
      const home = user.home;
      let gift = 0;
      if (!user.homeGift){ user.homeGift = true; gift = HOME_GIFT; progress.money = (progress.money || 0) + HOME_GIFT; }
      const reply = extra => jsonResponse(Object.assign({ ok: true, money: progress.money || 0, home, gift }, extra || {}));

      if (last === 'home'){ await this.room.storage.put('user:' + userId, user); return reply(); }

      let body; try { body = await req.json(); } catch(e){ return jsonResponse({ error:'bad_json' }, 400); }
      if (last === 'home_buy'){
        const kind = String(body.kind || ''), id = String(body.id || '');
        let price = null;
        if (kind === 'furn' && HOME_FURN[id]) price = HOME_FURN[id][0];
        else if (kind === 'floor' && id in HOME_FLOORS && !home.floors.includes(id)) price = HOME_FLOORS[id];
        else if (kind === 'wall' && id in HOME_WALLS && !home.walls.includes(id)) price = HOME_WALLS[id];
        else if (kind === 'expand' && HOME_LEVELS[home.level + 1]) price = HOME_LEVELS[home.level + 1].price;
        if (price == null) return jsonResponse({ error:'bad_item', message:'買不了這個' }, 400);
        if ((progress.money || 0) < price) return jsonResponse({ error:'no_money', message:'金幣不夠，去關卡賺一點吧' }, 400);
        progress.money -= price;
        if (kind === 'furn') home.own[id] = (home.own[id] || 0) + 1;
        else if (kind === 'floor'){ home.floors.push(id); home.floor = id; }
        else if (kind === 'wall'){ home.walls.push(id); home.wall = id; }
        else home.level += 1;
        await this.room.storage.put('user:' + userId, user);
        await this.logActivity(user, 'home_buy', { kind, id: kind === 'expand' ? 'Lv' + home.level : id, price });
        return reply();
      }
      // home_save: the layout, checked against what this account owns
      const size = HOME_LEVELS[home.level].size, placed = Array.isArray(body.placed) ? body.placed.slice(0, 150) : null;
      if (!placed) return jsonResponse({ error:'bad_home' }, 400);
      const count = {}, clean = [];
      for (const q of placed){
        const id = String(q && q.id), f = HOME_FURN[id]; if (!f) continue;
        const rot = ((Math.floor(Number(q.rot)) || 0) % 4 + 4) % 4, x = Math.floor(Number(q.x)), z = Math.floor(Number(q.z));
        const w = rot % 2 ? f[2] : f[1], d = rot % 2 ? f[1] : f[2];
        if (!(x >= 0 && z >= 0 && x + w <= size && z + d <= size)) continue;
        count[id] = (count[id] || 0) + 1; if (count[id] > (home.own[id] || 0)) continue;
        clean.push({ uid: Math.max(1, Math.floor(Number(q.uid)) || clean.length + 1), id, x, z, rot });
      }
      home.placed = clean;
      if (home.floors.includes(body.floor)) home.floor = body.floor;
      if (home.walls.includes(body.wall)) home.wall = body.wall;
      if (typeof body.name === 'string') home.name = cleanHomeName(body.name);
      await this.room.storage.put('user:' + userId, user);
      return reply();
    }

    // POST /glue_score — a 恐怖考前複習夜 night ended: coins + leaderboard + achievements
    if (last === 'glue_score' && req.method === 'POST'){
      const auth = req.headers.get('authorization') || '';
      const userId = await verifyToken(auth.startsWith('Bearer ') ? auth.slice(7) : '', secret);
      if (!userId) return jsonResponse({ error:'bad_token' }, 401);
      let body; try { body = await req.json(); } catch(e){ return jsonResponse({ error:'bad_json' }, 400); }
      const user = await this.room.storage.get('user:' + userId);
      if (!user) return jsonResponse({ error:'no_user' }, 404);
      const now = Date.now();
      if (user.lastGlueAt && now - user.lastGlueAt < GLUE_MIN_GAP_MS)
        return jsonResponse({ error:'too_soon', message:'太快了，一晚要兩分半喔' }, 429);
      const mood = Math.floor(Number(body.mood) || 0), hits = Math.max(0, Math.min(99, Math.floor(Number(body.hits) || 0)));
      if (mood < 0 || mood > GLUE_MAX_MOOD) return jsonResponse({ error:'bad_score' }, 400);
      const coins = Math.max(0, Math.min(GLUE_MAX_REWARD, Math.floor(Number(body.coins) || 0)));
      user.profile = user.profile || { custom: null, progress: null };
      const progress = user.profile.progress || {};
      progress.money = (progress.money || 0) + coins;
      user.profile.progress = progress;
      user.lastGlueAt = now;
      const crown = mergeAch(user, 'glue', body.ach);
      const st = user.stats || (user.stats = {}); st.glueNights = (st.glueNights || 0) + 1; st.lastSeenAt = now;
      await this.room.storage.put('user:' + userId, user);
      await this.logActivity(user, 'glue_finish', { mood, hits, win: !!body.win });
      let board = (await this.room.storage.get('glue_board')) || [];
      const entry = { userId, name: user.displayName || user.username, mood, hits, win: !!body.win,
                      device: body.device === 'phone' ? 'phone' : 'pc', at: now, crown };
      const i = board.findIndex(r => r.userId === userId);
      let improved = false, dirty = false;
      if (i < 0 || glueBetter(entry, board[i])){ if (i >= 0) board.splice(i, 1); board.push(entry); improved = dirty = true; }
      else if (crown && !board[i].crown){ board[i].crown = true; dirty = true; }
      board.sort(glueSort); board = board.slice(0, GLUE_BOARD_SIZE);
      if (dirty) await this.room.storage.put('glue_board', board);
      const mine = board.findIndex(r => r.userId === userId);
      return jsonResponse({ ok: true, coins, money: progress.money, improved, crown, rank: mine >= 0 ? mine + 1 : null,
                            board: board.slice(0, 10).map(({ userId: _u, ...r }) => r) });
    }

    // GET /glue_board — top 10 (no user ids exposed)
    if (last === 'glue_board' && req.method === 'GET'){
      const board = (await this.room.storage.get('glue_board')) || [];
      return jsonResponse({ ok: true, rows: board.slice(0, 10).map(({ userId: _u, ...r }) => r) });
    }

    // GET /race_board?level=N — top 10 (no user ids exposed)
    if (last === 'race_board' && req.method === 'GET'){
      const level = Math.floor(Number(url.searchParams.get('level')) || 0);
      if (!RACE_LEVEL_MIN_TIME[level]) return jsonResponse({ error: 'bad_level' }, 400);
      const board = (await this.room.storage.get('race_board_' + level)) || [];
      return jsonResponse({ ok: true, level, rows: board.slice(0, 10).map(({ userId: _u, ...r }) => r) });
    }

    // ============================================================
    // ADMIN — gated by ADMIN_PASSWORD env var. Missing var disables ALL
    // admin routes (so a forgotten secret can't be brute-forced).
    // Auth: Authorization: Bearer <admin password>
    // ============================================================
    if (url.pathname.indexOf('/admin/') !== -1 || url.pathname.endsWith('/admin')){
      const env = (this.room && this.room.env)
               || (this.room && this.room.context && this.room.context.env)
               || (typeof process !== 'undefined' && process.env);
      const adminPw = env && env.ADMIN_PASSWORD;
      if (!adminPw){
        return jsonResponse({ error:'admin_disabled', message:'ADMIN_PASSWORD env var not set on the server' }, 503);
      }
      const authHeader = req.headers.get('authorization') || '';
      const provided = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
      if (provided !== adminPw){
        return jsonResponse({ error:'bad_admin', message:'Wrong admin password' }, 401);
      }

      // GET /admin/stats — totals
      if (url.pathname.endsWith('/admin/stats') && req.method === 'GET'){
        const userMap = await this.room.storage.list({ prefix: 'user:' });
        return jsonResponse({
          ok: true,
          users: userMap.size,
          scoreboard: this.scoreboard.length,
          activePlayers: this.players.size,
          ownedPlots: this.plots.filter(p => p.ownerId).length,
          totalPlots: this.plots.length,
          activeChests: this.chests.filter(c => c.available).length,
          storm: this.storm,
          serverTime: Date.now(),
        });
      }

      // GET /admin/users — list (omit hash/salt; safe to ship to client)
      if (url.pathname.endsWith('/admin/users') && req.method === 'GET'){
        const userMap = await this.room.storage.list({ prefix: 'user:' });
        const list = [];
        for (const [, u] of userMap){
          if (!u) continue;
          const p = (u.profile && u.profile.progress) || {};
          list.push({
            username: u.username,
            displayName: u.displayName,
            createdAt: u.createdAt,
            money: p.money || 0,
            maxDist: p.maxDist || 0,
            upgrades: p.upgrades || {},
            hasProfile: !!u.profile,
            lastSeenAt: (u.stats && u.stats.lastSeenAt) || null,
            visits: (u.stats && u.stats.visits) || 0,
            raceStarts: (u.stats && u.stats.raceStarts) || 0,
            raceFinishes: (u.stats && u.stats.raceFinishes) || 0,
            device: (u.stats && u.stats.device) || null,
          });
        }
        list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        return jsonResponse({ ok: true, users: list });
      }

      // GET /admin/activity — recent events, newest first
      if (url.pathname.endsWith('/admin/activity') && req.method === 'GET'){
        const feed = (await this.room.storage.get('activity')) || [];
        return jsonResponse({ ok: true, events: feed.slice().reverse() });
      }

      // /admin/users/<username>... — operations on one user
      const userMatch = url.pathname.match(/\/admin\/users\/([^/]+)(?:\/(reset))?$/);
      if (userMatch){
        const targetName = normalizeUsername(decodeURIComponent(userMatch[1]));
        const op = userMatch[2];
        const user = await this.room.storage.get('user:' + targetName);
        if (!user) return jsonResponse({ error:'no_user', message:'找不到這個帳號' }, 404);

        // DELETE /admin/users/<username>
        if (!op && req.method === 'DELETE'){
          await this.room.storage.delete('user:' + targetName);
          // Also strip them from the scoreboard
          const before = this.scoreboard.length;
          this.scoreboard = this.scoreboard.filter(s => s.userId !== targetName);
          if (this.scoreboard.length !== before){
            this.scoreboardDirty = true;
            this.broadcast({ type: 'scoreboard_update', scoreboard: this.scoreboard });
          }
          // Release any plots they owned (back on the market)
          let releasedPlots = 0;
          for (const p of this.plots){
            if (p.ownerId === targetName){
              p.ownerId = null; p.ownerName = '';
              p.build = { floor:'', walls:'', roof:'', furniture:'', decoration:'' };
              releasedPlots++;
              this.broadcast({
                type: 'plot_owned',
                plotId: p.id, ownerId: null, ownerName: '',
              });
            }
          }
          if (releasedPlots) this.plotsDirty = true;
          for (const lv of Object.keys(RACE_LEVEL_MIN_TIME)){
            const key = 'race_board_' + lv, b = await this.room.storage.get(key);
            if (Array.isArray(b) && b.some(r => r.userId === targetName)) await this.room.storage.put(key, b.filter(r => r.userId !== targetName));
          }
          // Boot any live sessions
          for (const [cid, p] of this.players){
            if (p.userId === targetName){
              const conns = this.room.getConnections ? Array.from(this.room.getConnections()) : [];
              for (const c of conns){
                if (c.id === cid){ try { c.close(); } catch(e){} }
              }
            }
          }
          return jsonResponse({ ok: true, deleted: targetName, releasedPlots });
        }

        // POST /admin/users/<username>/reset — set a new password
        if (op === 'reset' && req.method === 'POST'){
          let body;
          try { body = await req.json(); }
          catch(e){ return jsonResponse({ error:'bad_json' }, 400); }
          const newPassword = String(body.password || '');
          if (!isValidPassword(newPassword)){
            return jsonResponse({ error:'password_invalid', message:'新密碼至少 6 字' }, 400);
          }
          const { hash, salt } = await hashPassword(newPassword);
          user.hash = hash; user.salt = salt;
          await this.room.storage.put('user:' + targetName, user);
          return jsonResponse({ ok: true, message:`密碼已重設給 ${targetName}` });
        }
      }

      return jsonResponse({ error:'admin_route_not_found', path: url.pathname, method: req.method }, 404);
    }

    return jsonResponse({ error:'not_found' }, 404);
  }

  // ============================================================
  // Scoreboard
  // ============================================================
  sortAndBroadcastScoreboard(){
    this.scoreboard.sort((a, b) => b.maxDist - a.maxDist);
    this.scoreboard = this.scoreboard.slice(0, 20);
    this.scoreboardDirty = true;
    this.broadcast({ type: 'scoreboard_update', scoreboard: this.scoreboard });
  }
  recordScore(userId, displayName, dist){
    if (!userId || dist <= 0) return;
    const existing = this.scoreboard.find(s => s.userId === userId);
    if (existing){
      existing.displayName = displayName;
      if (dist > existing.maxDist){
        existing.maxDist = dist;
        existing.when = Date.now();
        this.sortAndBroadcastScoreboard();
      }
    } else {
      this.scoreboard.push({ userId, displayName, maxDist: dist, when: Date.now() });
      this.sortAndBroadcastScoreboard();
    }
  }

  spawnInitialPowerups(){
    let id = 1;
    const TYPES = ['speed', 'jump', 'magnet'];
    for (let zone = 0; zone < NUM_ZONES; zone++){
      const zStart = -zone * ZONE_LEN - 30;
      const zEnd   = -(zone + 1) * ZONE_LEN + 20;
      const count  = 1 + (zone >= 2 ? 1 : 0);
      for (let i = 0; i < count; i++){
        this.powerups.push({
          id: id++,
          type: TYPES[Math.floor(Math.random() * TYPES.length)],
          x: (Math.random() * 2 - 1) * (RUNWAY_HALF_W - 3),
          z: zStart - Math.random() * (zStart - zEnd),
          available: true,
          respawnAt: 0,
        });
      }
    }
  }

  spawnInitialCoins(){
    let id = 1;
    for (let zone = 0; zone < NUM_ZONES; zone++){
      const zStart = -(zone) * ZONE_LEN - 15;
      const zEnd   = -(zone + 1) * ZONE_LEN + 5;
      // Front-zone bonus so early players have enough cash for first upgrades.
      // zone 0:32 / 1:38 / 2:44 / 3:50 / 4:56 / ... / 9:106
      const count  = 16 + zone * 10 + Math.max(0, 4 - zone) * 4;
      const value  = 1 + zone;
      for (let i = 0; i < count; i++){
        this.coins.push({
          id: id++,
          x: (Math.random() * 2 - 1) * (RUNWAY_HALF_W - 1),
          z: zStart - Math.random() * (zStart - zEnd),
          value,
          available: true,
          respawnAt: 0,
        });
      }
    }
  }

  tick(){
    const now = Date.now();
    const dt = (now - this.lastTick) / 1000;
    this.lastTick = now;

    // Coin respawn
    for (const c of this.coins){
      if (!c.available && c.respawnAt && now >= c.respawnAt){
        c.available = true;
        c.respawnAt = 0;
        this.broadcast({ type: 'coin_respawn', id: c.id });
      }
    }
    // Big treasure respawn
    if (!this.bigTreasure.available && this.bigTreasure.respawnAt && now >= this.bigTreasure.respawnAt){
      this.bigTreasure.available = true;
      this.bigTreasure.respawnAt = 0;
      this.broadcast({
        type: 'big_treasure_spawn',
        x: this.bigTreasure.x, z: this.bigTreasure.z, value: this.bigTreasure.value,
      });
    }

    // Powerup respawn (re-randomize type each respawn so distribution mixes)
    for (const p of this.powerups){
      if (!p.available && p.respawnAt && now >= p.respawnAt){
        const TYPES = ['speed', 'jump', 'magnet'];
        p.type = TYPES[Math.floor(Math.random() * TYPES.length)];
        p.available = true;
        p.respawnAt = 0;
        this.broadcast({ type: 'powerup_respawn', id: p.id, ptype: p.type });
      }
    }

    // Storm phase machine
    if (!this.storm && now >= this.stormCooldownUntil && Math.random() < dt * 0.025){
      this.storm = true;
      this.stormUntil = now + (14 + Math.random() * 8) * 1000;
      this.broadcast({ type: 'storm_start' });
    }
    if (this.storm && now > this.stormUntil){
      this.storm = false;
      this.stormCooldownUntil = now + (30 + Math.random() * 50) * 1000;
      this.broadcast({ type: 'storm_end' });
    }

    // Wave spawning (only if at least one authed player is in danger zone)
    const authedPlayers = Array.from(this.players.values()).filter(p => p.authed);
    if (authedPlayers.length > 0){
      this.spawnAccum += dt;
      if (this.spawnAccum > this.nextSpawnIn){
        this.spawnAccum = 0;
        this.nextSpawnIn = nextWaveGap(this.storm);

        // Use the deepest authed player to set difficulty
        let minZ = 8;
        for (const p of authedPlayers) if (p.z < minZ) minZ = p.z;

        // Only actually spawn if at least one player has crossed safety line
        if (minZ < 5){
          const wt = pickWaveType(this.storm);
          // Fixed, readable wave speed; spawn ~6 s ahead of the deepest player.
          // Keep in sync with WAVE_WARN_SEC / waveSpeedFor in island.html.
          const depthFactor = Math.min(1, Math.max(0, -minZ) / RUNWAY_LEN);
          const speed = (0.30 + 0.12 * depthFactor) * wt.speedMul;
          const fromZ = Math.max(-RUNWAY_LEN + 5, minZ - speed * 60 * 6);

          const partial = wt.width < RUNWAY_HALF_W * 1.7;
          // Boosted lateral sweep on narrow waves: amp ×3 vs the old 4-10 range
          // so they actually chase players who try to hug an edge.
          const maxAmp = RUNWAY_HALF_W - wt.width/2 - 1;
          const lateralAmp = partial ? Math.min(maxAmp, 12 + Math.random() * 14) : 0;

          // Twin-narrow waves: when a partial wave rolls, 30% chance to spawn
          // mirrored pair on opposite sides of the runway so the middle is the
          // only safe corridor. Storm boosts to 45%.
          const twinChance = this.storm ? TWIN_CHANCE_STORM : TWIN_CHANCE;
          const isTwin = partial && Math.random() < twinChance;

          const spawnOne = (xOffset, phaseOffset) => {
            const baseX = isTwin
              ? xOffset
              : (Math.random() * 2 - 1) * maxAmp;
            const wave = {
              id: this.nextWaveId++,
              waveTypeId: wt.id,
              speed,
              fromZ,
              baseX,
              // Pinched twin waves use a smaller sweep so they stay on their side
              lateralAmp: isTwin ? Math.min(6, lateralAmp * 0.5) : lateralAmp,
              lateralPhase: Math.random() * Math.PI * 2 + phaseOffset,
              lateralFreq: 0.5 + Math.random() * 1.0,
              spawnTime: now,
            };
            this.waves.push(wave);
            this.broadcast({ type: 'wave_spawn', wave });
          };

          if (isTwin){
            // Place each wave hugging its own runway edge
            const edgeX = (RUNWAY_HALF_W - wt.width/2 - 1) * 0.7;
            spawnOne(-edgeX, 0);
            spawnOne( edgeX, Math.PI);   // opposite phase so they sweep in opposite directions
          } else {
            spawnOne(0, 0);
          }
        }
      }
    }

    // Persist scoreboard at most once every 5s while there are pending changes
    if (this.scoreboardDirty && (now - this.scoreboardLastSave) > 5000){
      this.scoreboardLastSave = now;
      this.scoreboardDirty = false;
      if (this.room && this.room.storage){
        try { Promise.resolve(this.room.storage.put('scoreboard', this.scoreboard)).catch(()=>{}); } catch(e){}
      }
    }
    // Persist plot ownership similarly
    if (this.plotsDirty && (now - this.plotsLastSave) > 5000){
      this.plotsLastSave = now;
      this.plotsDirty = false;
      if (this.room && this.room.storage){
        try {
          const snap = this.plots.map(p => ({
            id: p.id, ownerId: p.ownerId, ownerName: p.ownerName, build: p.build,
          }));
          Promise.resolve(this.room.storage.put('plots', snap)).catch(()=>{});
        } catch(e){}
      }
    }

    // Wave removal once past hill base
    for (let i = this.waves.length - 1; i >= 0; i--){
      const w = this.waves[i];
      const elapsed = (now - w.spawnTime) / 1000;
      const z = w.fromZ + w.speed * 60 * elapsed;
      if (z > HILL_START_Z){
        this.waves.splice(i, 1);
        this.broadcast({ type: 'wave_remove', id: w.id });
      }
    }
  }

  broadcast(obj, except){
    this.room.broadcast(JSON.stringify(obj), except || []);
  }

  onConnect(conn){
    // Connection starts un-authed. We tell the client we need auth, then
    // wait for an `auth` message with a valid token before adding them to
    // the world. Anything else sent before that is ignored.
    const player = {
      id: conn.id,
      userId: null, displayName: null,
      name: '???', custom: null,
      x: 0, y: 0, z: 8, ry: 0, moving: false, inPit: false,
      authed: false,
    };
    this.players.set(conn.id, player);

    try { conn.send(JSON.stringify({ type: 'auth_required' })); } catch(e){}

    setTimeout(() => {
      const p = this.players.get(conn.id);
      if (p && !p.authed){
        try { conn.send(JSON.stringify({ type: 'auth_timeout' })); } catch(e){}
        try { conn.close(); } catch(e){}
        this.players.delete(conn.id);
      }
    }, PRE_AUTH_TIMEOUT_MS);
  }

  async logActivity(user, type, extra){
    const feed = (await this.room.storage.get('activity')) || [];
    feed.push({ at: Date.now(), user: user.username, name: user.displayName, type, ...(extra || {}) });
    if (feed.length > ACTIVITY_MAX) feed.splice(0, feed.length - ACTIVITY_MAX);
    await this.room.storage.put('activity', feed);
  }
  // Mark the user as seen (call before saving the user record). Returns true
  // when this counts as a new visit, which is also logged to the feed.
  async markSeen(user, where, device){
    const now = Date.now(), st = user.stats || (user.stats = {});
    const isNew = !st.lastSeenAt || now - st.lastSeenAt > VISIT_GAP_MS;
    st.lastSeenAt = now;
    if (device) st.device = device;
    if (isNew){ st.visits = (st.visits || 0) + 1; await this.logActivity(user, 'visit', { where, device: device || null }); }
    return isNew;
  }

  async handleAuth(conn, msg){
    const secret = getSecret(this.room);
    const userId = await verifyToken(msg.token, secret);
    if (!userId){
      try { conn.send(JSON.stringify({ type: 'auth_failed', reason: 'bad_token' })); } catch(e){}
      try { conn.close(); } catch(e){}
      return false;
    }
    const user = await this.room.storage.get('user:' + userId);
    if (!user){
      try { conn.send(JSON.stringify({ type: 'auth_failed', reason: 'no_user' })); } catch(e){}
      try { conn.close(); } catch(e){}
      return false;
    }
    const player = this.players.get(conn.id);
    if (!player) return false;
    if (await this.markSeen(user, 'island', null)) await this.room.storage.put('user:' + userId, user);
    player.userId = userId;
    player.displayName = user.displayName;
    player.name = user.displayName;
    player.custom = (user.profile && user.profile.custom) || null;
    player.authed = true;

    // Send the world snapshot now that we know who this is
    conn.send(JSON.stringify({
      type: 'init',
      yourId: conn.id,
      userId, displayName: user.displayName,
      profile: user.profile || null,
      players: Array.from(this.players.values())
        .filter(p => p.authed && p.id !== conn.id)
        .map(p => ({
          id: p.id, name: p.name, custom: p.custom,
          x: p.x, y: p.y, z: p.z, ry: p.ry,
          moving: p.moving, inPit: p.inPit,
        })),
      coins: this.coins.filter(c => c.available).map(c => ({
        id: c.id, x: c.x, z: c.z, value: c.value,
      })),
      powerups: this.powerups.filter(p => p.available).map(p => ({
        id: p.id, x: p.x, z: p.z, type: p.type,
      })),
      chests: this.chests.filter(c => c.available).map(c => ({
        id: c.id, x: c.x, z: c.z, value: c.value, slots: c.slots,
        ownerName: c.ownerName, bag: c.bag || '',
      })),
      bigTreasure: this.bigTreasure.available ? {
        x: this.bigTreasure.x, z: this.bigTreasure.z, value: this.bigTreasure.value,
      } : null,
      plots: this.plots.map(p => ({
        id: p.id, ownerId: p.ownerId, ownerName: p.ownerName, build: p.build,
      })),
      scoreboard: this.scoreboard.slice(0, 10),
      chatHistory: (this.chatHistory || []).slice(-30),
      waves: this.waves,
      storm: this.storm,
    }));

    this.broadcast({
      type: 'join',
      player: {
        id: conn.id, name: player.name, custom: player.custom,
        x: player.x, y: player.y, z: player.z, ry: player.ry,
        moving: false, inPit: false,
      },
    }, [conn.id]);
    return true;
  }

  async onMessage(raw, sender){
    let msg;
    try { msg = JSON.parse(raw); } catch (e) { return; }
    const player = this.players.get(sender.id);
    if (!player) return;

    // Pre-auth: only the `auth` message is honoured
    if (!player.authed){
      if (msg.type === 'auth') await this.handleAuth(sender, msg);
      return;
    }

    if (msg.type === 'state'){
      player.x = +msg.x || 0;
      player.y = +msg.y || 0;
      player.z = +msg.z || 0;
      player.ry = +msg.ry || 0;
      player.moving = !!msg.moving;
      player.inPit  = !!msg.inPit;
      this.broadcast({
        type: 'state',
        id: sender.id,
        x: player.x, y: player.y, z: player.z, ry: player.ry,
        moving: player.moving, inPit: player.inPit,
      }, [sender.id]);
    } else if (msg.type === 'identify'){
      // Display name is locked to the account. Cosmetics can update.
      player.custom = msg.custom || null;
      this.broadcast({
        type: 'identify',
        id: sender.id,
        name: player.name,
        custom: player.custom,
      }, [sender.id]);
      // Persist cosmetics into the user's profile so they survive reconnects
      try {
        const user = await this.room.storage.get('user:' + player.userId);
        if (user){
          user.profile = user.profile || {};
          user.profile.custom = player.custom;
          await this.room.storage.put('user:' + player.userId, user);
        }
      } catch(e){}
    } else if (msg.type === 'profile_save'){
      // Full progress snapshot from the client. Throttling is on the client.
      try {
        const user = await this.room.storage.get('user:' + player.userId);
        if (!user) return;
        // The island doesn't know about race-only fields; keep them across its saves.
        const prev = (user.profile && user.profile.progress) || {};
        const progress = msg.progress || null;
        if (progress && prev.raceBest && !progress.raceBest) progress.raceBest = prev.raceBest;
        user.profile = {
          custom: msg.custom || (user.profile && user.profile.custom) || null,
          progress,
        };
        await this.room.storage.put('user:' + player.userId, user);
      } catch(e){}
    } else if (msg.type === 'pickup_attempt'){
      const coin = this.coins.find(c => c.id === msg.coinId);
      if (coin && coin.available){
        coin.available = false;
        // Spillover coins don't respawn — they're one-shot drops from chests
        if (!coin.spillover) coin.respawnAt = Date.now() + COIN_RESPAWN_MS;
        this.broadcast({
          type: 'coin_pickup',
          id: coin.id,
          byId: sender.id,
          byName: player.name,
          value: coin.value,
        });
        if (coin.spillover){
          this.coins = this.coins.filter(c => c.id !== coin.id);
        }
      }
    } else if (msg.type === 'powerup_attempt'){
      const p = this.powerups.find(x => x.id === msg.powerupId);
      if (p && p.available){
        p.available = false;
        p.respawnAt = Date.now() + POWERUP_RESPAWN_MS;
        this.broadcast({
          type: 'powerup_pickup',
          id: p.id,
          buffType: p.type,
          byId: sender.id,
          byName: player.name,
        });
      }
    } else if (msg.type === 'chest_drop'){
      const value = +msg.value || 0;
      const slots = +msg.slots || 0;
      if (value <= 0 || slots <= 0) return;
      const chest = {
        id: 'chest_' + (this.nextChestId++),
        x: +msg.x || 0,
        z: +msg.z || 0,
        value, slots,
        ownerName: player.name,
        bag: String(msg.bag || '').slice(0, 24),
        available: true,
      };
      this.chests.push(chest);
      this.broadcast({
        type: 'chest_spawn',
        id: chest.id, x: chest.x, z: chest.z,
        value, slots, ownerName: chest.ownerName, bag: chest.bag,
      });
    } else if (msg.type === 'plot_buy'){
      const plot = this.plots.find(p => p.id === msg.plotId);
      if (!plot || plot.ownerId) return;
      plot.ownerId = player.userId;
      plot.ownerName = player.name;
      plot.build = { floor:'', walls:'', roof:'', furniture:'', decoration:'' };
      this.plotsDirty = true;
      this.broadcast({
        type: 'plot_owned',
        plotId: plot.id,
        ownerId: player.userId,
        ownerName: player.name,
      });
    } else if (msg.type === 'plot_build'){
      const plot = this.plots.find(p => p.id === msg.plotId);
      if (!plot || plot.ownerId !== player.userId) return;
      const slot = msg.slot;
      if (!['floor','walls','roof','furniture','decoration'].includes(slot)) return;
      plot.build[slot] = String(msg.itemId || '').slice(0, 32);
      this.plotsDirty = true;
      this.broadcast({
        type: 'plot_built',
        plotId: plot.id,
        slot,
        itemId: plot.build[slot],
        byId: sender.id,
      });
    } else if (msg.type === 'big_treasure_attempt'){
      if (this.bigTreasure.available){
        this.bigTreasure.available = false;
        this.bigTreasure.respawnAt = Date.now() + BIG_TREASURE_RESPAWN_MS;
        this.broadcast({
          type: 'big_treasure_picked',
          byId: sender.id,
          byName: player.name,
          value: this.bigTreasure.value,
        });
      }
    } else if (msg.type === 'chest_pickup_attempt'){
      const c = this.chests.find(x => x.id === msg.chestId);
      if (!c || !c.available) return;
      c.available = false;
      const carryMax   = +msg.carryMax || 10;
      const currentBag = +msg.currentBag || 0;
      const space = Math.max(0, carryMax - currentBag);
      const takenSlots  = Math.min(c.slots, space);
      const takenValue  = c.slots > 0 ? Math.floor(c.value * takenSlots / c.slots) : 0;
      const leftSlots   = c.slots - takenSlots;
      const leftValue   = c.value - takenValue;
      this.broadcast({
        type: 'chest_picked',
        id: c.id,
        byId: sender.id, byName: player.name,
        takenSlots, takenValue,
        x: c.x, z: c.z,
      });
      // Excess scatters as ground coins (spillover, no respawn)
      if (leftSlots > 0 && leftValue > 0){
        const perCoin = Math.max(1, Math.floor(leftValue / leftSlots));
        let remaining = leftValue;
        for (let i = 0; i < leftSlots; i++){
          const value = (i === leftSlots - 1) ? remaining : perCoin;
          remaining -= perCoin;
          const coin = {
            id: 'spill_' + sender.id.slice(0,4) + '_' + (this.nextChestId++),
            x: c.x + (Math.random() - 0.5) * 4,
            z: c.z + (Math.random() - 0.5) * 4,
            value,
            available: true,
            respawnAt: 0,
            spillover: true,
          };
          this.coins.push(coin);
          this.broadcast({
            type: 'coin_spawn',
            coin: { id: coin.id, x: coin.x, z: coin.z, value: coin.value },
          });
        }
      }
      this.chests = this.chests.filter(x => x.id !== c.id);
    } else if (msg.type === 'punch_attempt'){
      const target = this.players.get(String(msg.targetId || ''));
      if (!target || target === player) return;
      const now = Date.now();
      if (now - (this.lastPunch?.get(sender.id) || 0) < 2000) return;   // 2s cooldown
      const dx = target.x - player.x;
      const dz = target.z - player.z;
      const distSq = dx*dx + dz*dz;
      if (distSq > 36) return;   // out of range (6 units, bat reach)
      if (!this.lastPunch) this.lastPunch = new Map();
      this.lastPunch.set(sender.id, now);
      const dist = Math.sqrt(distSq) || 1;
      // Strength scales knockback: base 80 + 20 per level
      // With client decay ~0.05/sec (k≈3), distance ≈ magnitude / 3 units
      // Lv 0 ≈ 27m, Lv 5 ≈ 60m, Lv 10 ≈ 93m
      const strengthLv = Math.max(0, Math.min(20, +msg.strength || 0));
      const magnitude = 80 + strengthLv * 20;
      this.broadcast({
        type: 'punch_hit',
        attackerId: sender.id, attackerName: player.name,
        targetId: target.id, targetName: target.name,
        dirX: dx / dist, dirZ: dz / dist,
        magnitude,
        stun: Math.random() < 0.5,   // 50% chance to stun
      });
    } else if (msg.type === 'score'){
      this.recordScore(player.userId, player.displayName, +msg.maxDist || 0);
    } else if (msg.type === 'chat'){
      const text = String(msg.text || '').slice(0, 120);
      if (!text) return;
      const chatMsg = {
        type: 'chat',
        id: sender.id,
        name: player.name,
        text,
        ts: Date.now(),
      };
      if (!this.chatHistory) this.chatHistory = [];
      this.chatHistory.push(chatMsg);
      if (this.chatHistory.length > 50) this.chatHistory.splice(0, this.chatHistory.length - 50);
      this.broadcast(chatMsg);
    }
  }

  onClose(conn){
    const p = this.players.get(conn.id);
    this.players.delete(conn.id);
    if (p && p.authed){
      this.broadcast({ type: 'leave', id: conn.id });
    }
  }

  onError(conn, err){
    console.error('WorldServer error', err);
  }
}
