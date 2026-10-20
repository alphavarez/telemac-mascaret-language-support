// Faithful-enough stub of the vscode API for exercising the extension's real
// activation, DICO loading (bundled + local install + additional files),
// hover and completion code against files on disk.
const fs = require('fs');
const path = require('path');

const state = {
    config: {},                 // telemacMascaret.* values
    configNamespaces: new Set(),
    commands: new Map(),
    hoverProviders: [],
    completionProviders: [],
    errors: [],
    log: [],
};

class FileSystemError extends Error {
    constructor(message, code) { super(message); this.code = code; }
}
const Uri = {
    file: (p) => ({ fsPath: p, path: p.replace(/\\/g, '/'), scheme: 'file' }),
    joinPath: (base, ...segs) => Uri.file(path.join(base.fsPath, ...segs)),
};
const notFound = (uri) => new FileSystemError(`File not found: ${uri.fsPath}`, 'FileNotFound');

class MarkdownString {
    constructor(v = '') { this.value = v; this.isTrusted = false; }
    appendMarkdown(s) { this.value += s; return this; }
}
class Range { constructor(sl, sc, el, ec) { Object.assign(this, { sl, sc, el, ec }); } }
class Position { constructor(line, character) { this.line = line; this.character = character; } }
class Hover { constructor(contents, range) { this.contents = contents; this.range = range; } }
class CompletionItem { constructor(label, kind) { this.label = label; this.kind = kind; } }

module.exports = {
    __state: state,
    FileSystemError, Uri, MarkdownString, Range, Position, Hover, CompletionItem,
    FileType: { File: 1, Directory: 2 },
    CompletionItemKind: { Keyword: 13 },
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
            return { get: (key) => state.config[`${ns}.${key}`] };
        },
        onDidChangeConfiguration: () => ({ dispose() {} }),
    },
    window: {
        createOutputChannel: () => ({
            error: (m) => state.log.push(['error', m]), warn: (m) => state.log.push(['warn', m]),
            info: (m) => state.log.push(['info', m]), show() {}, appendLine() {},
        }),
        showErrorMessage: (m) => { state.errors.push(m); return Promise.resolve(undefined); },
    },
    commands: { registerCommand: (id, fn) => { state.commands.set(id, fn); return { dispose() {} }; } },
    languages: {
        registerHoverProvider: (lang, p) => { state.hoverProviders.push([lang, p]); return { dispose() {} }; },
        registerCompletionItemProvider: (lang, p) => { state.completionProviders.push([lang, p]); return { dispose() {} }; },
    },
};
