/** For parsing DICO files */

import * as os from 'os';
import * as vscode from 'vscode';
import { Config } from './config';
import { GLOBALS } from './globals';
import { latexToMarkdown } from './latex';
import { toTitleCase } from './utils';

export enum DicoModule {
    Artemis = 'Artemis',
    Gaia = 'Gaia',
    Khione = 'Khione',
    Mascaret = 'Mascaret',
    Postel3d = 'Postel3d',
    Sisyphe = 'Sisyphe',
    Stbtel = 'Stbtel',
    Telemac2d = 'Telemac2d',
    Telemac3d = 'Telemac3d',
    Tomawac = 'Tomawac',
    Waqtel = 'Waqtel',
}

/** Names as written in the TELEMAC-MASCARET documentation. */
export const MODULE_LABELS: Record<DicoModule, string> = {
    [DicoModule.Artemis]: 'ARTEMIS',
    [DicoModule.Gaia]: 'GAIA',
    [DicoModule.Khione]: 'KHIONE',
    [DicoModule.Mascaret]: 'MASCARET',
    [DicoModule.Postel3d]: 'POSTEL-3D',
    [DicoModule.Sisyphe]: 'SISYPHE',
    [DicoModule.Stbtel]: 'STBTEL',
    [DicoModule.Telemac2d]: 'TELEMAC-2D',
    [DicoModule.Telemac3d]: 'TELEMAC-3D',
    [DicoModule.Tomawac]: 'TOMAWAC',
    [DicoModule.Waqtel]: 'WAQTEL',
};

const DICO_PATHS: Record<DicoModule, string> = {
    [DicoModule.Artemis]: 'sources/artemis/artemis.dico',
    [DicoModule.Gaia]: 'sources/gaia/gaia.dico',
    [DicoModule.Khione]: 'sources/khione/khione.dico',
    [DicoModule.Mascaret]: 'sources/mascaret/mascaret.dico',
    [DicoModule.Postel3d]: 'sources/postel3d/postel3d.dico',
    [DicoModule.Sisyphe]: 'sources/sisyphe/sisyphe.dico',
    [DicoModule.Stbtel]: 'sources/stbtel/stbtel.dico',
    [DicoModule.Telemac2d]: 'sources/telemac2d/telemac2d.dico',
    [DicoModule.Telemac3d]: 'sources/telemac3d/telemac3d.dico',
    [DicoModule.Tomawac]: 'sources/tomawac/tomawac.dico',
    [DicoModule.Waqtel]: 'sources/waqtel/waqtel.dico',
} as const;

/** TELEMAC-MASCARET releases whose dictionaries ship with the extension. */
export const BUNDLED_VERSIONS = ['9.1.2', '8p4'] as const;
export type BundledVersion = typeof BUNDLED_VERSIONS[number];
export const DEFAULT_VERSION: BundledVersion = '9.1.2';
export const VERSION_LABELS: Record<BundledVersion, string> = { '9.1.2': 'v9.1.2', '8p4': 'v8p4' };

const TRANSLATIONS: Record<string, Record<string, string>> = {
    type: {
        'REEL': 'REAL',
        'ENTIER': 'INTEGER',
        'LOGIQUE': 'LOGICAL',
        'CHAINE': 'STRING',
        'CARACTERE': 'STRING',
    } as const,
} as const;

export interface DicoEntry {
    nameEnglish: string;
    nameFrench: string;
    type: KeywordType;
    index: number;
    /**
     * Number of values expected for the keyword.
     * If the keyword can have a dynamic number of values set TAILLE to 2 and add DYNLIST in APPARENCE.
     */
    taille: number;
    submit?: DicoSubmit;
    defaultEnglish?: string;
    defaultFrench?: string;
    choiceEnglish?: DicoArray;
    choiceFrench?: DicoArray;
    mnemo?: string;
    /** Hints for graphical interfaces (APPARENCE), e.g. ['DYNLIST']. */
    appearance: string[];
    /** Allowed range from CONTROLE (min;max). */
    rangeMin?: number;
    rangeMax?: number;
    categoriesEnglish: string[];
    categoriesFrench: string[];
    required: boolean;
    helpEnglish: string;
    helpFrench: string;
}

export type KeywordType = 'STRING' | 'REAL' | 'INTEGER' | 'LOGICAL';

