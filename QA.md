# GuideCheck 0.2 exploratory QA

Checked 30 September 2026 with original synthetic documents and isolated Edge browser profiles. The initial exploratory audit ran against public build `01a447752a8f826fc4fde8a157f87eb1c831f68a`. The resulting fixes are covered by repeatable browser regressions. This is scoped product QA, not a claim of exhaustive testing or perfection.

## Reproduced defects and resolution

| Reproduction | Fix and regression evidence |
| --- | --- |
| Open two tabs; save a guide in A, download a complete backup in stale B. The old export omits A's guide. | Backup reads the latest atomic IndexedDB snapshot immediately before export. `backup-safe.spec.ts` compares the full exported state with the committed snapshot. |
| Delay `slow.json`, select and preview a faster JSON file, then let the old read finish. The preview and saved content diverge. | Selection generation invalidates older reads and previews. `async-safety.spec.ts` verifies the selected file is both previewed and saved. |
| Select `AUDIT.JSON`. The old dialog chooses Markdown. | Case-insensitive extension selection; uppercase file regression. |
| Delay screenshot reading and immediately save a correction. The attachment is omitted. | Pending reads block save; attachments are retained alongside existing screenshots. |
| Delay a save, cancel, open another import draft. The old completion closes the new dialog. | Mutable fields, close, backdrop and Escape are locked during a pending dialog mutation; duplicate actions are guarded synchronously. |
| A writes while B has a valid draft. B's writes reject safely, but repeated retries cannot recover without closing. | Draft-preserving refresh for import, correction and review; draft download remains available. A changed review version requires explicit retesting of a populated draft. Backup refresh preserves the file and requires replacement confirmation again. |
| Enter new review text while an older save is pending. Completion clears the new text. | Review fields are locked during save. The next draft can be entered after completion. |
| Restore a valid 20,000-review workspace; open History. The old UI creates every article and stalls for about four seconds. | Five versions per page and 25 reviews per version page. Full exports retain every record. Regression restores the supported-size synthetic fixture, reads the next page and compares all exported reviews. |
| A delayed workspace read completes after a newer committed review. The cached UI can move backwards. | All incoming snapshots use a monotonic workspace revision guard. Regression delays the older read and confirms the newer evidence remains visible and survives reload. |
| Restore a shorter compatible history in another tab while on a later history page. | Page bounds clamp to the available history; regression preserves the same guide ID and verifies the remaining version. |
| Paste valid Unicode JSON with 3,104,881 characters but 5,104,881 UTF-8 bytes. The old parser accepts it despite the stated 5 MB import limit. | Pasted and file imports now use the same UTF-8 byte limit. A regression checks oversized rejection and accepted under-limit Unicode content. Existing workspaces and 50 MB backup compatibility remain unchanged. |

Latency injection makes asynchronous defects reproducible; it does not simulate every browser or device failure. Initial large-history measurements and final test timings are machine-specific, not performance guarantees.

## Control coverage

| Area | Checked controls and outcomes |
| --- | --- |
| Public base route and navigation | Initial load, brand, review/history buttons and tabs, guide selection, current-version metric filters, reload, actual browser process restart, document Back/Forward. Views use buttons within one URL; there are no shareable guide routes. |
| Library and queue | Guide/owner search, step/change search, all five filters, matching and empty states, individual step selection, previous/next step, clear-filter action. |
| Comparison | Previous/current version selectors, current and preserved versions, removed/added steps, plain-text word changes, links and screenshots, original timestamps and carried evidence. Links are rendered with their validated destination; no automatic link checking occurs. |
| Import and revisions | Markdown/JSON selection, actual files and pasted source, uppercase extensions, generation races, check-before-save, changed source invalidation, required version note, identical import rejection, import rules, downloadable examples, malformed/empty/oversized/hostile input. |
| Correction | Titles, instructions, references, screenshot description/file/removal, guide title/owner/context, version note, invalid image rejection, pending reads, saved new version and preserved old content. |
| Human review | Tested/Needs update, required reviewer/context/observations, validation, busy controls, repeated/interrupted actions, retained history and conflict recovery. Verification is self-reported. |
| Exports and backup | Selected guide Markdown/JSON, full history JSON, complete backup, fresh cross-tab export, backup file race, malformed backup, explicit restore preview/confirmation, interrupted restore, conflict reconfirmation, error recovery and separate visitor contexts. Stable interchange keys and backup schema remain version 1. |
| Localization | EN/RU/KK selector in workspace and dialogs, persistent preference, `document.lang`, translated errors/help/aria/loading/empty states, local dates/numbers/plurals, switch with an open draft, unchanged user-authored content and schema. |
| Accessibility and responsive layout | Axe WCAG A/AA on workspace/import/correction/backup/history, native-dialog focus return/Escape, visible keyboard rings, 44px action targets, bounded dialogs and intentional internal queues at 320/360/390/414/768/1280/1440px in portrait/landscape. |

The multilingual layout matrix makes 168 workspace/dialog observations (3 languages × 7 widths × 2 orientations × 4 flows), with fonts loaded. Browser emulation is not a real-device study. Safari, native mobile hardware, assistive-technology users and professional native-language review remain untested. The narrow layouts also exercise reflow, but no certification of every browser zoom mode is claimed.

## Persistence and security boundary

The IndexedDB name `guidecheck-private-workspace-v1`, schema version, guide/version/review IDs, original timestamps and backup envelope remain compatible. No origin-wide storage clearing or service worker is installed. Preference storage is separately namespaced as `guidecheck.locale.v1`; it contains only the chosen interface language. Backup files remain editable and unencrypted. Other repository apps under `seoshiro.github.io` share the origin and can deliberately access its storage; namespacing prevents accidental collisions, not origin-level isolation. Different isolated visitor profiles do not share a workspace.

Private guide files are processed locally; the tested public golden path sends no non-GET requests. Font and icon assets are bundled. Network/service availability, browser eviction, disk failure, tampered backups, malicious same-origin apps and long-term retention require additional validation beyond this release.
