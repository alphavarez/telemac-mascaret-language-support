// File-system-backed stub of the vscode API, used to run the extension's real
// activation, DICO loading, hover, completion and diagnostics code outside VS Code.
const fs = require('fs');
const path = require('path');

const state = {
    config: {},                 // 'telemacMascaret.<key>' -> value
    configNamespaces: new Set(),
    configUpdates: [],
    commands: new Map(),
    hoverProviders: [],
    completionProviders: [],
    codeActionProviders: [],
    diagnostics: new Map(),     // uri string -> Diagnostic[]
    statusItems: [],
    errors: [],
    warnings: [],
    log: [],
    quickPickAnswer: undefined,
    listeners: { open: [], change: [], close: [], activeEditor: [] },
    textDocuments: [],
    activeTextEditor: undefined,
};

class FileSystemError extends Error {
    constructor(message, code) { super(message); this.code = code; }
}
const Uri = {
    file: (p) => ({ fsPath: p, path: p.replace(/\\/g, '/'), scheme: 'file', toString: () => 'file://' + p }),
    joinPath: (base, ...segs) => Uri.file(path.join(base.fsPath, ...segs)),
};
const notFound = (uri) => new FileSystemError(`File not found: ${uri.fsPath}`, 'FileNotFound');

class MarkdownString {
    constructor(v = '') { this.value = v; this.isTrusted = false; }
    appendMarkdown(s) { this.value += s; return this; }
}
class Position { constructor(line, character) { this.line = line; this.character = character; } }
class Range {
    constructor(sl, sc, el, ec) { this.start = new Position(sl, sc); this.end = new Position(el, ec); }
}
class Hover { constructor(contents, range) { this.contents = contents; this.range = range; } }
class CompletionItem { constructor(label, kind) { this.label = label; this.kind = kind; } }
class Diagnostic { constructor(range, message, severity) { this.range = range; this.message = message; this.severity = severity; } }
class CodeAction { constructor(title, kind) { this.title = title; this.kind = kind; } }
class WorkspaceEdit {
    constructor() { this.edits = []; }
    replace(uri, range, text) { this.edits.push({ uri, range, text }); }
}

function makeDocument(fileName, text, languageId = 'casefile') {
    const lines = () => text.split(/\r?\n/);
    const doc = {
        uri: Uri.file(fileName),
        fileName,
        languageId,
        getText(range) {
            if (!range) return text;
            const ls = lines();
            const out = [];
            for (let l = range.start.line; l <= range.end.line; l++) {
                const line = ls[l] ?? '';
                const s = l === range.start.line ? range.start.character : 0;
                const e = l === range.end.line ? range.end.character : line.length;
                out.push(line.slice(s, e));
            }
            return out.join('\n');
        },
        lineAt(p) { return { text: lines()[typeof p === 'number' ? p : p.line] ?? '' }; },
        setText(t) { text = t; },
    };
    return doc;
}

const disposable = { dispose() {} };

module.exports = {
    __state: state,
    __makeDocument: makeDocument,
    FileSystemError, Uri, MarkdownString, Range, Position, Hover, CompletionItem,
    Diagnostic, CodeAction, WorkspaceEdit,
    FileType: { File: 1, Directory: 2 },
    CompletionItemKind: { Value: 11, Keyword: 13, EnumMember: 19 },
    DiagnosticSeverity: { Error: 0, Warning: 1, Information: 2, Hint: 3 },
    CodeActionKind: { QuickFix: 'quickfix' },
    StatusBarAlignment: { Left: 1, Right: 2 },
    ConfigurationTarget: { Global: 1, Workspace: 2, WorkspaceFolder: 3 },
    Disposable: { from: (...d) => ({ dispose() {}, items: d }) },
    workspace: {
        fs: {
            async readFile(uri) {
                try { return await fs.promises.readFile(uri.fsPath); }
                catch (e) { if (e.code === 'ENOENT' || e.code === 'EISDIR') throw notFound(uri); throw e; }
            },
            async stat(uri) {
                try { const s = await fs.promises.stat(uri.fsPath); return { type: s.isDirectory() ? 2 : 1 }; }
                catch (e) { if (e.code === 'ENOENT') throw notFound(uri); throw e; }
            },
        },
        decode: async (bytes) => new TextDecoder('utf-8').decode(bytes),
        getConfiguration(ns) {
            state.configNamespaces.add(ns);
            return {
                get: (key) => state.config[`${ns}.${key}`],
                inspect: (key) => ({ globalValue: state.config[`${ns}.${key}`] }),
                update: async (key, value, target) => { state.configUpdates.push({ key, value, target }); state.config[`${ns}.${key}`] = value; },
            };
        },
        get textDocuments() { return state.textDocuments; },
        onDidChangeConfiguration: () => disposable,
        onDidOpenTextDocument: (fn) => { state.listeners.open.push(fn); return disposable; },
        onDidChangeTextDocument: (fn) => { state.listeners.change.push(fn); return disposable; },
        onDidCloseTextDocument: (fn) => { state.listeners.close.push(fn); return disposable; },
    },
    window: {
        createOutputChannel: () => ({
            error: (m) => state.log.push(['error', m]), warn: (m) => state.log.push(['warn', m]),
            info: (m) => state.log.push(['info', m]), trace: () => {}, show() {}, appendLine() {},
        }),
        showErrorMessage: (m) => { state.errors.push(m); return Promise.resolve(undefined); },
        showWarningMessage: (m) => { state.warnings.push(m); return Promise.resolve(undefined); },
        showQuickPick: async (items) => items.find(i => i.value === state.quickPickAnswer),
        createStatusBarItem: () => {
            const item = { text: '', tooltip: undefined, command: undefined, name: '', visible: false, show() { this.visible = true; }, hide() { this.visible = false; }, dispose() {} };
            state.statusItems.push(item);
            return item;
        },
        get activeTextEditor() { return state.activeTextEditor; },
        onDidChangeActiveTextEditor: (fn) => { state.listeners.activeEditor.push(fn); return disposable; },
    },
    commands: { registerCommand: (id, fn) => { state.commands.set(id, fn); return disposable; } },
    languages: {
        registerHoverProvider: (lang, p) => { state.hoverProviders.push([lang, p]); return disposable; },
        registerCompletionItemProvider: (lang, p, ...triggers) => { state.completionProviders.push([lang, p, triggers]); return disposable; },
        registerCodeActionsProvider: (lang, p) => { state.codeActionProviders.push([lang, p]); return disposable; },
        createDiagnosticCollection: () => ({
            set: (uri, d) => state.diagnostics.set(uri.toString(), d),
            delete: (uri) => state.diagnostics.delete(uri.toString()),
            dispose() {},
        }),
    },
};
