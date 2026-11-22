import http from 'node:http';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import pg from 'pg';

const PORT = Number(process.env.PORT || 8787);
const PUBLIC_URL = (process.env.PUBLIC_URL || 'http://localhost:' + PORT).replace(/\/$/, '');
const ROOT = dirname(fileURLToPath(import.meta.url));
const DASH = resolve(ROOT, '../dashboard');
const PEPPER = process.env.AUTH_PEPPER;
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL || !PEPPER || PEPPER.length < 32) {
  console.error('DATABASE_URL and a 32+ character AUTH_PEPPER are required');
  process.exit(1);
}
const db = new pg.Pool({ connectionString: DATABASE_URL, max: 8, idleTimeoutMillis: 20000, connectionTimeoutMillis: 10000 });
db.on('error', e => console.error('Postgres pool error:', e.message));
const sha = value => createHash('sha256').update(value).digest('hex');
const secretHash = value => sha(PEPPER + ':' + value);
const makeToken = () => randomBytes(32).toString('hex');
const authPattern = /^[a-f0-9]{64}$/i;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const idPattern = /^[a-zA-Z0-9_-]{1,64}$/;
const error = (status, message, more = {}) => Object.assign(new Error(message), { status, more });
const banActive = p => Boolean(p && p.is_banned && (!p.banned_until || new Date(p.banned_until).getTime() > Date.now()));
const banData = p => ({ error: 'BANNED', reason: p.ban_reason || 'Access suspended', bannedUntil: p.banned_until || null });
const rateHits = new Map();
const streams = new Set();

setInterval(() => {
  for (const [key, hit] of rateHits) if (hit.reset < Date.now()) rateHits.delete(key);
}, 60000).unref();

