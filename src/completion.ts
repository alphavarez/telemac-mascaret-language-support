import * as vscode from 'vscode';
import { dicoEntries, DicoModule, detectModule, getEntryDetails, DicoEntry } from './dico';

export class CasefileCompletionItemProvider implements vscode.CompletionItemProvider {
    provideCompletionItems(document: vscode.TextDocument, position: vscode.Position, _token: vscode.CancellationToken, _context: vscode.CompletionContext): vscode.ProviderResult<vscode.CompletionItem[] | vscode.CompletionList<vscode.CompletionItem>> {
        // Detect if a keyword is being typed at the start of the line
        const lineText = document.lineAt(position).text.substring(0, position.character);
        const range = new vscode.Range(position.line, 0, position.line, position.character);
        const keywordRx = /^([A-Z][A-Z0-9 -]*)/;
        const prefix = lineText.toUpperCase().match(keywordRx)?.[1]?.trim();
        if (prefix === undefined)
            return null;

        // If the module can be guessed from the file name, suggest only that
        // module's keywords; otherwise offer keywords from every module.
        const detected = detectModule(document);
        const modules = detected ? [detected] : Object.values(DicoModule);

        const result: vscode.CompletionItem[] = [];
        const seen = new Set<string>();
        for (const module of modules) {
            for (const entry of dicoEntries[module]) {
                // De-duplicate keywords that appear in several modules (only when
                // searching across all of them).
                if (seen.has(entry.nameEnglish))
                    continue;
                seen.add(entry.nameEnglish);

                result.push(this.makeItem(entry, entry.nameEnglish, module, range));
                result.push(this.makeItem(entry, entry.nameFrench, module, range));
            }
        }
        if (result.length === 0)
            return null;
        return result;
    }

    private makeItem(entry: DicoEntry, label: string, module: DicoModule, range: vscode.Range): vscode.CompletionItem {
        const item = new vscode.CompletionItem(label, vscode.CompletionItemKind.Keyword);
        item.documentation = getEntryDetails(entry, module);
        item.range = range;
        item.detail = `${entry.type} · ${module}`;
        item.filterText = label + (entry.mnemo ?? '');
        return item;
    }
}
