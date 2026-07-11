# ResumeForge

A private, free resume tailoring tool — built to do what the paid "beat the ATS" services do, without the subscription, the upsells, or uploading your work history to someone else's server.

## How to use it

Open `index.html` in any browser. That's it — no install, no account, no internet needed. Everything saves automatically to the browser you're using (use the **Backup** button to download a copy of your data, **Restore** to load it on another computer).

The workflow is the three tabs, in order:

1. **Master Profile** — enter your full work history once. Every job, every accomplishment bullet you can think of, all your skills. This is your source of truth; you never retype it.
2. **Jobs & Tailoring** — for each job you apply to: paste the full posting, click **Analyze**, and you get a match score plus the exact keywords the posting uses that your resume is missing. Click a missing keyword to add it (only if it's true!), reword bullets to mirror the posting's language, untick irrelevant old jobs. The score updates as you go.
3. **Preview & Export** — see the final document, run the ATS/quality audit, then export: **PDF** (via print dialog), **Word .doc**, **plain text** (for those "paste your resume" forms), or copy to clipboard. File names are auto-suggested like `Jane-Doe-Resume-Acme.pdf`.

Each job also gets two bonus tools on the Jobs tab once you've analyzed the posting:

- **Cover letter generator** — drafts a letter from your tailored resume and the posting's top keywords (your real accomplishments, the posting's language). Edit it, copy it, or download it as a Word doc.
- **Interview prep sheet** — the keywords to say out loud, the questions to expect (including one per top keyword), and your quantified bullets to rehearse as short situation → action → result stories. One click copies the whole sheet to bring with you.

## Why this beats the paid services

- **Same core tech.** The "AI resume optimization" those sites sell is mostly keyword extraction from the posting + coverage scoring + formatting rules. That's exactly what this does, transparently.
- **Private.** Job hunting data (salary history, employers, contact info) never leaves your machine. The paid sites store and monetize it.
- **ATS-safe by construction.** Every export is single-column, standard headings, real text, no tables/graphics/headers-footers — the format that parses cleanly in Workday, Greenhouse, Lever, iCIMS, Taleo, etc. You can't accidentally break it.
- **Honest.** It won't stuff white-text keywords or lie for you (that backfires in interviews and some ATS flag it). It shows you what the posting asks for and helps you say it truthfully.

## How ATS actually work (the 2-minute truth)

Most applicant tracking systems **don't auto-reject anyone**. They're searchable databases. A recruiter with 400 applicants searches terms from their own job posting; resumes containing those terms rank up, the rest are never seen. So:

1. **Mirror the posting's exact words** — "patient scheduling" if they say "patient scheduling," not a synonym.
2. **Put the target job title in your summary** — title searches are the most common search.
3. **Keep formatting dead simple** — fancy templates lose data in parsing.
4. **Apply in the first 2–3 days** of a posting. Recency matters enormously.
5. **Quantify bullets** — numbers make recruiters stop scrolling.
6. **Tailor every single application.** Ten tailored applications beat fifty copies of one generic resume. This tool makes that take ~10 minutes instead of an hour.

## Tech notes

Single self-contained HTML file (vanilla JS, zero dependencies). Data lives in `localStorage` under the key `resumeforge_v1`. The keyword engine combines a ~350-term curated skills dictionary (multi-word phrase matching) with frequency-based n-gram extraction from the posting, weighted scoring, and light suffix-tolerant matching against the resume text.
