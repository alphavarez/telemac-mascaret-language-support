import * as vscode from 'vscode';
import { parseCas, tokenize } from './casParser';
import {
    dicoEntries, DicoEntry, DicoModule, MODULE_LABELS, detectModule, findDicoEntries, getChoices,
    getEntryDetails, isFrenchName,
} from './dico';
import { isDictionaryFile } from './diagnostics';

export const COMPLETION_TRIGGERS = ['=', ':', ' ', '\'', ',', ';'];

interface LineState {
    inComment: boolean;
    /** Quote character of a string still open at the cursor. */
    openQuote: string | null;
    openQuoteIndex: number;
    /** Index of the first separator on the line, -1 if none. */
    sepIndex: number;
    /** Index of the last ';' on the line, -1 if none. */
    semiIndex: number;
}

/** Scans the text of the current line before the cursor (same rules as the parser). */
function scanLine(before: string): LineState {
    const state: LineState = { inComment: false, openQuote: null, openQuoteIndex: -1, sepIndex: -1, semiIndex: -1 };
    let wordStart = true;
    for (let i = 0; i < before.length; i++) {
        const c = before[i];
        if (state.openQuote) {
            if (c === state.openQuote) {
                if (before[i + 1] === c) {
                    i++;
                    continue;
                }
                state.openQuote = null;
            }
            continue;
        }
        if (state.inComment) {
            if (c === '/')
                state.inComment = false;
            continue;
        }
        if (c === '/') {
            state.inComment = true;
            continue;
        }
        if ((c === '\'' || c === '"') && wordStart) {
            state.openQuote = c;
            state.openQuoteIndex = i;
            continue;
        }
        if ((c === '=' || c === ':') && state.sepIndex < 0)
            state.sepIndex = i;
        if (c === ';')
            state.semiIndex = i;
        wordStart = c === ' ' || c === '\t' || c === '=' || c === ':' || c === ';';
    }
    return state;
}

export class CasefileCompletionItemProvider implements vscode.CompletionItemProvider {
    provideCompletionItems(document: vscode.TextDocument, position: vscode.Position, _token: vscode.CancellationToken, _context: vscode.CompletionContext): vscode.ProviderResult<vscode.CompletionItem[]> {
        if (isDictionaryFile(document.fileName))
            return null;
        const before = document.lineAt(position.line).text.substring(0, position.character);
        if (before.startsWith('/') || /^\s*&/.test(before))
            return null;
        const state = scanLine(before);
        if (state.inComment)
            return null;

        const module = detectModule(document);
        const textBefore = document.getText(new vscode.Range(0, 0, position.line, position.character));
        const doc = parseCas(textBefore);
        const last = doc.statements[doc.statements.length - 1];
        const lastToken = tokenize(textBefore).tokens.at(-1);
        const sepOnThisLine = state.sepIndex >= 0 && last && last.separator.line === position.line;
        // A trailing separator or ';' means a value (or another list element) is expected,
        // whether it is on this line or a previous one.
        const continuesValue = last && lastToken && (lastToken.kind === 'sep' || lastToken.kind === 'semi');

        if (last && (sepOnThisLine || continuesValue))
            return this.valueItems(last.keyword, module, before, state, position);
        if (state.openQuote)
            return null;
        return this.keywordItems(module, before, position);
    }

    private keywordItems(module: DicoModule | null, before: string, position: vscode.Position): vscode.CompletionItem[] | null {
        const start = before.length - before.trimStart().length;
        const range = new vscode.Range(position.line, start, position.line, position.character);
        const modules = module && dicoEntries[module].length ? [module] : Object.values(DicoModule);

        const result: vscode.CompletionItem[] = [];
        const seen = new Set<string>();
        for (const m of modules) {
            for (const entry of dicoEntries[m]) {
                if (seen.has(entry.nameEnglish))
                    continue;
                seen.add(entry.nameEnglish);
                result.push(this.keywordItem(entry, entry.nameEnglish, m, range, false));
                if (entry.nameFrench !== entry.nameEnglish)
                    result.push(this.keywordItem(entry, entry.nameFrench, m, range, true));
            }
        }
        return result.length ? result : null;
    }

    private keywordItem(entry: DicoEntry, label: string, module: DicoModule, range: vscode.Range, french: boolean): vscode.CompletionItem {
        const item = new vscode.CompletionItem(label, vscode.CompletionItemKind.Keyword);
        item.documentation = getEntryDetails(entry, module, { french });
        item.range = range;
        item.detail = `${entry.type} · ${MODULE_LABELS[module]}`;
        item.filterText = label + (entry.mnemo ? ` ${entry.mnemo}` : '');
        return item;
    }

