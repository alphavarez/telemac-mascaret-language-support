/**
 * Parser for TELEMAC-MASCARET steering files (.cas), following the syntax of
 * the TELEMAC-2D user manual:
 *  - `=` or `:` separates a keyword from its value; the value may start on the
 *    next line and continue over several lines;
 *  - list values are separated by `;`;
 *  - strings containing spaces or `/ : = &` are written between apostrophes,
 *    with inner apostrophes doubled;
 *  - characters between two `/` on a line are a comment, and a line starting
 *    with `/` in the first column is a comment;
 *  - `&FIN` ends the file; `&ETA`, `&LIS`, `&IND`, `&STO` are commands;
 *  - a keyword name cannot be split over two lines.
 *
 * This module has no dependency on VS Code so it can be tested on its own.
 */

export interface Span {
    line: number;
    start: number;
    /** Exclusive end column. For tokens spanning lines this is on `endLine`. */
    end: number;
    endLine: number;
}

export type TokenKind = 'word' | 'string' | 'sep' | 'semi' | 'command';

export interface CasToken extends Span {
    kind: TokenKind;
    /** For strings: the content without quotes; otherwise the raw text. */
    text: string;
}

export interface CasValueElement extends Span {
    /** Value text: string content for quoted values, raw text otherwise. */
    text: string;
    quoted: boolean;
    /** Tokens making up this element (more than one indicates a syntax problem). */
    tokens: CasToken[];
}

export interface CasStatement {
    keyword: string;
    keywordSpan: Span;
    separator: CasToken;
    /** Elements separated by `;`. Empty elements (`;;`) have text ''. */
    elements: CasValueElement[];
    /** Raw value text (elements joined with `;`). */
    valueText: string;
    /** Position right after the separator, and end of the last value token. */
    valueStart: { line: number; character: number };
    valueEnd: { line: number; character: number };
}

export interface CasProblem extends Span {
    message: string;
    code: 'missing-keyword' | 'unterminated-string';
}

export interface CasDocument {
    /** All tokens outside comments (keywords, values, separators, commands). */
    tokens: CasToken[];
    statements: CasStatement[];
    commands: CasToken[];
    problems: CasProblem[];
    /** Line of &FIN, if present. Text after it is ignored by TELEMAC. */
    endLine?: number;
}

const SPECIAL = new Set(['=', ':', ';', '/']);

export function tokenize(text: string): { tokens: CasToken[]; problems: CasProblem[]; endLine?: number } {
    const lines = text.split(/\r?\n/);
    const tokens: CasToken[] = [];
    const problems: CasProblem[] = [];
    let open: { quote: string; line: number; start: number; content: string } | null = null;

    for (let li = 0; li < lines.length; li++) {
        const line = lines[li];
        if (!open && line.startsWith('/'))
            continue; // whole-line comment
        let inComment = false;
        let j = 0;
        while (j < line.length) {
            const c = line[j];
            if (open) {
                if (c === open.quote) {
                    if (line[j + 1] === open.quote) {
                        open.content += c;
                        j += 2;
                        continue;
                    }
                    tokens.push({ kind: 'string', text: open.content, line: open.line, start: open.start, endLine: li, end: j + 1 });
                    open = null;
                    j++;
                    continue;
                }
                open.content += c;
                j++;
                continue;
            }
            if (inComment) {
                if (c === '/')
                    inComment = false;
                j++;
                continue;
            }
            if (c === '/') {
                inComment = true;
                j++;
                continue;
            }
            if (c === ' ' || c === '\t' || c === '\r') {
                j++;
                continue;
            }
            if (c === '\'' || c === '"') {
                open = { quote: c, line: li, start: j, content: '' };
                j++;
                continue;
            }
            if (c === '=' || c === ':') {
                tokens.push({ kind: 'sep', text: c, line: li, start: j, endLine: li, end: j + 1 });
                j++;
                continue;
            }
            if (c === ';') {
                tokens.push({ kind: 'semi', text: c, line: li, start: j, endLine: li, end: j + 1 });
                j++;
                continue;
            }
            // A word: runs until whitespace or a special character. Apostrophes
            // inside a word belong to it (French names such as D'INFLUENCE).
            const start = j;
            while (j < line.length && !SPECIAL.has(line[j]) && line[j] !== ' ' && line[j] !== '\t'
                && !((line[j] === '\'' || line[j] === '"') && j === start))
                j++;
            const word = line.slice(start, j);
            if (word.startsWith('&') && /^&[A-Za-z]+$/.test(word)) {
                tokens.push({ kind: 'command', text: word.toUpperCase(), line: li, start, endLine: li, end: j });
                if (word.toUpperCase() === '&FIN')
                    return { tokens, problems, endLine: li };
                continue;
            }
            tokens.push({ kind: 'word', text: word, line: li, start, endLine: li, end: j });
        }
        if (open)
            open.content += ' ';
    }
    if (open) {
        problems.push({ code: 'unterminated-string', message: 'String is not closed (missing apostrophe).', line: open.line, start: open.start, endLine: open.line, end: open.start + 1 });
        tokens.push({ kind: 'string', text: open.content.trimEnd(), line: open.line, start: open.start, endLine: lines.length - 1, end: lines[lines.length - 1].length });
    }
    return { tokens, problems };
}

