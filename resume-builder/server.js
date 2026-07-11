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

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

function send(res, code, body, type = 'application/json') {
  res.writeHead(code, Object.assign({ 'Content-Type': type }, CORS));
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}

function stripHtml(s) {
  return String(s || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, ' ').trim();
}

async function fetchJson(url, opts = {}) {
  const r = await fetch(url, Object.assign({ headers: { 'User-Agent': 'ResumeForge/1.0 (personal job search tool)' } }, opts));
  if (!r.ok) throw new Error(`upstream ${r.status}`);
  return r.json();
}

const DEMO_JOBS = q => [
  {
    title: `${q || 'Office'} Coordinator`, company: 'Sample Health Group', location: 'Anywhere, USA',
    url: 'https://example.com/demo-1', source: 'Demo',
    description: `We are seeking a ${q || 'office'} coordinator. Responsibilities: patient scheduling, customer service, data entry, insurance verification, multi-line phone. Requirements: 2+ years experience, Microsoft Office, electronic health records, HIPAA, strong communication and time management skills.`
  },
  {
    title: `Senior ${q || 'Office'} Specialist`, company: 'Demo Logistics Inc', location: 'Remote',
    url: 'https://example.com/demo-2', source: 'Demo',
    description: `Requirements: inventory management, order fulfillment, Microsoft Excel, data entry, attention to detail, fast-paced environment. Responsibilities include shipping, receiving, vendor management, process improvement and reporting.`
  },
  {
    title: `${q || 'Customer'} Support Representative`, company: 'Example Retail Co', location: 'Anywhere, USA',
    url: 'https://example.com/demo-3', source: 'Demo',
    description: `Must have: customer service, conflict resolution, POS systems, cash handling, upselling. Preferred: bilingual Spanish, scheduling, inventory control, training new team members.`
  }
];

async function searchSource(p) {
  const src = p.get('src'), q = p.get('q') || '', loc = p.get('loc') || '';
  const enc = encodeURIComponent;

  switch (src) {
    case 'demo':
      return DEMO_JOBS(q);

    case 'adzuna': {
      const id = p.get('adzunaId'), key = p.get('adzunaKey'), country = (p.get('country') || 'us').toLowerCase();
      if (!id || !key) throw new Error('Adzuna needs an app id and key');
      const d = await fetchJson(`https://api.adzuna.com/v1/api/jobs/${country}/search/1?app_id=${enc(id)}&app_key=${enc(key)}&results_per_page=20&what=${enc(q)}&where=${enc(loc)}&content-type=application/json`);
      return (d.results || []).map(r => ({
        title: r.title, company: r.company?.display_name || '', location: r.location?.display_name || '',
        url: r.redirect_url, description: stripHtml(r.description), source: 'Adzuna', posted: r.created
      }));
    }

    case 'jooble': {
      const key = p.get('joobleKey');
      if (!key) throw new Error('Jooble needs an API key');
      const r = await fetch(`https://jooble.org/api/${enc(key)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keywords: q, location: loc })
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
          description: stripHtml([j.UserArea?.Details?.JobSummary, (j.QualificationSummary || '')].filter(Boolean).join(' '))
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
    let buf = '';
    req.on('data', c => { buf += c; if (buf.length > limit) { reject(new Error('too large')); req.destroy(); } });
    req.on('end', () => resolve(buf));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'OPTIONS') { res.writeHead(204, CORS); return res.end(); }

  if (url.pathname === '/api/clip' && req.method === 'POST') {
    try {
      const body = JSON.parse(await readBody(req));
      clips.push({
        id: Math.random().toString(36).slice(2),
        title: String(body.title || '').slice(0, 300),
        url: String(body.url || '').slice(0, 2000),
        text: String(body.text || '').slice(0, 40000),
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

  if (url.pathname === '/favicon.ico') { res.writeHead(204, CORS); return res.end(); }

  // Static files
  let file = url.pathname === '/' ? '/index.html' : url.pathname;
  file = path.normalize(file).replace(/^(\.\.[/\\])+/, '');
  const full = path.join(ROOT, file);
  if (!full.startsWith(ROOT)) return send(res, 403, { error: 'forbidden' });
  fs.readFile(full, (err, data) => {
    if (err) return send(res, 404, 'Not found', 'text/plain');
    res.writeHead(200, Object.assign({ 'Content-Type': MIME[path.extname(full)] || 'application/octet-stream' }, CORS));
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