export interface DicoSubmit {
    tempName: string;
    tempAccess: 'READ' | 'WRITE' | 'READWRITE';
    required: boolean;
    binary: boolean;
    special?: string;
}

export class DicoParseError extends Error {}

export const dicoEntries: Record<DicoModule, DicoEntry[]> =
    Object.fromEntries(
        Object.values(DicoModule).map(module => [module, [] as DicoEntry[]]),
    ) as Record<DicoModule, DicoEntry[]>;

/** Normalised name (upper case, single spaces) -> entry, per module. */
const keywordIndex: Record<DicoModule, Map<string, DicoEntry>> =
    Object.fromEntries(
        Object.values(DicoModule).map(module => [module, new Map<string, DicoEntry>()]),
    ) as Record<DicoModule, Map<string, DicoEntry>>;

export function normalizeKeyword(name: string): string {
    return name.toUpperCase().replace(/\s+/g, ' ').trim();
}

function rebuildIndex(module: DicoModule): void {
    const index = new Map<string, DicoEntry>();
    for (const entry of dicoEntries[module]) {
        index.set(normalizeKeyword(entry.nameEnglish), entry);
        if (!index.has(normalizeKeyword(entry.nameFrench)))
            index.set(normalizeKeyword(entry.nameFrench), entry);
    }
    keywordIndex[module] = index;
}

/** Where the currently loaded dictionaries come from. */
export interface DicoSource {
    /** 'bundled' or 'installation' */
    kind: 'bundled' | 'installation';
    /** Bundled version used (directly or as fallback). */
    bundledVersion: BundledVersion;
    /** Installation folder, when kind is 'installation'. */
    location?: string;
    /** Modules taken from the bundle although an installation is used. */
    fallbackModules: DicoModule[];
    /** Modules with no dictionary in this version (e.g. Sisyphe in v9). */
    unavailableModules: DicoModule[];
}

export const dicoSource: DicoSource = {
    kind: 'bundled',
    bundledVersion: DEFAULT_VERSION,
    fallbackModules: [],
    unavailableModules: [],
};

/** Human-readable label of the loaded version, e.g. "v9.1.2" or "installation". */
export function versionLabel(): string {
    return dicoSource.kind === 'installation' ? 'installation' : VERSION_LABELS[dicoSource.bundledVersion];
}

/** Keyword names of the bundled versions not currently loaded, per module. */
const otherVersionNames = new Map<BundledVersion, Record<string, Set<string>>>();

/**
 * Bundled versions (other than the loaded one) whose dictionary of `module`
 * contains `keyword`, newest first.
 */
export function otherVersionsWith(module: DicoModule, keyword: string): BundledVersion[] {
    const keys = keyVariants(keyword);
    return BUNDLED_VERSIONS.filter(v => {
        const names = otherVersionNames.get(v)?.[module];
        return names !== undefined && keys.some(k => names.has(k));
    });
}

async function loadOtherVersionNames(extensionUri: vscode.Uri, loaded: BundledVersion | null): Promise<void> {
    otherVersionNames.clear();
    for (const version of BUNDLED_VERSIONS) {
        if (version === loaded)
            continue;
        const perModule: Record<string, Set<string>> = {};
        await Promise.all(Object.values(DicoModule).map(async module => {
            try {
                const entries = await parseDicoFromUri(vscode.Uri.joinPath(extensionUri, 'dico', version, `${module.toLowerCase()}.dico`));
                perModule[module] = new Set(entries.flatMap(e => [normalizeKeyword(e.nameEnglish), normalizeKeyword(e.nameFrench)]));
            }
            catch { /* module not in this version */ }
        }));
        otherVersionNames.set(version, perModule);
    }
}

const loadListeners: (() => void)[] = [];
/** Registers a callback run after every (re)load of the dictionaries. */
export function onDicoLoaded(listener: () => void): vscode.Disposable {
    loadListeners.push(listener);
    return { dispose: () => loadListeners.splice(loadListeners.indexOf(listener), 1) } as vscode.Disposable;
}

/**
 * Some dictionary names contain an index placeholder `x` (e.g. MASCARET's
 * 'LOI CONC x NOM'), written in steering files with a number ('LOI CONC 1 NOM').
 */
function keyVariants(name: string): string[] {
    const key = normalizeKeyword(name);
    return /\b\d+\b/.test(key) ? [key, key.replace(/\b\d+\b/g, 'X')] : [key];
}

