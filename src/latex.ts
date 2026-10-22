/**
 * Converts the LaTeX found in TELEMAC-MASCARET dictionary help texts (AIDE /
 * AIDE1) into Markdown for VS Code hovers. The dictionaries use a small subset
 * of LaTeX: itemize/enumerate lists, the documentation macros \telkey,
 * \telfile, \telemac{2d} and module names, inline math ($k-\epsilon$) and a
 * few text-formatting commands.
 */

const GREEK: Record<string, string> = {
    alpha: 'α', beta: 'β', gamma: 'γ', Gamma: 'Γ', delta: 'δ', Delta: 'Δ',
    epsilon: 'ε', varepsilon: 'ε', zeta: 'ζ', eta: 'η', theta: 'θ', Theta: 'Θ',
    vartheta: 'ϑ', iota: 'ι', kappa: 'κ', lambda: 'λ', Lambda: 'Λ', mu: 'μ',
    nu: 'ν', xi: 'ξ', Xi: 'Ξ', pi: 'π', Pi: 'Π', rho: 'ρ', sigma: 'σ',
    Sigma: 'Σ', tau: 'τ', upsilon: 'υ', phi: 'φ', varphi: 'φ', Phi: 'Φ',
    chi: 'χ', psi: 'ψ', Psi: 'Ψ', omega: 'ω', Omega: 'Ω',
};

const SYMBOLS: Record<string, string> = {
    circ: '°', degree: '°', times: '×', cdot: '·', ldots: '…', dots: '…',
    cdots: '⋯', infty: '∞', leq: '≤', le: '≤', geq: '≥', ge: '≥', neq: '≠',
    ne: '≠', approx: '≈', simeq: '≃', sim: '∼', pm: '±', mp: '∓',
    partial: '∂', nabla: '∇', sum: '∑', int: '∫', rightarrow: '→', to: '→',
    leftarrow: '←', Rightarrow: '⇒', propto: '∝', ll: '≪', gg: '≫',
    sin: 'sin', cos: 'cos', tan: 'tan', exp: 'exp', log: 'log', ln: 'ln',
    max: 'max', min: 'min', quad: ' ', qquad: '  ', textdegree: '°',
};

/** Product and module macros defined in the TELEMAC documentation sources. */
const PRODUCTS: Record<string, string> = {
    tel: 'TELEMAC', telemacsystem: 'TELEMAC-MASCARET', tomawac: 'TOMAWAC',
    gaia: 'GAIA', khione: 'KHIONE', waqtel: 'WAQTEL', sisyphe: 'SISYPHE',
    stbtel: 'STBTEL', artemis: 'ARTEMIS', nestor: 'NESTOR', postel: 'POSTEL-3D',
    mascaret: 'MASCARET', courlis: 'COURLIS', partel: 'PARTEL', gretel: 'GRETEL',
    estel: 'ESTEL', bief: 'BIEF', damocles: 'DAMOCLES', telapy: 'TelApy',
};

const SUPERSCRIPT: Record<string, string> = {
    '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶',
    '7': '⁷', '8': '⁸', '9': '⁹', '-': '⁻', '+': '⁺', 'n': 'ⁿ',
};
const SUBSCRIPT: Record<string, string> = {
    '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆',
    '7': '₇', '8': '₈', '9': '₉', '-': '₋', '+': '₊',
};

const ACCENTS: Record<string, string> = {
    tilde: '̃', vec: '⃗', hat: '̂', bar: '̄',
    overline: '̄', dot: '̇', ddot: '̈', acute: '́',
    grave: '̀',
};

/** Matches a brace group, allowing one level of nested braces. */
const GROUP = '\\{((?:[^{}]|\\{[^{}]*\\})*)\\}';

function script(text: string, map: Record<string, string>, fallback: string): string {
    const plain = text.trim();
    if (plain.length > 0 && [...plain].every(c => c in map))
        return [...plain].map(c => map[c]).join('');
    return /^\w+$/.test(plain) ? `${fallback}${plain}` : `${fallback}(${plain})`;
}

function convertMath(math: string): string {
    let s = math;
    // Accents on a single symbol: \tilde{\nu}, \vec{U}, \ddot{u}
    s = s.replace(new RegExp(`\\\\(${Object.keys(ACCENTS).join('|')})\\s*${GROUP}`, 'g'),
        (_m, accent: string, body: string) => `${convertMath(body)}${ACCENTS[accent]}`);
    s = s.replace(new RegExp(`\\\\frac\\s*${GROUP}\\s*${GROUP}`, 'g'),
        (_m, a: string, b: string) => {
            const num = convertMath(a);
            const den = convertMath(b);
            return `${num.length > 1 ? `(${num})` : num}/${den.length > 1 ? `(${den})` : den}`;
        });
    s = s.replace(new RegExp(`\\\\sqrt\\s*${GROUP}`, 'g'),
        (_m, body: string) => {
            const inner = convertMath(body);
            return inner.length > 1 ? `√(${inner})` : `√${inner}`;
        });
    s = s.replace(new RegExp(`\\\\(?:rm|mathrm|text|textrm|mathit|mathbf|operatorname|mbox)\\s*${GROUP}`, 'g'),
        (_m, body: string) => convertMath(body));
    s = s.replace(/\{\\rm\s+([^{}]*)\}/g, '$1');
    s = s.replace(/\\([A-Za-z]+)/g, (m, name: string) => GREEK[name] ?? SYMBOLS[name] ?? PRODUCTS[name] ?? name);
    // Superscripts and subscripts
    s = s.replace(new RegExp(`\\^\\s*${GROUP}`, 'g'), (_m, body: string) =>
        body.trim() === '°' ? '°' : script(convertMath(body), SUPERSCRIPT, '^'));
    s = s.replace(/\^([0-9A-Za-z+-])/g, (_m, c: string) => script(c, SUPERSCRIPT, '^'));
    s = s.replace(new RegExp(`_\\s*${GROUP}`, 'g'), (_m, body: string) => script(convertMath(body), SUBSCRIPT, '_'));
    s = s.replace(/_([0-9])/g, (_m, c: string) => SUBSCRIPT[c]);
    s = s.replace(/[{}]/g, '');
    return s.normalize('NFC');
}

