// Vercel serverless function: POST /api/lead
// Accepts an enquiry, validates it, and delivers it to the sales team.
// Success (200 {ok:true}) is returned ONLY after at least one delivery channel confirmed receipt.
//
// Environment variables (set in Vercel → Project → Settings → Environment Variables; never in client code):
//   TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID      – deliver to a Telegram chat/group of the sales team
//   RESEND_API_KEY, LEAD_EMAIL_TO, LEAD_EMAIL_FROM – deliver by email via Resend (https://resend.com)
//   LEAD_WEBHOOK_URL (+ optional LEAD_WEBHOOK_SECRET) – POST JSON to a CRM / automation webhook
//   ALLOWED_ORIGINS – comma-separated list of allowed Origin values (e.g. https://isanipark.ge)
//   TELEGRAM_API_BASE – override for tests only

const MAX_BODY = 16 * 1024;
const hits = new Map(); // best-effort per-instance rate limit

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function rateLimited(ip) {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter((t) => now - t < 10 * 60 * 1000);
  arr.push(now);
  hits.set(ip, arr);
  if (hits.size > 5000) hits.clear();
  return arr.filter((t) => now - t < 60 * 1000).length > 3 || arr.length > 10;
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body);
  let size = 0; const chunks = [];
  for await (const c of req) { size += c.length; if (size > MAX_BODY) throw new Error('too_large'); chunks.push(c); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

const clean = (v, max) => String(v ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max);

export function validate(b) {
  const errors = [];
  const name = clean(b.name, 80);
  const phone = clean(b.phone, 24);
  const comment = clean(b.comment, 1000);
  const digits = phone.replace(/\D/g, '');
  if (name.length < 2 || !/\p{L}/u.test(name)) errors.push('name');
  if (!/^[+\d][\d\s()\-.]*$/.test(phone) || digits.length < 7 || digits.length > 15) errors.push('phone');
  if (String(b.comment ?? '').length > 1000) errors.push('comment');
  const apartment = Number.isInteger(b.apartment) && b.apartment > 0 && b.apartment < 1000 ? b.apartment : null;
  const lang = ['ka', 'en', 'ru'].includes(b.lang) ? b.lang : 'ka';
  const attr = {};
  const a = b.attribution && typeof b.attribution === 'object' ? b.attribution : {};
  for (const k of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'gbraid', 'wbraid', 'landing_page', 'referrer']) {
    if (a[k]) attr[k] = clean(a[k], 200);
  }
  return { errors, lead: { id: clean(b.id, 64), name, phone, comment, apartment, lang, page: clean(b.page, 120), attribution: attr } };
}

function text(lead) {
  const lines = [
    'Новая заявка — Isani Park Residence (корпус E)',
    `Имя: ${lead.name}`,
    `Телефон: ${lead.phone}`,
    lead.apartment ? `Квартира: № ${lead.apartment}` : 'Квартира: не выбрана',
    lead.comment ? `Комментарий: ${lead.comment}` : null,
    `Язык сайта: ${lead.lang}`,
    Object.keys(lead.attribution).length ? `Источник: ${Object.entries(lead.attribution).map(([k, v]) => `${k}=${v}`).join(', ')}` : null,
    `ID: ${lead.id}`,
  ];
  return lines.filter(Boolean).join('\n');
}

async function toTelegram(lead) {
  const token = process.env.TELEGRAM_BOT_TOKEN, chat = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chat) return null;
  const base = process.env.TELEGRAM_API_BASE || 'https://api.telegram.org';
  const r = await fetch(`${base}/bot${token}/sendMessage`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chat, text: text(lead), disable_web_page_preview: true }),
    signal: AbortSignal.timeout(8000),
  });
  const j = await r.json().catch(() => ({}));
  return r.ok && j.ok === true;
}

async function toEmail(lead) {
  const key = process.env.RESEND_API_KEY, to = process.env.LEAD_EMAIL_TO, from = process.env.LEAD_EMAIL_FROM;
  if (!key || !to || !from) return null;
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ from, to: to.split(',').map((s) => s.trim()), subject: `Заявка: ${lead.name}${lead.apartment ? ', кв. ' + lead.apartment : ''} — Isani Park Residence`, text: text(lead) }),
    signal: AbortSignal.timeout(8000),
  });
  return r.ok;
}

async function toWebhook(lead) {
  const url = process.env.LEAD_WEBHOOK_URL;
  if (!url) return null;
  const r = await fetch(url, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(process.env.LEAD_WEBHOOK_SECRET ? { 'X-Lead-Secret': process.env.LEAD_WEBHOOK_SECRET } : {}) },
    body: JSON.stringify({ source: 'isani-park-residence', ...lead, received_at: new Date().toISOString() }),
    signal: AbortSignal.timeout(8000),
  });
  return r.ok;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return json(res, 405, { ok: false, error: 'method_not_allowed' }); }
  const allowed = (process.env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  const origin = req.headers.origin;
  if (allowed.length && origin && !allowed.includes(origin)) return json(res, 403, { ok: false, error: 'forbidden_origin' });

  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();
  let body;
  try { body = await readBody(req); } catch { return json(res, 400, { ok: false, error: 'bad_request' }); }

  // spam traps: hidden field filled or form submitted inhumanly fast → pretend success, deliver nothing
  if (body.company || (typeof body.elapsed === 'number' && body.elapsed < 1500)) return json(res, 200, { ok: true });
  if (rateLimited(ip)) return json(res, 429, { ok: false, error: 'rate_limited' });

  const { errors, lead } = validate(body);
  if (errors.length) return json(res, 422, { ok: false, error: 'invalid', fields: errors });

  const results = await Promise.allSettled([toTelegram(lead), toEmail(lead), toWebhook(lead)]);
  const configured = results.filter((r) => r.status === 'fulfilled' ? r.value !== null : true);
  const delivered = results.some((r) => r.status === 'fulfilled' && r.value === true);
  if (!configured.length) return json(res, 503, { ok: false, error: 'not_configured' });
  if (!delivered) {
    console.error('lead delivery failed', results.map((r) => r.status === 'rejected' ? String(r.reason) : r.value));
    return json(res, 502, { ok: false, error: 'delivery_failed' });
  }
  return json(res, 200, { ok: true, id: lead.id });
}
