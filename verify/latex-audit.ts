// Audits the LaTeX -> Markdown conversion over every help text and choice label.
import * as fs from 'fs';
import * as path from 'path';
import { parseDico, getChoices } from '../src/dico';
import { GLOBALS } from '../src/globals';
GLOBALS.outputChannel = { error: () => {}, warn: () => {}, info: () => {}, show: () => {}, trace: () => {} } as unknown as typeof GLOBALS.outputChannel;
const dir = process.argv[2];
const residue: Record<string, number> = { backslash: 0, brace: 0, dollar: 0, beginEnd: 0 };
const samples: Record<string, string[]> = { backslash: [], brace: [], dollar: [], beginEnd: [] };
let texts = 0;
for (const v of fs.readdirSync(dir)) {
    for (const f of fs.readdirSync(path.join(dir, v)).filter(x => x.endsWith('.dico'))) {
        for (const e of parseDico(fs.readFileSync(path.join(dir, v, f), 'utf8'))) {
            for (const t of [e.helpEnglish, e.helpFrench]) {
                texts++;
                const checks: [string, RegExp][] = [['backslash', /\\(?![*])/], ['brace', /[{}]/], ['dollar', /\$/], ['beginEnd', /begin|\\item/]];
                for (const [k, rx] of checks) if (rx.test(t)) { residue[k]++; if (samples[k].length < 3) samples[k].push(`${v}/${f} ${e.nameEnglish}: …${t.slice(Math.max(0, t.search(rx) - 60), t.search(rx) + 60).replace(/\n/g, '⏎')}…`); }
            }
            void getChoices(e);
        }
    }
}
console.log(`help texts checked: ${texts}`, residue);
for (const k of Object.keys(samples)) samples[k].forEach(s => console.log(`  [${k}] ${s}`));
// Show a few converted examples
const t2d = parseDico(fs.readFileSync(path.join(dir, 'v9.1.2', 'telemac2d.dico'), 'utf8'));
for (const name of ['LAW OF BOTTOM FRICTION', 'VARIABLES FOR GRAPHIC PRINTOUTS', 'TURBULENCE MODEL', 'CORIOLIS COEFFICIENT']) {
    const e = t2d.find(x => x.nameEnglish === name);
    console.log(`\n=== ${name} ===\n${e?.helpEnglish.slice(0, 700)}`);
}
