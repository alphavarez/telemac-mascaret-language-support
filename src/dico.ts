/** For parsing DICO files */

import * as vscode from 'vscode';
import { Config } from './config';
import { GLOBALS } from './globals';
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
    /** This is used to give information for the interface on how to enter the values for the keyword. */
    appearence?: Appearence;
    categoriesEnglish: string[];
    categoriesFrench: string[];
    required: boolean;
    helpEnglish: string;
    helpFrench: string;
}

export type Appearence = 'LIST' | 'TUPLE' | 'DYNLIST';
export type KeywordType = 'STRING' | 'REAL' | 'INTEGER' | 'LOGICAL';

export interface DicoSubmit {
    tempName: string;
    tempAccess: 'READ' | 'WRITE' | 'READWRITE';
    required: boolean;
    binary: boolean;
    special?: SubmitSpecial;
}

export enum SubmitSpecial {
    /** geometry file will go through partel. */
    SELAFIN_GEOM = 'SELAFIN-GEOM',
    /** mesh file will go through but only the result field will be partitioned it will use the mesh from the SELAFIN-GEOM file. */
    SELAFIN = 'SELAFIN',
    /** boundary condition file. */
    CONLIM = 'CONLIM',
    /** file will be copied for each processor. */
    PARAL = 'PARAL',
    /** no copy only the main processor will be able to access it. */
    SCAL = 'SCAL',
    /** ZONES, SECTIONS: file added to partel with SELAFIN-GEOM. */
    WEIRS = 'WEIRS',
    /** keyword for the steering file. */
    CAS = 'CAS',
    /** keyword for the dictionary. */
    DICO = 'DICO',
    /** user fortran. */
    FORTRAN = 'FORTRAN',
    /** files for coupling with Delwaq */
    DELWAQHYD = 'DELWAQHYD',
    /** files for coupling with Delwaq */
    DELWAQSEG = 'DELWAQSEG',
    /** files for coupling with Delwaq */
    DELWAQMET = 'DELWAQMET',
    /** files for coupling with Delwaq */
    DELWAQPTS = 'DELWAQPTS',
    /** Unknown */
    MULTI2 = 'MULTI2',
}

export class DicoParseError extends Error {}

export const dicoEntries: Record<DicoModule, DicoEntry[]> =
    Object.fromEntries(
        Object.values(DicoModule).map(module => [module, [] as DicoEntry[]]),
    ) as Record<DicoModule, DicoEntry[]>;

export function getDicoEntry(keyword: string, module: DicoModule): DicoEntry | null {
    return dicoEntries[module].find(entry => entry.nameEnglish === keyword || entry.nameFrench === keyword) ?? null;
}

export interface DicoMatch {
    module: DicoModule;
    entry: DicoEntry;
}

/**
 * Find a keyword across every loaded module (English or French name).
 * If `preferred` is given, matches from that module are sorted first.
 */
export function findDicoEntries(keyword: string, preferred?: DicoModule | null): DicoMatch[] {
    const matches: DicoMatch[] = [];
    for (const module of Object.values(DicoModule)) {
        const entry = dicoEntries[module].find(e => e.nameEnglish === keyword || e.nameFrench === keyword);
        if (entry)
            matches.push({ module, entry });
    }
    if (preferred)
        matches.sort((a, b) => Number(b.module === preferred) - Number(a.module === preferred));
    return matches;
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
        ['pos', DicoModule.Postel3d],
        ['stb', DicoModule.Stbtel],
        ['mas', DicoModule.Mascaret],
    ];
    for (const [prefix, module] of prefixes) {
        if (name.startsWith(prefix))
            return module;
    }
    return null;
}

