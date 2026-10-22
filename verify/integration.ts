// Runs the extension's real activate(), DICO loading, hover, completion and
// diagnostics code against the files on disk, with a file-system-backed vscode stub.
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { activate } from '../src/extension';
import { dicoEntries, dicoSource, DicoModule } from '../src/dico';

/* eslint-disable @typescript-eslint/no-explicit-any */
const stub = vscode as any;
const state = stub.__state;
const makeDoc = stub.__makeDocument as (file: string, text: string) => vscode.TextDocument & { setText(t: string): void };
const root = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'telemac-ext-'));
let failures = 0;
const check = (ok: boolean, msg: string, detail = '') => {
    console.log(`  ${ok ? '✓' : '✗'} ${msg}${!ok && detail ? '\n      ' + detail.replace(/\n/g, '\n      ') : ''}`);
    if (!ok) failures++;
};
const total = () => Object.values(dicoEntries).reduce((n, l) => n + l.length, 0);
const file = (name: string) => path.join(tmp, name);

const hoverAt = (doc: vscode.TextDocument, line: number, character: number): string | null => {
    const [, provider] = state.hoverProviders[0];
    const h = provider.provideHover(doc, new vscode.Position(line, character), {});
    return h ? h.contents.value : null;
};
const completeAt = (doc: vscode.TextDocument, line: number, character: number): any[] => {
    const [, provider] = state.completionProviders[0];
    return provider.provideCompletionItems(doc, new vscode.Position(line, character), {}, {}) ?? [];
};
const labelOf = (i: any): string => typeof i.label === 'string' ? i.label : i.label.label;
const descOf = (i: any): string => typeof i.label === 'string' ? '' : i.label.description ?? '';
const diagnose = (doc: vscode.TextDocument): any[] => {
    for (const fn of state.listeners.open) fn(doc);
    return state.diagnostics.get(doc.uri.toString()) ?? [];
};
const codes = (diags: any[]) => diags.map(d => `${d.range.start.line}:${d.code}`);

const VALID_T2D = `/----------------------------------------------------------------------
/  TELEMAC-2D steering file (validation test)
/----------------------------------------------------------------------
TITLE = 'Dam break test'
GEOMETRY FILE            = 'geo.slf'
BOUNDARY CONDITIONS FILE = 'geo.cli'
RESULTS FILE             = 'r2d.slf'
GEOMETRY FILE FORMAT     = 'SERAFIN'
VARIABLES FOR GRAPHIC PRINTOUTS : 'U,V,H,S,B,T1'
GRAPHIC PRINTOUT PERIOD  = 10
TIME STEP                = 0,1   / comma as decimal point /
NUMBER OF TIME STEPS     = 400
LAW OF BOTTOM FRICTION   = 4
FRICTION COEFFICIENT     = 0.025
TURBULENCE MODEL         = 1
VELOCITY DIFFUSIVITY     = 1.D-6
INITIAL CONDITIONS       = 'CONSTANT ELEVATION'
TIDAL FLATS              = YES
OPTION FOR THE TREATMENT OF TIDAL FLATS = 1
PRESCRIBED ELEVATIONS    = 0.;
                           1.5
COEFFICIENT D'INFLUENCE DU VENT = 1.E-6
BILAN DE MASSE : OUI
&ETA
&FIN
THIS IS IGNORED AFTER FIN = 1
`;

const ERRORS_T2D = [
    '/ Steering file with one problem per line',
    'LAW OF BOTOM FRICTION = 4',
    'LAW OF BOTTOM FRICTION = 9',
    'TIME STEP = abc',
    'TIDAL FLATS = MAYBE',
    'GEOMETRY FILE FORMAT = \'SELAFIN\'',
    'VARIABLES FOR GRAPHIC PRINTOUTS = \'U,V,XYZ\'',
    'NUMBER OF TIME STEPS = 400',
    'NUMBER OF TIME STEPS = 500',
    'TITLE = my run name',
    'CLASSES SEDIMENT DIAMETERS = 0.001',
    'RESULTS FILE =',
    'INITIAL CONDITIONS = \'CONSTANT ELEVATION\'',
    'GEOMETRY FILE = \'a_very_long_mesh_file_name_that_goes_past_column_72.slf\'',
    'BOUNDARY CONDITIONS FILE = \'unterminated',
].join('\n');

