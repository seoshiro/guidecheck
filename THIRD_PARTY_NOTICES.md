# Bundled assets and reuse notices

GuideCheck's product code is covered by the repository's [MIT license](LICENSE). Third-party assets retain their own licenses; a future commercial release must retain the required notices. No paid asset was purchased and no competitor artwork was copied.

| Asset | Primary source and license | Local notice |
| --- | --- | --- |
| IBM Plex Sans variable normal font | [IBM Plex](https://github.com/IBM/plex), [Google Fonts source metadata](https://github.com/google/fonts/blob/main/ofl/ibmplexsans/METADATA.pb). SIL Open Font License 1.1. | [OFL](public/fonts/OFL-IBM-Plex.txt), [download hashes and glyph check](public/fonts/asset-record.json) |
| Lucide authored interface icons | [Official license](https://lucide.dev/license): ISC, with Feather-derived icons retaining MIT terms. Compiled locally from the existing `lucide-react` dependency. | [Lucide](public/licenses/Lucide.txt), [Feather](public/licenses/Feather.txt) |
| React and React DOM | [React license](https://github.com/facebook/react/blob/main/LICENSE): MIT. | [React](public/licenses/React.txt) |

The unmodified font binary is self-hosted (537,244 bytes). Its character map was checked for Latin, Russian and the Kazakh letters Ә Ғ Қ Ң Ө Ұ Ү Һ І and lowercase counterparts. Loading checks and localized browser screenshots supplement that binary check. Font weights use the supplied variable axis; system fallback remains available while loading. There are no runtime font CDN or icon-service requests. OFL permits bundling and commercial use subject to its conditions; do not sell the font by itself or rename modified fonts using the reserved Plex name.

The design research also considered [Phosphor](https://phosphoricons.com/) and [Noto Sans](https://github.com/google/fonts/blob/main/ofl/notosans/METADATA.pb). The final choice keeps one coherent Lucide family for recognizable actions and uses IBM Plex for the technical-document workspace. Decorative shields, oversized icon tiles and the double-check logo were removed. The GC monogram/favicon is original vector artwork. The neutral paper/ink palette, limited blue action color, 4/8px spacing increments, restrained 3–8px radii and readable 14–15px controls are authored product decisions, not assets from another application's design.
