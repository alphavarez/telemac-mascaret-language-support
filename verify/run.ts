import * as fs from 'fs';
import * as path from 'path';
import { parseDico, getEntryDetails, dicoEntries, findDicoEntries, detectModule, DicoModule } from '../src/dico';
import { GLOBALS } from '../src/globals';

const logged: string[] = [];
GLOBALS.outputChannel = {
    error: (m: string) => logged.push('ERROR ' + m), warn: (m: string) => logged.push('WARN ' + m),
    info: () => {}, show: () => {},
} as unknown as typeof GLOBALS.outputChannel;

let failures = 0;
const fail = (msg: string) => { failures++; console.log('  ✗ ' + msg); };
const dicoDir = path.join(__dirname, '..', 'dico');

// 1. Every bundled dictionary parses completely with the real parser.
console.log('--- Parse completeness (real parser) ---');
let total = 0;
for (const module of Object.values(DicoModule)) {
    const file = path.join(dicoDir, `${module.toLowerCase()}.dico`);
    if (!fs.existsSync(file)) { fail(`${module}: no bundled dico`); continue; }
    const text = fs.readFileSync(file, 'utf8');
    const expected = (text.match(/^NOM1 = /gm) ?? []).length;
    const before = logged.length;
    const entries = parseDico(text);
    dicoEntries[module] = entries;
    total += entries.length;
    const bad = entries.filter(e => !e.nameEnglish || !e.nameFrench || !e.type || !e.helpEnglish);
    const errs = logged.length - before;
    const ok = entries.length === expected && bad.length === 0 && errs === 0;
    console.log(`  ${ok ? '✓' : '✗'} ${module.padEnd(10)} ${String(entries.length).padStart(4)}/${expected}  malformed=${bad.length} logged=${errs}`);
    if (!ok) failures++;
}
console.log(`  total keywords loaded: ${total}`);

// 2. Hover rendering: keyword -> expected fragment of the v8p4 manual text.
console.log('\n--- Hover rendering ---');
const hovers: [string, DicoModule, string][] = [
    ['ABSCISSAE OF SOURCES', DicoModule.Telemac2d, 'HYDRO › PHYSICAL PARAMETERS HYDRO › SOURCES'],
    ['1D SPECTRA RESULTS FILE', DicoModule.Tomawac, 'Related keywords'],
    ['ACCURACY OF EPSILON', DicoModule.Telemac2d, 'transport equation'],
    ['FINITE VOLUME SCHEME SPACE ORDER', DicoModule.Telemac2d, ''],
    ['BED-LOAD TRANSPORT FORMULA', DicoModule.Sisyphe, 'transport formulas'],
    ['ACCURACY FOR DIFFUSION OF SUSPENSION', DicoModule.Gaia, 'diffusion of suspension'],
    ['3D RESULTS FILE', DicoModule.Khione, 'ICE PRINTOUT PERIOD'],
    ['ABSCISSE APPORT', DicoModule.Mascaret, 'No help text is given'],
    ['COURLIS OPTION', DicoModule.Mascaret, ''],
    ['3D RESULT FILE', DicoModule.Postel3d, 'TELEMAC-3D run'],
];
for (const [kw, mod, frag] of hovers) {
    const match = findDicoEntries(kw, mod)[0];
    if (!match) { fail(`${kw}: not found`); continue; }
    const md = getEntryDetails(match.entry, match.module).value.replace(/\n+/g, ' ');
    const ok = match.module === mod && (!frag || md.includes(frag));
    console.log(`  ${ok ? '✓' : '✗'} [${match.module}] ${kw}\n      ${md.slice(0, 200)}`);
    if (!ok) failures++;
}

// 3. French-name lookup resolves to the English keyword.
console.log('\n--- French lookup ---');
for (const [fr, en, mod] of [['CONVECTION', 'ADVECTION', DicoModule.Telemac2d], ['FORMULE DE TRANSPORT SOLIDE', 'BED-LOAD TRANSPORT FORMULA', DicoModule.Sisyphe]] as const) {
    const m = findDicoEntries(fr, mod)[0];
    const ok = m?.entry.nameEnglish === en;
    console.log(`  ${ok ? '✓' : '✗'} ${fr} -> ${m?.entry.nameEnglish ?? 'NOT FOUND'}`);
    if (!ok) failures++;
}

// 4. Module detection from file names.
console.log('\n--- Module detection ---');
const doc = (p: string) => ({ uri: { path: p } }) as unknown as Parameters<typeof detectModule>[0];
const cases: [string, DicoModule | null][] = [
    ['/w/t2d_flood.cas', DicoModule.Telemac2d], ['/w/sis_bed.cas', DicoModule.Sisyphe],
    ['/w/gai_sediment.cas', DicoModule.Gaia], ['/w/courlis_case.cas', DicoModule.Mascaret],
    ['/w/telemac3d.dico', DicoModule.Telemac3d], ['/w/khione.dico', DicoModule.Khione],
    ['/w/steering.cas', null],
];
for (const [p, expected] of cases) {
    const got = detectModule(doc(p));
    const ok = got === expected;
    console.log(`  ${ok ? '✓' : '✗'} ${path.basename(p).padEnd(20)} -> ${got ?? '(all modules)'}`);
    if (!ok) failures++;
}

logged.slice(0, 3).forEach(l => console.log("  LOG: " + l.slice(0, 140)));
console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'}`);
process.exit(failures === 0 ? 0 : 1);
