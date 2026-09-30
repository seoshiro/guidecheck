# GuideCheck validation record

Release work checked on 30 September 2026 using Node 24.19.0, pnpm 11.19.0, React 19, TypeScript and Vite 7. The optional local edition uses Node's built-in SQLite; the public edition is static and uses private browser IndexedDB. All fixtures and test observations are original synthetic examples. Other projects and their data were not edited.

## Local release checks

### Version 0.2 follow-up

The clean-install follow-up passed ESLint, TypeScript, Prettier, **18 domain/API/localization tests**, both production builds and isolated production-server restart checks. **4 local SQLite browser scenarios** and **26 public/static Edge browser tests** passed on the final source, including 168 multilingual layout observations at 320/360/390/414/768/1280/1440px in portrait and landscape. The production dependency advisory audit reported no known vulnerabilities at this snapshot. A source-only clean copy used frozen dependencies with lifecycle scripts disabled; no user database or credentials were copied.

The independent gpt-6.1-sol/xhigh live audit reproduced eight asynchronous/backup/history defects against the prior public build. Fixes, two additional stale-read/history recovery regressions, complete control coverage and realistic limitations are recorded in [QA.md](QA.md). EN/RU/KK interface copy has 338 dictionary entries; static-key coverage, placeholders, Unicode, counts and dynamic validation are tested. User-authored content and schema keys stay unchanged. Four updated real screenshots show the final rendered interface. [Third-party notices](THIRD_PARTY_NOTICES.md) record bundled fonts/icons and their licenses.

These checks validate local implementation. Exact-commit remote CI, Pages deployment and subsequent live checks are supplied with the release handoff only after they succeed. Professional native-language review, real mobile hardware, Safari and assistive-technology user studies remain unperformed.

### Initial version 0.1 release

- TypeScript, ESLint, Prettier, production builds for both architectures, and production dependency audit passed. The audit reported no known production dependency vulnerabilities at this snapshot; it does not guarantee vulnerability-free software.
- **13 domain/API tests passed.** Coverage includes stable-ID diffs across title/text/links/screenshots/order/add/remove, bounded word diff, documented Markdown/JSON parsing and round trips, malformed/unsafe imports, version history, evidence validation, original timestamp inheritance, context invalidation, stale writes, identical-version rejection, SQLite close/reopen, HTTP exports and complete backup/restore, cross-origin rejection, malformed paths and requests. A near-limit workspace backup checks consistent export/restore byte limits. Invalid inherited evidence and blank reviewer observations are rejected.
- **4 local browser scenarios passed** using isolated Microsoft Edge contexts and a temporary SQLite database. Covered empty/error states, complete import/revision/review/correction/screenshot/export flow, tested and needs-update observations, reload, preserved history, historical read-only behavior, search/filter empty states, actual file imports, invalid screenshot handling, native-dialog keyboard interaction, and responsive widths from 375 to 1440px.
- **5 public browser scenarios passed** on the static build. Covered private import/revision/review, portable exports and complete backup/restore, reload, actual browser-process restart, separate visitors, unavailable IndexedDB, malformed backup rejection, responsive widths, Escape/focus return, and overlapping backup file reads. Synthetic imports caused no non-GET network requests and no runtime errors in the golden path.
- Automated axe WCAG A/AA checks cover the workspace, backup, import, correction, and history views. Contrast issues were fixed rather than suppressed. These checks supplement functional keyboard tests; they are not full accessibility certification or a screen-reader study.
- Production integration terminated and restarted an isolated local server, verifying unchanged SQLite guide/review data, report export, security headers and malformed-path survival. Machine-readable evidence: `evidence/production-restart.json`.
- Screenshot capture uses a fresh isolated browser context and labelled demo data. `evidence/guidecheck-desktop.png` and `evidence/guidecheck-mobile.png` show real rendered UI. `evidence/preview-check.json` records the capture URL and checks; it is not a customer study.

## Independent review

The independent reviewer used **gpt-6.1-sol / xhigh**, read local source, and made no edits or remote writes. Initial local review found malformed-URL handling, enum validation, Markdown reference fidelity, modal backdrop, and accessible selected-state issues; these were fixed with regression coverage. Public release review found three backup issues: missing required evidence/inheritance consistency, mismatched serialized byte limits, and overlapping file-selection reads. All three were fixed and covered by regression tests. Follow-up source review found no remaining release blocker; remote CI and deployment still require their own verification.

## Publication and execution boundaries

The intended public repository is [seoshiro/guidecheck](https://github.com/seoshiro/guidecheck); the static destination is [GitHub Pages](https://seoshiro.github.io/guidecheck/). The release workflow verifies the exact commit before deploying only `dist-browser/`. The `guidecheck-build` HTML meta tag identifies the deployed SHA. Actual remote run and deployment outcomes are supplied in the release handoff rather than predicted here.

Only reviewed product files and synthetic fixtures are published. SQLite files, user workspaces/backups, logs, installed dependencies and test output are excluded. Existing authorized GitHub access is reused; no new login, token, OAuth grant, billing activation, paid API, or hosted database is required. The workflow uses standard public-repository runners and a small one-day Pages artifact. All checks use synthetic data.

The sandbox cannot read some installed dependency files, so authorized checks use auto-reviewed execution escalation. An earlier optional `21st review` CLI action was rejected by automatic approval review because it might disclose source externally. It was not retried. Metadata-only design search, independent local review, local checks and browser inspection supplied the review path.

## Limits and assumptions

Tests establish implementation behavior, not customer demand, willingness to pay, retention, procedure validity, reviewer identity, or suitability for sensitive team data. Review evidence is self-reported, editable through backup files, and not tamper-proof. Timestamps use a device clock. Carried evidence is not a new test. No automatic link checks, image interpretation, procedure execution, or freshness expiry occurs.

The public edition has no login, cloud sync, encrypted storage or server backup. Browser storage can be cleared or evicted; keep complete backups. Other `seoshiro.github.io` repository sites share the same origin and therefore the storage trust boundary. Namespacing prevents collisions, not deliberate same-origin access. No origin-wide clearing or service worker is installed. The local loopback edition is the alternative for sensitive documents.

Markdown has a documented restricted format. JSON is the lossless guide-content interchange. Image validation checks size and basic signatures rather than fully decoding/scanning. Browsers, screen readers, interrupted writes under device failure, long-term backup recovery, maximum-size interactive workloads and collaborative authorization have not been exhaustively studied. GitHub Pages availability and free quotas follow the provider's current rules; this is a portfolio tool, not a commercial SaaS hosting arrangement.
