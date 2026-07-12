#!/usr/bin/env node
'use strict';
/*
 * ResumeForge local server — zero dependencies, runs entirely on your machine.
 *   node server.js          → http://127.0.0.1:7777
 *
 * Provides:
 *   - the app itself (static files)
 *   - POST /api/clip    : receives a job posting from the browser bookmarklet
 *   - GET  /api/clips   : the app polls this to pick up clipped postings
 *   - GET  /api/search  : proxies job-board APIs (avoids browser CORS limits)
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = Number(process.env.PORT || 7777);
const HOST = '127.0.0.1';
const ROOT = path.dirname(fileURLToPath(import.meta.url));

let clips = [];

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.md': 'text/plain; charset=utf-8'
};

function send(res, code, body, type = 'application/json') {
  res.writeHead(code, { 'Content-Type': type });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}

function stripHtml(s) {
  return String(s || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, ' ').trim();
}

async function fetchJson(url, opts = {}) {
  const r = await fetch(url, Object.assign({
    headers: { 'User-Agent': 'ResumeForge/1.0 (personal job search tool)' },
    signal: AbortSignal.timeout(15000)
  }, opts));
  if (!r.ok) throw new Error(`upstream ${r.status}`);
  return r.json();
}

const daysAgo = d => new Date(Date.now() - d * 86400000).toISOString();
const DEMO_JOBS = q => [
  {
    title: `${q || 'Office'} Coordinator`, company: 'Sample Health Group', location: 'Anywhere, USA',
    url: 'https://example.com/demo-1', source: 'Demo', posted: daysAgo(1),
    description: `We are seeking a ${q || 'office'} coordinator to join our busy practice. Responsibilities: manage patient scheduling and patient intake for multiple providers, deliver excellent customer service, perform accurate data entry, handle insurance verification and prior authorization requests, and answer a multi-line phone system. Requirements: 2+ years experience in a medical or office setting, proficiency with Microsoft Office and electronic health records, knowledge of HIPAA compliance, strong communication and time management skills. Bilingual Spanish a plus.`
  },
  {
    title: `Senior ${q || 'Office'} Specialist`, company: 'Demo Logistics Inc', location: 'Remote',
    url: 'https://example.com/demo-2', source: 'Demo', posted: daysAgo(6),
    description: `Join our operations team. Responsibilities: oversee shipping and receiving, coordinate order fulfillment across two warehouses, manage vendor relationships, drive process improvement initiatives, and produce weekly reporting for leadership. Requirements: 3+ years experience with inventory management, advanced Microsoft Excel (pivot tables, vlookup), accurate data entry, strong attention to detail, and comfort in a fast-paced environment. Forklift certification a plus.`
  },
  {
    title: `${q || 'Customer'} Support Representative`, company: 'Example Retail Co', location: 'Anywhere, USA',
    url: 'https://example.com/demo-3', source: 'Demo', posted: daysAgo(21),
    description: `Deliver outstanding customer service across phone, chat, and email while resolving billing questions and order issues. Responsibilities: handle escalations with professional conflict resolution, operate POS systems with accurate cash handling, identify upselling opportunities, and maintain customer satisfaction benchmarks. Requirements: 1+ years customer service experience, strong communication skills, scheduling flexibility including weekends. Preferred: bilingual Spanish, inventory control experience, and training new team members.`
  }
];

async function searchSource(p) {
  const src = p.get('src'), q = p.get('q') || '', loc = p.get('loc') || '';
  const enc = encodeURIComponent;

  switch (src) {
    case 'demo':
      return DEMO_JOBS(q);

    case 'adzuna': {
      const id = p.get('adzunaId'), key = p.get('adzunaKey');
      const rawCountry = (p.get('country') || 'us').toLowerCase();
      const country = /^[a-z]{2}$/.test(rawCountry) ? rawCountry : 'us';
      if (!id || !key) throw new Error('Adzuna needs an app id and key');
      const d = await fetchJson(`https://api.adzuna.com/v1/api/jobs/${country}/search/1?app_id=${enc(id)}&app_key=${enc(key)}&results_per_page=20&what=${enc(q)}&where=${enc(loc)}&content-type=application/json`);
      return (d.results || []).map(r => ({
        title: r.title, company: r.company?.display_name || '', location: r.location?.display_name || '',
        url: r.redirect_url, description: stripHtml(r.description).slice(0, 8000), source: 'Adzuna', posted: r.created
      }));
    }

    case 'jooble': {
      const key = p.get('joobleKey');
      if (!key) throw new Error('Jooble needs an API key');
      const r = await fetch(`https://jooble.org/api/${enc(key)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keywords: q, location: loc }),
        signal: AbortSignal.timeout(15000)
      });
      if (!r.ok) throw new Error(`upstream ${r.status}`);
      const d = await r.json();
      return (d.jobs || []).map(j => ({
        title: j.title, company: j.company || '', location: j.location || '',
        url: j.link, description: stripHtml(j.snippet), source: 'Jooble', posted: j.updated
      }));
    }

    case 'usajobs': {
      const key = p.get('usajobsKey'), email = p.get('usajobsEmail');
      if (!key || !email) throw new Error('USAJobs needs an API key and your registered email');
      const d = await fetchJson(`https://data.usajobs.gov/api/search?Keyword=${enc(q)}&LocationName=${enc(loc)}&ResultsPerPage=20`, {
        headers: { 'Authorization-Key': key, 'User-Agent': email, Host: 'data.usajobs.gov' }
      });
      return (d.SearchResult?.SearchResultItems || []).map(it => {
        const j = it.MatchedObjectDescriptor || {};
        return {
          title: j.PositionTitle, company: j.OrganizationName || '', location: (j.PositionLocationDisplay || ''),
          url: j.PositionURI, source: 'USAJobs', posted: j.PublicationStartDate,
          description: stripHtml([j.UserArea?.Details?.JobSummary, (j.QualificationSummary || '')].filter(Boolean).join(' ')).slice(0, 8000)
        };
      });
    }

    case 'remotive': {
      const d = await fetchJson(`https://remotive.com/api/remote-jobs?search=${enc(q)}&limit=20`);
      return (d.jobs || []).map(j => ({
        title: j.title, company: j.company_name || '', location: j.candidate_required_location || 'Remote',
        url: j.url, description: stripHtml(j.description).slice(0, 8000), source: 'Remotive', posted: j.publication_date
      }));
    }

    case 'arbeitnow': {
      const d = await fetchJson(`https://www.arbeitnow.com/api/job-board-api?search=${enc(q)}`);
      return (d.data || []).slice(0, 20).map(j => ({
        title: j.title, company: j.company_name || '', location: j.location || (j.remote ? 'Remote' : ''),
        url: j.url, description: stripHtml(j.description).slice(0, 8000), source: 'Arbeitnow'
      }));
    }

    case 'remoteok': {
      const d = await fetchJson('https://remoteok.com/api');
      const ql = q.toLowerCase();
      return (Array.isArray(d) ? d : []).filter(j => j && j.position)
        .filter(j => !ql || (j.position + ' ' + (j.tags || []).join(' ') + ' ' + (j.description || '')).toLowerCase().includes(ql))
        .slice(0, 20).map(j => ({
          title: j.position, company: j.company || '', location: j.location || 'Remote',
          url: j.url, description: stripHtml(j.description).slice(0, 8000), source: 'RemoteOK', posted: j.date
        }));
    }

    default:
      throw new Error('unknown source: ' + src);
  }
}

function readBody(req, limit = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', c => {
      size += c.length;
      if (size > limit) { reject(new Error('too large')); req.destroy(); return; }
      chunks.push(c);
    });
    // Concatenate before decoding so multi-byte UTF-8 split across chunks survives.
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  let url;
  try { url = new URL(req.url, `http://${HOST}:${PORT}`); }
  catch (e) { return send(res, 400, { error: 'bad request' }); }

  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  if (url.pathname === '/api/clip' && req.method === 'POST') {
    try {
      const body = JSON.parse(await readBody(req));
      const cut = (v, max) => {
        let x = String(v || '').slice(0, max);
        // don't leave half an emoji behind after truncation
        const c = x.charCodeAt(x.length - 1);
        return (c >= 0xD800 && c <= 0xDBFF) ? x.slice(0, -1) : x;
      };
      clips.push({
        id: Math.random().toString(36).slice(2),
        title: cut(body.title, 300),
        url: cut(body.url, 2000),
        text: cut(body.text, 40000),
        at: Date.now()
      });
      if (clips.length > 50) clips = clips.slice(-50);
      return send(res, 200, { ok: true });
    } catch (e) { return send(res, 400, { error: String(e.message) }); }
  }

  if (url.pathname === '/api/clips' && req.method === 'GET') {
    const out = clips; clips = [];
    return send(res, 200, { clips: out });
  }

  if (url.pathname === '/api/search' && req.method === 'GET') {
    try {
      const results = await searchSource(url.searchParams);
      return send(res, 200, { results });
    } catch (e) {
      return send(res, 200, { results: [], error: String(e.message) });
    }
  }

  if (url.pathname === '/favicon.ico') { res.writeHead(204); return res.end(); }

  // Static files
  let file = url.pathname === '/' ? '/index.html' : url.pathname;
  file = path.normalize(file).replace(/^(\.\.[/\\])+/, '');
  const full = path.join(ROOT, file);
  if (full !== ROOT && !full.startsWith(ROOT + path.sep)) return send(res, 403, { error: 'forbidden' });
  fs.readFile(full, (err, data) => {
    if (err) return send(res, 404, 'Not found', 'text/plain');
    res.writeHead(200, { 'Content-Type': MIME[path.extname(full)] || 'application/octet-stream' });
    res.end(data);
  });
});

server.listen(PORT, HOST, () => {
  console.log('');
  console.log('  ResumeForge is running ✓');
  console.log(`  Open:  http://${HOST}:${PORT}`);
  console.log('  Keep this window open while you use the app. Press Ctrl+C to stop.');
  console.log('');
});