function makeElement(tokens: CasToken[]): CasValueElement | null {
    if (tokens.length === 0)
        return null;
    const first = tokens[0];
    const last = tokens[tokens.length - 1];
    const quoted = tokens.length === 1 && first.kind === 'string';
    return {
        text: quoted ? first.text : tokens.map(t => t.text).join(' '),
        quoted,
        tokens,
        line: first.line,
        start: first.start,
        endLine: last.endLine,
        end: last.end,
    };
}

export function parseCas(text: string): CasDocument {
    const { tokens, problems, endLine } = tokenize(text);
    const valueTokens = tokens.filter(t => t.kind !== 'command');
    const commands = tokens.filter(t => t.kind === 'command');
    const statements: CasStatement[] = [];

    // Index of every separator, and where its keyword starts.
    const starts: { sep: number; kwStart: number }[] = [];
    for (let i = 0; i < valueTokens.length; i++) {
        const tok = valueTokens[i];
        if (tok.kind !== 'sep')
            continue;
        let k = i - 1;
        const floor = starts.length ? starts[starts.length - 1].sep : -1;
        while (k > floor && valueTokens[k].kind === 'word' && valueTokens[k].line === tok.line) {
            // On the same line, the first element after a separator or ';' is a
            // value, not part of the next keyword (e.g. "A = 1 B = 2"). A keyword
            // cannot be split over lines, so all words before the separator on
            // its own line belong to it when the previous value ended earlier.
            const before = valueTokens[k - 1];
            if (before && (before.kind === 'sep' || before.kind === 'semi') && before.line === tok.line)
                break;
            k--;
        }
        if (k === i - 1) {
            problems.push({ code: 'missing-keyword', message: 'Value without a keyword before the separator.', line: tok.line, start: tok.start, endLine: tok.line, end: tok.end });
            continue;
        }
        starts.push({ sep: i, kwStart: k + 1 });
    }

    for (let s = 0; s < starts.length; s++) {
        const { sep, kwStart } = starts[s];
        const kwTokens = valueTokens.slice(kwStart, sep);
        const valueEndIndex = s + 1 < starts.length ? starts[s + 1].kwStart : valueTokens.length;
        const value = valueTokens.slice(sep + 1, valueEndIndex);

        const elements: CasValueElement[] = [];
        let current: CasToken[] = [];
        let lastSemi: CasToken | null = null;
        for (const tok of value) {
            if (tok.kind === 'semi') {
                const el = makeElement(current);
                elements.push(el ?? { text: '', quoted: false, tokens: [], line: tok.line, start: tok.start, endLine: tok.line, end: tok.start });
                current = [];
                lastSemi = tok;
                continue;
            }
            current.push(tok);
        }
        const tail = makeElement(current);
        if (tail)
            elements.push(tail);
        else if (lastSemi)
            elements.push({ text: '', quoted: false, tokens: [], line: lastSemi.line, start: lastSemi.end, endLine: lastSemi.line, end: lastSemi.end });

        const sepTok = valueTokens[sep];
        const lastTok = value.length ? value[value.length - 1] : sepTok;
        statements.push({
            keyword: kwTokens.map(t => t.text).join(' '),
            keywordSpan: { line: kwTokens[0].line, start: kwTokens[0].start, endLine: kwTokens[0].line, end: kwTokens[kwTokens.length - 1].end },
            separator: sepTok,
            elements,
            valueText: elements.map(e => e.quoted ? `'${e.text}'` : e.text).join(';'),
            valueStart: { line: sepTok.line, character: sepTok.end },
            valueEnd: { line: lastTok.endLine, character: lastTok.end },
        });
    }
    return { tokens, statements, commands, problems, endLine };
}

/** Compares positions: negative if a < b. */
export function comparePos(a: { line: number; character: number }, b: { line: number; character: number }): number {
    return a.line !== b.line ? a.line - b.line : a.character - b.character;
}

export function spanContains(span: Span, line: number, character: number): boolean {
    return comparePos({ line: span.line, character: span.start }, { line, character }) <= 0
        && comparePos({ line, character }, { line: span.endLine, character: span.end }) <= 0;
}

/** The statement whose keyword or value contains the position, if any. */
export function statementAt(doc: CasDocument, line: number, character: number): { statement: CasStatement; inKeyword: boolean } | null {
    for (const st of doc.statements) {
        if (spanContains(st.keywordSpan, line, character))
            return { statement: st, inKeyword: true };
        if (comparePos(st.valueStart, { line, character }) <= 0 && comparePos({ line, character }, st.valueEnd) <= 0)
            return { statement: st, inKeyword: false };
    }
    return null;
}
