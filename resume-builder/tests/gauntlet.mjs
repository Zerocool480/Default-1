// Engine gauntlet: fires a corpus of job postings through the real engine
// in a real browser and reports every anomaly. Usage: node gauntlet.mjs corpus.json
import { chromium } from 'playwright';
import fs from 'node:fs';

const corpus = JSON.parse(fs.readFileSync(process.argv[2] || 'corpus.json', 'utf8'));
const anomalies = [];
const note = (posting, kind, detail) => anomalies.push({ posting: posting.title?.slice(0, 60), field: posting.field, kind, detail: String(detail).slice(0, 300) });

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const page = await browser.newPage();
page.on('dialog', d => d.accept());
const pageErrors = [];
page.on('pageerror', e => pageErrors.push(String(e)));
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const APP_DIR = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
await page.goto('file://' + path.join(APP_DIR, 'index.html'));

// Load Danielle's realistic profile so grading has a real resume to score against
const profilePath = process.argv[3];
const profile = profilePath ? JSON.parse(fs.readFileSync(profilePath, 'utf8')) : null;
if (profile) await page.evaluate(data => {
  state = normalizeState(Object.assign(defaultState(), data));
  flushNow();
}, profile);

const STOP_SAMPLE = ['the', 'and', 'with', 'must', 'have', 'you', 'our', 'will', 'for'];