/** Converts itemize/enumerate/description environments into Markdown lists. */
function convertLists(text: string): string {
    const tokenRx = /\\begin\{(itemize|enumerate|description)\}|\\end\{(itemize|enumerate|description)\}|\\item\b(?:\s*\[([^\]]*)\])?/g;
    const stack: { kind: string; count: number }[] = [];
    let out = '';
    let last = 0;
    for (const m of text.matchAll(tokenRx)) {
        out += text.slice(last, m.index);
        last = (m.index ?? 0) + m[0].length;
        if (m[1]) {
            stack.push({ kind: m[1], count: 0 });
            out += '\n';
        }
        else if (m[2]) {
            stack.pop();
            out += '\n\n';
        }
        else {
            const env = stack[stack.length - 1] ?? { kind: 'itemize', count: 0 };
            env.count++;
            const indent = '   '.repeat(Math.max(stack.length - 1, 0));
            const bullet = env.kind === 'enumerate' ? `${env.count}. ` : '- ';
            const label = m[3] !== undefined ? `**${m[3].trim()}** ` : '';
            out += `\n${indent}${bullet}${label}`;
        }
    }
    return out + text.slice(last);
}

export function latexToMarkdown(input: string): string {
    if (!input)
        return input;
    // Protect literal (escaped) characters before any other processing.
    const literals: string[] = [];
    const protect = (c: string) => `\uE000${literals.push(c) - 1}\uE000`;
    let s = input
        .replace(/\\\\/g, '\n\n')
        .replace(/\\([&%_#{}$])/g, (_m, c: string) => protect(c))
        .replace(/~/g, ' ')
        .replace(/``|''/g, '"');

    // Markdown-significant characters in the plain text (e.g. TASURF**).
    s = s.replace(/\*/g, () => protect('\\*'));

    // Inline math.
    s = s.replace(/\$([^$]+)\$/g, (_m, math: string) => convertMath(math).replace(/\*/g, '\\*'));

    // Documentation macros.
    s = s.replace(new RegExp(`\\\\telkey\\s*${GROUP}`, 'g'), (_m, k: string) => `\`${restore(k, literals).replace(/\s+/g, ' ').trim()}\``);
    s = s.replace(new RegExp(`\\\\telfile\\s*${GROUP}`, 'g'), (_m, k: string) => `\`${restore(k, literals).trim()}\``);
    s = s.replace(new RegExp(`\\\\telemac\\s*${GROUP}`, 'g'), (_m, d: string) => d.trim() ? `TELEMAC-${d.trim().toUpperCase()}` : 'TELEMAC');
    s = s.replace(new RegExp(`\\\\(?:textbf|bf)\\s*${GROUP}`, 'g'), '**$1**');
    s = s.replace(new RegExp(`\\\\(?:textit|emph|it)\\s*${GROUP}`, 'g'), '*$1*');
    s = s.replace(new RegExp(`\\\\(?:texttt|verb)\\s*${GROUP}`, 'g'), '`$1`');
    s = s.replace(new RegExp(`\\\\href\\s*${GROUP}\\s*${GROUP}`, 'g'), '[$2]($1)');
    s = s.replace(new RegExp(`\\\\url\\s*${GROUP}`, 'g'), '<$1>');
    s = s.replace(new RegExp(`\\\\footnote\\s*${GROUP}`, 'g'), ' ($1)');
    s = s.replace(new RegExp(`\\\\(?:cite|label|index)\\s*${GROUP}`, 'g'), '');
    s = s.replace(new RegExp(`\\\\(?:textsc|underline|textrm|textsf|mbox|text|ref)\\s*${GROUP}`, 'g'), '$1');

    s = convertLists(s);

    // Remaining commands: symbols, product macros, unknown ones.
    s = s.replace(/\\([A-Za-z]+)\s?/g, (_m, name: string) => {
        const rep = PRODUCTS[name] ?? SYMBOLS[name] ?? GREEK[name];
        return rep !== undefined ? `${rep} ` : '';
    });
    s = s.replace(/\\ /g, ' ').replace(/\\/g, '');
    s = s.replace(/[{}]/g, '');
    s = restore(s, literals);

    // Tidy whitespace while keeping list structure.
    return s
        .split('\n')
        .map(line => line.replace(/[ \t]+/g, ' ').replace(/ +([,;:)])/g, '$1').replace(/ +\.(?=\s|$)/g, '.').trimEnd())
        .map(line => /^\s*(-|\d+\.)\s/.test(line) ? line : line.trimStart())
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

function restore(text: string, literals: string[]): string {
    return text.replace(/\uE000(\d+)\uE000/g, (_m, i: string) => literals[Number(i)]);
}