function lookupIn(index: Map<string, DicoEntry>, name: string): DicoEntry | undefined {
    for (const key of keyVariants(name)) {
        const entry = index.get(key);
        if (entry)
            return entry;
    }
    return undefined;
}

export function getDicoEntry(keyword: string, module: DicoModule): DicoEntry | null {
    return lookupIn(keywordIndex[module], keyword) ?? null;
}

export interface DicoMatch {
    module: DicoModule;
    entry: DicoEntry;
}

/**
 * Find a keyword across every loaded module (English or French name, case and
 * spacing insensitive). If `preferred` is given, its match is sorted first.
 */
export function findDicoEntries(keyword: string, preferred?: DicoModule | null): DicoMatch[] {
    const matches: DicoMatch[] = [];
    for (const module of Object.values(DicoModule)) {
        const entry = lookupIn(keywordIndex[module], keyword);
        if (entry)
            matches.push({ module, entry });
    }
    if (preferred)
        matches.sort((a, b) => Number(b.module === preferred) - Number(a.module === preferred));
    return matches;
}

/** True when `name` is the French name of the entry (and differs from the English one). */
export function isFrenchName(entry: DicoEntry, name: string): boolean {
    const keys = keyVariants(name);
    const fr = normalizeKeyword(entry.nameFrench);
    const en = normalizeKeyword(entry.nameEnglish);
    return keys.includes(fr) && !keys.includes(en);
}

/**
 * Best-effort guess of the Telemac module a steering/dictionary file belongs to,
 * based on its file name. Returns null when no confident guess can be made, in
 * which case callers should fall back to searching across all modules.
 */
export function detectModule(document: vscode.TextDocument): DicoModule | null {
    const name = (document.uri.path.split('/').pop() ?? '').toLowerCase();
    // Full module name appearing anywhere (covers "<module>.dico" and descriptive names)
    for (const module of Object.values(DicoModule)) {
        if (name.includes(module.toLowerCase()))
            return module;
    }
    // Courlis (1D sediment) keywords live in the Mascaret dictionary
    if (name.includes('courlis'))
        return DicoModule.Mascaret;
    // Conventional 3-letter prefixes at the start of the file name (t2d_*, sis_*, gai_*, ...)
    const prefixes: [string, DicoModule][] = [
        ['t2d', DicoModule.Telemac2d],
        ['t3d', DicoModule.Telemac3d],
        ['sis', DicoModule.Sisyphe],
        ['gai', DicoModule.Gaia],
        ['tom', DicoModule.Tomawac],
        ['wac', DicoModule.Tomawac],
        ['waq', DicoModule.Waqtel],
        ['art', DicoModule.Artemis],
        ['khi', DicoModule.Khione],
        ['ice', DicoModule.Khione],
        ['pos', DicoModule.Postel3d],
        ['p3d', DicoModule.Postel3d],
        ['stb', DicoModule.Stbtel],
        ['mas', DicoModule.Mascaret],
    ];
    for (const [prefix, module] of prefixes) {
        if (name.startsWith(prefix))
            return module;
    }
    // Finally, a parent folder named after a module (e.g. .../gaia/case1/run.cas).
    const folders = document.uri.path.split('/').slice(0, -1).reverse().slice(0, 4).map(f => f.toLowerCase());
    for (const folder of folders) {
        for (const module of Object.values(DicoModule)) {
            if (folder.includes(module.toLowerCase()))
                return module;
        }
        if (folder.includes('courlis'))
            return DicoModule.Mascaret;
    }
    return null;
}

function expandHome(p: string): string {
    return p === '~' || p.startsWith('~/') || p.startsWith('~\\') ? os.homedir() + p.slice(1) : p;
}

/**
 * Locates a TELEMAC-MASCARET installation: the telemacDirectory setting, then
 * the HOMETEL environment variable set by the TELEMAC environment scripts,
 * then the default Windows installation folder.
 */
