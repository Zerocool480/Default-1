# ResumeForge

A private, free job-application command center — resume tailoring, A–F grading against real postings, cover letters, interview prep, and multi-board job search. Built to do what the paid "beat the ATS" services do, without the subscription, the upsells, or uploading your work history to someone else's server.

## Two ways to run it

**Full app (recommended):** double-click **`Start ResumeForge.command`** (Mac — needs a free one-time [Node.js](https://nodejs.org) install), or run `node server.js`. It opens at `http://127.0.0.1:7777` and unlocks job-board search and the browser button. Keep the terminal window open while you use it.

**Quick mode:** open `index.html` directly in any browser. Everything works except job search (no server = no way to call the job boards).

Either way there's no account and no internet requirement beyond the job-board searches themselves. Data saves automatically in the browser; use **Backup**/**Restore** for copies. Note: quick mode and app mode keep separate data — pick one, or move data between them with Backup/Restore.

## The workflow

1. **Master Profile** — enter the full work history once: every job, every accomplishment bullet, all skills.
2. **Find Jobs** — search several boards at once; every result is auto-graded against the master resume so you apply where you'll actually rank. For **Indeed & LinkedIn** (no public APIs exist — anyone claiming otherwise is scraping), drag the **📋 Grade in ResumeForge** button to your bookmarks bar; clicking it on any posting beams that job into the app, analyzed and graded.
3. **Jobs & Tailoring** — each application gets an **A–F grade** with subscores (keyword match, title alignment, skills-list coverage, quantified bullets, ATS audit). The analyzer detects the posting's *Requirements* section and flags those keywords with ★ — missing required terms hurt the grade most. Click missing keywords to add them (only if true!), reword bullets to mirror the posting, and watch the grade climb. Then generate the **cover letter** and review the **interview prep sheet**.
4. **Preview & Export** — ATS-safe single-column layout → PDF (print dialog), Word .doc, plain text, or clipboard, with auto-suggested file names like `Jane-Doe-Resume-Acme.pdf`.
5. **Apply Kit** — per job: open the posting, copy the tailored resume, copy the cover letter. A genuinely tailored application in about two minutes.

## Job board connections

| Source | Coverage | Setup |
|---|---|---|
| Adzuna | Aggregates Indeed, Monster, CareerBuilder & more | Free key at developer.adzuna.com |
| Jooble | Large aggregator | Free key at jooble.org/api/about |
| USAJobs | US government jobs | Free key at developer.usajobs.gov |
| Remotive / RemoteOK / Arbeitnow | Remote-work boards | None — works out of the box |
| Indeed, LinkedIn, company sites | Anything you can open in a browser | The 📋 bookmarklet |

Keys are entered on the Find Jobs tab and stored only on your computer.

## Why no auto-apply bot

Bots that log into Indeed/LinkedIn and mass-apply violate their terms of service, get accounts banned, and some ATS flag bot-submitted applications. Mass-applying also underperforms targeted applying. The Apply Kit gets a real, tailored application down to ~2 minutes — that's the honest version of "apply for me," and it converts better.

## How ATS actually work (the 2-minute truth)

Most applicant tracking systems **don't auto-reject anyone**. They're searchable databases. A recruiter with 400 applicants searches terms from their own job posting; resumes containing those terms rank up, the rest are never seen. So:

1. **Mirror the posting's exact words** — especially anything under "Requirements" (the ★ keywords).
2. **Put the target job title in your summary** — title searches are the most common search.
3. **Keep formatting dead simple** — every export here is single-column and parse-safe by construction.
4. **Apply in the first 2–3 days** of a posting. Recency matters enormously.
5. **Quantify bullets** — numbers make recruiters stop scrolling.
6. **Tailor every application.** Ten tailored beats fifty generic; this makes tailoring take ~10 minutes.

## Tech notes

- `index.html` — the entire frontend: vanilla JS, zero dependencies. Data in `localStorage` (`resumeforge_v1`).
- `server.js` — zero-dependency Node server: serves the app, receives bookmarklet clips (`POST /api/clip`), and proxies job-board APIs (`GET /api/search`) so the browser isn't blocked by CORS. Binds to 127.0.0.1 only — nothing is exposed to the network.
- Keyword engine: ~350-term curated skills dictionary (multi-word phrase matching) + n-gram frequency extraction, with required-section detection and weighting; light suffix-tolerant matching against the resume text.
- Grade: weighted composite — keywords 55%, title alignment 12%, skills-list coverage 11%, quantified bullets 11%, ATS audit 11%.
