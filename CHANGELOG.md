# Change Log

All notable changes to TELEMAC-MASCARET Language Support are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/).

## [1.0.2] - 2026-10-20

### Changed

- The author's GitHub account was renamed to `alphavarez`; repository, issues
  and homepage links now point to
  `alphavarez/telemac-mascaret-language-support`.

## [1.0.1] - 2026-10-20

### Fixed

- Repository, issues and homepage links pointed to a non-existent GitHub
  account. They were changed to the author's account at the time
  (`aldougke`).

## [1.0.0] - 2026-10-20

First release as an independent extension (`alphavarez.telemac-mascaret`).

### Added

- Complete TELEMAC-MASCARET v8p4 keyword reference for 11 modules (2,049
  keywords): TELEMAC-2D, TELEMAC-3D, Sisyphe, Gaia, Khione, Tomawac, Waqtel,
  Artemis, Postel3D, Stbtel and Mascaret (including Tracer and Courlis). Works
  without a local installation and on any operating system.
- Keyword categories in the hover, taken from the reference manuals.
- Keyword resolution across all modules, plus module detection from the file
  name (`t2d_*`, `sis_*`, `gai_*`, `courlis_*`, `<module>.dico`, ...).
- `scripts/gen_dico.py` to regenerate the dictionaries from new reference
  manuals, and `pnpm run verify-dico` to check them with the extension's parser.
- Extension icon.

### Changed

- New identity: name `telemac-mascaret`, publisher `alphavarez`, display name
  "TELEMAC-MASCARET Language Support".
- Settings and command moved to the `telemacMascaret.*` namespace
  (`telemacMascaret.telemacDirectory`, `telemacMascaret.additionalDicoFiles`,
  `TELEMAC-MASCARET: Reload DICO files`), so this extension can be installed
  next to the original without conflicts.
- A local installation set in `telemacMascaret.telemacDirectory` takes
  precedence over the bundled reference.

### Fixed

- DICO parser now handles French type names (`CARACTERE`), help text wrapped
  over several lines, entries without categories, empty English help (falls
  back to French), stray whitespace in arrays and non-standard `SUBMIT` values.
- A malformed last entry no longer aborts loading the whole dictionary.

## Development history

This project started from
[telemac-language-support](https://github.com/Pasu4/telemac-language-support)
0.1.2 by Pasu4 (MIT). Intermediate builds 0.2.0 and 0.3.0 were made under the
original identifier before the project became independent; their changes are
included in 1.0.0 above.
