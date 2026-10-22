# Change Log

All notable changes to TELEMAC-MASCARET Language Support are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/).

## [1.1.0] - 2026-10-22

### Added

- TELEMAC-MASCARET **v9.1.2** dictionaries (default) next to **v8p4**, both the
  official `.dico` files from the release tags `v9.1.2` and `v8p4r1`.
- `telemacMascaret.version` setting (`9.1.2`, `8p4`, `installation`) and a
  status bar item with a version picker.
- Allowed values in the hover, plus the meaning of the value currently written
  (e.g. `4` = MANNING) and the dictionary range when there is one.
- Value completion after `=`/`:`: numbered options with labels, quoted file
  formats, YES/NO (OUI/NON for French keywords), output variable codes; the
  default value is preselected.
- Error checking:
  - unknown keywords (with a "did you mean" quick fix, and a note when the
    keyword exists in the other bundled version);
  - keywords of another module;
  - values outside the allowed options;
  - wrong value types;
  - missing values;
  - unquoted strings with spaces;
  - unclosed strings;
  - values past column 72.

  Duplicated keywords and values outside the dictionary range are reported as
  information. Settings `telemacMascaret.diagnostics.enabled` and
  `.maxLineLength` control the checks. Validated on the 1,535 steering files of
  the official v9.1.2 and v8p4 examples.
- Steering-file parser following the TELEMAC syntax rules:
  - comments between two `/`;
  - values continued on the next lines;
  - several keywords on one line;
  - apostrophes in French keyword names;
  - `&FIN`.
- `installation` mode reads `$HOMETEL` when no directory is set; `~` is
  expanded in paths.
- `scripts/export_dico.sh` to export the dictionaries of any release from a
  TELEMAC-MASCARET git clone, and `verify-corpus` scripts to run the checks
  over a folder of real steering files.
- Module detection for `ice_` (KHIONE) and `p3d_` (POSTEL-3D) files and from
  parent folder names; indexed MASCARET keywords (`LOI CONC 1 NOM` for
  `LOI CONC x NOM`).

### Changed

- To use a local installation, set `telemacMascaret.version` to
  `installation` (or pick "Local installation" from the status bar). In 1.0.x
  setting `telemacMascaret.telemacDirectory` was enough; now the bundled 9.1.2
  dictionaries are used unless `installation` is selected.
- Hover and completion work on any keyword line (indented, `:` separator, value
  on the next line), not only on lines starting with the keyword.
- Help text: LaTeX is converted to Markdown (lists, `\telkey`, module names,
  Greek letters and math such as k-ε or ν̃); French keywords show the French
  help.
- Keyword lookup ignores case and extra spaces.

### Fixed

- Lists written over several lines in DICO files (allowed values, defaults)
  were cut after the first line.
- `APPARENCE` was never read.
- Switching versions could leave keywords of the previous version loaded.
- About 1,000 spurious warnings per load from over-strict checks of SUBMIT
  and category fields.

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
