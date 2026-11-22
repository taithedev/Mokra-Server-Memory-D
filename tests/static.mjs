import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const server = readFileSync(new URL('../backend/server.js',import.meta.url),'utf8');
const ui = readFileSync(new URL('../dashboard/app.js',import.meta.url),'utf8');
const html = readFileSync(new URL('../dashboard/index.html',import.meta.url),'utf8');
for (const endpoint of ['/api/health','/api/v1/auth/guest','/api/v1/player/state','/api/v1/player/name','/api/v1/player/photon-ticket','/api/v1/photon/auth','/api/v1/admin/login','/api/v1/admin/catalog','/api/v1/admin/config']) {
 assert(server.includes(endpoint),'Missing endpoint: '+endpoint);
}
for (const id of ['dashboard','loginPage','loginForm','mainContent','userLabel','connection','modalRoot','toast']) {
 assert(html.includes('id="'+id+'"'),'Missing dashboard element: '+id);
}
for (const page of ['overview','players','catalog','config','audit']) assert(ui.includes(page),'Missing dashboard page: '+page);
assert(!server.includes('postgresql://USER:PASSWORD@'),'Backend must never contain an embedded DB password');
console.log('PASS API/UI integration contract checks');
