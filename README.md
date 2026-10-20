# TELEMAC-MASCARET Language Support

Hover documentation, keyword completion and syntax highlighting for
TELEMAC-MASCARET steering files (`.cas`) and dictionaries (`.dico`) in
Visual Studio Code.

The complete v8p4 keyword reference is bundled with the extension: 11 modules
and 2,049 keywords. It works out of the box on Windows, Linux and macOS, with or
without a local TELEMAC-MASCARET installation.

## Features

- **Hover documentation.** Hover a keyword to see its module, type, dimension,
  French name, mnemonic (Fortran variable), default value, category and the
  description from the reference manual.
- **Keyword completion.** Start typing at the beginning of a line to get English
  and French keyword names, each with the same documentation attached.
- **Module detection.** The module is inferred from the file name: `t2d_*.cas`,
  `t3d_*.cas`, `sis_*.cas`, `gai_*.cas`, `tom_*.cas`, `art_*.cas`, `waq_*.cas`,
  `khi_*.cas`, `courlis_*.cas`, or a name containing the module
  (`telemac2d.dico`, `my_gaia_case.cas`). If the module cannot be inferred,
  hover searches every module and completion offers all keywords.
- **Syntax highlighting** for steering and dictionary files, with a ruler at
  column 72.

## Bundled reference (v8p4)

Each dictionary was generated from the "Detail list of keywords" chapter of the
module's official v8p4 Reference Manual. Every keyword was cross-checked against
the manual's separate "List of keywords classified according to type" chapter,
which also supplies the category shown in the hover.

| Module | Keywords |
| --- | ---: |
| TELEMAC-2D | 376 |
| TELEMAC-3D | 348 |
| Mascaret (including Tracer and Courlis) | 360 |
| Tomawac | 209 |
| Sisyphe | 174 |
| Gaia | 146 |
| Khione | 133 |
| Artemis | 118 |
| Waqtel | 91 |
| Stbtel | 56 |
| Postel3D | 38 |

The manuals give no description for 202 keywords (163 in Mascaret, 26 in
Khione, 13 in Sisyphe). For those, the hover says so instead of showing an empty
box.

## Settings

| Setting | Description |
| --- | --- |
| `telemacMascaret.telemacDirectory` | Installation directory, e.g. `C:\Program Files\TELEMAC\V8P4`. When set, the DICO files of that installation take precedence over the bundled reference, so another version (v8p5, v9…) shows its own keywords. If empty, the default Windows location is detected automatically. |
| `telemacMascaret.additionalDicoFiles` | Extra DICO files to load, for example a customised dictionary. |

After changing a setting the dictionaries reload automatically. You can also run
**TELEMAC-MASCARET: Reload DICO files** from the Command Palette.

## Regenerating the dictionaries

`scripts/gen_dico.py` rebuilds a dictionary from a Reference Manual, which is
useful when a new TELEMAC-MASCARET release comes out:

```
pdftotext -layout telemac2d_reference_v9.pdf telemac2d.txt
python3 scripts/gen_dico.py telemac2d.txt TELEMAC2D dico/telemac2d.dico
pnpm run verify-dico
```

`verify-dico` loads every bundled dictionary with the extension's own parser and
checks completeness, hover rendering, French-name lookup and module detection.

## Development

```
pnpm install
pnpm run compile        # type-check, lint and build
pnpm run verify-dico    # dictionary checks with the extension's parser
pnpm run verify-ext     # activation, loading, hover and completion (no VS Code needed)
pnpm test               # end-to-end tests in a real VS Code instance
npx @vscode/vsce package --no-dependencies
```

## Credits

This extension started from
[telemac-language-support](https://github.com/Pasu4/telemac-language-support)
by Pasu4 (MIT licence), which provided the original syntax grammar, DICO parser
and hover/completion providers. This version adds the bundled v8p4 reference for
all modules, multi-module keyword resolution and module detection, a more
tolerant DICO parser, keyword categories, and the dictionary generator.

TELEMAC-MASCARET is developed by the TELEMAC-MASCARET Consortium
(<https://www.opentelemac.org>). This extension is an independent project and is
not affiliated with or endorsed by the Consortium. The keyword names and
descriptions come from the openly published v8p4 reference manuals.

## License

- Extension source code: [MIT](LICENSE).
- Bundled keyword dictionaries (`dico/*.dico`): derived from the open-source
  TELEMAC-MASCARET system and distributed under the
  [GNU GPL v3](dico/COPYING).

See [LICENSE](LICENSE) for details.
