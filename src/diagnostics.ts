import * as vscode from 'vscode';
import { CasStatement, CasValueElement, parseCas, Span } from './casParser';
import { Config } from './config';
import {
    BUNDLED_VERSIONS, DicoEntry, DicoModule, MODULE_LABELS, VERSION_LABELS, dicoEntries, dicoSource, detectModule,
    findDicoEntries, getChoices, getDicoEntry, normalizeKeyword, onDicoLoaded, otherVersionsWith, versionLabel,
} from './dico';

export type CheckSeverity = 'error' | 'warning' | 'info';

export interface CasCheck extends Span {
    message: string;
    severity: CheckSeverity;
    code: string;
}

const INT_RX = /^[+-]?\d+$/;
/** Fortran-style reals; TELEMAC accepts both '.' and ',' as decimal point. */
const REAL_RX = /^[+-]?(\d+([.,]\d*)?|[.,]\d+)([EeDd][+-]?\d+)?$/;
/** Accepted logical values (TELEMAC-2D user manual). */
const LOGICALS = new Set(['1', 'OUI', 'YES', '.TRUE.', 'TRUE', 'VRAI', '0', 'NON', 'NO', '.FALSE.', 'FALSE', 'FAUX']);
const MAX_STRING_LENGTH = 144;

export function isDictionaryFile(fileName: string): boolean {
    const base = fileName.split(/[\\/]/).pop() ?? '';
    return /\.dico$/i.test(base) || /^...DICO$/i.test(base);
}

function parseReal(text: string): number {
    return parseFloat(text.replace(',', '.').replace(/[Dd]/, 'E'));
}

function levenshtein(a: string, b: string, max: number): number {
    if (Math.abs(a.length - b.length) > max)
        return max + 1;
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
        const cur = [i];
        let rowMin = i;
        for (let j = 1; j <= b.length; j++) {
            cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
            rowMin = Math.min(rowMin, cur[j]);
        }
        if (rowMin > max)
            return max + 1;
        prev = cur;
    }
    return prev[b.length];
}

/** Closest known keyword name, for "did you mean" hints and quick fixes. */
export function suggestKeyword(keyword: string, module: DicoModule | null): string | null {
    const key = normalizeKeyword(keyword);
    const max = Math.max(2, Math.floor(key.length * 0.25));
    const modules = module && dicoEntries[module].length ? [module] : Object.values(DicoModule);
    let best: string | null = null;
    let bestDist = max + 1;
    for (const m of modules) {
        for (const entry of dicoEntries[m]) {
            for (const name of [entry.nameEnglish, entry.nameFrench]) {
                const d = levenshtein(key, normalizeKeyword(name), Math.min(max, bestDist));
                if (d < bestDist) {
                    bestDist = d;
                    best = name;
                }
            }
        }
    }
    return bestDist <= max ? best : null;
}

function formatChoices(entry: DicoEntry): string {
    const choices = getChoices(entry);
    const shown = choices.slice(0, 8).map(c => c.label ? `${c.value} (${c.label})` : c.value);
    return shown.join(', ') + (choices.length > 8 ? ', …' : '');
}

function checkElement(entry: DicoEntry, keyword: string, el: CasValueElement, out: CasCheck[]): void {
    const push = (message: string, code: string, severity: CheckSeverity = 'warning'): void => {
        out.push({ ...spanOf(el), message, code, severity });
    };

    if (el.tokens.length > 1) {
        push('Unexpected text in the value. Strings containing spaces must be quoted; otherwise a "=" or ":" may be missing.', 'unexpected-text');
        return;
    }
    const v = el.text.trim();
    if (v === '' && !el.quoted)
        return;

    switch (entry.type) {
        case 'INTEGER':
            if (!INT_RX.test(v))
                return push(`"${v}" is not an integer; ${keyword} expects an integer.`, 'invalid-type');
            break;
        case 'REAL':
            if (!REAL_RX.test(v))
                return push(`"${v}" is not a real number; ${keyword} expects a real.`, 'invalid-type');
            break;
        case 'LOGICAL':
            if (!LOGICALS.has(v.toUpperCase()))
                return push(`"${v}" is not a logical value. Use YES or NO (also accepted: OUI/NON, TRUE/FALSE, VRAI/FAUX, 1/0).`, 'invalid-type');
            break;
        case 'STRING':
            if (v.length > MAX_STRING_LENGTH)
                push(`String is ${v.length} characters long; TELEMAC accepts at most ${MAX_STRING_LENGTH}.`, 'string-too-long');
            break;
    }

    const choices = [...getChoices(entry), ...getChoices(entry, true)];
    if (choices.length > 0) {
        // The list of options is the stricter check; a range check would only repeat it.
        if (entry.type === 'INTEGER') {
            if (!choices.some(c => INT_RX.test(c.value) && Number(c.value) === Number(v)))
                push(`${v} is not an allowed value for ${keyword}. Allowed: ${formatChoices(entry)}.`, 'invalid-value');
        }
        else if (entry.type === 'STRING') {
            // Output-variable code lists (U, V, H, 1A1, CS1, T*…) are not exhaustive in
            // the dictionaries and accept user wildcards, so they are not checked.
            const codeList = choices.some(c => c.label !== undefined) && choices.every(c => !INT_RX.test(c.value));
            const allowed = new Set(choices.map(c => c.value.trim().toUpperCase()));
            // A value may also list several options in one string: 'TOMAWAC,GAIA'.
            const parts = v.split(',').map(p => p.trim().toUpperCase());
            if (!codeList && !allowed.has(v.toUpperCase()) && !parts.every(p => allowed.has(p)))
                push(`'${v}' is not an allowed value for ${keyword}. Allowed: ${formatChoices(entry)}.`, 'invalid-value');
        }
        return;
    }

    if ((entry.type === 'INTEGER' || entry.type === 'REAL') && (entry.rangeMin !== undefined || entry.rangeMax !== undefined)) {
        const n = parseReal(v);
        if (entry.rangeMin !== undefined && n < entry.rangeMin || entry.rangeMax !== undefined && n > entry.rangeMax)
            // Ranges (CONTROLE) are meant for user interfaces and some look wrong
            // (e.g. 0;Inf for a coordinate translation), so this is informational.
            push(`${v} is outside the range given in the dictionary for ${keyword} (${entry.rangeMin ?? '−∞'} to ${entry.rangeMax ?? '∞'}).`, 'out-of-range', 'info');
    }
}