export async function findLocalTelemacUri(): Promise<vscode.Uri | null> {
    if (Config.telemacDirectory)
        return vscode.Uri.file(expandHome(Config.telemacDirectory));
    if (process.env.HOMETEL)
        return vscode.Uri.file(process.env.HOMETEL);

    const versions = ['9.2', '9.1', '9.0', 'V9P2', 'V9P1', 'V9P0', 'V8P5', 'V8P4'];
    const searchPath = 'C:/Program Files/TELEMAC';
    for (const version of versions) {
        try {
            const uri = vscode.Uri.joinPath(vscode.Uri.file(searchPath), version);
            const stat = await vscode.workspace.fs.stat(uri);
            if (stat.type === vscode.FileType.Directory)
                return uri;
        }
        catch { /* Ignore */ }
    }
    return null;
}

async function parseDicoFromUri(uri: vscode.Uri): Promise<DicoEntry[]> {
    const content = await vscode.workspace.fs.readFile(uri);
    const text = await vscode.workspace.decode(content);
    return parseDico(text);
}

function isFileNotFound(e: unknown): boolean {
    return e instanceof vscode.FileSystemError && (e.code === 'FileNotFound' || e.code === 'FileIsADirectory');
}

export async function loadDico(extensionUri: vscode.Uri): Promise<void> {
    const setting = Config.version;
    const useInstallation = setting === 'installation';
    const bundledVersion: BundledVersion = (BUNDLED_VERSIONS as readonly string[]).includes(setting)
        ? setting as BundledVersion
        : DEFAULT_VERSION;
    const telemacUri = useInstallation ? await findLocalTelemacUri() : null;
    if (useInstallation && !telemacUri) {
        const msg = `No TELEMAC-MASCARET installation found (set "telemacMascaret.telemacDirectory" or load the TELEMAC environment so HOMETEL is defined). Using the bundled ${VERSION_LABELS[bundledVersion]} reference instead.`;
        GLOBALS.outputChannel.warn(msg);
        vscode.window.showWarningMessage(msg);
    }

    const parseErrors: Error[] = [];
    const fallbackModules: DicoModule[] = [];
    const unavailableModules: DicoModule[] = [];

    // Start from a clean slate so switching versions never leaves stale keywords.
    for (const module of Object.values(DicoModule))
        dicoEntries[module] = [];

    await Promise.all(Object.values(DicoModule).map(async module => {
        // 1. A local installation, when requested.
        if (telemacUri) {
            try {
                dicoEntries[module] = await parseDicoFromUri(vscode.Uri.joinPath(telemacUri, DICO_PATHS[module]));
                return;
            }
            catch (e) {
                if (e instanceof DicoParseError) {
                    parseErrors.push(e);
                    GLOBALS.outputChannel.error(`Error parsing installed DICO file for module ${module}: ${e.message}`);
                    return;
                }
                if (!isFileNotFound(e))
                    throw e;
                // Not in this installation: fall through to the bundled copy.
            }
        }

        // 2. The dictionaries bundled with the extension.
        try {
            const uri = vscode.Uri.joinPath(extensionUri, 'dico', bundledVersion, `${module.toLowerCase()}.dico`);
            dicoEntries[module] = await parseDicoFromUri(uri);
            if (telemacUri)
                fallbackModules.push(module);
        }
        catch (e) {
            if (e instanceof DicoParseError) {
                parseErrors.push(e);
                GLOBALS.outputChannel.error(`Error parsing bundled DICO file for module ${module}: ${e.message}`);
            }
            else if (isFileNotFound(e)) {
                unavailableModules.push(module);
            }
            else {
                throw e;
            }
        }
    }));

    // User-specified additional DICO files are appended to TELEMAC-2D.
    for (const file of Config.additionalDicoFiles) {
        try {
            dicoEntries[DicoModule.Telemac2d].push(...await parseDicoFromUri(vscode.Uri.file(expandHome(file))));
        }
        catch (e) {
            GLOBALS.outputChannel.error(`Could not load additional DICO file "${file}": ${e instanceof Error ? e.message : String(e)}`);
        }
    }

    for (const module of Object.values(DicoModule))
        rebuildIndex(module);
    await loadOtherVersionNames(extensionUri, telemacUri ? null : bundledVersion);

    dicoSource.kind = telemacUri ? 'installation' : 'bundled';
    dicoSource.bundledVersion = bundledVersion;
    dicoSource.location = telemacUri?.fsPath;
    dicoSource.fallbackModules = fallbackModules.sort();
    dicoSource.unavailableModules = unavailableModules.sort();

    const totalEntries = Object.values(dicoEntries).reduce((n, list) => n + list.length, 0);
    GLOBALS.outputChannel.info(
        `Loaded ${totalEntries} keywords. Source: ${telemacUri ? `installation at ${telemacUri.fsPath}` : `bundled reference ${VERSION_LABELS[bundledVersion]}`}.`
        + (fallbackModules.length ? ` Bundled ${VERSION_LABELS[bundledVersion]} used for: ${fallbackModules.join(', ')}.` : '')
        + (unavailableModules.length ? ` Not available in this version: ${unavailableModules.join(', ')}.` : ''),
    );

    if (parseErrors.length > 0) {
        const checkOutputItem = 'Check output log';
        vscode.window.showErrorMessage(`${parseErrors.length} errors occurred while parsing DICO files.`, checkOutputItem).then(selection => {
            if (selection === checkOutputItem)
                GLOBALS.outputChannel.show();
        });
    }

    for (const listener of [...loadListeners])
        listener();
}

