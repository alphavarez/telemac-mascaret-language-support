import * as vscode from 'vscode';
import { detectModule, findDicoEntries, getEntryDetails } from './dico';

export class CasefileHoverProvider implements vscode.HoverProvider {
    provideHover(document: vscode.TextDocument, position: vscode.Position, _token: vscode.CancellationToken): vscode.ProviderResult<vscode.Hover> {
        // Detect if a keyword is hovered
        const lineText = document.lineAt(position).text;
        const keywordRx = /^([A-Z][A-Z0-9 -]+)=/;
        const keyword = lineText.match(keywordRx)?.[1]?.trim();
        if (!keyword)
            return null;

        // Prefer the module guessed from the file name, but search across every
        // loaded module so keywords from any module (Telemac2d, Sisyphe, ...) resolve.
        const preferred = detectModule(document);
        const matches = findDicoEntries(keyword, preferred);
        if (matches.length === 0)
            return null; // No entry found in any dico

        const range = new vscode.Range(position.line, 0, position.line, keyword.length);
        const primary = matches[0];
        const markdown = getEntryDetails(primary.entry, primary.module);

        // If the same keyword exists in other modules, mention them.
        const others = matches.slice(1).map(m => m.module);
        if (others.length > 0)
            markdown.appendMarkdown(`\n\n---\n\n*Also defined in: ${others.join(', ')}*`);

        return new vscode.Hover(markdown, range);
    }
}