function spanOf(s: Span): Span {
    return { line: s.line, start: s.start, endLine: s.endLine, end: s.end };
}

function checkStatement(st: CasStatement, entry: DicoEntry, out: CasCheck[]): void {
    const meaningful = st.elements.filter(e => e.quoted || e.text.trim() !== '');
    if (meaningful.length === 0) {
        out.push({ ...spanOf(st.separator), message: `Missing value for ${st.keyword}.`, code: 'missing-value', severity: 'warning' });
        return;
    }
    for (const el of st.elements)
        checkElement(entry, st.keyword, el, out);
}

/**
 * Checks a steering file. `module` is the module the file belongs to (null when
 * it cannot be inferred: keywords are then looked up in every module).
 */
export function checkSteeringFile(text: string, module: DicoModule | null, maxLineLength = 72): CasCheck[] {
    const out: CasCheck[] = [];
    const doc = parseCas(text);

    for (const p of doc.problems)
        out.push({ ...spanOf(p), message: p.message, code: p.code, severity: p.code === 'unterminated-string' ? 'error' : 'warning' });

    const lines = text.split(/\r?\n/);
    if (maxLineLength > 0) {
        // Only keywords and values count: comments past the limit are harmless
        // and common in the official examples.
        const contentEnd = new Map<number, number>();
        for (const tok of doc.tokens) {
            const end = tok.endLine === tok.line ? tok.end : lines[tok.line].trimEnd().length;
            contentEnd.set(tok.line, Math.max(contentEnd.get(tok.line) ?? 0, end));
        }
        for (const [i, end] of contentEnd) {
            if (end > maxLineLength) {
                out.push({
                    line: i, start: maxLineLength, endLine: i, end, severity: 'warning', code: 'line-too-long',
                    message: `Text beyond column ${maxLineLength}: TELEMAC reads ${maxLineLength} characters per line of a steering file. Continue the value on the next line.`,
                });
            }
        }
    }

    const moduleAvailable = !module || dicoEntries[module].length > 0;
    if (!moduleAvailable && module) {
        const hint = module === DicoModule.Sisyphe ? ' Sisyphe was replaced by GAIA in v9.' : '';
        out.push({
            line: 0, start: 0, endLine: 0, end: Math.min(lines[0]?.length ?? 0, 1), severity: 'info', code: 'module-unavailable',
            message: `${MODULE_LABELS[module]} is not part of TELEMAC-MASCARET ${versionLabel()}.${hint} Keyword checks are off for this file; select v8p4 with "TELEMAC-MASCARET: Select TELEMAC version" to check it.`,
        });
        return out;
    }
    const anyLoaded = Object.values(dicoEntries).some(list => list.length > 0);
    if (!anyLoaded)
        return out;

    // Same keyword = same dictionary entry (English and French names are one
    // keyword) and same index for indexed names ('LOI CONC 1 NOM' vs 'LOI CONC 2 NOM').
    const seen = new Map<string, CasStatement>();
    const keyOf = (entry: DicoEntry, written: string) =>
        `${entry.nameEnglish}#${(normalizeKeyword(written).match(/\b\d+\b/g) ?? []).join(',')}`;
    for (const st of doc.statements) {
        const entry = module ? getDicoEntry(st.keyword, module) : findDicoEntries(st.keyword)[0]?.entry ?? null;
        if (!entry) {
            const elsewhere = module ? findDicoEntries(st.keyword)[0] : undefined;
            const inOtherVersions = module ? otherVersionsWith(module, st.keyword) : [];
            let message: string;
            if (module && inOtherVersions.length > 0) {
                const other = inOtherVersions[0];
                const loaded = dicoSource.kind === 'bundled' ? dicoSource.bundledVersion : null;
                const when = loaded && BUNDLED_VERSIONS.indexOf(other) < BUNDLED_VERSIONS.indexOf(loaded)
                    ? `it was added in ${VERSION_LABELS[other]}`
                    : loaded ? `it exists in ${VERSION_LABELS[other]} and was removed or renamed since`
                        : `it exists in the bundled ${VERSION_LABELS[other]} dictionary`;
                message = `"${st.keyword}" is not a ${MODULE_LABELS[module]} keyword in TELEMAC-MASCARET ${versionLabel()}; ${when}.`;
            }
            else if (elsewhere && module)
                message = `"${st.keyword}" is a ${MODULE_LABELS[elsewhere.module]} keyword, not a ${MODULE_LABELS[module]} one.`;
            else {
                const where = module ? `${MODULE_LABELS[module]} keyword` : 'keyword';
                const suggestion = suggestKeyword(st.keyword, module);
                message = `Unknown ${where} "${st.keyword}" (TELEMAC-MASCARET ${versionLabel()}).${suggestion ? ` Did you mean "${suggestion}"?` : ''}`;
            }
            out.push({ ...spanOf(st.keywordSpan), message, code: 'unknown-keyword', severity: 'warning' });
            continue;
        }
        const dupKey = keyOf(entry, st.keyword);
        const previous = seen.get(dupKey);
        if (previous)
            out.push({ ...spanOf(st.keywordSpan), message: `${st.keyword} is also set on line ${previous.keywordSpan.line + 1}.`, code: 'duplicate-keyword', severity: 'info' });
        else
            seen.set(dupKey, st);
        checkStatement(st, entry, out);
    }
    return out;
}