/**
 * Reassemble DICO logical lines so that every field (`KEY = value`) sits on one
 * line. Official DICO files spread values over several physical lines in two
 * ways: a quoted string (help text) wrapped over lines, and lists written one
 * element per line, often starting on the line after `KEY =`:
 *
 *     CHOIX1 =
 *     '0="NO FRICTION"';
 *     '1="HAALAND"';
 *
 * Any line that does not start a new field is appended to the current one, and
 * lines are always appended while a quote is open. Blank, comment (`/`) and
 * directive (`&`) lines end the current field.
 */
function joinWrappedValues(content: string): string {
    const quoteIsOpen = (s: string): boolean =>
        (s.replace(/''/g, '').match(/'/g)?.length ?? 0) % 2 === 1;
    const startsField = (s: string): boolean => /^\s*[A-Za-z][A-Za-z0-9]*\s*=/.test(s);

    const out: string[] = [];
    let buffer: string | null = null;
    const flush = () => {
        if (buffer !== null)
            out.push(buffer);
        buffer = null;
    };
    for (const line of content.split(/\r?\n/)) {
        if (buffer !== null && quoteIsOpen(buffer)) {
            buffer += ' ' + line.trim(); // inside a wrapped string
            continue;
        }
        const trimmed = line.trim();
        if (trimmed === '' || trimmed.startsWith('/') || trimmed.startsWith('&')) {
            flush();
            out.push(line);
        }
        else if (startsField(line)) {
            flush();
            buffer = line;
        }
        else if (buffer !== null) {
            buffer += ' ' + trimmed; // continuation of the current field's value
        }
        else {
            out.push(line);
        }
    }
    flush();
    return out.join('\n');
}

export function parseDico(content: string): DicoEntry[] {
    content = joinWrappedValues(content);
    const entries: DicoEntry[] = [];
    let currentEntry: Partial<DicoEntry> = {};
    let currentEntryInvalid = true;
    const entryRx = /^(\w+)\s*=\s*((?:'[^']*'|.)+)/gm;

    const matches = content.matchAll(entryRx);
    for (const match of matches) {
        const key = match[1];
        if (currentEntryInvalid && key !== 'NOM')
            continue; // Skip lines until the start of a new entry
        let value = match[2].trim();
        try {
            switch (key) {
                case 'NOM':
                    // NOM marks the start of a new entry
                    // Don't push the initial empty entry
                    if (!currentEntryInvalid) {
                        validateDicoEntry(currentEntry);
                        entries.push(currentEntry);
                    }
                    currentEntry = {};
                    currentEntryInvalid = false;
                    currentEntry.nameFrench = parseStringValue(value);
                    break;
                case 'NOM1':
                    currentEntry.nameEnglish = parseStringValue(value);
                    break;
                case 'TYPE':
                    if (value in TRANSLATIONS.type)
                        value = TRANSLATIONS.type[value];
                    validateKeywordType(value);
                    currentEntry.type = value;
                    break;
                case 'INDEX':
                    currentEntry.index = parseInt(value, 10);
                    break;
                case 'TAILLE':
                    currentEntry.taille = parseInt(value, 10);
                    if (isNaN(currentEntry.taille))
                        throw new DicoParseError(`Invalid TAILLE value: ${value}. Expected an integer.`);
                    break;
                case 'SUBMIT':
                    // Submit information is not used for hover/completion; an
                    // unusual SUBMIT string must not discard the keyword.
                    try {
                        currentEntry.submit = parseSubmit(value);
                    }
                    catch (e) {
                        GLOBALS.outputChannel.trace(`Ignoring SUBMIT for keyword ${currentEntry.nameFrench ?? '<UNKNOWN>'}: ${e instanceof Error ? e.message : String(e)}`);
                    }
                    break;
                case 'DEFAUT':
                    currentEntry.defaultFrench = value;
                    break;
                case 'DEFAUT1':
                    currentEntry.defaultEnglish = value;
                    break;
                case 'MNEMO':
                    currentEntry.mnemo = parseStringValue(value);
                    break;
                case 'CHOIX':
                    currentEntry.choiceFrench = parseArray(value);
                    break;
                case 'CHOIX1':
                    currentEntry.choiceEnglish = parseArray(value);
                    break;
                case 'APPARENCE':
                    try {
                        currentEntry.appearance = (parseArray(value) as unknown[]).map(v => String(v).trim().toUpperCase());
                    }
                    catch { /* purely informative */ }
                    break;
                case 'CONTROLE': {
                    const [min, max] = value.split(';').map(v => parseFloat(v.trim().replace(/[Dd]/, 'E')));
                    if (!isNaN(min))
                        currentEntry.rangeMin = min;
                    if (!isNaN(max))
                        currentEntry.rangeMax = max;
                    break;
                }
                case 'RUBRIQUE':
                    currentEntry.categoriesFrench = parseCategories(value);
                    break;
                case 'RUBRIQUE1':
                    currentEntry.categoriesEnglish = parseCategories(value);
                    break;
                case 'NIVEAU':
                    currentEntry.required = value === '0';
                    break;
                case 'AIDE':
                    currentEntry.helpFrench = parseStringValue(value, true);
                    break;
                case 'AIDE1':
                    currentEntry.helpEnglish = parseStringValue(value, true);
                    break;
                case 'COMPOSE':
                case 'COMPORT':
                    // Interface behaviour rules (Fudaa/Eficas); not used here
                    break;
                case 'PATHNODE':
                case 'ALLOCATE':
                case 'ALLOCATED':
                case 'ALLOCATED2':
                    // Undocumented but specified in official dico files
                    break;
                default:
                    throw new DicoParseError(`Unknown key in DICO entry: ${key}.`);
            }
        }
        catch (e) {
            if (e instanceof DicoParseError) {
                currentEntryInvalid = true;
                GLOBALS.outputChannel.error(`Error parsing DICO entry for keyword ${currentEntry.nameFrench ?? currentEntry.nameEnglish ?? '<UNKNOWN>'}: ${e.message}`);
            }
            else
                throw e;
        }
    }
    // Push the last entry, tolerating a malformed trailing entry the same way
    // the loop tolerates malformed entries in the middle of the file.
    if (!currentEntryInvalid) {
        try {
            validateDicoEntry(currentEntry);
            entries.push(currentEntry as DicoEntry);
        }
        catch (e) {
            if (e instanceof DicoParseError)
                GLOBALS.outputChannel.error(`Error parsing final DICO entry for keyword ${currentEntry.nameFrench ?? currentEntry.nameEnglish ?? '<UNKNOWN>'}: ${e.message}`);
            else
                throw e;
        }
    }

    return entries;
}

/** One allowed value of a keyword: e.g. { value: '4', label: 'MANNING' }. */
export interface DicoChoice {
    value: string;
    label?: string;
}

/**
 * Allowed values of a keyword, from CHOIX1 (English) or CHOIX (French).
 * Entries of the form 4="MANNING" are split into code and label.
 */
export function getChoices(entry: DicoEntry, french = false): DicoChoice[] {
    const raw = (french ? entry.choiceFrench ?? entry.choiceEnglish : entry.choiceEnglish ?? entry.choiceFrench) ?? [];
    return (raw as unknown[]).map(item => {
        const text = String(item);
        const m = text.match(/^\s*([^="]+?)\s*=\s*"(.*)"\s*$/s);
        // A blank option (e.g. '        ' for "no format") is kept as the empty value.
        return m ? { value: m[1].trim(), label: m[2].trim() } : { value: text.trim() };
    });
}

/** True when the keyword accepts a list of values separated by ';'. */
export function acceptsList(entry: DicoEntry): boolean {
    return entry.taille !== 1 || entry.appearance.some(a => a.includes('LIST'));
}

export interface EntryDetailsOptions {
    /** Value currently written for the keyword, shown at the top of the hover. */
    currentValue?: string;
    /** Use French labels and help. */
    french?: boolean;
}

function stripQuotes(value: string): string {
    const v = value.trim();
    return v.length >= 2 && (v[0] === '\'' || v[0] === '"') && v[v.length - 1] === v[0] ? v.slice(1, -1).trim() : v;
}

/** Describes a written value using the keyword's choices, e.g. "4 — MANNING". */
export function describeValue(entry: DicoEntry, value: string, french = false): string | null {
    const choices = getChoices(entry, french);
    const labelled = choices.filter(c => c.label);
    if (labelled.length === 0)
        return null;
    const parts = value.split(';').map(v => stripQuotes(v)).filter(v => v !== '');
    const described = parts.map(p => {
        const c = labelled.find(ch => ch.value.toUpperCase() === p.toUpperCase());
        return c ? `\`${c.value}\` ${latexToMarkdown(c.label ?? '')}` : null;
    });
    return described.every(d => d !== null) && described.length > 0 ? described.join(', ') : null;
}

export function getEntryDetails(entry: DicoEntry, module?: DicoModule, options: EntryDetailsOptions = {}): vscode.MarkdownString {
    const french = options.french ?? false;
    const md = new vscode.MarkdownString();
    md.appendMarkdown(`### ${entry.nameEnglish}`);
    const origin = [module ? MODULE_LABELS[module] : null, versionLabel()].filter(Boolean).join(' · ');
    md.appendMarkdown(`\n\n*${origin}*`);

    if (options.currentValue !== undefined) {
        const described = describeValue(entry, options.currentValue, french);
        if (described)
            md.appendMarkdown(`\n\n**Current value:** ${described}`);
    }

    md.appendMarkdown(`\n\n**Type:** ${toTitleCase(entry.type)} · **Dimension:** ${entry.taille}`);
    if (entry.nameFrench && entry.nameFrench !== entry.nameEnglish)
        md.appendMarkdown(`\n\n**French keyword:** ${entry.nameFrench}`);
    if (entry.mnemo)
        md.appendMarkdown(`\n\n**Mnemo:** \`${entry.mnemo}\``);
    const defaultValue = french ? entry.defaultFrench ?? entry.defaultEnglish : entry.defaultEnglish ?? entry.defaultFrench;
    if (defaultValue)
        md.appendMarkdown(`\n\n**Default:** \`${defaultValue}\``);
    if (entry.rangeMin !== undefined || entry.rangeMax !== undefined)
        md.appendMarkdown(`\n\n**Range:** ${entry.rangeMin ?? '−∞'} to ${entry.rangeMax ?? '∞'}`);
    const categories = french ? entry.categoriesFrench : entry.categoriesEnglish;
    if (categories.length > 0)
        md.appendMarkdown(`\n\n**Category:** ${categories.join(' › ')}`);

    const choices = getChoices(entry, french);
    if (choices.length > 0) {
        const list = choices
            .map(c => c.value === ''
                ? '- `\'\'` (empty)'
                : c.label ? `- \`${c.value}\` ${latexToMarkdown(c.label)}` : `- \`${c.value}\``)
            .join('\n');
        md.appendMarkdown(`\n\n**Allowed values${acceptsList(entry) ? ' (one or more, separated by `;`)' : ''}:**\n\n${list}`);
    }

    md.appendMarkdown(`\n\n---\n\n${french ? entry.helpFrench : entry.helpEnglish}`);
    md.isTrusted = false;
    return md;
}

function validateKeywordType(value: string): asserts value is KeywordType {
    const validTypes: KeywordType[] = ['STRING', 'REAL', 'INTEGER', 'LOGICAL'];
    if (!validTypes.includes(value as KeywordType)) {
        throw new DicoParseError(`Invalid keyword type: ${value}. Expected one of ${validTypes.join(', ')}`);
    }
}

function validateDicoEntry(entry: Partial<DicoEntry>): asserts entry is DicoEntry {
    const requiredFields: (keyof DicoEntry)[] = [
        'nameEnglish',
        'nameFrench',
        'type',
        'index',
        'taille',
        'categoriesEnglish',
        'categoriesFrench',
        'required',
        'helpEnglish',
        'helpFrench',
    ];
    // Set default values for optional fields if they are missing
    entry.taille ??= 1;
    entry.required ??= false;
    entry.index ??= -1;
    entry.appearance ??= [];
    entry.categoriesEnglish ??= [];
    entry.categoriesFrench ??= [];
    entry.nameEnglish ??= entry.nameFrench;
    // Treat an empty help string as missing so a keyword documented only in one
    // language still shows help (some DICO files leave AIDE1 empty).
    const helpEnglish = entry.helpEnglish;
    if (!entry.helpEnglish)
        entry.helpEnglish = entry.helpFrench || '<No help text available>';
    if (!entry.helpFrench)
        entry.helpFrench = helpEnglish || '<Aucun texte d\'aide disponible>';

    // Check for required fields
    if (!requiredFields.every(field => field in entry && entry[field] !== undefined)) {
        throw new DicoParseError(`Missing required fields in DICO entry: ${requiredFields.filter(field => !(field in entry) || entry[field] === undefined).join(', ')}`);
    }
}

function parseStringValue(value: string, convertLatex = false): string {
    let result = value;
    // Strip the surrounding quotes and un-double the inner apostrophes
    result = result
        .substring(1, result.length - 1)
        .replace(/''/g, '\'');
    return convertLatex ? latexToMarkdown(result) : result;
}

type DicoArray = string[] | number[] | boolean[];
function parseArray(value: string): DicoArray {
    //                 string          | number      | boolean
    const elementRx = /('(?:[^']|'')*')|([0-9.Ee+-]+)|(YES|NO|OUI|NON)|(;)|[^;]/g;
    const match = value.matchAll(elementRx);
    const result: DicoArray = [];
    let expectedType: string | null = null;
    for (const m of match) {
        if (m[1]) {
            // String value
            if (!expectedType)
                expectedType = 'string';
            else if (expectedType !== 'string')
                throw new DicoParseError(`Elements of mixed type in array: ${value}. Expected all elements to be of type ${expectedType}.`);
            (result as string[]).push(parseStringValue(m[1]));
        }
        else if (m[2]) {
            // Numeric value
            if (!expectedType)
                expectedType = 'number';
            else if (expectedType !== 'number')
                throw new DicoParseError(`Elements of mixed type in array: ${value}. Expected all elements to be of type ${expectedType}.`);
            const num = parseFloat(m[2]);
            if (isNaN(num)) {
                throw new DicoParseError(`Invalid number in array value: ${m[2]}`);
            }
            (result as number[]).push(num);
        }
        else if (m[3]) {
            // Logical value
            if (!expectedType)
                expectedType = 'boolean';
            else if (expectedType !== 'boolean')
                throw new DicoParseError(`Elements of mixed type in array: ${value}. Expected all elements to be of type ${expectedType}.`);
            const boolValue = m[3].toUpperCase();
            (result as boolean[]).push(boolValue === 'YES' || boolValue === 'OUI');
        }
        else if (m[4] || m[0].trim() === '') {
            // Separator or whitespace, ignore
        }
        else {
            throw new DicoParseError(`Invalid array value: ${m[0]}. Expected a string, number, or logical value.`);
        }
    }
    if (result.length === 0) {
        throw new DicoParseError(`Empty array value: ${value}. Expected at least one element.`);
    }
    return result;
}

function parseCategories(value: string): string[] {
    const array = parseArray(value);
    if (typeof array[0] !== 'string')
        throw new DicoParseError(`Invalid categories value: ${value}. Expected an array of strings.`);
    // Official dictionaries use 1 to 3 levels; empty levels are dropped.
    return (array as string[]).filter(category => category.trim() !== '');
}

function parseSubmit(value: string): DicoSubmit {
    const submitRx = /^'([^;]+?)(?:-(READ|WRITE|READWRITE))?;([^;]+);(FACUL|OBLIG);(BIN|ASC);(LIT|ECR|ECRLIT);([A-Za-z0-9-]+)'$/;
    const match = value.match(submitRx);
    if (!match) {
        throw new DicoParseError(`Unrecognised SUBMIT value: ${value}.`);
    }
    const [, tempName, tempAccessStr, , requiredStr, binaryStr, , specialStr] = match;
    return {
        tempName,
        tempAccess: tempAccessStr as DicoSubmit['tempAccess'],
        required: requiredStr === 'OBLIG',
        binary: binaryStr === 'BIN',
        special: specialStr,
    };
}
