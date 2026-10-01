// Unit checks for api/lead.js without network: stubs fetch and exercises every branch.
import handler, { validate } from '../api/lead.js';
import { Readable } from 'node:stream';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('FAIL', m); } };
function call(body, { method = 'POST', headers = {} } = {}) {
  return new Promise((resolve) => {
    const req = Readable.from([Buffer.from(typeof body === 'string' ? body : JSON.stringify(body))]);
    req.method = method; req.headers = { 'x-forwarded-for': headers.ip || '1.1.1.' + Math.random(), ...headers }; req.socket = {};
    const res = { headers: {}, statusCode: 200, setHeader(k, v) { this.headers[k] = v; }, end(b) { resolve({ status: this.statusCode, body: b ? JSON.parse(b) : null }); } };
    handler(req, res);
  });
}
const good = { id: 't1', name: 'Nino', phone: '+995 555 12 34 56', comment: 'hi', apartment: 104, lang: 'ka', elapsed: 9000, attribution: { utm_source: 'google', gclid: 'abc' } };
const env = process.env;
// validation
ok(validate(good).errors.length === 0, 'valid lead');
ok(validate({ ...good, name: 'A' }).errors.includes('name'), 'short name');
ok(validate({ ...good, phone: '12345' }).errors.includes('phone'), 'short phone');
ok(validate({ ...good, phone: 'call me' }).errors.includes('phone'), 'letters in phone');
ok(validate({ ...good, comment: 'x'.repeat(1001) }).errors.includes('comment'), 'long comment');
ok(validate({ ...good, apartment: 'DROP' }).lead.apartment === null, 'apartment sanitised');
// method
ok((await call(good, { method: 'GET' })).status === 405, 'GET rejected');
// not configured -> 503, never a fake success
delete env.TELEGRAM_BOT_TOKEN; delete env.RESEND_API_KEY; delete env.LEAD_WEBHOOK_URL;
ok((await call(good)).status === 503, 'not configured -> 503');
// telegram success
env.TELEGRAM_BOT_TOKEN = 'x'; env.TELEGRAM_CHAT_ID = '1';
let sent = null;
globalThis.fetch = async (url, opt) => { sent = { url, body: JSON.parse(opt.body) }; return { ok: true, json: async () => ({ ok: true }) }; };
let r = await call(good);
ok(r.status === 200 && r.body.ok === true, 'telegram delivered -> 200');
ok(sent.body.text.includes('Nino') && sent.body.text.includes('104') && sent.body.text.includes('gclid=abc'), 'message content');
// telegram failure -> 502
globalThis.fetch = async () => ({ ok: false, json: async () => ({ ok: false }) });
ok((await call(good)).status === 502, 'delivery failure -> 502');
globalThis.fetch = async () => { throw new Error('network'); };
ok((await call(good)).status === 502, 'network failure -> 502');
// invalid -> 422
globalThis.fetch = async () => ({ ok: true, json: async () => ({ ok: true }) });
r = await call({ ...good, phone: '1' });
ok(r.status === 422 && r.body.fields.includes('phone'), 'invalid -> 422');
// honeypot -> silent 200 without delivery
sent = null; globalThis.fetch = async (u, o) => { sent = o; return { ok: true, json: async () => ({ ok: true }) }; };
r = await call({ ...good, company: 'spam inc' });
ok(r.status === 200 && sent === null, 'honeypot swallowed');
// rate limit
const ip = '9.9.9.9'; let last;
for (let i = 0; i < 5; i++) last = await call(good, { headers: { ip } });
ok(last.status === 429, 'rate limited after burst');
// origin allow-list
env.ALLOWED_ORIGINS = 'https://isanipark.example';
ok((await call(good, { headers: { origin: 'https://evil.example' } })).status === 403, 'foreign origin blocked');
delete env.ALLOWED_ORIGINS;
// bad json
ok((await call('{not json')).status === 400, 'bad json -> 400');
console.log(`api tests: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
