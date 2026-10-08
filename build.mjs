// Static site generator for the Isani Park Residence website.
// node build.mjs            -> production build into dist/ (clean URLs: /ka/, /en/, /ru/)
// node build.mjs --preview  -> self-contained preview build (explicit index.html links, no absolute URLs)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = path.dirname(new URL(import.meta.url).pathname);
const PREVIEW = process.argv.includes('--preview');
const OUT = path.join(ROOT, process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : 'dist');
const read = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));

const config = read('site.config.json');
const SITE = (process.env.SITE_URL || config.siteUrl || '').replace(/\/$/, '');
if (!PREVIEW && !SITE) console.warn('! SITE_URL is empty: canonical, hreflang, sitemap and absolute Open Graph URLs are omitted.');
const LANGS = config.languages;
// typographic polish: keep numbers with their units and thousands groups, no dangling dashes
const NB = '\u00a0';
function typo(v) {
  if (typeof v === 'string') return v
    .replace(/(\d) (?=\d{3}(?!\d))/g, `$1${NB}`)
    .replace(/(\d) (м²|m²|მ²|%|м|m)(?![\p{L}])/gu, `$1${NB}$2`)
    .replace(/ (—|–) /g, `${NB}$1 `)
    .replace(/(\d)–(\d)/g, '$1\u2060–\u2060$2')
    .replace(/(\s)(в|и|с|к|у|о|а|по|до|от|на|за|из|не|a|an|the|of|to|in|at|on|by) /gi, `$1$2${NB}`);
  if (Array.isArray(v)) return v.map(typo);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, typo(x)]));
  return v;
}
const I18N = Object.fromEntries(LANGS.map((l) => [l, typo(read(`src/i18n/${l}.json`))]));
const media = read('src/data/media.json');
const logo = read('src/data/logo.json');
const aptsSrc = read('src/data/apartments.source.json');
const floormap = read('src/data/floormap.json');

// ---------- helpers ----------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (s, vars) => String(s).replace(/\{(\w+)\}/g, (_, k) => (k in vars ? vars[k] : `{${k}}`));
const numLocale = { ka: 'ka-GE', en: 'en-GB', ru: 'ru-RU' };
const num = (lang, v, digits = 1) => new Intl.NumberFormat(numLocale[lang], { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(v);
const m2 = { ka: 'მ²', en: 'm²', ru: 'м²' };

// cache-busting query for media whose URL never changes (hero poster/video: 30-day browser cache)
const MEDIA_V = {};
function hv(rel) {
  if (PREVIEW) return '';
  if (!(rel in MEDIA_V)) { const f = path.join(OUT, 'assets', rel); MEDIA_V[rel] = fs.existsSync(f) ? '?v=' + hashFile(f).slice(0, 8) : ''; }
  return MEDIA_V[rel];
}
function hashFile(p) { return crypto.createHash('sha1').update(fs.readFileSync(p)).digest('hex').slice(0, 10); }
function rmrf(p) { fs.rmSync(p, { recursive: true, force: true }); }
function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    if (e.isDirectory()) copyDir(s, d); else fs.copyFileSync(s, d);
  }
}
function write(rel, content) {
  const p = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
}

// URL helpers. `depth` = how many folders below root the page lives.
const up = (depth) => (depth ? '../'.repeat(depth) : './');
const pageHref = (depth, lang, sub = '') => PREVIEW
  ? `${up(depth)}${lang}/${sub ? sub + '/' : ''}index.html`
  : `/${lang}/${sub ? sub + '/' : ''}`;
const absUrl = (lang, sub = '') => SITE ? `${SITE}/${lang}/${sub ? sub + '/' : ''}` : '';

// ---------- data ----------
const apartments = aptsSrc.map((a) => ({
  id: a.id, floor: a.floor, rooms: a.rooms, area: a.area, inner: a.inner, summer: a.summer,
  plan: Boolean(a.planRatio), ratio: a.planRatio || 1.35,
})).sort((a, b) => a.floor - b.floor || a.id - b.id);

// ---------- SVG marks ----------
const svgStroke = (d, extra = '') => `<path d="${d}" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"${extra}/>`;
function monogram(cls = 'monogram') {
  const m = logo.mark;
  return `<svg class="${cls} mc-mark" viewBox="${m.viewBox}" aria-hidden="true" focusable="false"><path class="mg-c" d="${m.c}" fill="none" stroke="currentColor" stroke-width="${m.cw}" stroke-linecap="round"/><path class="mg-m" d="${m.m}" fill="currentColor"/></svg>`;
}
function mcWord(cls, label = '') {
  const m = logo.mc;
  return `<svg class="${cls}" viewBox="0 -2 ${m.wordW} ${m.wordH}" ${label ? `role="img" aria-label="${esc(label)}"` : 'aria-hidden="true" focusable="false"'}><path d="${m.word}" fill="currentColor"/></svg>`;
}
function wordSvg(d, w, cls, label, draw = false) {
  const pl = draw ? ' pathLength="1"' : '';
  return `<svg class="${cls}" viewBox="-4 -4 ${w + 8} ${logo.isaniPark.h + 8}" ${label ? `role="img" aria-label="${esc(label)}"` : 'aria-hidden="true" focusable="false"'}>${svgStroke(d, pl)}</svg>`;
}
const heroTitleSvg = () => `
  <svg class="hero__mark hero__mark--one" viewBox="-4 -4 ${logo.isaniPark.w + 8} 128" aria-hidden="true" focusable="false">${svgStroke(logo.isaniPark.d, ' pathLength="1"')}</svg>
  <svg class="hero__mark hero__mark--two" viewBox="-4 -4 ${Math.max(logo.isaniPark2.w1, logo.isaniPark2.w2) + 8} 288" aria-hidden="true" focusable="false"><g transform="translate(${(Math.max(logo.isaniPark2.w1, logo.isaniPark2.w2) - logo.isaniPark2.w1) / 2} 0)">${svgStroke(logo.isaniPark2.l1, ' pathLength="1"')}</g><g transform="translate(${(Math.max(logo.isaniPark2.w1, logo.isaniPark2.w2) - logo.isaniPark2.w2) / 2} 160)">${svgStroke(logo.isaniPark2.l2, ' pathLength="1"')}</g></svg>`;