// ---------------------------------------------------------------------------
// VS Code wiring
// ---------------------------------------------------------------------------

const SEVERITY: Record<CheckSeverity, vscode.DiagnosticSeverity> = {
    error: vscode.DiagnosticSeverity.Error,
    warning: vscode.DiagnosticSeverity.Warning,
    info: vscode.DiagnosticSeverity.Information,
};

export class CasDiagnostics implements vscode.Disposable {
    private readonly collection = vscode.languages.createDiagnosticCollection('telemac-mascaret');
    private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
    private readonly disposables: vscode.Disposable[] = [];

    constructor() {
        this.disposables.push(
            this.collection,
            vscode.workspace.onDidOpenTextDocument(doc => this.validate(doc)),
            vscode.workspace.onDidChangeTextDocument(e => this.schedule(e.document)),
            vscode.workspace.onDidCloseTextDocument(doc => this.collection.delete(doc.uri)),
            onDicoLoaded(() => this.validateAll()),
        );
    }

    validateAll(): void {
        for (const doc of vscode.workspace.textDocuments)
            this.validate(doc);
    }

    private schedule(doc: vscode.TextDocument): void {
        const key = doc.uri.toString();
        clearTimeout(this.timers.get(key));
        this.timers.set(key, setTimeout(() => {
            this.timers.delete(key);
            this.validate(doc);
        }, 300));
    }

    validate(doc: vscode.TextDocument): void {
        if (doc.languageId !== 'casefile' || isDictionaryFile(doc.fileName) || !Config.diagnosticsEnabled) {
            this.collection.delete(doc.uri);
            return;
        }
        const checks = checkSteeringFile(doc.getText(), detectModule(doc), Config.maxLineLength);
        this.collection.set(doc.uri, checks.map(c => {
            const d = new vscode.Diagnostic(new vscode.Range(c.line, c.start, c.endLine, c.end), c.message, SEVERITY[c.severity]);
            d.source = 'TELEMAC-MASCARET';
            d.code = c.code;
            return d;
        }));
    }

    dispose(): void {
        for (const t of this.timers.values())
            clearTimeout(t);
        for (const d of this.disposables)
            d.dispose();
    }
}

/** Quick fix: replace an unknown keyword by the closest known one. */
export class CasQuickFixes implements vscode.CodeActionProvider {
    static readonly kinds = [vscode.CodeActionKind.QuickFix];

    provideCodeActions(document: vscode.TextDocument, _range: vscode.Range, context: vscode.CodeActionContext): vscode.CodeAction[] {
        const actions: vscode.CodeAction[] = [];
        for (const diag of context.diagnostics) {
            if (diag.source !== 'TELEMAC-MASCARET' || diag.code !== 'unknown-keyword')
                continue;
            const suggestion = suggestKeyword(document.getText(diag.range), detectModule(document));
            if (!suggestion)
                continue;
            const action = new vscode.CodeAction(`Replace with "${suggestion}"`, vscode.CodeActionKind.QuickFix);
            action.edit = new vscode.WorkspaceEdit();
            action.edit.replace(document.uri, diag.range, suggestion);
            action.diagnostics = [diag];
            action.isPreferred = true;
            actions.push(action);
        }
        return actions;
    }
}