for (const p of corpus) {
  const r = await page.evaluate(({ text, title }) => {
    const out = {};
    try {
      const kws = extractKeywords(text, title);
      out.kwCount = kws.length;
      out.kws = kws.map(k => ({ term: k.term, weight: k.weight, req: !!k.req }));
      out.badWeights = kws.filter(k => !(k.weight > 0) || !isFinite(k.weight)).length;
      out.knockouts = detectKnockouts(text).map(k => k.label);
      const job = { id: 'gtest', title: 'Test Role', company: 'TestCo', jd: text, url: '', status: 'saved', notes: '', coverLetter: '', tailored: makeTailored(), analysis: kws.length ? { keywords: kws, at: 'x' } : null };
      state.jobs = [job]; state.ui.selectedJob = job.id;
      if (job.analysis) {
        const g = computeGrade(job.id);
        out.gradePct = g.pct; out.gradeLetter = g.letter;
        const sr = scoreResume(job.id, kws);
        out.partition = sr.found.length + sr.partial.length + sr.missing.length === kws.length;
        out.scoreRange = sr.score >= 0 && sr.score <= 100;
      }
      const req = requiredSectionText(text);
      out.reqLen = req.length;
      out.htmlLen = (analysisHTML(job) || '').length;
      out.prepLen = (prepHTML(job) || '').length;
      out.coverLen = genCoverLetter(job).length;
      const docx = makeDocx(resumeDocxParas(job.id));
      out.docxMagic = docx[0] === 0x50 && docx[1] === 0x4B;
      out.plainOk = !/undefined|\[object/.test(resumePlainText(job.id));
    } catch (e) { out.threw = String(e && e.stack || e).slice(0, 400); }
    return out;
  }, { text: p.text, title: p.title });

  if (r.threw) { note(p, 'EXCEPTION', r.threw); continue; }
  if (p.style !== 'garbage' && r.kwCount === 0) note(p, 'zero-keywords', 'realistic posting extracted nothing');
  if (r.badWeights) note(p, 'bad-weight', `${r.badWeights} keywords with non-positive/NaN weight`);
  const junk = (r.kws || []).filter(k => STOP_SAMPLE.includes(k.term) || k.term.length < 2);
  if (junk.length) note(p, 'junk-keyword', junk.map(k => k.term).join(','));
  if (r.gradePct != null && !(r.gradePct >= 0 && r.gradePct <= 100)) note(p, 'grade-out-of-range', r.gradePct);
  if (r.partition === false) note(p, 'partition-broken', 'found+partial+missing != total keywords');
  if (r.scoreRange === false) note(p, 'score-out-of-range', '');
  if (r.docxMagic === false) note(p, 'docx-not-zip', '');
  if (r.plainOk === false) note(p, 'plaintext-artifacts', 'undefined/[object in plain text export');
  if (p.expectKnockouts) for (const k of p.expectKnockouts) {
    if (!r.knockouts.some(x => x.toLowerCase().includes(k.toLowerCase()))) note(p, 'knockout-missed', k);
  }
  if (p.expectKeywords) for (const k of p.expectKeywords) {
    if (!(r.kws || []).some(x => x.term.includes(k.toLowerCase()) || k.toLowerCase().includes(x.term))) note(p, 'keyword-missed', k);
  }
}

// Deterministic matcher sanity cases (stemming precision + acronym exactness)
const matcher = await page.evaluate(() => {
  const cases = [
    ['scheduling appointments daily', 'schedules', true],
    ['managed a team', 'managing', true],
    ['customer experience focus', 'customer experiences', true],
    ['drove the car to work', 'care', false],
    ['information architecture and taxonomy', 'ia', false],
    ['ia governance council', 'ia', true],
    ['content testing at scale', 'content tests', true],
    ['sales enablement', 'salesforce', false],
    ['worked with confluence daily', 'confluence', true],
    ['singer in a band', 'sing', false],
    ['built html canvas visualizations', 'canva', false],
    ['employer united healthcare group', 'unit', false],
    ['wrote 20+ hr policies', 'policy', true],
    ['managed 3 facilities', 'facility', true]
  ];
  return cases.map(([hay, term, want]) => ({ hay, term, want, got: textHasTerm(normText(hay), term) }));
});
for (const c of matcher) if (c.got !== c.want) anomalies.push({ posting: 'matcher-case', kind: 'matcher-wrong', detail: `"${c.term}" vs "${c.hay}" → ${c.got}, expected ${c.want}` });

// Regression traps for every bug the verification rounds confirmed
const regress = await page.evaluate(() => {
  const R = [];
  const t = (name, cond) => R.push({ name, pass: !!cond });
  const k1 = detectKnockouts("Valid driver's license required. Bilingual Spanish a plus.");
  t('softener in next sentence does not hide license knockout', k1.some(k => k.label.includes('License')));
  const k2 = detectKnockouts('3-5 years agency experience a plus. Minimum of 7 years content design experience required.');
  t('softened first years-mention does not hide the hard one', k2.some(k => k.label.includes('Minimum years')));
  const k3 = detectKnockouts('This is a telework position. Our headquarters: Springfield, IL. Apply today for this fully telecommuting role with benefits and a great team environment for everyone involved.');
  t('telework posting does not trigger implicit-onsite', !k3.some(k => k.label.includes('Location')));
  const kw1 = extractKeywords('Growth Marketing Manager role. Own paid media strategy and demand generation programs. Benefits include stock options, employee stock purchase plan, and stock refresh grants annually. Requirements: 5+ years in growth marketing, strong analytical skills, experience with paid media platforms and attribution.');
  t('benefits stock-options boilerplate does not extract retail skill stocking', !kw1.some(k => k.term === 'stocking'));
  const kw2 = extractKeywords('Requirements Analyst\nWe need someone great. Responsibilities: gather requirements from stakeholders. Requirements: 3+ years business analysis experience, SQL, strong communication skills and stakeholder management experience.', 'Requirements Analyst');
  t('title does not hijack required-section detection', kw2.filter(k => k.req).length < kw2.length);
  const j = { title: 'X', jd: 'Requirements: strong technical writer with API documentation experience' };
  const req = requiredSectionText(j.jd);
  t('content after Requirements: header is kept', /technical writer/.test(req));
  document.getElementById('print-area').innerHTML = '<p>STALE OLD CONTENT</p>';
  dispatchEvent(new Event('beforeprint'));
  const printed = document.getElementById('print-area').innerHTML;
  dispatchEvent(new Event('afterprint'));
  t('beforeprint regenerates over stale content', !printed.includes('STALE OLD CONTENT'));
  t('afterprint clears print area', !document.getElementById('print-area').innerHTML.trim());
  return R;
});
for (const r of regress) if (!r.pass) anomalies.push({ posting: 'regression-trap', kind: 'regression', detail: r.name });

if (pageErrors.length) anomalies.push({ posting: '(page)', kind: 'console-error', detail: pageErrors.slice(0, 3).join(' | ') });

await browser.close();
console.log(JSON.stringify({ postings: corpus.length, anomalies }, null, 1));
process.exitCode = anomalies.length ? 1 : 0;
