// Runs the extension's real activate(), DICO loading, hover and completion code
// against the files on disk, with a file-system-backed vscode stub.
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { activate } from '../src/extension';
import { dicoEntries, DicoModule } from '../src/dico';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const state = (vscode as any).__state;
const root = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const extensionUri = vscode.Uri.file(root);
let failures = 0;
const check = (ok: boolean, msg: string, detail = '') => {
    console.log(`  ${ok ? '✓' : '✗'} ${msg}${!ok && detail ? '\n      ' + detail : ''}`);
    if (!ok) failures++;
};

const doc = (fileName: string, text: string) => {
    const lines = text.split('\n');
    return {
        uri: vscode.Uri.file(path.join(os.tmpdir(), fileName)),
        lineAt: (p: vscode.Position | number) => ({ text: lines[typeof p === 'number' ? p : p.line] }),
    } as unknown as vscode.TextDocument;
};
const hoverText = (fileName: string, line: string, col = 2): string | null => {
    const [, provider] = state.hoverProviders[0];
    const h = provider.provideHover(doc(fileName, line), new vscode.Position(0, col), {});
    return h ? h.contents.value : null;
};
const complete = (fileName: string, line: string): vscode.CompletionItem[] => {
    const [, provider] = state.completionProviders[0];
    return provider.provideCompletionItems(doc(fileName, line), new vscode.Position(0, line.length), {}, {}) ?? [];
};
const counts = () => Object.fromEntries(Object.values(DicoModule).map(m => [m, dicoEntries[m].length]));