async function findLocalTelemacUri(): Promise<vscode.Uri | null> {
    if (Config.telemacDirectory)
        return vscode.Uri.file(Config.telemacDirectory);

    // Find latest installed Telemac version in the default Windows install location
    const versions = ['9.1', '9.0', 'V8P5', 'V8P4'];
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

export async function loadDico(extensionUri: vscode.Uri): Promise<void> {
    const telemacUri = await findLocalTelemacUri();

    // Additional DICO files supplied by the user (loaded as extra Telemac2d entries)
    const additionalDicoFiles = Config.additionalDicoFiles;

    const parseErrors: Error[] = [];
    const missingModules: DicoModule[] = [];
    const bundledModules: DicoModule[] = [];

    // Load DICO files for each module. A local Telemac installation (accurate for
    // the user's version) takes precedence; the DICO files bundled with the
    // extension are used as a fallback so the extension also works with no local
    // installation and on any operating system.
    await Promise.all(Object.values(DicoModule).map(async module => {
        // 1. Try the local Telemac installation.
        if (telemacUri) {
            try {
                const uri = vscode.Uri.joinPath(telemacUri, DICO_PATHS[module]);
                dicoEntries[module] = await parseDicoFromUri(uri);
                return;
            }
            catch (e) {
                if (e instanceof DicoParseError) {
                    parseErrors.push(e);
                    GLOBALS.outputChannel.error(`Error parsing installed DICO file for module ${module}: ${e.message}`);
                    return;
                }
                else if (!(e instanceof vscode.FileSystemError && e.code === 'FileNotFound')) {
                    throw e;
                }
                // FileNotFound -> fall through to the bundled copy.
            }
        }

        // 2. Fall back to the DICO file bundled with the extension.
        try {
            const uri = vscode.Uri.joinPath(extensionUri, 'dico', `${module.toLowerCase()}.dico`);
            dicoEntries[module] = await parseDicoFromUri(uri);
            bundledModules.push(module);
        }
        catch (e) {
            if (e instanceof DicoParseError) {
                parseErrors.push(e);
                GLOBALS.outputChannel.error(`Error parsing bundled DICO file for module ${module}: ${e.message}`);
            }
            else if (e instanceof vscode.FileSystemError && e.code === 'FileNotFound') {
                missingModules.push(module);
            }
            else {
                throw e;
            }
        }
    }));

    // Load any user-specified additional DICO files, appending to Telemac2d.
    for (const file of additionalDicoFiles) {
        try {
            const uri = vscode.Uri.file(file);
            dicoEntries[DicoModule.Telemac2d].push(...await parseDicoFromUri(uri));
        }
        catch (e) {
            GLOBALS.outputChannel.error(`Could not load additional DICO file "${file}": ${e instanceof Error ? e.message : String(e)}`);
        }
    }

    const totalEntries = Object.values(dicoEntries).reduce((n, list) => n + list.length, 0);
    GLOBALS.outputChannel.info(
        `Loaded ${totalEntries} keywords. Source: ${telemacUri ? `installation at ${telemacUri.fsPath}` : 'bundled reference'}. `
        + `Bundled fallback used for: ${bundledModules.length ? bundledModules.join(', ') : 'none'}.`,
    );

    if (parseErrors.length > 0) {
        const checkOutputItem = 'Check output log';
        vscode.window.showErrorMessage(`${parseErrors.length} errors occurred while parsing DICO files.`, checkOutputItem).then(selection => {
            if (selection === checkOutputItem)
                GLOBALS.outputChannel.show();
        });
    }
    // Modules with neither an installed nor a bundled DICO (e.g. Gaia/Khione when
    // no local installation is present). Reported quietly in the log only.
    if (missingModules.length > 0) {
        GLOBALS.outputChannel.warn(`No DICO available for the following modules: ${missingModules.join(', ')}. Install Telemac or add them via "telemacMascaret.additionalDicoFiles" to enable them.`);
    }
}

/**
 * Reassemble DICO logical lines. Some official DICO files wrap a single quoted
 * value (typically AIDE/AIDE1 help text) across several physical lines. The
 * line-based key/value regex would only capture the first physical line and
 * lose the rest, so we join any line that leaves a quote open onto the next
 * one. Comment (`/`) and directive (`&`) lines are left untouched.
 */
function joinWrappedValues(content: string): string {
    const quoteIsOpen = (s: string): boolean =>
        (s.replace(/''/g, '').match(/'/g)?.length ?? 0) % 2 === 1;

    const out: string[] = [];
    let buffer: string | null = null;
    for (const line of content.split(/\r?\n/)) {
        const trimmed = line.trimStart();
        if (buffer === null) {
            if (trimmed === '' || trimmed.startsWith('/') || trimmed.startsWith('&')) {
                out.push(line);
                continue;
            }
            buffer = line;
        }
        else {
            buffer += ' ' + line.trim();
        }
        if (quoteIsOpen(buffer)) {
            continue; // keep accumulating until the string is closed
        }
        out.push(buffer);
        buffer = null;
    }
    if (buffer !== null)
        out.push(buffer);
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
                    try { currentEntry.index = parseInt(value, 10); }
                    catch (e) { throw new DicoParseError(`Invalid INDEX value: ${value}. Expected an integer.`, {cause: e}); }
                    break;
                case 'TAILLE':
                    try { currentEntry.taille = parseInt(value, 10); }
                    catch (e) { throw new DicoParseError(`Invalid TAILLE value: ${value}. Expected an integer.`, {cause: e}); }
                    break;
                case 'SUBMIT':
                    // A non-standard SUBMIT string should not discard the whole
                    // keyword (submit info is not used for hover/completion).
                    try {
                        currentEntry.submit = parseSubmit(value);
                    }
                    catch (e) {
                        GLOBALS.outputChannel.warn(`Ignoring invalid SUBMIT for keyword ${currentEntry.nameFrench ?? currentEntry.nameEnglish ?? '<UNKNOWN>'}: ${e instanceof Error ? e.message : String(e)}`);
                    }
                    break;
                case 'DEFAUT':
                    currentEntry.defaultFrench = value;
                    break;
                case 'DEFAUT1':
                    currentEntry.defaultEnglish = value;
                    break;
                case 'MNEMO':
                    currentEntry.mnemo = parseStringValue(value, true);
                    break;
                case 'CHOIX':
                    currentEntry.choiceFrench = parseArray(value);
                    break;
                case 'CHOIX1':
                    currentEntry.choiceEnglish = parseArray(value);
                    break;
                case 'APPARENCE':
                    if ((['LIST', 'TUPLE', 'DYNLIST'] satisfies Appearence[]).includes(value as Appearence)) {
                        currentEntry.appearence = value as Appearence;
                    }
                    break;
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
                    // Unused in Telemac
                    break;
                case 'CONTROLE':
                case 'PATHNODE':
                case 'ALLOCATE':
                case 'ALLOCATED':
                case 'ALLOCATED2':
                    // Undocumented but specified in official dico files
                    break;
                // TODO
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

export function getEntryDetails(entry: DicoEntry, module?: DicoModule): vscode.MarkdownString {
    // TODO: French option
    const markdown = new vscode.MarkdownString();
    markdown.appendMarkdown(`### ${entry.nameEnglish}`);
    if (module)
        markdown.appendMarkdown(`\n\n**Module:** ${module}`);
    markdown.appendMarkdown(`\n\n**Type:** ${toTitleCase(entry.type)}`);
    markdown.appendMarkdown(`\n\n**Dimension:** ${entry.taille}`);
    if (entry.nameFrench && entry.nameFrench !== entry.nameEnglish)
        markdown.appendMarkdown(`\n\n**French keyword:** ${entry.nameFrench}`);
    if (entry.mnemo)
        markdown.appendMarkdown(`\n\n**Mnemo:** \`${entry.mnemo}\``);
    if (entry.defaultEnglish)
        markdown.appendMarkdown(`\n\n**Default:** \`${entry.defaultEnglish}\``);
    if (entry.categoriesEnglish.length > 0)
        markdown.appendMarkdown(`\n\n**Category:** ${entry.categoriesEnglish.join(' › ')}`);
    markdown.appendMarkdown(`\n\n${entry.helpEnglish}`);

    markdown.isTrusted = false;
    return markdown;
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
        // 'defaultEnglish',
        // 'defaultFrench',
        // 'mnemo',
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
    entry.categoriesEnglish ??= [];
    entry.categoriesFrench ??= [];
    // Treat an empty help string as missing so a keyword documented only in one
    // language still shows help (some DICO files leave AIDE1 empty).
    const helpEnglish = entry.helpEnglish;
    if (!entry.helpEnglish)
        entry.helpEnglish = entry.helpFrench || '<No help text available>';
    if (!entry.helpFrench)
        entry.helpFrench = helpEnglish || '<Aucun texte d\'aide disponible>';

    // Check for required fields
    if (!requiredFields.every(field => field in entry)) {
        throw new DicoParseError(`Missing required fields in DICO entry: ${requiredFields.filter(field => !(field in entry)).join(', ')}`);
    }
}

function parseStringValue(value: string, convertLatex = false): string {
    let result = value;
    // Replace double single quotes with a single quote
    result = result
        .substring(1, result.length - 1)
        .replace(/(?<!^)''/g, '\'');
    if (convertLatex) {
        result = result
            .replace(/\\telkey\{(.+?)\}/g, '`$1`') // Convert \telkey{KEYWORD} to `KEYWORD`
            .replace(/\\(begin|end)\{(itemize|enumerate)\}/g, '') // Remove itemize and enumerate environments
            .replace(/\\item/g, '- ') // Convert \item to markdown list item
            .replace(/\\telemac\{2[Dd]\}/g, 'Telemac2D') // Convert \telemac{2D} to Telemac2D
            .replace(/\\(.)/g, '$1'); // Remove backslashes before any character (e.g. for LaTeX commands)
    }
    return result;
}

type DicoArray = string[] | number[] | boolean[];
function parseArray(value: string): DicoArray {
    //                 string          | number      | boolean
    const elementRx = /('(?:[^']|'')*')|([0-9.Ee+-]+)|(YES|NO|OUI|NON)|(;)|[^;]/g;
    const match = value.matchAll(elementRx);
    if (!match) {
        throw new DicoParseError(`Invalid array value: ${value}. Expected format like: "'VALUE1';'VALUE2';'VALUE3'" or "1;2;3"`);
    }
    const result: DicoArray = [];
    let expectedType: string | null = null;
    for (const m of match) {
        if (m[1]) {
            // String value
            if (!expectedType)
                expectedType = 'string';
            else if (expectedType !== 'string')
                throw new DicoParseError(`Elements of mixed type in array: ${value}. Expected all elements to be of type ${expectedType}.`);
            (result as string[]).push(parseStringValue(m[1], true));
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
            if (boolValue === 'YES' || boolValue === 'OUI') {
                (result as boolean[]).push(true);
            }
            else {
                (result as boolean[]).push(false);
            }
        }
        else if (m[4]) {
            // Separator, ignore
        }
        else if (m[0].trim() === '') {
            // Whitespace between elements, ignore
        }
        else {
            // Invalid element
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
    if (array.length !== 3)
        GLOBALS.outputChannel.warn(`Invalid categories value: ${value}. Expected exactly 3 categories.`);
    return array.filter(category => category !== '') as string[]; // Filter out empty categories
}

function parseSubmit(value: string): DicoSubmit {
    const submitRx = /^'([^;]+?)(?:-(READ|WRITE|READWRITE))?;([^;]+);(FACUL|OBLIG);(BIN|ASC);(LIT|ECR|ECRLIT);([A-Z0-9-]+)'$/;
    const match = value.match(submitRx);
    if (!match) {
        throw new DicoParseError(`Invalid SUBMIT value: ${value}. Expected format like: 'T2DBI1-READ;T2DBI1;FACUL;BIN;LIT;SELAFIN'`);
    }
    const [, tempName, tempAccessStr, tempName2, requiredStr, binaryStr, tempAccessStr2, specialStr] = match;

    // Validate the parsed values
    if (tempName2 !== tempName) {
        GLOBALS.outputChannel.warn(`Mismatched temp names in SUBMIT value: ${value}. Expected temp names to match.`);
    }
    if (
        tempAccessStr === 'READ' && tempAccessStr2 !== 'LIT'
        || tempAccessStr === 'WRITE' && tempAccessStr2 !== 'ECR'
        || tempAccessStr === 'READWRITE' && tempAccessStr2 !== 'ECRLIT'
    ) {
        GLOBALS.outputChannel.warn(`Mismatched temp access and access type in SUBMIT value: ${value}. Expected READ with LIT, WRITE with ECR, and READWRITE with ECRLIT.`);
    }
    if (!Object.values(SubmitSpecial).includes(specialStr as SubmitSpecial)) {
        GLOBALS.outputChannel.warn(`Unknown special value in SUBMIT: ${specialStr}. Expected one of ${Object.values(SubmitSpecial).join(', ')}`);
    }

    // Convert parsed values to appropriate types
    return {
        tempName,
        tempAccess: tempAccessStr as DicoSubmit['tempAccess'],
        required: requiredStr === 'OBLIG',
        binary: binaryStr === 'BIN',
        special: specialStr as SubmitSpecial,
    };
}