const ICON = {
  sliders: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h4M12 17h8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="16" cy="7" r="2" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="10" cy="17" r="2" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
  whatsapp: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 19.5l1.1-3.9A8 8 0 1 1 8.6 18.6Z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M9.2 8.6c.2-.5.6-.5.9-.5h.4c.2 0 .4.1.5.4l.6 1.4c.1.2 0 .5-.1.6l-.4.5c-.1.1-.2.3 0 .5.5.9 1.3 1.6 2.2 2.1.2.1.4.1.5 0l.5-.6c.2-.2.4-.2.6-.1l1.4.7c.2.1.3.3.3.5 0 .9-.6 1.6-1.5 1.7-2.6.3-6.1-2.9-5.9-5.5.1-.6.3-1.2.4-1.7Z" fill="currentColor"/></svg>',
  expand: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  sun: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4.2" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M12 2.5v2.2M12 19.3v2.2M4.6 4.6l1.6 1.6M17.8 17.8l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.6 19.4l1.6-1.6M17.8 6.2l1.6-1.6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
  moon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19.5 14.6A8 8 0 0 1 9.4 4.5a8 8 0 1 0 10.1 10.1Z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>',
  menu: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h16M4 16h16" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
  close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
  prev: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 5.5 8 12l6.5 6.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  next: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.5 5.5 16 12l-6.5 6.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6.5v11M15 6.5v11" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.5 6.2v11.6L18 12 8.5 6.2Z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>',
  plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
  minus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
  phone: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.6 3.8h2.6l1.4 4-1.9 1.3a11 11 0 0 0 6.2 6.2l1.3-1.9 4 1.4v2.6a2 2 0 0 1-2.2 2A15.6 15.6 0 0 1 4.6 6a2 2 0 0 1 2-2.2Z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>',
  pin: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-6.5-6.2-6.5-11.2a6.5 6.5 0 0 1 13 0C18.5 14.8 12 21 12 21Z" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="12" cy="9.8" r="2.3" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13M13 6.5l5.5 5.5-5.5 5.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  ext: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 5h5v5M19 5l-8 8M17 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-10A1.5 1.5 0 0 1 4 18.5v-10A1.5 1.5 0 0 1 5.5 7H10" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

// ---------- fonts ----------
function fontsHref(lang) {
  const fam = ['family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500', 'family=Manrope:wght@400;500;600;700'];
  if (lang === 'ka') fam.push('family=Noto+Sans+Georgian:wght@400;500;600', 'family=Noto+Serif+Georgian:wght@300;400;500');
  return `https://fonts.googleapis.com/css2?${fam.join('&')}&display=swap`;
}

// ---------- picture helper ----------
function picture(base, sizes, w, h, alt, { widths = [640, 1280, 1920, 2560, 3840], avif = !PREVIEW, cls = '', loading = 'lazy', fetchpriority = '' } = {}) {
  const ws = [...new Set(widths.filter((x) => !(PREVIEW && x > 1280)).map((x) => Math.min(x, w)))];
  const srcset = (ext) => ws.map((x) => `${base}-${x}.${ext} ${x}w`).join(', ');
  return `<picture class="${cls}">${avif ? `<source type="image/avif" srcset="${srcset('avif')}" sizes="${sizes}">` : ''}<source type="image/webp" srcset="${srcset('webp')}" sizes="${sizes}"><img src="${base}-${ws[Math.min(1, ws.length - 1)]}.webp" width="${w}" height="${h}" alt="${esc(alt)}" loading="${loading}" decoding="async"${fetchpriority ? ` fetchpriority="${fetchpriority}"` : ''}></picture>`;
}

// ---------- page chrome ----------
function head({ lang, t, depth, title, description, sub = '', robots = 'index,follow', extraHead = '', canonical = '' }) {
  const A = up(depth) + 'assets/';
  // a noindex page (404) carries no canonical or hreflang; the root chooser is canonical to itself
  const alternates = SITE && !/noindex/.test(robots) ? [
    ...LANGS.map((l) => `<link rel="alternate" hreflang="${l}" href="${absUrl(l, sub)}">`),
    `<link rel="alternate" hreflang="x-default" href="${sub ? absUrl(config.defaultLang, sub) : SITE + '/'}">`,
    `<link rel="canonical" href="${canonical || absUrl(lang, sub)}">`,
  ].join('\n') : '';
  const ogImg = SITE ? `${SITE}/assets/img/og-image.jpg` : `${A}img/og-image.jpg`;
  return `<!doctype html>
<html lang="${t.htmlLang}" data-theme="dark" class="no-js">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta name="robots" content="${robots}">
${alternates}
<meta property="og:type" content="website">
<meta property="og:site_name" content="Isani Park Residence">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:locale" content="${t.ogLocale}">
${LANGS.filter((l) => l !== lang).map((l) => `<meta property="og:locale:alternate" content="${I18N[l].ogLocale}">`).join('')}
${SITE && !/noindex/.test(robots) ? `<meta property="og:url" content="${canonical || absUrl(lang, sub)}">` : ''}
<meta property="og:image" content="${ogImg}">
<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#0c0b09">
<meta name="format-detection" content="telephone=no">
<link rel="icon" href="${A}logo/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="${A}logo/apple-touch-icon.png">
<script>(function(d){d.classList.remove('no-js');d.classList.add('js');try{var s=localStorage.getItem('ipr-theme');if(s==='light'||s==='dark')d.setAttribute('data-theme',s);}catch(e){}})(document.documentElement)</script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="preload" as="style" href="${fontsHref(lang)}" onload="this.onload=null;this.rel='stylesheet'">
<noscript><link rel="stylesheet" href="${fontsHref(lang)}"></noscript>
<link rel="stylesheet" href="${A}css/site.css${PREVIEW ? '' : '?v=' + ASSET_V.css}">
${extraHead}
</head>`;
}

function langSwitch(lang, depth, sub, t, cls = 'lang') {
  return `<nav class="${cls}" aria-label="${esc(t.nav.language)}"><ul>${LANGS.map((l) => `<li><a href="${pageHref(depth, l, sub)}" hreflang="${l}" lang="${I18N[l].htmlLang}" data-lang-link="${l}"${l === lang ? ' aria-current="true"' : ''}><span aria-hidden="true">${I18N[l].label}</span><span class="sr-only">${I18N[l].labelLong}</span></a></li>`).join('')}</ul></nav>`;
}

function header({ lang, t, depth, sub = '', home = false }) {
  const homeHref = home ? '#top' : pageHref(depth, lang);
  const navItems = [['project', 'project'], ['apartments', 'apartments'], ['gallery', 'gallery'], ['location', 'location'], ['purchase', 'purchase'], ['contact', 'contact']];
  const navHref = (id) => home ? `#${id}` : `${pageHref(depth, lang)}#${id}`;
  const links = navItems.map(([id, key]) => `<li><a href="${navHref(id)}" data-nav="${id}">${esc(t.nav[key])}</a></li>`).join('');
  return `
<a class="skip" href="#main">${esc(t.skip)}</a>
<header class="site-header" data-header>
  <div class="site-header__inner">
    <a class="brand" href="${homeHref}" aria-label="${esc(t.nav.home)}">${monogram('brand__mark')}<span class="brand__name" aria-hidden="true">Isani Park<span> Residence</span></span></a>
    <nav class="site-nav" aria-label="${esc(t.nav.primary)}"><ul>${links}</ul></nav>
    <div class="site-header__tools">
      ${langSwitch(lang, depth, sub, t)}
      <button class="icon-btn theme-toggle" type="button" data-theme-toggle aria-label="${esc(t.nav.themeToLight)}" data-label-light="${esc(t.nav.themeToLight)}" data-label-dark="${esc(t.nav.themeToDark)}"><span class="theme-toggle__sun">${ICON.sun}</span><span class="theme-toggle__moon">${ICON.moon}</span></button>
      <button class="icon-btn menu-btn" type="button" data-menu-open aria-haspopup="dialog" aria-controls="nav-sheet"><span class="sr-only">${esc(t.nav.menu)}</span>${ICON.menu}</button>
    </div>
  </div>
</header>
<dialog class="nav-sheet" id="nav-sheet" aria-label="${esc(t.nav.menu)}">
  <div class="nav-sheet__top">
    <span class="nav-sheet__brand">${monogram('brand__mark')}</span>
    <button class="icon-btn" type="button" data-menu-close><span class="sr-only">${esc(t.nav.close)}</span>${ICON.close}</button>
  </div>
  <nav aria-label="${esc(t.nav.primary)}"><ul class="nav-sheet__links">${links}</ul></nav>
  <div class="nav-sheet__tools">${langSwitch(lang, depth, sub, t, 'lang lang--sheet')}
    <button class="btn btn--ghost btn--sm" type="button" data-theme-toggle data-label-light="${esc(t.nav.themeToLight)}" data-label-dark="${esc(t.nav.themeToDark)}"><span class="theme-toggle__sun">${ICON.sun}</span><span class="theme-toggle__moon">${ICON.moon}</span><span data-theme-text>${esc(t.nav.themeToLight)}</span></button>
  </div>
</dialog>`;
}

function footer({ lang, t, depth, sub = '' }) {
  const A = up(depth) + 'assets/';
  return `
<footer class="site-footer">
  <div class="pattern pattern--footer" aria-hidden="true"></div>
  <div class="container site-footer__inner">
    <div class="site-footer__brand">
      <p class="site-footer__lockup">${wordSvg(logo.isaniPark.d, logo.isaniPark.w, 'footer-mark', 'Isani Park Residence')}</p>
      <p class="site-footer__by"><span class="site-footer__by-word">by</span>${monogram('footer-by__mark')}${mcWord('footer-by', 'Mono Capitals')}</p>
    </div>
    <div class="site-footer__cols">
      <div>
        <p>${esc(t.footer.seller)}</p>
        <p>${esc(t.footer.officeLine)}</p>
        <p><a href="tel:${config.contacts.phoneE164}" data-phone-link>${esc(config.contacts.phoneDisplay)}</a> · <a href="mailto:${config.contacts.email}">${esc(config.contacts.email)}</a></p>
      </div>
      <div>
        <ul class="site-footer__links">
          <li><a href="${pageHref(depth, lang, 'privacy')}">${esc(t.footer.privacy)}</a></li>
        </ul>
        ${langSwitch(lang, depth, sub, t, 'lang lang--footer')}
      </div>
    </div>
    <p class="site-footer__fine">${esc(t.footer.disclaimer)}</p>
    <p class="site-footer__fine">${esc(t.footer.rights)}</p>
  </div>
</footer>`;
}

// ---------- sections ----------
function hero(t, lang) {
  const A = '../assets/';
  return `
<section class="hero" id="top" aria-labelledby="hero-title">
  <div class="hero__media" data-hero-media>
    <picture><source media="(max-width: 700px)" srcset="${A}img/hero-poster-540.webp${hv('img/hero-poster-540.webp')}"><img class="hero__poster" src="${A}img/hero-poster-1280.webp${hv('img/hero-poster-1280.webp')}" alt="" width="1280" height="720" fetchpriority="high"></picture>
    <video class="hero__video" muted loop playsinline preload="none" aria-hidden="true" tabindex="-1" data-hero-video data-src-wide="${A}video/hero-1280.mp4${hv('video/hero-1280.mp4')}" data-src-xl="${A}video/hero-1600.mp4${hv('video/hero-1600.mp4')}" data-src-tall="${A}video/hero-608x1080.mp4${hv('video/hero-608x1080.mp4')}"></video>
    <div class="hero__veil"></div>
  </div>
  <div class="hero__content container">
    <p class="hero__context eyebrow">${esc(t.hero.context)}</p>
    <h1 class="hero__title" id="hero-title"><span class="sr-only">Isani Park Residence</span>${heroTitleSvg()}</h1>
    <p class="hero__by"><span class="hero__rule" aria-hidden="true"></span><span>${esc(t.hero.by)}</span></p>
    <p class="hero__offer"><span class="hero__offer-long">${esc(t.hero.offer)}</span><span class="hero__offer-short">${esc(t.hero.offerShort)}</span></p>
    <div class="hero__actions">
      <a class="btn btn--primary" href="#choose" data-cta="hero-choose">${esc(t.hero.ctaPrimary)}</a>
      <a class="btn btn--ghost" href="#contact" data-cta="hero-price">${esc(t.hero.ctaSecondary)}</a>
    </div>
  </div>
  <button class="hero__toggle icon-btn" type="button" data-video-toggle hidden aria-label="${esc(t.hero.pause)}" data-label-pause="${esc(t.hero.pause)}" data-label-play="${esc(t.hero.play)}"><span class="i-pause">${ICON.pause}</span><span class="i-play">${ICON.play}</span></button>
  <a class="hero__scroll" href="#project"><span>${esc(t.hero.scroll)}</span><i aria-hidden="true"></i></a>
</section>`;
}

function project(t, lang) {
  const g = media.gallery.find((x) => x.id === 'corner-west');
  return `
<section class="section project" id="project" aria-labelledby="project-title">
  <div class="container project__grid">
    <div class="project__text">
      <p class="eyebrow">${esc(t.project.eyebrow)}</p>
      <h2 class="h2" id="project-title">${esc(t.project.title)}</h2>
      <p class="lead">${esc(t.project.lead)}</p>
    </div>
    <figure class="project__figure">
      ${picture('../assets/img/gallery/corner-west', '(min-width: 1100px) 60vw, 100vw', g.w, g.h, t.project.imageAlt, { cls: 'project__img' })}
      <figcaption><span class="badge">${esc(t.gallery.badge)}</span> ${esc(t.project.imageCaption)}</figcaption>
    </figure>
  </div>
  <div class="container">
    <dl class="facts">${t.project.facts.map((f) => `<div class="fact"><dt>${esc(f.label)}</dt><dd class="fact__value">${esc(f.value)}</dd><dd class="fact__note">${esc(f.note)}</dd></div>`).join('')}</dl>
  </div>
</section>`;
}

function living(t) {
  const g = media.gallery.find((x) => x.id === 'garden-front');
  return `
<section class="section living" id="living" aria-labelledby="living-title">
  <div class="container">
    <div class="section-head">
      <p class="eyebrow">${esc(t.living.eyebrow)}</p>
      <h2 class="h2" id="living-title">${esc(t.living.title)}</h2>
    </div>
    <div class="living__grid">
      <figure class="living__figure">
        ${picture('../assets/img/gallery/' + g.id, '(min-width: 1000px) 46vw, 100vw', g.w, g.h, t.gallery.items[g.id], { cls: 'living__img' })}
        <figcaption><span class="badge">${esc(t.gallery.badge)}</span> ${esc(t.gallery.items[g.id])}</figcaption>
      </figure>
      <ul class="benefits">${t.living.items.map((it) => `<li class="benefit"><h3 class="h3">${esc(it.title)}</h3><p>${esc(it.text)}</p></li>`).join('')}</ul>
    </div>
  </div>
</section>`;
}

function picker(t, lang) {
  const p = t.picker;
  const g = media.gallery.find((x) => x.id === floormap.facade.image);
  const counts = {}; apartments.forEach((a) => { counts[a.floor] = (counts[a.floor] || 0) + 1; });
  const bands = Object.entries(floormap.facade.bands).map(([f, b]) => {
    const [x0, y0, x1, y1] = b.map((v, i) => +(v * (i % 2 ? 1125 : 2000)).toFixed(1));
    const label = fmt(p.floorCount, { n: f, count: counts[f] });
    return `<a class="pk-band" href="#choose" data-floor-pick="${f}" aria-label="${esc(label)}" data-tip="${esc(label)}"><rect x="${x0}" y="${y0}" width="${+(x1 - x0).toFixed(1)}" height="${+(y1 - y0).toFixed(1)}"/><text x="${x1 + 14}" y="${+((y0 + y1) / 2 + 9).toFixed(1)}" aria-hidden="true">${f}</text></a>`;
  }).reverse().join('');
  return `
<section class="section picker" id="choose" aria-labelledby="picker-title">
  <div class="container">
    <div class="section-head">
      <p class="eyebrow">${esc(p.eyebrow)}</p>
      <h2 class="h2" id="picker-title">${esc(p.title)}</h2>
      <p class="lead">${esc(p.lead)}</p>
    </div>
    <div class="picker__stage" data-picker>
      <div class="picker__floors" role="group" aria-label="${esc(p.floorsLabel)}"><span class="picker__floors-label" aria-hidden="true">${esc(p.floorsLabel)}</span>${Array.from({ length: 10 }, (_, i) => `<button class="picker__fbtn" type="button" data-floor-btn="${i + 1}" aria-label="${esc(fmt(p.floorLabel, { n: i + 1 }))}">${i + 1}</button>`).join('')}</div>
      <div class="picker__facade" data-pk-facade>
        <div class="picker__frame" data-pk-frame>
          <div class="picker__pan" data-pk-pan>
            <div class="picker__canvas">
              ${picture('../assets/img/gallery/' + g.id, '(min-width: 1300px) 1240px, (max-width: 760px) 220vw, 100vw', g.w, g.h, p.facadeAlt, { cls: 'picker__img' })}
              <svg class="picker__svg" viewBox="0 0 2000 1125" preserveAspectRatio="none" role="group" aria-label="${esc(p.hintFacade)}">${bands}</svg>
              <div class="picker__tip" data-pk-tip aria-hidden="true" hidden></div>
            </div>
          </div>
          <span class="badge picker__badge">${esc(p.badge)}</span>
          <button class="icon-btn picker__zoom" type="button" data-pk-zoom aria-pressed="false" aria-label="${esc(p.zoomIn)}" data-label-in="${esc(p.zoomIn)}" data-label-out="${esc(p.zoomOut)}"><span class="i-in">${ICON.plus}</span><span class="i-out">${ICON.minus}</span></button>
        </div>
        <div class="picker__pick" data-pk-pick hidden><p class="picker__pick-label" aria-live="polite"><span class="sr-only">${esc(p.pickHint)}: </span><span data-pk-pick-label></span></p><button class="btn btn--primary btn--sm" type="button" data-pk-pick-open>${esc(p.openFloor)}</button></div>
        <p class="picker__hint">${esc(p.hintFacade)}</p>
      </div>
      <div class="picker__floor" data-pk-floor hidden>
        <div class="picker__bar">
          <button class="btn btn--ghost btn--sm" type="button" data-pk-back>${ICON.prev} ${esc(p.back)}</button>
          <div class="picker__stepper">
            <button class="icon-btn icon-btn--line" type="button" data-pk-step="-1" aria-label="${esc(p.down)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9.5l6 6 6-6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
            <h3 class="h3 picker__floor-title" data-pk-title tabindex="-1"></h3>
            <button class="icon-btn icon-btn--line" type="button" data-pk-step="1" aria-label="${esc(p.up)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 14.5l6-6 6 6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
          </div>
        </div>
        <div class="pk3d" data-pk-scroll tabindex="0">
          <div class="pk3d__stage" data-pk-stage>
            <div class="pk3d__scene" data-pk-scene>
              <div class="pk3d__shadow" aria-hidden="true"></div>
              <div class="pk3d__face pk3d__front" aria-hidden="true"></div>
              <div class="pk3d__face pk3d__back" aria-hidden="true"></div>
              <div class="pk3d__face pk3d__left" aria-hidden="true"></div>
              <div class="pk3d__face pk3d__right" aria-hidden="true"></div>
              <div class="pk3d__top">
                <img data-pk-img alt="" width="${floormap.w}" height="${floormap.h}" decoding="async">
                <svg class="picker__plan-svg" viewBox="0 0 ${floormap.w} ${floormap.h}" data-pk-svg role="group"></svg>
              </div>
            </div>
          </div>
          <div class="picker__tip" data-pk-tip2 aria-hidden="true" hidden></div>
          <span class="badge picker__badge">${esc(p.badge3d)}</span>
        </div>
        <p class="picker__hint">${esc(p.hintFloor)}</p>
        <ul class="picker__list" data-pk-list aria-label="${esc(p.listLabel)}"></ul>
      </div>
    </div>
  </div>
</section>`;
}

function aptCard(a, t, lang, i) {
  const c = t.catalog;
  const title = `${c.apartment} ${c.no} ${a.id}`;
  const img = a.plan
    ? `<img src="../assets/plans/img/apt-${a.id}-${PREVIEW ? 1000 : 440}.webp" width="440" height="${Math.round(440 * a.ratio)}" alt="${esc(fmt(c.planAlt, { n: a.id, floor: a.floor }))}" loading="lazy" decoding="async">`
    : `<span class="apt-card__noplan">${esc(t.modal.noPlan)}</span>`;
  return `<li class="apt-card" data-apt="${a.id}" data-rooms="${a.rooms}" data-floor="${a.floor}" data-area="${a.area}">
  <article>
    <button class="apt-card__plan" type="button" data-open-apt="${a.id}" aria-label="${esc(title)} — ${esc(c.details)}">${img}</button>
    <div class="apt-card__body">
      <p class="apt-card__meta">${esc(fmt(c.floorShort, { n: a.floor }))}</p>
      <h3 class="apt-card__title">${esc(title)}</h3>
      <p class="apt-card__area"><span>${num(lang, a.area)}</span> ${m2[lang]}</p>
      <dl class="apt-card__specs">
        <div><dt class="sr-only">${esc(c.rooms)}</dt><dd>${esc(c.roomsLabel[a.rooms])}</dd></div>
        <div><dt>${esc(c.interior)}</dt><dd>${num(lang, a.inner)} ${m2[lang]}<span class="apt-card__short"> ${esc(c.interiorShort)}</span></dd></div>
        <div><dt>${esc(c.summer)}</dt><dd>${num(lang, a.summer)} ${m2[lang]}<span class="apt-card__short"> ${esc(c.summerShort)}</span></dd></div>
      </dl>
      <div class="apt-card__actions">
        <a class="btn btn--primary btn--sm" href="#contact" data-request-apt="${a.id}">${esc(c.priceCta)}</a>
        <button class="btn btn--text btn--sm" type="button" data-open-apt="${a.id}">${esc(c.details)}</button>
      </div>
    </div>
  </article>
</li>`;
}

function catalog(t, lang) {
  const c = t.catalog;
  const radio = (name, value, label, checked) => `<label class="chip"><input type="radio" name="${name}" value="${value}"${checked ? ' checked' : ''}><span>${esc(label)}</span></label>`;
  const layouts = media.layouts.map((l) => `<li class="layout">
    <figure>
      <img src="../assets/img/layouts/${l.id}-600.webp" srcset="../assets/img/layouts/${l.id}-600.webp 600w, ../assets/img/layouts/${l.id}-1200.webp 1200w" sizes="(min-width: 900px) 30vw, 80vw" width="${l.w}" height="${l.h}" alt="${esc(fmt(c.typicalAlt, { n: l.rooms, area: num(lang, l.area) }))}" loading="lazy" decoding="async">
      <figcaption><span class="layout__area">≈ ${num(lang, l.area)} ${m2[lang]}</span><span class="layout__rooms">${esc(c.roomsLabel[l.rooms])}</span></figcaption>
    </figure>
    <button class="btn btn--text btn--sm" type="button" data-similar-rooms="${l.rooms}" data-similar-area="${l.area}">${esc(c.typicalShow)}</button>
  </li>`).join('');
  const floorImg = (f) => `<img src="../assets/img/floors/${f.id}-1200.webp" srcset="../assets/img/floors/${f.id}-1200.webp 1200w, ../assets/img/floors/${f.id}-2400.webp 2400w" sizes="(min-width: 1300px) 1240px, 1200px" width="${f.w}" height="${f.h}" alt="${esc(c.floorAlt[f.id])}" loading="lazy" decoding="async">`;
  return `
<section class="section catalog" id="apartments" aria-labelledby="catalog-title">
  <div class="container">
    <div class="section-head">
      <p class="eyebrow">${esc(c.eyebrow)}</p>
      <h2 class="h2" id="catalog-title">${esc(c.title)}</h2>
      <p class="lead">${esc(c.lead)}</p>
    </div>
    <div class="filters-bar" data-filters-bar>
      <button class="btn btn--ghost btn--sm filters-bar__toggle" type="button" data-filters-toggle aria-expanded="false" aria-controls="filters-panel">${ICON.sliders}<span>${esc(c.filtersOpen)}</span><span class="filters-bar__n" data-filters-n hidden></span></button>
      <p class="filters-bar__count" data-count-bar aria-hidden="true">${esc(fmt(c.countShort, { n: apartments.length }))}</p>
      <button class="btn btn--text btn--sm filters-bar__clear" type="button" data-filters-clear hidden>${esc(c.resetShort)}</button>
    </div>
    <ul class="filters-active" data-filters-active aria-label="${esc(c.activeFilters)}" hidden></ul>
    <form class="filters" id="filters-panel" data-filters aria-label="${esc(c.filters)}">
      <fieldset class="filters__group"><legend>${esc(c.rooms)}</legend><div class="chips">${radio('rooms', 'all', c.roomsAny, true)}${[1, 2, 3, 4].map((r) => radio('rooms', r, c.roomsFilter[r])).join('')}</div></fieldset>
      <fieldset class="filters__group"><legend>${esc(c.area)}</legend><div class="chips">${radio('area', 'all', c.areaAny, true)}${c.areaBands.map((b) => radio('area', b.id, b.label)).join('')}</div></fieldset>
      <div class="filters__row">
        <label class="field field--select"><span class="field__label">${esc(c.floor)}</span><select name="floor" id="filter-floor"><option value="all">${esc(c.floorAny)}</option>${Array.from({ length: 10 }, (_, i) => `<option value="${i + 1}">${esc(fmt(c.floorShort, { n: i + 1 }))}</option>`).join('')}</select></label>
        <label class="field field--select"><span class="field__label">${esc(c.sort)}</span><select name="sort" id="filter-sort"><option value="floor">${esc(c.sortOptions.floor)}</option><option value="areaAsc">${esc(c.sortOptions.areaAsc)}</option><option value="areaDesc">${esc(c.sortOptions.areaDesc)}</option></select></label>
        <button class="btn btn--text btn--sm filters__reset" type="reset">${esc(c.reset)}</button>
      </div>
      <button class="btn btn--primary filters__apply" type="button" data-filters-apply>${esc(fmt(c.showN, { n: apartments.length }))}</button>
    </form>
    <p class="catalog__count" data-count aria-live="polite">${esc(fmt(c.found, { n: apartments.length }))}</p>
    <ul class="apt-list" data-apt-list>${apartments.map((a, i) => aptCard(a, t, lang, i)).join('\n')}</ul>
    <div class="catalog__empty" data-empty hidden><p>${esc(c.empty)}</p><button class="btn btn--ghost btn--sm" type="button" data-filters-clear>${esc(c.emptyReset)}</button></div>
    <div class="catalog__more"><button class="btn btn--ghost" type="button" data-more hidden>${esc(c.more)}</button></div>

    <div class="typical">
      <div class="section-head section-head--small">
        <h3 class="h3">${esc(c.typicalTitle)}</h3>
        <p>${esc(c.typicalLead)}</p>
      </div>
      <ul class="layouts" data-layouts>${layouts}</ul>
    </div>

  </div>
</section>`;
}

function gallery(t) {
  const g = t.gallery;
  const items = media.gallery;
  return `
<section class="section gallery" id="gallery" aria-labelledby="gallery-title">
  <div class="container">
    <div class="section-head">
      <p class="eyebrow">${esc(g.eyebrow)}</p>
      <h2 class="h2" id="gallery-title">${esc(g.title)}</h2>
      <p class="lead">${esc(g.lead)}</p>
    </div>
  </div>
  <div class="gallery__stage" data-gallery>
    <ul class="gallery__track" data-gallery-track tabindex="0" aria-label="${esc(g.title)}">
      ${items.map((it, i) => `<li class="gallery__slide${it.h > it.w ? ' is-portrait' : ''}" data-index="${i}" aria-roledescription="slide" aria-label="${esc(fmt(g.counter, { i: i + 1, n: items.length }))}">
        <figure>${picture(`../assets/img/gallery/${it.id}`, '(min-width: 1200px) 1100px, 92vw', it.w, it.h, g.items[it.id], { cls: 'gallery__pic' })}
        <figcaption><span class="badge">${esc(g.badge)}</span><span>${esc(g.items[it.id])}</span></figcaption></figure></li>`).join('')}
    </ul>
    <div class="container gallery__controls">
      <button class="icon-btn icon-btn--line" type="button" data-gallery-prev aria-label="${esc(g.prev)}">${ICON.prev}</button>
      <p class="gallery__counter" data-gallery-counter aria-live="polite">${esc(fmt(g.counter, { i: 1, n: items.length }))}</p>
      <button class="icon-btn icon-btn--line" type="button" data-gallery-next aria-label="${esc(g.next)}">${ICON.next}</button>
      <button class="icon-btn icon-btn--line" type="button" data-gallery-full aria-label="${esc(g.fullscreen)}">${ICON.expand}</button>
    </div>
    <div class="container"><ul class="gallery__thumbs" aria-label="${esc(g.thumbs)}">${items.map((it, i) => `<li><button type="button" data-gallery-go="${i}" aria-label="${esc(g.items[it.id])}"${i === 0 ? ' aria-current="true"' : ''}><img src="../assets/img/gallery/${it.id}-640.webp" width="${it.w}" height="${it.h}" alt="" loading="lazy" decoding="async"></button></li>`).join('')}</ul></div>
  </div>
</section>
<dialog class="lightbox" data-lightbox aria-label="${esc(g.viewer)}">
  <div class="lightbox__stage" data-lb-stage></div>
  <p class="lightbox__caption"><span class="badge">${esc(g.badge)}</span><span data-lb-caption></span><span class="lightbox__count" data-lb-count aria-live="polite"></span></p>
  <button class="icon-btn lightbox__btn lightbox__close" type="button" data-lb-close aria-label="${esc(g.closeViewer)}">${ICON.close}</button>
  <button class="icon-btn lightbox__btn lightbox__prev" type="button" data-lb-prev aria-label="${esc(g.prev)}">${ICON.prev}</button>
  <button class="icon-btn lightbox__btn lightbox__next" type="button" data-lb-next aria-label="${esc(g.next)}">${ICON.next}</button>
</dialog>`;
}

function location(t, lang) {
  const l = t.location;
  const q = encodeURIComponent(config.map.query);
  const aerial = media.gallery.find((x) => x.id === 'aerial-courtyard');
  return `
<section class="section location" id="location" aria-labelledby="location-title">
  <div class="container location__grid">
    <div class="location__text">
      <p class="eyebrow">${esc(l.eyebrow)}</p>
      <h2 class="h2" id="location-title">${esc(l.title)}</h2>
      <dl class="addresses">
        <div><dt>${esc(l.complexLabel)}</dt><dd>${esc(l.complexAddress)}</dd></div>
        <div><dt>${esc(l.officeLabel)}</dt><dd>${esc(l.officeAddress)}<br>${esc(l.officeHours)}</dd></div>
      </dl>
      <h3 class="h4">${esc(l.nearbyTitle)}</h3>
      <ul class="nearby">${l.nearby.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>
    </div>
    <div class="map" data-map data-map-src="https://www.google.com/maps?q=${q}&amp;hl=${lang}&amp;z=16&amp;output=embed" data-map-title="${esc(l.mapTitle)}">
      ${picture('../assets/img/gallery/aerial-courtyard', '(min-width: 1000px) 50vw, 100vw', aerial.w, aerial.h, '', { cls: 'map__bg' })}
      <div class="map__card">
        <span class="map__pin">${ICON.pin}</span>
        <p class="map__addr">${esc(l.complexAddress)}</p>
        <div class="map__actions">
          <button class="btn btn--primary btn--sm" type="button" data-map-load>${esc(l.mapButton)}</button>
          <a class="btn btn--ghost btn--sm" href="https://www.google.com/maps/search/?api=1&amp;query=${q}" target="_blank" rel="noopener">${esc(l.mapLink)} ${ICON.ext}</a>
        </div>
        <p class="map__note">${esc(l.mapNote)}</p>
      </div>
    </div>
  </div>
</section>`;
}

function purchase(t) {
  const p = t.purchase;
  return `
<section class="section purchase" id="purchase" aria-labelledby="purchase-title">
  <div class="container">
    <div class="section-head">
      <p class="eyebrow">${esc(p.eyebrow)}</p>
      <h2 class="h2" id="purchase-title">${esc(p.title)}</h2>
    </div>
    <div class="purchase__grid">
      <div class="installment">
        <p class="installment__figure" aria-hidden="true">0%</p>
        <h3 class="h3">${esc(p.installmentTitle)}</h3>
        <p>${esc(p.installmentText)}</p>
        <a class="btn btn--primary" href="#contact" data-cta="installment">${esc(p.installmentCta)}</a>
      </div>
      <div class="steps">
        <h3 class="h4">${esc(p.stepsTitle)}</h3>
        <ol>${p.steps.map((s) => `<li><h4 class="h5">${esc(s.title)}</h4><p>${esc(s.text)}</p></li>`).join('')}</ol>
        <p class="note">${esc(p.pricesNote)}</p>
      </div>
    </div>
  </div>
</section>`;
}

function developer(t, lang) {
  const d = t.developer;
  return `
<section class="section developer" id="developer" aria-labelledby="developer-title">
  <div class="container developer__grid">
    <div class="developer__mark">${monogram('developer__monogram')}${mcWord('developer__word')}</div>
    <div class="developer__text">
      <p class="eyebrow">${esc(d.eyebrow)}</p>
      <h2 class="h2" id="developer-title">${esc(d.title)}</h2>
      <p class="lead">${esc(d.text)}</p>
      <h3 class="developer__mat-title">${esc(d.materialsTitle)}</h3>
      <ul class="materials">${d.materials.map(([title, note, href]) => `<li><a href="${href}"><span class="materials__t">${esc(title)}</span><span class="materials__n">${esc(note)}</span></a></li>`).join('')}</ul>
      <p class="developer__ig"><a class="link-arrow" href="${config.contacts.instagram}" target="_blank" rel="noopener">${esc(d.link)} ${ICON.ext}</a></p>
    </div>
  </div>
</section>`;
}

function faq(t) {
  const f = t.faq;
  return `
<section class="section faq" id="faq" aria-labelledby="faq-title">
  <div class="container faq__grid">
    <div class="section-head">
      <p class="eyebrow">${esc(f.eyebrow)}</p>
      <h2 class="h2" id="faq-title">${esc(f.title)}</h2>
    </div>
    <div class="faq__list">${f.items.map((it, i) => `<details class="qa"${i === 0 ? ' open' : ''}><summary><span>${esc(it.q)}</span><i aria-hidden="true">${ICON.plus}</i></summary><div class="qa__a"><p>${esc(it.a)}</p></div></details>`).join('')}</div>
  </div>
</section>`;
}

function contact(t, lang, depth) {
  const c = t.contact;
  const privacyLink = `<a href="${pageHref(depth, lang, 'privacy')}">${esc(c.consentLink)}</a>`;
  return `
<section class="section contact" id="contact" aria-labelledby="contact-title">
  
  <div class="container contact__grid">
    <div class="contact__intro">
      <p class="eyebrow">${esc(c.eyebrow)}</p>
      <h2 class="h2" id="contact-title">${esc(c.title)}</h2>
      <p class="lead">${esc(c.lead)}</p>
      <div class="direct">
        <h3 class="h4">${esc(c.directTitle)}</h3>
        <p class="direct__label">${esc(c.phoneLabel)}</p>
        <p class="direct__phone"><a href="tel:${config.contacts.phoneE164}" data-phone-link>${esc(config.contacts.phoneDisplay)}</a>
          <button class="btn btn--text btn--sm" type="button" data-copy="${esc(config.contacts.phoneDisplay)}" data-copied="${esc(c.copied)}">${esc(c.copy)}</button></p>
        <p class="direct__label">${esc(c.emailLabel)}</p>
        <p><a href="mailto:${config.contacts.email}">${esc(config.contacts.email)}</a></p>
        <p class="direct__label">${esc(c.messengers)}</p>
        <ul class="direct__links">
          <li><a href="${config.contacts.whatsapp}?text=${encodeURIComponent(t.contact.whatsappText.replace(/[\u00a0\u2060]/g, " "))}" target="_blank" rel="noopener">WhatsApp ${ICON.ext}</a></li>
          <li><a href="${config.contacts.telegram}" target="_blank" rel="noopener">Telegram ${ICON.ext}</a></li>
          <li><a href="${config.contacts.instagram}" target="_blank" rel="noopener">Instagram ${ICON.ext}</a></li>
        </ul>
        <p class="note">${esc(t.location.officeAddress)}. ${esc(c.hours)}</p>
      </div>
    </div>
    <div class="lead-card" data-lead-card>
      <form class="lead-form" data-lead-form novalidate>
        <div class="selected" data-selected hidden>
          <span class="selected__label">${esc(c.selected)}</span>
          <span class="selected__value" data-selected-value></span>
          <button class="icon-btn icon-btn--sm" type="button" data-selected-remove aria-label="${esc(c.removeSelected)}">${ICON.close}</button>
        </div>
        <div class="form-summary" data-form-summary tabindex="-1" hidden></div>
        <div class="field">
          <label class="field__label" for="lead-name">${esc(c.name)}</label>
          <input id="lead-name" name="name" type="text" autocomplete="name" autocapitalize="words" enterkeyhint="next" required minlength="2" maxlength="80" aria-describedby="lead-name-error">
          <p class="field__error" id="lead-name-error" hidden></p>
        </div>
        <div class="field">
          <label class="field__label" for="lead-phone">${esc(c.phone)}</label>
          <input id="lead-phone" name="phone" type="tel" inputmode="tel" autocomplete="tel" enterkeyhint="next" required maxlength="24" placeholder="+995" aria-describedby="lead-phone-hint lead-phone-error">
          <p class="field__hint" id="lead-phone-hint">${esc(c.phoneHint)}</p>
          <p class="field__error" id="lead-phone-error" hidden></p>
        </div>
        <div class="field">
          <label class="field__label" for="lead-comment">${esc(c.comment)} <span class="field__opt">(${esc(c.optional)})</span></label>
          <textarea id="lead-comment" name="comment" enterkeyhint="send" rows="3" maxlength="1000" placeholder="${esc(c.commentPlaceholder)}" aria-describedby="lead-comment-error"></textarea>
          <p class="field__error" id="lead-comment-error" hidden></p>
        </div>
        <div class="hp" aria-hidden="true"><label for="lead-company">Company</label><input id="lead-company" name="company" type="text" tabindex="-1" autocomplete="off"></div>
        <input type="hidden" name="apartment" value="">
        <button class="btn btn--primary btn--block" type="submit" data-submit><span data-submit-text>${esc(c.submit)}</span></button>
        <p class="form-status" data-form-status role="alert" hidden></p>
        <p class="consent-line">${fmt(esc(c.consent), { link: privacyLink })}</p>
      </form>
      <div class="lead-success" data-lead-success tabindex="-1" hidden>
        <p class="lead-success__mark" aria-hidden="true">${monogram('success-mark')}</p>
        <h3 class="h3">${esc(c.successTitle)}</h3>
        <p>${esc(c.successText)}</p>
        <button class="btn btn--ghost btn--sm" type="button" data-lead-again>${esc(c.successAgain)}</button>
      </div>
    </div>
  </div>
</section>`;
}

function aptDialog(t) {
  const m = t.modal;
  return `
<dialog class="apt-dialog" id="apt-dialog" aria-labelledby="apt-dialog-title">
  <div class="apt-dialog__inner">
    <header class="apt-dialog__head">
      <div>
        <p class="eyebrow" data-apt-sub></p>
        <h2 class="h3" id="apt-dialog-title" data-apt-title></h2>
      </div>
      <button class="icon-btn icon-btn--line" type="button" data-apt-close><span class="sr-only">${esc(m.close)}</span>${ICON.close}</button>
    </header>
    <div class="apt-dialog__body">
      <div class="apt-dialog__media">
      <div class="view-switch" role="tablist" aria-label="${esc(m.view3d)} / ${esc(m.viewPlan)}">
        <button class="view-switch__btn" type="button" role="tab" id="vs-3d" aria-controls="v3d-panel" aria-selected="true" data-view="3d">${esc(m.view3d)}</button>
        <button class="view-switch__btn" type="button" role="tab" id="vs-plan" aria-controls="plan-panel" aria-selected="false" tabindex="-1" data-view="plan">${esc(m.viewPlan)}</button>
      </div>
      <div class="v3d" id="v3d-panel" role="tabpanel" aria-labelledby="vs-3d" data-v3d>
        <button class="v3d__btn" type="button" data-v3d-open aria-label="${esc(m.open3dHint)}"><img data-v3d-img alt="" width="800" height="640" decoding="async"></button>
        <div class="v3d__cap"><span class="v3d__hint" aria-hidden="true">${esc(m.open3dHint)}</span><span class="v3d__note">${esc(m.note3d)}</span></div>
      </div>
      <div class="plan-view" id="plan-panel" role="tabpanel" aria-labelledby="vs-plan" data-plan-view>
        <div class="plan-view__scroll" data-plan-scroll tabindex="0"><img data-plan-img alt="" width="1000" height="1350"></div>
        <p class="plan-view__noplan" data-plan-none hidden>${esc(m.noPlan)}</p>
        <p class="plan-view__noplan" data-plan-error role="status" hidden>${esc(m.planError)}</p>
        <p class="plan-view__hint" data-zoom-hint aria-hidden="true">${esc(m.zoomHint)}</p>
        <div class="plan-view__tools">
          <a class="icon-btn icon-btn--line" data-plan-original href="../assets/plans/pdf/isani-park-residence-E-apartment-1.pdf" target="_blank" rel="noopener" aria-label="${esc(m.original)}">${ICON.ext}</a>
          <button class="icon-btn icon-btn--line" type="button" data-zoom="out" aria-label="${esc(m.zoomOut)}" disabled>${ICON.minus}</button>
          <button class="icon-btn icon-btn--line" type="button" data-zoom="in" aria-label="${esc(m.zoomIn)}">${ICON.plus}</button>
        </div>
        <p class="plan-view__no3d" data-no3d hidden>${esc(m.no3d)}</p>
        <p class="plan-view__no3d" data-err3d role="status" hidden>${esc(m.error3d)}</p>
      </div>
      </div>
      <div class="apt-dialog__side">
        <p class="apt-dialog__area"><span data-apt-area></span></p>
        <h3 class="sr-only">${esc(m.specs)}</h3>
        <dl class="specs" data-apt-specs></dl>
        <div class="apt-dialog__actions">
          <a class="btn btn--primary btn--block" href="#contact" data-apt-request>${esc(m.request)}</a>
          <a class="btn btn--ghost btn--block" data-apt-pdf href="../assets/plans/pdf/isani-park-residence-E-apartment-1.pdf" target="_blank" rel="noopener">${esc(m.pdf)} ${ICON.ext}</a>
        </div>
        <p class="note">${esc(m.note)}</p>
        <div class="apt-dialog__nav">
          <button class="btn btn--text btn--sm" type="button" data-apt-prev>${ICON.prev} ${esc(m.prev)}</button>
          <button class="btn btn--text btn--sm" type="button" data-apt-next>${esc(m.next)} ${ICON.next}</button>
        </div>
      </div>
    </div>
  </div>
</dialog>`;
}

function mobileBar(t) {
  const wa = `${config.contacts.whatsapp}?text=${encodeURIComponent(t.contact.whatsappText.replace(/[\u00a0\u2060]/g, ' '))}`;
  return `<div class="mobile-bar is-hidden" data-mobile-bar>
  <a class="btn btn--primary mobile-bar__main" href="#choose" data-cta="bar-choose">${esc(t.mobileBar.choose)}</a>
  <a class="icon-btn mobile-bar__icon" href="tel:${config.contacts.phoneE164}" data-phone-link aria-label="${esc(t.mobileBar.callLabel)}">${ICON.phone}</a>
  <a class="icon-btn mobile-bar__icon" href="${wa}" target="_blank" rel="noopener" data-cta="bar-whatsapp" aria-label="${esc(t.mobileBar.whatsapp)}">${ICON.whatsapp}</a>
</div>`;
}

function consentBanner(t) {
  const a = config.analytics;
  if (!a.ga4MeasurementId && !a.googleAdsId) return '';
  return `<div class="consent" data-consent hidden role="region" aria-label="Cookies"><p>${esc(t.consent.text)}</p><div><button class="btn btn--primary btn--sm" type="button" data-consent-accept>${esc(t.consent.accept)}</button><button class="btn btn--ghost btn--sm" type="button" data-consent-decline>${esc(t.consent.decline)}</button></div></div>`;
}

function jsonLd(lang, t) {
  const org = {
    '@type': ['Organization', 'RealEstateAgent'], '@id': 'https://www.monocapitals.ge/#org', name: 'Mono Capitals', url: 'https://www.monocapitals.ge/',
    logo: 'https://www.monocapitals.ge/assets/logo/mono-capitals-logo-512.png', image: 'https://www.monocapitals.ge/assets/img/og-image.jpg',
    email: config.contacts.email, telephone: config.contacts.phoneE164,
    address: { '@type': 'PostalAddress', streetAddress: lang === 'ka' ? 'ს. წულაძის ქ. N34' : (lang === 'ru' ? 'ул. С. Цуладзе, 34' : '34 S. Tsuladze St.'), addressLocality: lang === 'ka' ? 'თბილისი' : (lang === 'ru' ? 'Тбилиси' : 'Tbilisi'), addressCountry: 'GE' },
    sameAs: [config.contacts.instagram],
  };
  const complex = {
    '@type': 'ApartmentComplex', name: 'Isani Park Residence', description: t.meta.description,
    numberOfAccommodationUnits: apartments.length, containedInPlace: { '@type': 'Place', name: lang === 'ka' ? 'ისნის რაიონი, თბილისი' : (lang === 'ru' ? 'район Исани, Тбилиси' : 'Isani district, Tbilisi') },
    address: { '@type': 'PostalAddress', streetAddress: t.location.complexAddress, addressLocality: lang === 'ka' ? 'თბილისი' : (lang === 'ru' ? 'Тбилиси' : 'Tbilisi'), addressCountry: 'GE' },
    ...(SITE ? { url: absUrl(lang), image: `${SITE}/assets/img/og-image.jpg` } : {}),
  };
  const faqLd = { '@type': 'FAQPage', mainEntity: t.faq.items.map((q) => ({ '@type': 'Question', name: q.q, acceptedAnswer: { '@type': 'Answer', text: q.a } })) };
  return `<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@graph': [org, complex, faqLd] }).replace(/</g, '\\u003c')}</script>`;
}

function clientData(lang, t) {
  const js = {
    lang,
    numLocale: numLocale[lang],
    m2: m2[lang],
    paths: Object.fromEntries(LANGS.map((l) => [l, pageHref(1, l)])),
    assets: '../assets/',
    config: { analytics: config.analytics, phone: config.contacts.phoneDisplay, api: '/api/lead' },
    pdf: !PREVIEW,
    t: {
      catalog: { shown: t.catalog.shown, found: t.catalog.found, floorShort: t.catalog.floorShort, roomsLabel: t.catalog.roomsLabel, total: t.catalog.total, interior: t.catalog.interior, summer: t.catalog.summer, summerHint: t.catalog.summerHint, planAlt: t.catalog.planAlt, apartment: t.catalog.apartment, no: t.catalog.no, block: t.catalog.block, floor: t.catalog.floor, rooms: t.catalog.rooms, areaBands: t.catalog.areaBands, showN: t.catalog.showN, countShort: t.catalog.countShort, removeFilter: t.catalog.removeFilter },
      modal: { title: t.modal.title, subtitle: t.modal.subtitle, alt3d: t.modal.alt3d },
      picker: { floorLabel: t.picker.floorLabel, floorCount: t.picker.floorCount, planAlt: t.picker.planAlt },
      gallery: { counter: t.gallery.counter },
      hero: { pause: t.hero.pause, play: t.hero.play },
      contact: { errors: t.contact.errors, sending: t.contact.sending, submit: t.contact.submit, name: t.contact.name, phone: t.contact.phone, comment: t.contact.comment },
      nav: { themeToLight: t.nav.themeToLight, themeToDark: t.nav.themeToDark },
      net: t.net,
    },
    apartments: apartments.map((a) => [a.id, a.floor, a.rooms, a.area, a.inner, a.summer, a.plan ? 1 : 0, a.ratio, floormap.apartments[a.id].pos, floormap.apartments[a.id].t3d || 0]),
    floormap: { w: floormap.w, h: floormap.h, shapes: floormap.shapes, renders: floormap.renders },
  };
  return `<script id="ipr-data" type="application/json">${JSON.stringify(js).replace(/</g, '\\u003c')}</script>`;
}

// ---------- pages ----------
let ASSET_V = {};

function homePage(lang) {
  const t = I18N[lang];
  const depth = 1;
  const preload = `<link rel="preload" as="image" href="../assets/img/hero-poster-540.webp${hv('img/hero-poster-540.webp')}" media="(max-width: 700px)"><link rel="preload" as="image" href="../assets/img/hero-poster-1280.webp${hv('img/hero-poster-1280.webp')}" media="(min-width: 701px)">${jsonLd(lang, t)}`;
  return `${head({ lang, t, depth, title: t.meta.title, description: t.meta.description, extraHead: preload })}
<body class="page-home lang-${lang}">
${header({ lang, t, depth, home: true })}
<main id="main" tabindex="-1">
${hero(t, lang)}
${project(t, lang)}
${living(t)}
${picker(t, lang)}
${catalog(t, lang)}
${gallery(t)}
${location(t, lang)}
${purchase(t)}
${developer(t, lang)}
${faq(t)}
${contact(t, lang, depth)}
</main>
${footer({ lang, t, depth })}
${mobileBar(t)}
${aptDialog(t)}
${consentBanner(t)}
${clientData(lang, t)}
<script src="../assets/js/site.js${PREVIEW ? '' : '?v=' + ASSET_V.js}" defer></script>
</body>
</html>
`;
}

function privacyPage(lang) {
  const t = I18N[lang];
  const depth = 2;
  const p = t.privacy;
  const crumbs = SITE ? `<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Isani Park Residence', item: absUrl(lang) }, { '@type': 'ListItem', position: 2, name: p.title, item: absUrl(lang, 'privacy') }] }).replace(/</g, '\\u003c')}</script>` : '';
  return `${head({ lang, t, depth, title: t.meta.privacyTitle, description: t.meta.privacyDescription, sub: 'privacy', extraHead: crumbs })}
<body class="page-doc lang-${lang}">
${header({ lang, t, depth, sub: 'privacy' })}
<main id="main" class="doc container" tabindex="-1">
  <p class="eyebrow">Isani Park Residence</p>
  <h1 class="h2">${esc(p.title)}</h1>
  <p class="note">${esc(p.updated)}</p>
  ${p.sections.map((s) => `<section><h2 class="h4">${esc(s.h)}</h2>${s.p.map((x) => `<p>${esc(x)}</p>`).join('')}</section>`).join('')}
  <p><a class="btn btn--ghost" href="${pageHref(depth, lang)}">${esc(p.back)}</a></p>
</main>
${footer({ lang, t, depth, sub: 'privacy' })}
<script>document.querySelectorAll('[data-theme-toggle]').forEach(function(b){b.addEventListener('click',function(){var d=document.documentElement,n=d.getAttribute('data-theme')==='light'?'dark':'light';d.setAttribute('data-theme',n);try{localStorage.setItem('ipr-theme',n)}catch(e){}})});var s=document.getElementById('nav-sheet');document.querySelectorAll('[data-menu-open]').forEach(function(b){b.addEventListener('click',function(){s.showModal()})});document.querySelectorAll('[data-menu-close]').forEach(function(b){b.addEventListener('click',function(){s.close()})});</script>
</body>
</html>
`;
}

function notFoundPage() {
  const lang = 'en';
  const blocks = LANGS.map((l) => {
    const t = I18N[l];
    return `<section lang="${I18N[l].htmlLang}" class="nf__block"><h2 class="h3">${esc(t.notFound.title)}</h2><p>${esc(t.notFound.text)}</p><p class="nf__links"><a class="btn btn--primary btn--sm" href="${PREVIEW ? `${l}/index.html` : `/${l}/`}">${esc(t.notFound.home)}</a><a class="btn btn--ghost btn--sm" href="${PREVIEW ? `${l}/index.html` : `/${l}/`}#apartments">${esc(t.notFound.catalog)}</a></p></section>`;
  }).join('');
  return `${head({ lang, t: I18N.en, depth: 0, title: I18N.en.meta.notFoundTitle, description: I18N.en.meta.description, robots: 'noindex' }).replace(/\.\.\/assets|\.\/assets/g, '/assets')}
<body class="page-doc">
<main id="main" class="doc container nf">
  <h1 class="sr-only">404 · ${esc(I18N.en.meta.notFoundTitle)}</h1>
  <p class="nf__mark">${monogram('nf__monogram')}</p>
  ${blocks}
</main>
</body>
</html>
`;
}

// Root chooser (x-default). In the preview it is the artifact's main page and is wrapped by the host,
// so it is written without its own document skeleton.
function chooserPage() {
  const langs = ['ka', 'en', 'ru'];
  const body = `
<main class="chooser" id="main">
  <div class="hero__media"><picture><source media="(max-width: 700px)" srcset="assets/img/hero-poster-540.webp${hv('img/hero-poster-540.webp')}"><img class="hero__poster" src="assets/img/hero-poster-1280.webp${hv('img/hero-poster-1280.webp')}" alt="" width="1280" height="720"></picture><div class="hero__veil"></div></div>
  <div class="chooser__inner">
    <p class="eyebrow">Tbilisi · Isani</p>
    <h1 class="chooser__title"><span class="sr-only">Isani Park Residence</span>${heroTitleSvg()}</h1>
    <p class="hero__by"><span class="hero__rule" aria-hidden="true"></span><span>by Mono Capitals</span></p>
    <ul class="chooser__langs">${langs.map((l) => `<li><a class="btn btn--ghost" href="${PREVIEW ? `${l}/index.html` : `/${l}/`}" hreflang="${l}" lang="${I18N[l].htmlLang}" data-lang-link="${l}"><span class="chooser__label">${esc(I18N[l].labelLong)}</span><span class="chooser__hint">${esc(I18N[l].chooser.prompt)}</span></a></li>`).join('')}</ul>
  </div>
</main>
<script>(function(){try{var s=localStorage.getItem('ipr-lang');if(s){var a=document.querySelector('[data-lang-link="'+s+'"]');if(a)a.classList.add('is-last');}document.querySelectorAll('[data-lang-link]').forEach(function(a){a.addEventListener('click',function(){try{localStorage.setItem('ipr-lang',a.getAttribute('data-lang-link'))}catch(e){}})})}catch(e){}})()</script>`;
  if (PREVIEW) {
    return `<title>Isani Park Residence</title>
<link rel="stylesheet" href="${fontsHref('ka')}">
<link rel="stylesheet" href="assets/css/site.css${PREVIEW ? '' : '?v=' + ASSET_V.css}">
<script>(function(d){d.classList.add('js');d.setAttribute('data-theme','dark');try{var s=localStorage.getItem('ipr-theme');if(s==='light'||s==='dark')d.setAttribute('data-theme',s);}catch(e){}})(document.documentElement)</script>
${body}`;
  }
  const t = I18N.en;
  return `${head({ lang: 'en', t, depth: 0, title: 'Isani Park Residence — Tbilisi | Mono Capitals', description: t.meta.description, canonical: SITE ? SITE + '/' : '' }).replace('<html lang="en"', '<html lang="en"').replace(/href="\.\/assets/g, 'href="/assets')}
<body class="page-chooser">${body}
</body>
</html>
`;
}

// ---------- build ----------
rmrf(OUT);
copyDir(path.join(ROOT, 'public'), OUT);
if (PREVIEW) {
  // the preview host limits file counts: drop AVIF duplicates, small plan thumbnails and PDFs
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
  for (const f of walk(path.join(OUT, 'assets'))) {
    if (f.endsWith('.avif') || /plans\/img\/apt-\d+-440\.webp$/.test(f) || f.endsWith('.pdf') || /gallery\/.*-(1920|2560|3840|3072)\.webp$/.test(f)) fs.rmSync(f);
  }
}
ASSET_V = { css: hashFile(path.join(OUT, 'assets/css/site.css')), js: hashFile(path.join(OUT, 'assets/js/site.js')) };

for (const lang of LANGS) {
  write(`${lang}/index.html`, homePage(lang));
  write(`${lang}/privacy/index.html`, privacyPage(lang));
}
write('index.html', chooserPage());
write('404.html', notFoundPage());

if (SITE && !PREVIEW) {
  const today = new Date().toISOString().slice(0, 10);
  const urls = [['', ''], ...LANGS.map((l) => [l, '']), ...LANGS.map((l) => [l, 'privacy'])];
  const alt = (sub) => LANGS.map((l) => `<xhtml:link rel="alternate" hreflang="${l}" href="${absUrl(l, sub)}"/>`).join('');
  write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls.map(([l, sub]) => `<url><loc>${l ? absUrl(l, sub) : SITE + '/'}</loc><lastmod>${today}</lastmod>${l ? alt(sub) : ''}</url>`).join('\n')}\n</urlset>\n`);
  write('robots.txt', `User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: ${SITE}/sitemap.xml\n`);
} else {
  write('robots.txt', `User-agent: *\nAllow: /\nDisallow: /api/\n`);
}
console.log(`built ${PREVIEW ? 'preview' : 'production'} -> ${path.relative(ROOT, OUT)}`);