async function main() {
    console.log('--- Manifest ---');
    check(pkg.publisher === 'alphavarez' && pkg.name === 'telemac-mascaret' && pkg.version === '1.1.0', `identity ${pkg.publisher}.${pkg.name}@${pkg.version}`);
    const props = Object.keys(pkg.contributes.configuration[0].properties);
    check(props.every((k: string) => k.startsWith('telemacMascaret.')) && props.includes('telemacMascaret.version'), `settings: ${props.join(', ')}`);
    check(pkg.contributes.configuration[0].properties['telemacMascaret.version'].default === '9.1.2', 'default version is 9.1.2');

    console.log('\n--- Activation, default version 9.1.2 ---');
    const context = { extensionUri: vscode.Uri.file(root), subscriptions: [] as unknown[] } as unknown as vscode.ExtensionContext;
    await activate(context);
    const cmds = pkg.contributes.commands.map((c: { command: string }) => c.command);
    check(cmds.every((c: string) => state.commands.has(c)), `commands registered: ${cmds.join(', ')}`);
    check([...state.configNamespaces].every(ns => ns === 'telemacMascaret'), 'settings read only from telemacMascaret.*');
    check(total() === 1932 && dicoEntries[DicoModule.Sisyphe].length === 0, `1932 keywords loaded, no SISYPHE (got ${total()})`);
    check(dicoSource.kind === 'bundled' && dicoSource.unavailableModules.join() === DicoModule.Sisyphe, 'source: bundled 9.1.2; SISYPHE reported as not in this version');
    const noisy = state.log.filter((l: string[]) => l[0] !== 'info');
    check(noisy.length === 0 && state.errors.length === 0, 'no warnings or errors while loading', JSON.stringify(noisy.slice(0, 3)));
    const triggers = state.completionProviders[0][2];
    check(['=', ':'].every(t => triggers.includes(t)), `completion triggers: ${JSON.stringify(triggers)}`);

    console.log('\n--- Status bar ---');
    const status = state.statusItems[0];
    state.activeTextEditor = { document: makeDoc(file('t2d_a.cas'), '') };
    state.listeners.activeEditor.forEach((fn: () => void) => fn());
    check(status.visible && status.text.includes('TELEMAC v9.1.2') && status.command === 'telemacMascaret.selectVersion', `visible for steering files: "${status.text}"`);
    state.activeTextEditor = { document: { ...makeDoc(file('notes.txt'), ''), languageId: 'plaintext' } };
    state.listeners.activeEditor.forEach((fn: () => void) => fn());
    check(!status.visible, 'hidden for other files');

    console.log('\n--- Hover ---');
    let doc = makeDoc(file('t2d_flood.cas'), 'LAW OF BOTTOM FRICTION = 4\n   TIDAL FLATS : NO\n/ LAW OF BOTTOM FRICTION = 4\nLOI DE FROTTEMENT SUR LE FOND = 4');
    let h = hoverAt(doc, 0, 3);
    check(!!h && h.includes('*TELEMAC-2D · v9.1.2*') && h.includes('**Current value:** `4` MANNING') && h.includes('- `6` COLEBROOK-WHITE'),
        'keyword: module, version, current value and allowed values', h ?? 'no hover');
    check(!!h && h.includes('Selects the type of formulation') && !/\\item|begin\{/.test(h), 'help text converted from LaTeX', h?.slice(-300) ?? '');
    check(!!hoverAt(doc, 0, 25), 'hover also works on the value');
    h = hoverAt(doc, 1, 6);
    check(!!h && h.includes('### TIDAL FLATS'), 'indented keyword with ":" separator', h ?? 'no hover');
    check(hoverAt(doc, 2, 5) === null, 'no hover on a comment line');
    h = hoverAt(doc, 3, 3);
    check(!!h && h.includes('**Current value:** `4` MANNING') && h.includes('Selectionne le type'), 'French keyword: French help text', h?.slice(0, 400) ?? 'no hover');

    console.log('\n--- Completion ---');
    doc = makeDoc(file('t2d_c.cas'), 'LAW OF BO');
    let items = completeAt(doc, 0, 9);
    check(items.some(i => labelOf(i) === 'LAW OF BOTTOM FRICTION') && items.every(i => String(i.detail).endsWith('TELEMAC-2D')), `keywords for TELEMAC-2D (${items.length} items)`);
    doc = makeDoc(file('t2d_c.cas'), 'LAW OF BOTTOM FRICTION = ');
    items = completeAt(doc, 0, 25);
    check(items.map(labelOf).join(',') === '0,1,2,3,4,5,6' && descOf(items[4]) === 'MANNING', 'values after "=": codes 0..6 with labels', items.map(i => `${labelOf(i)} ${descOf(i)}`).join(' | '));
    check(!items.some(i => i.preselect), 'LAW OF BOTTOM FRICTION has no default (mandatory): nothing preselected');
    doc = makeDoc(file('t2d_c.cas'), 'TURBULENCE MODEL = ');
    items = completeAt(doc, 0, 19);
    check(labelOf(items.find(i => i.preselect)) === '1' && descOf(items[0]).includes('(default)'), 'default value marked and preselected (TURBULENCE MODEL = 1)', items.map(i => `${labelOf(i)} ${descOf(i)}`).join(' | '));
    doc = makeDoc(file('t2d_c.cas'), 'GEOMETRY FILE FORMAT = ');
    items = completeAt(doc, 0, 23);
    check(items.map(i => i.insertText).join(',') === '\'SERAFIN\',\'SERAFIND\',\'MED\'', 'string values are inserted quoted', items.map(i => i.insertText).join(','));
    doc = makeDoc(file('t2d_c.cas'), 'GEOMETRY FILE FORMAT = \'SER');
    items = completeAt(doc, 0, 27);
    check(items[0]?.insertText === '\'SERAFIN\'' && items[0]?.range.start.character === 23, 'typed opening quote is replaced, not doubled');
    doc = makeDoc(file('t2d_c.cas'), 'TIDAL FLATS = ');
    items = completeAt(doc, 0, 14);
    check(items.map(labelOf).join(',') === 'YES,NO' && labelOf(items.find(i => i.preselect)) === 'YES', 'logical: YES/NO, default YES');
    doc = makeDoc(file('t2d_c.cas'), 'BANCS DECOUVRANTS = ');
    items = completeAt(doc, 0, 20);
    check(items.map(labelOf).join(',') === 'OUI,NON', 'French keyword: OUI/NON');
    doc = makeDoc(file('t2d_c.cas'), 'VARIABLES FOR GRAPHIC PRINTOUTS = \'U,V,');
    items = completeAt(doc, 0, 39);
    check(items.some(i => labelOf(i) === 'H') && items.every(i => i.range.start.character === 39) && !items.some(i => String(i.insertText ?? '').includes('\'')), 'variable codes: inserts just the code after the comma');
    doc = makeDoc(file('t2d_c.cas'), 'LAW OF BOTTOM FRICTION =\n');
    items = completeAt(doc, 1, 0);
    check(items.map(labelOf).join(',') === '0,1,2,3,4,5,6', 'value written on the next line');
    doc = makeDoc(file('t2d_c.cas'), 'TIME STEP = 1.\n');
    items = completeAt(doc, 1, 0);
    check(items.some(i => labelOf(i) === 'LAW OF BOTTOM FRICTION'), 'new line after a complete value: keywords again');
    doc = makeDoc(file('t2d_c.cas'), 'TITLE = \'x\' / note');
    check(completeAt(doc, 0, 19).length === 0, 'nothing inside a comment');

    console.log('\n--- Diagnostics ---');
    let diags = diagnose(makeDoc(file('t2d_valid.cas'), VALID_T2D));
    check(diags.length === 0, 'valid TELEMAC-2D file: no problems', diags.map(d => `${d.range.start.line + 1}: ${d.message}`).join('\n'));
    diags = diagnose(makeDoc(file('t2d_errors.cas'), ERRORS_T2D));
    const expected = ['1:unknown-keyword', '2:invalid-value', '3:invalid-type', '4:invalid-type', '5:invalid-value',
        '8:duplicate-keyword', '9:unexpected-text', '10:unknown-keyword', '11:missing-value', '13:line-too-long', '14:unterminated-string'];
    const got = codes(diags).sort();
    check(JSON.stringify(got) === JSON.stringify([...expected].sort()), 'one problem per line, each with the right check',
        `expected ${expected.join(' ')}\n got     ${got.join(' ')}\n${diags.map(d => `${d.range.start.line}: [${d.code}] ${d.message}`).join('\n')}`);
    const msg = (line: number) => diags.find(d => d.range.start.line === line)?.message ?? '';
    check(msg(1).includes('Did you mean "LAW OF BOTTOM FRICTION"?'), `typo suggestion: ${msg(1)}`);
    check(msg(2).includes('4 (MANNING)'), `allowed values listed: ${msg(2)}`);
    check(!codes(diags).includes('6:invalid-value'), 'output-variable codes are not checked (lists are not exhaustive)');
    check(msg(10).includes('GAIA keyword'), `keyword of another module: ${msg(10)}`);
    check(diags.find(d => d.code === 'unterminated-string').severity === 0 && diags.find(d => d.code === 'invalid-value').severity === 1
        && diags.find(d => d.code === 'duplicate-keyword').severity === 2, 'severities: syntax error = Error, duplicates = Information, others = Warning');

    console.log('\n--- Lessons from the 1,535 official example files ---');
    diags = diagnose(makeDoc(file('t2d_lessons.cas'), [
        'COUPLING WITH : \'TOMAWAC,GAIA\'',
        'VARIABLES FOR GRAPHIC PRINTOUTS = \'U,V,H,T*,1A1\'',
        'MASS-BALANCE = YES      / a comment can run past column 72 without any problem',
        'COMPUTATION CONTINUED = NO',
        'PARAMETER ESTIMATION = \'FRICTION, STEADY\'',
    ].join('\n')));
    check(codes(diags).join() === '3:unknown-keyword', `only the removed keyword is reported (${codes(diags).join()})`, diags.map(d => d.message).join('\n'));
    check(String(diags[0]?.message).includes('exists in v8p4 and was removed or renamed since'), `removed keyword explained: ${diags[0]?.message}`);
    diags = diagnose(makeDoc(file('courlis_case.cas'), 'LOI CONC 1 NOM = \'a\'\nLOI CONC 2 NOM = \'b\'\nLOI CONC 2 NOM = \'c\''));
    check(codes(diags).join() === '2:duplicate-keyword', `indexed keywords (LOI CONC 1/2 NOM) recognised, only the real duplicate reported (${codes(diags).join()})`);
    const iceDoc = makeDoc(file('ice_cover.cas'), 'BOLTZMANN CONSTANT (WM-2K-4) = 5.67E-8');
    check(diagnose(iceDoc).length === 0 && (hoverAt(iceDoc, 0, 2) ?? '').includes('KHIONE'), 'ice_*.cas detected as KHIONE');
    const folderDoc = makeDoc(path.join(tmp, 'projects', 'gaia', 'run.cas'), 'CLASSES SEDIMENT DIAMETERS = 0.001\nLAW OF BOTTOM FRICTION = 4');
    check(codes(diagnose(folderDoc)).join() === '1:unknown-keyword', 'module taken from a parent folder named after it (gaia/run.cas)');

    const errorsDoc = makeDoc(file('t2d_errors.cas'), ERRORS_T2D);
    const [, quickFix] = state.codeActionProviders[0];
    const actions = quickFix.provideCodeActions(errorsDoc, null, { diagnostics: diagnose(errorsDoc) });
    check(actions.length === 1 && actions[0].edit.edits[0].text === 'LAW OF BOTTOM FRICTION', `quick fix: ${actions.map((a: any) => a.title).join(', ')}`);

    diags = diagnose(makeDoc(file('tom_wind.cas'), 'WIND GENERATION = 5\nWHITE CAPPING WEIGHTING COEFFICIENT = 1.5'));
    check(codes(diags).join() === '0:invalid-value,1:out-of-range' && diags[1].severity === 2, `options vs dictionary range (info): ${codes(diags).join()}`);
    diags = diagnose(makeDoc(file('sis_bed.cas'), 'BED-LOAD TRANSPORT FORMULA = 1'));
    check(codes(diags).join() === '0:module-unavailable' && diags[0].severity === 2, `SISYPHE file in 9.1.2: one information message (${diags[0]?.message})`);
    diags = diagnose(makeDoc(file('telemac2d.dico'), 'NOM = \'X\'\nNOM1 = \'Y\''));
    check(diags.length === 0, 'dictionary files are not checked');
    diags = diagnose(makeDoc(file('run.cas'), 'LAW OF BOTTOM FRICTION = 4\nCLASSES SEDIMENT DIAMETERS = 0.001\nNOT A KEYWORD = 1'));
    check(codes(diags).join() === '2:unknown-keyword', `file of unknown module: keywords from any module accepted (${codes(diags).join()})`);
    state.config['telemacMascaret.diagnostics.enabled'] = false;
    check(diagnose(makeDoc(file('t2d_off.cas'), ERRORS_T2D)).length === 0, 'diagnostics can be turned off');
    state.config['telemacMascaret.diagnostics.enabled'] = true;
    state.config['telemacMascaret.diagnostics.maxLineLength'] = 0;
    check(!codes(diagnose(makeDoc(file('t2d_len.cas'), ERRORS_T2D))).includes('13:line-too-long'), 'line-length check can be turned off');
    delete state.config['telemacMascaret.diagnostics.maxLineLength'];

    console.log('\n--- Switching to v8p4 ---');
    state.quickPickAnswer = '8p4';
    await state.commands.get('telemacMascaret.selectVersion')();
    check(state.config['telemacMascaret.version'] === '8p4' && state.configUpdates.at(-1).target === 1, 'version picker updates the user setting');
    state.log.length = 0;
    state.activeTextEditor = { document: makeDoc(file('t2d_a.cas'), '') };
    await state.commands.get('telemacMascaret.reloadDico')();
    check(total() === 2049 && dicoEntries[DicoModule.Sisyphe].length === 174, `2049 keywords, SISYPHE back (174) (got ${total()})`);
    check(status.text.includes('v8p4'), `status bar: "${status.text}"`);
    const sis = makeDoc(file('sis_bed.cas'), 'BED-LOAD TRANSPORT FORMULA = 1\nSEDIMENT DIAMETERS = 0.0002\nSUSPENSION = NO');
    state.textDocuments.push(sis);
    diags = diagnose(sis);
    check(diags.length === 0, 'valid SISYPHE file in v8p4: no problems', diags.map(d => d.message).join('\n'));
    diags = diagnose(makeDoc(file('t2d_v9only.cas'), 'TIME STEP = 1.'));
    check(diags.length === 0, 'TELEMAC-2D still checked in v8p4');

    console.log('\n--- Local installation ---');
    const install = file('telemac-install');
    fs.mkdirSync(path.join(install, 'sources', 'telemac2d'), { recursive: true });
    fs.writeFileSync(path.join(install, 'sources', 'telemac2d', 'telemac2d.dico'),
        '&DYN\nNOM = \'MOT CLE LOCAL\'\nNOM1 = \'LOCAL ONLY KEYWORD\'\nTYPE = REAL\nINDEX = 1\nTAILLE = 1\n'
        + 'RUBRIQUE = \'A\';\'B\';\'\'\nRUBRIQUE1 = \'A\';\'B\';\'\'\nNIVEAU = 1\nAIDE1 = \'From the local install.\'\n');
    state.config['telemacMascaret.version'] = 'installation';
    state.config['telemacMascaret.telemacDirectory'] = install;
    await state.commands.get('telemacMascaret.reloadDico')();
    check(dicoSource.kind === 'installation' && dicoEntries[DicoModule.Telemac2d][0]?.nameEnglish === 'LOCAL ONLY KEYWORD', 'TELEMAC-2D read from the installation');
    check(dicoSource.fallbackModules.includes(DicoModule.Gaia) && dicoEntries[DicoModule.Gaia].length === 150, 'modules missing in the installation use bundled 9.1.2');
    check(status.text.includes('installation') && String(status.tooltip.value).includes(install), `status bar shows the installation: "${status.text}"`);
    state.config['telemacMascaret.telemacDirectory'] = '';
    process.env.HOMETEL = install;
    await state.commands.get('telemacMascaret.reloadDico')();
    check(dicoSource.location === install, 'HOMETEL used when no directory is set');
    delete process.env.HOMETEL;
    state.warnings.length = 0;
    await state.commands.get('telemacMascaret.reloadDico')();
    check(dicoSource.kind === 'bundled' && state.warnings.length === 1, `no installation found: bundled reference + one warning (${state.warnings[0]?.slice(0, 60)}…)`);

    console.log('\n--- Additional DICO files ---');
    state.config['telemacMascaret.version'] = '9.1.2';
    const extra = file('extra.dico');
    fs.writeFileSync(extra, '&DYN\nNOM = \'MOT UTILISATEUR\'\nNOM1 = \'USER KEYWORD\'\nTYPE = INTEGER\nINDEX = 1\nRUBRIQUE = \'U\'\nRUBRIQUE1 = \'U\'\nAIDE1 = \'User-defined.\'\n');
    state.config['telemacMascaret.additionalDicoFiles'] = [extra];
    await state.commands.get('telemacMascaret.reloadDico')();
    check(dicoEntries[DicoModule.Telemac2d].length === 387, 'additional DICO appended to TELEMAC-2D (386 + 1)');
    check(diagnose(makeDoc(file('t2d_user.cas'), 'USER KEYWORD = 3')).length === 0, 'user keyword accepted by the checks');

    fs.rmSync(tmp, { recursive: true, force: true });
    console.log(`\n${failures === 0 ? 'ALL INTEGRATION CHECKS PASSED' : failures + ' INTEGRATION CHECK(S) FAILED'}`);
    process.exit(failures === 0 ? 0 : 1);
}
main().catch(e => { console.error(e); process.exit(1); });
