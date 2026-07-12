import { chromium } from 'playwright';

const APP = 'http://127.0.0.1:7777';
const results = [];
const check = (name, cond, extra = '') => {
  results.push(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  → ' + extra : ''}`);
  if (!cond) process.exitCode = 1;
};

const JD = `Medical Front Office Coordinator

We are seeking a friendly, organized Medical Front Office Coordinator to join our busy clinic.

Responsibilities:
- Greet patients and manage patient intake and patient scheduling for 4 providers
- Verify insurance and handle insurance verification and prior authorization requests
- Maintain electronic health records in Epic with strict HIPAA compliance
- Answer multi-line phone system, route calls, and manage appointment scheduling
- Process medical billing and collect copays with accurate cash handling
- Provide excellent customer service and patient education

Requirements:
- 2+ years experience in a medical office or healthcare setting
- Proficiency with electronic health records (Epic preferred) and Microsoft Office
- Knowledge of medical terminology and HIPAA
- Strong communication and time management skills
- Experience with insurance verification and patient scheduling required
- Bilingual Spanish a plus`;

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const page = await browser.newPage();
page.on('dialog', d => d.accept());
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto(APP);

// --- Profile tab ---
await page.fill('[data-path="contact.name"]', 'Jane Doe');
await page.fill('[data-path="contact.email"]', 'jane.doe@email.com');
await page.fill('[data-path="contact.phone"]', '(555) 123-4567');
await page.fill('[data-path="contact.location"]', 'Austin, TX');
await page.fill('[data-path="summary"]', 'Medical office professional with 5 years of front desk and patient care experience seeking a Medical Front Office Coordinator role.');

for (const s of ['Customer service', 'Microsoft Office', 'Scheduling', 'Data entry', 'HIPAA', 'Epic', 'Medical terminology', 'Multi-line phone']) {
  await page.fill('#skill-input', s);
  await page.press('#skill-input', 'Enter');
}
check('skills chips render', await page.locator('#skills-chips .chip').count() === 8);

await page.click('[data-action="add-exp"]');
await page.fill('[data-exp][data-f="title"]', 'Front Desk Receptionist');
await page.fill('[data-exp][data-f="company"]', 'Hill Country Family Medicine');
await page.fill('[data-exp][data-f="location"]', 'Austin, TX');
await page.fill('[data-exp][data-f="start"]', 'Mar 2021');
await page.fill('[data-exp][data-f="end"]', 'Present');
await page.fill('[data-exp][data-f="bullets"]', 'Scheduled 60+ patient appointments daily across 4 providers\nMaintained electronic health records in Epic with 100% HIPAA compliance\nProcessed insurance verification for 40 patients per day');

await page.click('[data-action="add-edu"]');
await page.fill('[data-edu][data-f="degree"]', 'High School Diploma');
await page.fill('[data-edu][data-f="school"]', 'Austin High School');
await page.fill('[data-edu][data-f="gradDate"]', '2015');
await page.fill('[data-path="certifications"]', 'CPR/BLS Certification — current');

// --- Jobs tab ---
await page.click('nav.tabs button[data-tab="jobs"]');
await page.click('[data-action="add-job"]');
await page.fill('[data-job][data-f="title"]', 'Medical Front Office Coordinator');
await page.fill('[data-job][data-f="company"]', 'Lakeside Clinic');
await page.fill('[data-job][data-f="jd"]', JD);
await page.click('[data-action="analyze"]');
await page.waitForTimeout(300);

const foundChips = await page.locator('.chip.found').count();
const missingChips = await page.locator('.chip.missing').count();
check('keywords extracted & scored', foundChips > 3 && missingChips > 0, `found=${foundChips} missing=${missingChips}`);
check('required keywords flagged with star', (await page.locator('#analysis-zone .reqmark').count()) > 0, `${await page.locator('#analysis-zone .reqmark').count()} starred`);
check('knockout panel detects min-years requirement', (await page.locator('#knockout-panel').count()) === 1 && (await page.locator('#knockout-panel').innerText()).includes('Minimum years'));
const letter = (await page.locator('#analysis-zone .score-ring .val').textContent()).trim();
check('letter grade renders', /^[A-F][+−-]?$/.test(letter), `grade=${letter}`);
const pctTxt = (await page.locator('#analysis-zone .score-desc strong').first().textContent()).trim();
check('overall percent renders', /^\d+%$/.test(pctTxt), pctTxt);
const before = parseInt(pctTxt);
check('grade subscore bars render', (await page.locator('#analysis-zone .gbar').count()) >= 4, `${await page.locator('#analysis-zone .gbar').count()} bars`);

// click first missing keyword → grade should rise
const firstMissing = await page.locator('.chip.missing').first().getAttribute('data-term');
await page.locator('.chip.missing').first().click();
await page.waitForTimeout(300);
const skillsTA = await page.locator('[data-jobt][data-f="skills"]').inputValue();
check('click-to-add missing keyword lands in tailored skills', skillsTA.toLowerCase().includes(firstMissing.toLowerCase()), firstMissing);
const after = parseInt((await page.locator('#analysis-zone .score-desc strong').first().textContent()).trim());
check('grade rises after adding keyword', after > before, `${before}% → ${after}%`);

// cover letter generation
await page.click('[data-action="gen-cover"]');
await page.waitForTimeout(300);
const cover = await page.locator('[data-job][data-f="coverLetter"]').inputValue();
check('cover letter generated with company/title', cover.includes('Lakeside Clinic') && cover.includes('Medical Front Office Coordinator') && cover.includes('Jane Doe'));
check('cover letter uses matched keywords', /patient scheduling|insurance verification|electronic health records|hipaa|epic/i.test(cover));
const [dlc] = await Promise.all([page.waitForEvent('download'), page.click('[data-action="download-cover"]')]);
check('cover letter .docx download fires', (await dlc.suggestedFilename()).endsWith('.docx'), await dlc.suggestedFilename());
await dlc.saveAs('cover-test.docx');

// interview prep + apply kit
check('prep sheet renders', (await page.locator('#prep-card').count()) === 1);
const prepTxt = await page.locator('#prep-card').innerText();
check('prep sheet has questions & proof points', prepTxt.includes('Questions to expect') && prepTxt.includes('Tell me about your experience with') && /Scheduled 60\+/.test(prepTxt));
check('apply kit renders', (await page.locator('[data-action="copy-resume-text"]').count()) === 1);

// status change
await page.selectOption('[data-job][data-f="status"]', 'applied');
await page.waitForTimeout(300);
check('status badge updates in list', (await page.locator('.status-badge.status-applied').count()) >= 1);

// --- Preview tab ---
await page.click('[data-action="goto-preview"]');
await page.waitForTimeout(200);
const previewHTML = await page.locator('#resume-preview').innerHTML();
check('preview shows tailored resume', previewHTML.includes('Jane Doe') && previewHTML.includes('Professional Experience') && previewHTML.includes('Hill Country Family Medicine'));
check('ATS audit renders', (await page.locator('#ats-checks .check-item').count()) >= 5);
check('preview grade card with bars', (await page.locator('#preview-score-card .gbar').count()) >= 4);
const fname = await page.locator('#filename-hint').textContent();
check('filename suggestion per company', fname.includes('Jane-Doe-Resume-Lakeside-Clinic'), fname.trim());

const plain = await page.evaluate(() => resumePlainText(state.ui.previewTarget));
check('plain text export has sections', plain.includes('PROFESSIONAL SUMMARY') && plain.includes('SKILLS') && plain.includes('PROFESSIONAL EXPERIENCE') && plain.includes('EDUCATION') && plain.includes('CERTIFICATIONS'));

const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-action="download-doc"]')]);
check('.docx download fires', (await dl.suggestedFilename()).endsWith('.docx'), await dl.suggestedFilename());
await dl.saveAs('resume-test.docx');
const [dl2] = await Promise.all([page.waitForEvent('download'), page.click('[data-action="export-json"]')]);
check('backup download fires', (await dl2.suggestedFilename()).endsWith('.json'));

