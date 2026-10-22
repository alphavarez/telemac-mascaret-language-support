// Checks every bundled dictionary with the extension's own parser.
import * as fs from 'fs';
import * as path from 'path';
import { BUNDLED_VERSIONS, DicoModule, getChoices, getEntryDetails, parseDico } from '../src/dico';
import { GLOBALS } from '../src/globals';

const logged: string[] = [];
GLOBALS.outputChannel = {
    error: (m: string) => logged.push('ERROR ' + m), warn: (m: string) => logged.push('WARN ' + m),
    trace: () => {}, info: () => {}, show: () => {},
} as unknown as typeof GLOBALS.outputChannel;

let failures = 0;
const check = (ok: boolean, msg: string, detail = '') => {
    console.log(`  ${ok ? '✓' : '✗'} ${msg}${!ok && detail ? '\n      ' + detail : ''}`);
    if (!ok) failures++;
};
const root = path.join(__dirname, '..', 'dico');
const parsed: Record<string, Record<string, ReturnType<typeof parseDico>>> = {};

for (const version of BUNDLED_VERSIONS) {
    console.log(`--- ${version}: parse completeness ---`);
    parsed[version] = {};
    let total = 0;
    for (const module of Object.values(DicoModule)) {
        const file = path.join(root, version, `${module.toLowerCase()}.dico`);
        if (!fs.existsSync(file)) {
            check(version === '9.1.2' && module === DicoModule.Sisyphe, `${module}: not bundled${module === DicoModule.Sisyphe ? ' (removed in v9)' : ''}`);
            continue;
        }
        const text = fs.readFileSync(file, 'utf8');
        const expected = (text.match(/^NOM1\s*=/gm) ?? []).length;
        const before = logged.length;
        const entries = parseDico(text);
        parsed[version][module] = entries;
        total += entries.length;
        const bad = entries.filter(e => !e.nameEnglish || !e.nameFrench || !e.type || !e.helpEnglish);
        check(entries.length === expected && bad.length === 0 && logged.length === before,
            `${module.padEnd(10)} ${String(entries.length).padStart(4)}/${expected}  malformed=${bad.length} logged=${logged.length - before}`,
            logged.slice(before, before + 2).join(' | '));
    }
    console.log(`  total: ${total} keywords`);
}

console.log('\n--- Allowed-value lists are complete ---');
for (const version of BUNDLED_VERSIONS) {
    let fields = 0;
    let options = 0;
    let rawOptions = 0;
    let withChoices = 0;
    for (const module of Object.values(DicoModule)) {
        const file = path.join(root, version, `${module.toLowerCase()}.dico`);
        if (!fs.existsSync(file))
            continue;
        // Raw count: quoted items in each CHOIX1 field, which runs until the next field.
        const text = fs.readFileSync(file, 'utf8');
        for (const m of text.matchAll(/^CHOIX1\s*=([\s\S]*?)(?=^\s*[A-Z][A-Z0-9]*\s*=|^\/|^&)/gm)) {
            fields++;
            rawOptions += (m[1].match(/'(?:[^']|'')*'/g) ?? []).length;
        }
        for (const e of parsed[version][module]) {
            if (e.choiceEnglish) {
                withChoices++;
                options += getChoices(e).length;
            }
        }
    }
    check(withChoices === fields && options === rawOptions, `${version}: ${withChoices}/${fields} keywords with options, ${options}/${rawOptions} options read`);
}

console.log('\n--- Help text (LaTeX converted) ---');
let residue = 0;
for (const v of Object.values(parsed))
    for (const list of Object.values(v))
        for (const e of list)
            for (const t of [e.helpEnglish, e.helpFrench])
                if (/\\(?!\*)|[{}$]|\\item|\\begin/.test(t))
                    residue++;
check(residue === 0, `no LaTeX left in ${Object.values(parsed).flatMap(v => Object.values(v)).flat().length * 2} help texts`, `${residue} with residue`);

console.log('\n--- Allowed values and hover (9.1.2) ---');
const t2d = parsed['9.1.2'][DicoModule.Telemac2d];
const friction = t2d.find(e => e.nameEnglish === 'LAW OF BOTTOM FRICTION');
const choices = friction ? getChoices(friction) : [];
check(choices.length === 7 && choices[4].value === '4' && choices[4].label === 'MANNING', 'LAW OF BOTTOM FRICTION choices: 0..6, 4 = MANNING', JSON.stringify(choices));
check(friction ? getChoices(friction, true)[0].label === 'PAS DE FROTTEMENT' : false, 'French choices from CHOIX');
const md = friction ? getEntryDetails(friction, DicoModule.Telemac2d, { currentValue: '4' }).value : '';
check(md.includes('**Current value:** `4` MANNING') && md.includes('- `4` MANNING') && md.includes('HYDRO › PHYSICAL PARAMETERS HYDRO › FRICTION'),
    'hover shows current value, allowed values and category', md.slice(0, 300));
const geoFormat = t2d.find(e => e.nameEnglish === 'GEOMETRY FILE FORMAT');
check(geoFormat ? getChoices(geoFormat).map(c => c.value).join(',') === 'SERAFIN,SERAFIND,MED' : false, 'GEOMETRY FILE FORMAT choices: SERAFIN, SERAFIND, MED');
const withRange = Object.values(parsed['9.1.2']).flat().filter(e => e.rangeMin !== undefined);
check(withRange.length > 0, `CONTROLE ranges parsed (${withRange.length} keywords)`);
const lists = t2d.filter(e => e.appearance.includes('DYNLIST'));
check(lists.length > 0, `APPARENCE parsed (${lists.length} TELEMAC-2D keywords are DYNLIST)`);

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'}`);
process.exit(failures === 0 ? 0 : 1);