async function main() {
    console.log('--- Manifest consistency ---');
    const contributedCmds = pkg.contributes.commands.map((c: { command: string }) => c.command);
    const contributedCfg = Object.keys(pkg.contributes.configuration[0].properties);
    check(pkg.publisher === 'alphavarez' && pkg.name === 'telemac-mascaret', `identity ${pkg.publisher}.${pkg.name}@${pkg.version}`);
    check(fs.existsSync(path.join(root, pkg.icon)), `icon file exists (${pkg.icon})`);

    console.log('\n--- Scenario A: no local installation (bundled reference only) ---');
    const context = { extensionUri, subscriptions: [] as unknown[] } as unknown as vscode.ExtensionContext;
    await activate(context);
    check(contributedCmds.every((c: string) => state.commands.has(c)), `registered commands match package.json (${contributedCmds.join(', ')})`,
        `registered: ${[...state.commands.keys()].join(', ')}`);
    check([...state.configNamespaces].every(ns => ns === 'telemacMascaret'), `settings read from namespace: ${[...state.configNamespaces].join(', ')}`);
    check(contributedCfg.every((k: string) => k.startsWith('telemacMascaret.')), 'contributed settings use telemacMascaret.*');
    check(state.hoverProviders[0]?.[0] === 'casefile' && state.completionProviders[0]?.[0] === 'casefile', 'hover and completion registered for "casefile"');
    const c = counts();
    const total = Object.values(c).reduce((a: number, b) => a + (b as number), 0);
    check(Object.values(c).every(n => (n as number) > 0) && total === 2049, `all 11 modules loaded from bundle, ${total} keywords`, JSON.stringify(c));
    check(state.errors.length === 0, 'no error popups', state.errors.join(' | '));
    const warnsErrs = state.log.filter((l: string[]) => l[0] !== 'info');
    check(warnsErrs.length === 0, 'no warnings/errors in output channel', JSON.stringify(warnsErrs.slice(0, 3)));
    const info = state.log.find((l: string[]) => l[0] === 'info')?.[1] ?? '';
    check(/Source: bundled reference/.test(info), 'log reports bundled source', info);

    console.log('\n--- Hover (real provider) ---');
    let h = hoverText('t2d_flood.cas', 'ABSCISSAE OF SOURCES = 100.;200.');
    check(!!h && h.includes('**Module:** Telemac2d') && h.includes('nearest node') && h.includes('HYDRO › PHYSICAL PARAMETERS HYDRO › SOURCES'),
        'T2D keyword in t2d_*.cas: module, description, category', h ?? 'no hover');
    check(!!h && /Also defined in: .*Telemac3d/.test(h), 'notes the keyword also exists in TELEMAC-3D', h ?? '');
    h = hoverText('sis_bed.cas', 'BED-LOAD TRANSPORT FORMULA = 7');
    check(!!h && h.includes('**Module:** Sisyphe'), 'Sisyphe keyword in sis_*.cas', h ?? 'no hover');
    h = hoverText('gai_case.cas', 'CLASSES SEDIMENT DIAMETERS = 0.0002');
    check(!!h && h.includes('**Module:** Gaia'), 'Gaia keyword in gai_*.cas', h ?? 'no hover');
    h = hoverText('run.cas', 'CONVECTION = OUI');
    check(!!h && h.includes('### ADVECTION'), 'French keyword in an unrecognised file resolves to ADVECTION', h ?? 'no hover');
    h = hoverText('t2d_flood.cas', '/ comment line');
    check(h === null, 'no hover on comment lines');

    console.log('\n--- Completion (real provider) ---');
    let items = complete('sis_bed.cas', 'BED');
    let labels = items.map(i => String(i.label));
    check(labels.includes('BED-LOAD TRANSPORT FORMULA') && items.every(i => String(i.detail).endsWith('Sisyphe')),
        `sis_*.cas offers only Sisyphe keywords (${items.length} items incl. French names)`);
    items = complete('steering.cas', 'TIME');
    labels = items.map(i => String(i.label));
    const mods = new Set(items.map(i => String(i.detail).split(' · ')[1]));
    check(labels.includes('TIME STEP') && mods.size >= 5, `unrecognised file offers keywords from ${mods.size} modules`);

    console.log('\n--- Scenario B: local installation takes precedence ---');
    const fake = fs.mkdtempSync(path.join(os.tmpdir(), 'telemac-install-'));
    fs.mkdirSync(path.join(fake, 'sources', 'telemac2d'), { recursive: true });
    fs.writeFileSync(path.join(fake, 'sources', 'telemac2d', 'telemac2d.dico'),
        "&DYN\nNOM = 'MOT CLE LOCAL'\nNOM1 = 'LOCAL ONLY KEYWORD'\nTYPE = REAL\nINDEX = 1\nTAILLE = 1\n"
        + "RUBRIQUE = 'A';'B';''\nRUBRIQUE1 = 'A';'B';''\nNIVEAU = 1\nAIDE1 = 'From the local install.'\n");
    state.config['telemacMascaret.telemacDirectory'] = fake;
    state.log.length = 0;
    await state.commands.get('telemacMascaret.reloadDico')();
    check(dicoEntries[DicoModule.Telemac2d].length === 1 && dicoEntries[DicoModule.Telemac2d][0].nameEnglish === 'LOCAL ONLY KEYWORD',
        'TELEMAC-2D taken from the local installation');
    check(dicoEntries[DicoModule.Sisyphe].length === 174, 'modules missing from the installation fall back to the bundle');
    const info2 = state.log.find((l: string[]) => l[0] === 'info')?.[1] ?? '';
    check(info2.includes('installation at') && !/fallback used for: .*Telemac2d/.test(info2), 'log reports installation source', info2);

    console.log('\n--- Scenario C: additional DICO files ---');
    state.config['telemacMascaret.telemacDirectory'] = '';
    const extra = path.join(fake, 'extra.dico');
    fs.writeFileSync(extra, "&DYN\nNOM = 'MOT UTILISATEUR'\nNOM1 = 'USER KEYWORD'\nTYPE = INTEGER\nINDEX = 1\n"
        + "RUBRIQUE = 'U';'';''\nRUBRIQUE1 = 'U';'';''\nAIDE1 = 'User-defined.'\n");
    state.config['telemacMascaret.additionalDicoFiles'] = [extra];
    await state.commands.get('telemacMascaret.reloadDico')();
    check(dicoEntries[DicoModule.Telemac2d].some(e => e.nameEnglish === 'USER KEYWORD') && dicoEntries[DicoModule.Telemac2d].length === 377,
        'additional DICO appended to TELEMAC-2D (376 + 1)');
    fs.rmSync(fake, { recursive: true, force: true });

    console.log(`\n${failures === 0 ? 'ALL INTEGRATION CHECKS PASSED' : failures + ' INTEGRATION CHECK(S) FAILED'}`);
    process.exit(failures === 0 ? 0 : 1);
}
main().catch(e => { console.error(e); process.exit(1); });