// --- Find Jobs tab (demo source) ---
await page.click('nav.tabs button[data-tab="search"]');
await page.waitForTimeout(200);
check('offline warning hidden when served', await page.locator('#search-offline').isHidden());
check('bookmarklet link present', (await page.locator('#bm-link').getAttribute('href')).startsWith('javascript:'));
check('source checkboxes render', (await page.locator('[data-source]').count()) >= 6);
await page.fill('#search-q', 'medical receptionist');
await page.click('[data-action="run-search"]');
await page.waitForSelector('#search-results .item-card', { timeout: 10000 });
const nResults = await page.locator('#search-results .item-card').count();
check('demo search returns graded results', nResults >= 3 && (await page.locator('#search-results .mini-score').count()) >= 1, `${nResults} results`);
const resultsTxt = await page.locator('#search-results').innerText();
check('posting freshness badges render', /fresh, apply soon/.test(resultsTxt) && /w old/.test(resultsTxt));
await page.locator('[data-action="add-search-job"]').first().click();
await page.waitForTimeout(300);
check('add & tailor lands on jobs tab with auto-analysis', (await page.locator('#analysis-zone .score-ring .val').count()) === 1 && (await page.locator('.job-list-item').count()) === 2);

// --- Bookmarklet clip flow ---
await page.evaluate(() => fetch('/api/clip', {
  method: 'POST', headers: { 'Content-Type': 'text/plain' },
  body: JSON.stringify({ title: 'Office Manager - BuildCo - Indeed.com', url: 'https://example.com/job', text: 'Office Manager needed. Requirements: scheduling, payroll, QuickBooks, Microsoft Office, customer service, 3+ years experience managing an office. Responsibilities: supervise staff of 6, manage vendor contracts, process invoices.' })
}));
await page.waitForTimeout(5500);
check('clipped posting becomes a job', (await page.locator('.job-list-item').count()) === 3, `${await page.locator('.job-list-item').count()} jobs`);
const firstJob = await page.locator('.job-list-item .jt').first().textContent();
check('clip title parsed', firstJob.includes('Office Manager'), firstJob);

// --- Persistence across reload ---
await page.reload();
await page.waitForTimeout(300);
check('data persists after reload', (await page.locator('[data-path="contact.name"]').inputValue()) === 'Jane Doe');
await page.click('nav.tabs button[data-tab="jobs"]');
check('jobs persist after reload', (await page.locator('.job-list-item').count()) === 3);

// master vs tailored isolation
await page.locator('.job-list-item').last().click();
await page.fill('[data-jobt][data-f="summary"]', 'TAILORED ONLY SUMMARY');
await page.click('nav.tabs button[data-tab="profile"]');
const masterSummary = await page.locator('[data-path="summary"]').inputValue();
check('tailored edits do not touch master', !masterSummary.includes('TAILORED ONLY'));

check('no console/page errors', errors.length === 0, errors.slice(0, 3).join(' | '));

// screenshots
await page.click('nav.tabs button[data-tab="jobs"]');
await page.locator('.job-list-item').last().click();
await page.waitForTimeout(200);
await page.screenshot({ path: 'shot-jobs.png' });
await page.click('nav.tabs button[data-tab="search"]');
await page.waitForTimeout(200);
await page.screenshot({ path: 'shot-search.png' });

await browser.close();
console.log(results.join('\n'));
