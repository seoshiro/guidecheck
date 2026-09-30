# GuideCheck product hypothesis

Research snapshot: 30 September 2026. Sources are public pages; no customer data, application code, or incumbent design assets were copied.

Guidejar's [TrustMRR profile](https://trustmrr.com/startup/guidejar) displayed $4,918 MRR and 210 active subscriptions at the time of this build. The page title showed $5,357 revenue for the last 30 days on this read, compared with $5,337 in the parent's earlier snapshot. These numbers can change and are a signal that teams pay for documentation products, not evidence that they will buy GuideCheck.

Guidejar's [internal-wiki solution page](https://www.guidejar.com/solutions/internal-wiki) explicitly discusses documentation becoming stale and teams being unsure what remains accurate. Its [feature overview](https://www.guidejar.com/features) already advertises extensive capture, editing, AI, sharing/export, analytics, and team capabilities. We have not evaluated its entire application or established that it lacks a maintenance/review feature.

Our independently designed hypothesis is that support teams and technical writers may value a focused maintenance loop for **existing** guides: explicit version comparison, a queue of potential issues, human test observations with environment and time, correction, and portable evidence history. This prototype complements that category rather than cloning Guidejar's capture workflow or assets.

The first validation conversations should test whether teams already maintain review logs, how often procedures change, whether stable-ID Markdown/JSON import fits their documents, who owns retesting, and whether portable evidence reduces review time. Usability tests and code checks cannot establish demand, reliable reviewer identity, procedure validity, willingness to pay, retention, or production readiness for sensitive team data.

The current design uses an original paper/ink document workspace, self-hosted IBM Plex Sans, split comparison panels, amber potential-issue states and purposeful Lucide open-source controls. IBM Plex, Noto Sans and Phosphor's primary sources were reviewed; [asset notices](THIRD_PARTY_NOTICES.md) document the final choice, licenses and actual Kazakh glyph checks. Decorative trust shields and icon tiles were removed. Metadata-only 21st catalog inspiration informed the initial comparison composition. No paid retrieval or hosted AI generation was used, and no incumbent assets were reused.