    private valueItems(keyword: string, module: DicoModule | null, before: string, state: LineState, position: vscode.Position): vscode.CompletionItem[] | null {
        const match = findDicoEntries(keyword, module)[0];
        if (!match)
            return null;
        const { entry } = match;
        const french = isFrenchName(entry, keyword);
        const choices = getChoices(entry, french);
        const defaultValue = (french ? entry.defaultFrench ?? entry.defaultEnglish : entry.defaultEnglish ?? entry.defaultFrench)?.trim();
        const defaultBare = defaultValue?.replace(/^'(.*)'$/, '$1').trim().toUpperCase();

        // Start of the element being typed: after the separator or last ';' on this line.
        const boundary = Math.max(state.sepIndex, state.semiIndex) + 1;
        let elementStart = boundary;
        while (elementStart < before.length && /\s/.test(before[elementStart]))
            elementStart++;
        const typedQuote = state.openQuote && state.openQuoteIndex >= elementStart ? state.openQuote : null;
        const elementRange = new vscode.Range(position.line, elementStart, position.line, position.character);

        const items: vscode.CompletionItem[] = [];
        const add = (value: string, description: string | undefined, kind: vscode.CompletionItemKind, insert: string, range: vscode.Range, index: number) => {
            const isDefault = defaultBare !== undefined && value.toUpperCase() === defaultBare;
            const item = new vscode.CompletionItem({ label: value, description: [description, isDefault ? '(default)' : undefined].filter(Boolean).join(' ') || undefined }, kind);
            item.insertText = insert;
            item.range = range;
            item.filterText = `${typedQuote ?? ''}${value} ${description ?? ''}`.trim();
            item.sortText = String(index).padStart(4, '0');
            item.preselect = isDefault;
            item.detail = entry.nameEnglish;
            items.push(item);
        };

        const codeList = entry.type === 'STRING' && choices.some(c => c.label !== undefined) && choices.every(c => !/^-?\d+$/.test(c.value));
        if (codeList) {
            // Variable codes inside one string, e.g. 'U,V,H': insert only the code being typed.
            let s = position.character;
            while (s > 0 && !/[\s,;'"=:]/.test(before[s - 1]))
                s--;
            const codeRange = new vscode.Range(position.line, s, position.line, position.character);
            choices.forEach((c, i) => {
                const item = new vscode.CompletionItem({ label: c.value, description: c.label }, vscode.CompletionItemKind.EnumMember);
                item.range = codeRange;
                item.filterText = `${c.value} ${c.label ?? ''}`;
                item.sortText = String(i).padStart(4, '0');
                item.detail = entry.nameEnglish;
                items.push(item);
            });
            return items;
        }

        if (choices.length > 0) {
            choices.forEach((c, i) => {
                if (entry.type === 'STRING') {
                    const q = typedQuote ?? '\'';
                    add(c.value === '' ? `${q}${q}` : c.value, c.value === '' ? 'empty' : c.label, vscode.CompletionItemKind.EnumMember, `${q}${c.value}${q}`, elementRange, i);
                }
                else {
                    add(c.value, c.label, vscode.CompletionItemKind.EnumMember, c.value, elementRange, i);
                }
            });
            return items;
        }

        if (entry.type === 'LOGICAL') {
            const [yes, no] = french ? ['OUI', 'NON'] : ['YES', 'NO'];
            const defaultTrue = defaultBare !== undefined && ['1', 'OUI', 'YES', '.TRUE.', 'TRUE', 'VRAI'].includes(defaultBare);
            const defaultFalse = defaultBare !== undefined && !defaultTrue;
            [[yes, defaultTrue], [no, defaultFalse]].forEach(([value, isDefault], i) => {
                const item = new vscode.CompletionItem({ label: value as string, description: isDefault ? '(default)' : undefined }, vscode.CompletionItemKind.Value);
                item.range = elementRange;
                item.sortText = String(i);
                item.preselect = isDefault as boolean;
                item.detail = entry.nameEnglish;
                items.push(item);
            });
            return items;
        }

        // No list of options: offer the default value, if any.
        if (defaultValue && defaultValue !== '\'\'') {
            const item = new vscode.CompletionItem({ label: defaultValue, description: '(default)' }, vscode.CompletionItemKind.Value);
            item.range = elementRange;
            item.detail = entry.nameEnglish;
            items.push(item);
        }
        return items.length ? items : null;
    }
}