function limit(req, group, max, windowMs = 60000) {
  const auth = req.headers.authorization || '';
  const identity = /^Bearer [a-f0-9]{64}$/i.test(auth) ? sha(auth) : (req.socket.remoteAddress || 'unknown');
  const key = group + ':' + identity;
  const now = Date.now();
  let hit = rateHits.get(key);
  if (!hit || hit.reset < now) { hit = { count: 0, reset: now + windowMs }; rateHits.set(key, hit); }
  if (++hit.count > max) throw error(429, 'RATE_LIMITED');
}
function json(res, status, data, extra = {}) {
  const body = JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body), 'Cache-Control': 'no-store', ...extra });
  res.end(body);
}
function secureHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', "default-src 'self'; connect-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
}
function sameOrigin(req) { if (req.headers.origin !== PUBLIC_URL) throw error(403, 'BAD_ORIGIN'); }
function cookie(req, name) {
  const item = (req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith(name + '='));
  return item ? item.slice(name.length + 1) : null;
}
async function body(req) {
  const type = String(req.headers['content-type'] || '').toLowerCase().split(';')[0].trim();
  if (type !== 'application/json') throw error(415, 'JSON_REQUIRED');
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 32768) throw error(413, 'PAYLOAD_TOO_LARGE');
  }
  try {
    const data = JSON.parse(raw || '{}');
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw Error();
    return data;
  } catch { throw error(400, 'INVALID_JSON'); }
}
function passwordHash(password) {
  const salt = randomBytes(16).toString('hex');
  return salt + ':' + scryptSync(password, salt, 64).toString('hex');
}
function passwordMatches(password, stored) {
  if (typeof password !== 'string' || password.length > 1024 || typeof stored !== 'string') return false;
  const [salt, encoded] = stored.split(':');
  if (!salt || !encoded || !/^[a-f0-9]{128}$/i.test(encoded)) return false;
  return timingSafeEqual(Buffer.from(encoded, 'hex'), scryptSync(password, salt, 64));
}
async function player(req) {
  const bearer = /^Bearer ([a-f0-9]{64})$/i.exec(req.headers.authorization || '');
  if (!bearer) throw error(401, 'PLAYER_LOGIN_REQUIRED');
  const q = await db.query('SELECT p.* FROM mm_player_sessions s JOIN mm_players p ON p.id=s.player_id WHERE s.token_hash=$1 AND s.expires_at>now()', [secretHash(bearer[1])]);
  if (!q.rows.length) throw error(401, 'SESSION_EXPIRED');
  if (banActive(q.rows[0])) throw error(403, 'BANNED', banData(q.rows[0]));
  return q.rows[0];
}
async function admin(req) {
  const t = cookie(req, 'mm_admin');
  if (!t || !authPattern.test(t)) throw error(401, 'ADMIN_LOGIN_REQUIRED');
  const q = await db.query('SELECT username FROM mm_admin_sessions WHERE token_hash=$1 AND expires_at>now()', [secretHash(t)]);
  if (!q.rows.length) throw error(401, 'ADMIN_LOGIN_REQUIRED');
  return q.rows[0].username;
}
async function config() {
  const q = await db.query('SELECT key, value FROM mm_game_config');
  return Object.fromEntries(q.rows.map(r => [r.key, r.value]));
}
function olderVersion(current, required) {
  const a = String(current || '0.0.0').split('.').map(Number);
  const b = String(required || '0.0.0').split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((a[i] || 0) < (b[i] || 0)) return true;
    if ((a[i] || 0) > (b[i] || 0)) return false;
  }
  return false;
}
async function state(id) {
  const [p, inv, cfg] = await Promise.all([
    db.query('SELECT id, display_name, coins FROM mm_players WHERE id=$1', [id]),
    db.query('SELECT c.item_id, c.catalog FROM mm_inventory i JOIN mm_catalog c ON c.item_id=i.item_id WHERE i.player_id=$1 AND c.enabled=true ORDER BY c.item_id', [id]),
    config()
  ]);
  if (!p.rows[0]) throw error(404, 'PLAYER_NOT_FOUND');
  return {
    id: p.rows[0].id, displayName: p.rows[0].display_name, coins: p.rows[0].coins,
    inventory: inv.rows.map(r => r.item_id),
    inventoryDetails: inv.rows.map(r => ({ itemId: r.item_id, catalog: r.catalog })),
    motd: cfg.MOTD || '', minimumClientVersion: cfg.MinimumClientVersion || '0.0.0',
    maintenance: cfg.MaintenanceMode === 'true'
  };
}
function broadcast() {
  for (const res of streams) {
    try { res.write('event: refresh\ndata: {}\n\n'); } catch { streams.delete(res); }
  }
}
async function audit(actor, action, target, details = {}) {
  await db.query('INSERT INTO mm_audit_log(actor,action,target,details) VALUES ($1,$2,$3,$4::jsonb)', [actor,action,target,JSON.stringify(details)]);
  broadcast();
}
async function photonAuth(res, url) {
  const t = url.searchParams.get('ticket');
  if (!t || !authPattern.test(t)) return json(res, 200, { ResultCode: 2, Message: 'Invalid ticket' });
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const q = await client.query('SELECT t.player_id,t.expires_at,t.consumed_at,p.is_banned,p.banned_until FROM mm_photon_tickets t JOIN mm_players p ON p.id=t.player_id WHERE t.token_hash=$1 FOR UPDATE OF t', [secretHash(t)]);
    const p = q.rows[0];
    if (!p || p.consumed_at || new Date(p.expires_at).getTime() <= Date.now() || banActive(p)) {
      await client.query('ROLLBACK');
      return json(res, 200, { ResultCode: 2, Message: 'Authentication failed' });
    }
    await client.query('UPDATE mm_photon_tickets SET consumed_at=now() WHERE token_hash=$1', [secretHash(t)]);
    await client.query('COMMIT');
    return json(res, 200, { ResultCode: 1, UserId: p.player_id });
  } catch (e) { await client.query('ROLLBACK').catch(() => {}); throw e; }
  finally { client.release(); }
}
async function bootstrap() {
  const username = process.env.ADMIN_USERNAME, password = process.env.ADMIN_PASSWORD;
  if (!username || !password) return;
  if (!/^[A-Za-z0-9_]{3,60}$/.test(username) || password.length < 12) throw Error('Invalid bootstrap administrator settings');
  const q = await db.query('SELECT username FROM mm_admin_users LIMIT 1');
  if (!q.rows.length) {
    await db.query('INSERT INTO mm_admin_users(username,password_hash) VALUES($1,$2) ON CONFLICT DO NOTHING', [username, passwordHash(password)]);
    console.log('Initial admin created; remove ADMIN_PASSWORD from server environment after bootstrap');
  }
}
async function handle(req, res) {
  secureHeaders(res);
  const url = new URL(req.url || '/', PUBLIC_URL);
  const path = url.pathname;
  if (path === '/api/health' && req.method === 'GET') {
    await db.query('SELECT 1');
    return json(res, 200, { ok: true, service: 'MonkaMemory', version: '1.1.0' });
  }
  if (path === '/api/v1/photon/auth' && req.method === 'GET') {
    limit(req, 'photonverify', 180);
    return photonAuth(res, url);
  }
  if (path === '/api/v1/auth/guest' && req.method === 'POST') {
    limit(req, 'guest', 30);
    const input = await body(req);
    if (typeof input.guestKey !== 'string' || !authPattern.test(input.guestKey)) throw error(400, 'GUEST_KEY_REQUIRED');
    const cfg = await config();
    if (cfg.MaintenanceMode === 'true') throw error(503, 'MAINTENANCE');
    if (olderVersion(input.version, cfg.MinimumClientVersion)) throw error(426, 'UPDATE_REQUIRED', { minimumClientVersion: cfg.MinimumClientVersion });
    const guestHash = secretHash(input.guestKey.toLowerCase());
    const requested = typeof input.startingName === 'string' ? input.startingName.trim() : '';
    const name = /^[A-Za-z0-9_ ]{3,20}$/.test(requested) ? requested : 'Monke';
    const c = await db.connect();
    try {
      await c.query('BEGIN');
      const q = await c.query('INSERT INTO mm_players(guest_key_hash,display_name) VALUES($1,$2) ON CONFLICT(guest_key_hash) DO UPDATE SET last_seen_at=now() RETURNING *', [guestHash, name]);
      const p = q.rows[0];
      if (banActive(p)) { await c.query('ROLLBACK'); return json(res, 403, banData(p)); }
      const session = makeToken();
      await c.query("INSERT INTO mm_player_sessions(token_hash,player_id,expires_at) VALUES ($1,$2,now()+interval '7 days')", [secretHash(session), p.id]);
      await c.query('COMMIT');
      return json(res, 200, { sessionToken: session, player: await state(p.id) });
    } catch(e) { await c.query('ROLLBACK').catch(() => {}); throw e; }
    finally { c.release(); }
  }
  if (path === '/api/v1/player/state' && req.method === 'GET') {
    limit(req, 'state', 180);
    const p = await player(req);
    return json(res, 200, await state(p.id));
  }
  if (path === '/api/v1/player/name' && req.method === 'PATCH') {
    limit(req, 'rename', 12);
    const p = await player(req);
    const input = await body(req);
    const name = typeof input.name === 'string' ? input.name.trim() : '';
    if (!/^[A-Za-z0-9_ ]{3,20}$/.test(name)) throw error(400, 'INVALID_NAME');
    await db.query('UPDATE mm_players SET display_name=$1 WHERE id=$2', [name, p.id]);
    return json(res, 200, { ok: true, displayName: name });
  }
  if (path === '/api/v1/player/photon-ticket' && req.method === 'POST') {
    limit(req, 'ticket', 15);
    const p = await player(req);
    await body(req);
    const ticket = makeToken();
    await db.query("INSERT INTO mm_photon_tickets(token_hash,player_id,expires_at) VALUES ($1,$2,now()+interval '120 seconds')", [secretHash(ticket), p.id]);
    return json(res, 200, { ticket, expiresInSeconds: 120 });
  }
  if (path === '/api/v1/admin/login' && req.method === 'POST') {
    limit(req, 'adminlogin', 8);
    sameOrigin(req);
    const input = await body(req);
    if (typeof input.username !== 'string' || typeof input.password !== 'string') throw error(400, 'INVALID_CREDENTIALS');
    const q = await db.query('SELECT username,password_hash FROM mm_admin_users WHERE username=$1', [input.username]);
    if (!q.rows.length || !passwordMatches(input.password, q.rows[0].password_hash)) throw error(401, 'INVALID_CREDENTIALS');
    const session = makeToken();
    await db.query("INSERT INTO mm_admin_sessions(token_hash,username,expires_at) VALUES($1,$2,now()+interval '12 hours')", [secretHash(session), q.rows[0].username]);
    const secure = PUBLIC_URL.startsWith('https:') ? '; Secure' : '';
    return json(res, 200, { ok: true, username: q.rows[0].username }, { 'Set-Cookie': 'mm_admin=' + session + '; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200' + secure });
  }
  if (path.startsWith('/api/v1/admin/')) {
    const username = await admin(req);
    if (req.method !== 'GET') sameOrigin(req);
    if (path === '/api/v1/admin/me' && req.method === 'GET') return json(res, 200, { username });
    if (path === '/api/v1/admin/logout' && req.method === 'POST') {
      await body(req);
      await db.query('DELETE FROM mm_admin_sessions WHERE token_hash=$1', [secretHash(cookie(req, 'mm_admin'))]);
      return json(res, 200, { ok: true }, { 'Set-Cookie': 'mm_admin=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0' });
    }
    if (path === '/api/v1/admin/stream' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
      res.write('event: connected\ndata: {}\n\n');
      streams.add(res);
      const timer = setInterval(() => { if (!res.destroyed) res.write(': keepalive\n\n'); }, 25000);
      req.on('close', () => { clearInterval(timer); streams.delete(res); });
      return;
    }
    if (path === '/api/v1/admin/overview' && req.method === 'GET') {
      const [s, items, trend, recent] = await Promise.all([
        db.query("SELECT count(*)::int AS players,count(*) FILTER (WHERE last_seen_at>now()-interval '24 hours')::int AS active24h,count(*) FILTER (WHERE is_banned AND (banned_until IS NULL OR banned_until>now()))::int AS banned,coalesce(sum(coins),0)::bigint AS total_coins FROM mm_players"),
        db.query('SELECT count(*)::int AS items FROM mm_catalog'),
        db.query("SELECT to_char(d::date,'YYYY-MM-DD') AS day,count(p.id)::int AS players FROM generate_series(current_date-13,current_date,interval '1 day') d LEFT JOIN mm_players p ON p.created_at::date=d::date GROUP BY d ORDER BY d"),
        db.query('SELECT action,actor,target,created_at FROM mm_audit_log ORDER BY id DESC LIMIT 5')
      ]);
      return json(res, 200, { ...s.rows[0], items: items.rows[0].items, trend: trend.rows, recent: recent.rows });
    }
    if (path === '/api/v1/admin/players' && req.method === 'GET') {
      const q = (url.searchParams.get('q') || '').slice(0,60);
      const offset = Math.min(100000, Math.max(0, Number.parseInt(url.searchParams.get('offset') || '0',10) || 0));
      const [list, count] = await Promise.all([
        db.query('SELECT id,display_name,coins,is_banned,ban_reason,banned_until,created_at,last_seen_at FROM mm_players WHERE display_name ILIKE $1 OR id::text ILIKE $1 ORDER BY last_seen_at DESC LIMIT 50 OFFSET $2', ['%' + q + '%', offset]),
        db.query('SELECT count(*)::int AS total FROM mm_players WHERE display_name ILIKE $1 OR id::text ILIKE $1', ['%' + q + '%'])
      ]);
      return json(res, 200, { players: list.rows, total: count.rows[0].total, offset, limit: 50 });
    }
    if (path === '/api/v1/admin/catalog' && req.method === 'GET') {
      const q = await db.query('SELECT * FROM mm_catalog ORDER BY item_id');
      return json(res, 200, { items: q.rows });
    }
    if (path === '/api/v1/admin/catalog' && req.method === 'POST') {
      const x = await body(req);
      const id = String(x.itemId || '').trim(), cat = String(x.catalog || 'main').trim(), name = String(x.displayName || '').trim();
      if (!idPattern.test(id) || !idPattern.test(cat) || !name || name.length > 100) throw error(400, 'INVALID_CATALOG_ITEM');
      const q = await db.query('INSERT INTO mm_catalog(item_id,catalog,display_name,enabled) VALUES($1,$2,$3,$4) ON CONFLICT(item_id) DO UPDATE SET catalog=excluded.catalog,display_name=excluded.display_name,enabled=excluded.enabled RETURNING *', [id,cat,name,x.enabled !== false]);
      await audit(username, 'catalog.upsert', id, { catalog: cat, name, enabled: x.enabled !== false });
      return json(res, 200, q.rows[0]);
    }
    if (path === '/api/v1/admin/config' && req.method === 'GET') return json(res, 200, { config: await config() });
    if (path === '/api/v1/admin/config' && req.method === 'PUT') {
      const x = await body(req), key = x.key, value = x.value;
      if (!['MOTD','MinimumClientVersion','MaintenanceMode'].includes(key) || typeof value !== 'string' || value.length > 1000) throw error(400, 'INVALID_CONFIG');
      if (key === 'MinimumClientVersion' && !/^\d+\.\d+\.\d+$/.test(value)) throw error(400, 'INVALID_VERSION');
      if (key === 'MaintenanceMode' && !['true','false'].includes(value)) throw error(400, 'INVALID_MAINTENANCE');
      await db.query('INSERT INTO mm_game_config(key,value,updated_at) VALUES($1,$2,now()) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=now()', [key,value]);
      await audit(username, 'config.set', key, { value });
      return json(res, 200, { ok: true });
    }
    if (path === '/api/v1/admin/audit' && req.method === 'GET') {
      const q = await db.query('SELECT id,action,actor,target,details,created_at FROM mm_audit_log ORDER BY id DESC LIMIT 100');
      return json(res, 200, { events: q.rows });
    }
    const info = /^\/api\/v1\/admin\/players\/([^/]+)$/.exec(path);
    if (info && req.method === 'GET') {
      const id = info[1];
      if (!uuidPattern.test(id)) throw error(400, 'INVALID_PLAYER_ID');
      const [p,inv,ledger] = await Promise.all([
        db.query('SELECT id,display_name,coins,is_banned,ban_reason,banned_until,created_at,last_seen_at FROM mm_players WHERE id=$1',[id]),
        db.query('SELECT i.item_id,c.display_name,c.catalog FROM mm_inventory i JOIN mm_catalog c ON c.item_id=i.item_id WHERE i.player_id=$1 ORDER BY i.granted_at DESC',[id]),
        db.query('SELECT delta,balance_after,actor,reason,created_at FROM mm_currency_ledger WHERE player_id=$1 ORDER BY id DESC LIMIT 12',[id])
      ]);
      if (!p.rows[0]) throw error(404, 'PLAYER_NOT_FOUND');
      return json(res, 200, { player: p.rows[0], inventory: inv.rows, ledger: ledger.rows });
    }
    const act = /^\/api\/v1\/admin\/players\/([^/]+)\/(coins|ban|unban|items)$/.exec(path);
    if (act && ['POST','DELETE'].includes(req.method)) {
      const id = act[1], op = act[2], x = await body(req);
      if (!uuidPattern.test(id)) throw error(400, 'INVALID_PLAYER_ID');
      if (op === 'ban' && req.method === 'POST') {
        const reason = String(x.reason || 'Rule violation').slice(0,300);
        const until = x.until ? String(x.until) : null;
        if (until && (!Number.isFinite(Date.parse(until)) || Date.parse(until) <= Date.now())) throw error(400, 'INVALID_BAN_EXPIRATION');
        const q = await db.query('UPDATE mm_players SET is_banned=true,ban_reason=$1,banned_until=$2 WHERE id=$3', [reason,until,id]);
        if (!q.rowCount) throw error(404, 'PLAYER_NOT_FOUND');
        await audit(username, 'player.ban', id, { reason, until });
        return json(res, 200, { ok: true });
      }
      if (op === 'unban' && req.method === 'POST') {
        const q = await db.query('UPDATE mm_players SET is_banned=false,ban_reason=NULL,banned_until=NULL WHERE id=$1', [id]);
        if (!q.rowCount) throw error(404, 'PLAYER_NOT_FOUND');
        await audit(username, 'player.unban', id);
        return json(res, 200, { ok: true });
      }
      if (op === 'coins' && req.method === 'POST') {
        if (!Number.isInteger(x.delta) || x.delta === 0 || Math.abs(x.delta) > 1000000) throw error(400, 'INVALID_CURRENCY_DELTA');
        const reason = String(x.reason || 'Admin adjustment').slice(0,300);
        const c = await db.connect();
        let balance;
        try {
          await c.query('BEGIN');
          const q = await c.query('UPDATE mm_players SET coins=coins+$1 WHERE id=$2 AND coins+$1 BETWEEN 0 AND 2000000000 RETURNING coins', [x.delta,id]);
          if (!q.rows.length) throw error(400, 'PLAYER_NOT_FOUND_OR_INVALID_BALANCE');
          balance = q.rows[0].coins;
          await c.query('INSERT INTO mm_currency_ledger(player_id,delta,balance_after,actor,reason) VALUES($1,$2,$3,$4,$5)', [id,x.delta,balance,username,reason]);
          await c.query('COMMIT');
        } catch (e) { await c.query('ROLLBACK').catch(() => {}); throw e; }
        finally { c.release(); }
        await audit(username, 'player.coins', id, { delta:x.delta, balance, reason });
        return json(res, 200, { ok: true, coins:balance });
      }
      if (op === 'items') {
        const itemId = String(x.itemId || '').trim();
        if (!idPattern.test(itemId)) throw error(400, 'INVALID_ITEM_ID');
        if (req.method === 'POST') {
          const q = await db.query('INSERT INTO mm_inventory(player_id,item_id) SELECT p.id,c.item_id FROM mm_players p,mm_catalog c WHERE p.id=$1 AND c.item_id=$2 AND c.enabled=true ON CONFLICT DO NOTHING RETURNING item_id',[id,itemId]);
          if (!q.rowCount) {
            const chk = await db.query('SELECT item_id FROM mm_inventory WHERE player_id=$1 AND item_id=$2',[id,itemId]);
            if (!chk.rows.length) throw error(404, 'PLAYER_OR_ENABLED_ITEM_NOT_FOUND');
          }
          await audit(username, 'item.grant', id, { itemId });
          return json(res, 200, { ok:true });
        }
        if (req.method === 'DELETE') {
          await db.query('DELETE FROM mm_inventory WHERE player_id=$1 AND item_id=$2',[id,itemId]);
          await audit(username, 'item.revoke', id, { itemId });
          return json(res, 200, { ok:true });
        }
      }
    }
    throw error(404, 'NOT_FOUND');
  }
  const assets = { '/':'index.html', '/app.js':'app.js', '/style.css':'style.css', '/favicon.svg':'favicon.svg' };
  if (Object.hasOwn(assets,path) && req.method === 'GET') {
    const file = assets[path];
    const types = { html:'text/html', js:'text/javascript', css:'text/css', svg:'image/svg+xml' };
    const ext = file.split('.').pop();
    const data = readFileSync(resolve(DASH,file));
    res.writeHead(200, { 'Content-Type':types[ext] + '; charset=utf-8', 'Cache-Control':'no-store' });
    res.end(data);
    return;
  }
  throw error(404, 'NOT_FOUND');
}
const server = http.createServer(async (req,res) => {
  try { await handle(req,res); }
  catch (e) {
    if (res.headersSent) { res.end(); return; }
    if (!e.status) console.error('MonkaMemory API:',e.message);
    json(res,e.status || 500, { error:e.status ? e.message : 'SERVER_ERROR', ...(e.more || {}) });
  }
});
async function main() {
  await db.query('SELECT id FROM mm_players LIMIT 1').catch(e => { throw Error('Database not initialized: ' + e.message); });
  await bootstrap();
  server.listen(PORT,'0.0.0.0',() => console.log('MonkaMemory API ready on port ' + PORT));
  setInterval(() => {
    db.query('DELETE FROM mm_player_sessions WHERE expires_at<now()').catch(console.error);
    db.query('DELETE FROM mm_admin_sessions WHERE expires_at<now()').catch(console.error);
    db.query('DELETE FROM mm_photon_tickets WHERE expires_at<now()').catch(console.error);
  },3600000).unref();
}
main().catch(e => { console.error(e.message); process.exit(1); });
