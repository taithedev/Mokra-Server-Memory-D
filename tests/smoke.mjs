// Run against a deployed or local MonkaMemory API. This creates one test profile.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
const base = (process.env.MONKAMEMORY_URL || 'http://localhost:8787').replace(/\/$/, '');
async function request(path, method='GET', data, token) {
  const headers = {};
  if (data !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = 'Bearer ' + token;
  const res = await fetch(base + path, { method, headers, body:data===undefined?undefined:JSON.stringify(data) });
  return { status: res.status, body:await res.json() };
}
const health = await request('/api/health');
assert.equal(health.status,200);assert.equal(health.body.ok,true);
console.log('PASS health and Neon connection');
const key = randomBytes(32).toString('hex');
const login = await request('/api/v1/auth/guest','POST',{guestKey:key,version:'1.1.0',startingName:'TestMonke'});
assert.equal(login.status,200,JSON.stringify(login.body));const token = login.body.sessionToken;
assert.match(token,/^[a-f0-9]{64}$/);console.log('PASS guest login');
const repeated = await request('/api/v1/auth/guest','POST',{guestKey:key,version:'1.1.0',startingName:'TestMonke'});
assert.equal(repeated.body.player.id,login.body.player.id);console.log('PASS persistent guest identity');
const profile = await request('/api/v1/player/state','GET',undefined,token);
assert.equal(profile.body.id,login.body.player.id);console.log('PASS player state');
const changed = await request('/api/v1/player/name','PATCH',{name:'UpdatedMonke'},token);
assert.equal(changed.status,200);const after=await request('/api/v1/player/state','GET',undefined,token);
assert.equal(after.body.displayName,'UpdatedMonke');console.log('PASS saved player data');
const ticket = await request('/api/v1/player/photon-ticket','POST',{},token);
assert.equal(ticket.status,200);console.log('PASS Photon auth ticket issued');
const first = await request('/api/v1/photon/auth?ticket='+encodeURIComponent(ticket.body.ticket));
assert.equal(first.body.ResultCode,1);assert.equal(first.body.UserId,profile.body.id);
const second = await request('/api/v1/photon/auth?ticket='+encodeURIComponent(ticket.body.ticket));
assert.equal(second.body.ResultCode,2);console.log('PASS ticket replay prevention');
console.log('All MonkaMemory smoke tests passed');
