// Minimal stub of the vscode API surface touched by dico.ts during parsing/rendering.
class MarkdownString {
  constructor() { this.value = ''; this.isTrusted = false; }
  appendMarkdown(s) { this.value += s; return this; }
}
class FileSystemError extends Error {}
module.exports = {
  MarkdownString,
  FileSystemError,
  FileType: { Directory: 2, File: 1 },
  Uri: { file: (p) => ({ fsPath: p, path: p }), joinPath: () => ({}) },
  workspace: { fs: {}, decode: async (b) => b.toString('utf8'), getConfiguration: () => ({ get: () => undefined }) },
  window: { showErrorMessage: () => Promise.resolve(), createOutputChannel: () => ({}) },
};
