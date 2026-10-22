# TELEMAC-MASCARET Language Support

Hover documentation, keyword and value completion, error checking and syntax
highlighting for TELEMAC-MASCARET steering files (`.cas`) and dictionaries
(`.dico`) in Visual Studio Code.

The official dictionaries of **TELEMAC-MASCARET v9.1.2** (default) and **v8p4**
are bundled, so everything works on Windows, Linux and macOS with or without a
local installation. You can also point the extension at your own installation.

## Features

- **Hover documentation.** Hover a keyword to see its module, type, French
  name, Fortran variable, default value, category, the **allowed values** and
  the description from the reference manual. When the keyword already has a
  value, the hover tells you what it means, e.g. `LAW OF BOTTOM FRICTION = 4`
  shows *Current value: 4 MANNING*. Keywords written in French show the French
  help text.
- **Keyword completion.** Start typing at the beginning of a line to get the
  English and French keyword names of the module.
- **Value completion.** After `=` or `:`, get the allowed values of the
  keyword: numbered options with their meaning (`4` MANNING), file formats
  (`'SERAFIN'`, `'MED'`), `YES`/`NO` (or `OUI`/`NON` for French keywords) and
  output variable codes (`U`, `V`, `H`…) inside `'U,V,H'`. The default value is
  marked and preselected.
- **Error checking** as you type:
  - unknown keywords, with a "did you mean" suggestion and a quick fix;
  - keywords that exist in the other version: "removed or renamed since v9" or
    "added in v9.1.2";
  - keywords that belong to another module;
  - values that are not among the allowed options;
  - wrong value types (integer, real, logical);
  - missing values;
  - unquoted strings with spaces;
  - unclosed strings;
  - values written past column 72, the limit of a steering-file line (comments
    may go beyond).

  Duplicated keywords and values outside the range given in the dictionary are
  reported as information.
- **Version switcher.** The TELEMAC version in use is shown in the status bar;
  click it to switch between v9.1.2, v8p4 and your local installation.
- **Module detection** from the file name, using the prefixes of the official
  examples:

  | Prefix | Module |
  | --- | --- |
  | `t2d_` | TELEMAC-2D |
  | `t3d_` | TELEMAC-3D |
  | `gai_` | GAIA |
  | `sis_` | SISYPHE |
  | `tom_` | TOMAWAC |
  | `art_` | ARTEMIS |
  | `waq_` | WAQTEL |
  | `ice_` | KHIONE |
  | `p3d_` | POSTEL-3D |
  | `stb_` | STBTEL |
  | `courlis` | MASCARET |

  A file or parent folder named after a module also works (`telemac2d.dico`,
  `my_gaia_case.cas`, `gaia/run.cas`). When the module cannot be inferred,
  keywords of every module are accepted.
- **Syntax highlighting**, with a ruler at column 72.

The checks follow the steering-file syntax of the TELEMAC-2D user manual:

- `=` or `:` as separator, and the value may continue on the next lines;
- `;` between list values;
- strings between apostrophes;
- `.` or `,` as decimal point;
- comments between two `/`;
- `&FIN` ends the file.

## Tested against the official examples

The checks were run on all 1,535 steering files of the official examples of
both releases.

| Release | Files | Without findings |
| --- | ---: | ---: |
| v9.1.2 | 830 | 815 |
| v8p4 | 705 | 696 |

The remaining findings are genuine:

- example files that still use `COMPUTATION CONTINUED`, which was removed from
  TELEMAC-2D in v9;
- a keyword that exists in neither dictionary;
- a value past column 72;
- keywords set twice.

Hover and completion were also run on all 48,634 keyword lines without errors.

## Bundled dictionaries

The `.dico` files are copied unmodified from the official release tags.

| Module | v9.1.2 | v8p4 |
| --- | ---: | ---: |
| TELEMAC-2D | 386 | 376 |
| TELEMAC-3D | 367 | 348 |
| MASCARET (incl. Tracer and Courlis) | 367 | 360 |
| TOMAWAC | 224 | 209 |
| GAIA | 150 | 146 |
| KHIONE | 133 | 133 |
| ARTEMIS | 118 | 118 |
| WAQTEL | 93 | 91 |
| STBTEL | 56 | 56 |
| POSTEL-3D | 38 | 38 |
| SISYPHE | — | 174 |
| **Total** | **1,932** | **2,049** |

SISYPHE was removed in v9 (GAIA replaces it). A SISYPHE steering file opened
with v9.1.2 selected shows a notice suggesting v8p4.

## Settings

| Setting | Description |
| --- | --- |
| `telemacMascaret.version` | `9.1.2` (default), `8p4`, or `installation`. Also changed from the status bar. |
| `telemacMascaret.telemacDirectory` | Root folder of your installation (the one containing `sources/`), e.g. `~/telemac/source` or `C:\Program Files\TELEMAC\V9P1`. Used with `installation`. If empty, `$HOMETEL` is used when VS Code was started from a terminal with the TELEMAC environment loaded, then the default Windows location. Modules missing from the installation fall back to the bundled v9.1.2. |
| `telemacMascaret.additionalDicoFiles` | Extra DICO files to load, e.g. a customised dictionary. |
| `telemacMascaret.diagnostics.enabled` | Turn error checking on or off (default on). |
| `telemacMascaret.diagnostics.maxLineLength` | Maximum line length (default 72; `0` turns the check off). |

Commands: **TELEMAC-MASCARET: Select TELEMAC version** and
**TELEMAC-MASCARET: Reload DICO files**.

## Updating the dictionaries for a new release

From a git clone of the official repository:

```
git -C ~/telemac/source fetch --tags
scripts/export_dico.sh v9.1.2 dico/9.1.2 ~/telemac/source
pnpm run verify-dico
```

`verify-dico` loads every bundled dictionary with the extension's own parser
and checks that all keywords, options and help texts are read.
`scripts/gen_dico.py` can instead rebuild a dictionary from a Reference Manual
PDF when no clone is available.

## Development

```
pnpm install
pnpm run compile        # type-check, lint and build
pnpm run verify-dico    # dictionary checks
pnpm run verify-ext     # activation, loading, hover, completion and checks (no VS Code needed)
pnpm run verify-corpus <folder of .cas files> 9.1.2   # findings on real steering files
pnpm test               # end-to-end tests in a real VS Code instance
npx @vscode/vsce package --no-dependencies
```

## Credits

This extension started from
[telemac-language-support](https://github.com/Pasu4/telemac-language-support)
by Pasu4 (MIT licence), which provided the original syntax grammar, DICO parser
and hover/completion providers. This version adds the bundled dictionaries for
two releases, the steering-file parser, value completion, error checking, the
version switcher and the dictionary tooling.

TELEMAC-MASCARET is developed by the TELEMAC-MASCARET Consortium
(<https://www.opentelemac.org>). This extension is an independent project and is
not affiliated with or endorsed by the Consortium. The extension collects no
telemetry.

## License

- Extension source code: [MIT](LICENSE).
- Bundled dictionaries (`dico/`): official TELEMAC-MASCARET files, distributed
  under the [GNU GPL v3](dico/COPYING).

See [LICENSE](LICENSE) for details.
