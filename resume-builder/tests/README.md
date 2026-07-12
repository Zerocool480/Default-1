# ResumeForge verification suite

The same battery that validated the app during development. Run it after any change.

One-time setup (from the `resume-builder/` folder):

    npm install --no-save playwright
    npx playwright install chromium

Run everything:

    node server.js &                # smoke suite needs the app served
    node tests/smoke.mjs            # 35 end-to-end checks in a real browser
    node tests/gauntlet.mjs tests/corpus.json   # 30-posting engine torture test
                                     # + 14 matcher precision traps + 8 regression traps

`gauntlet.mjs` accepts an optional second argument: a ResumeForge backup JSON to
grade the corpus against a real profile instead of an empty one.

Exit code 0 = everything passed. Any confirmed bug from the three audit rounds
is encoded here as a permanent trap — if one of these ever fails, a fixed bug
has come back.
