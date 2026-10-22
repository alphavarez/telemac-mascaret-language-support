import * as vscode from 'vscode';
import { parseCas, statementAt } from './casParser';
import { detectModule, findDicoEntries, getEntryDetails, isFrenchName, MODULE_LABELS } from './dico';
import { isDictionaryFile } from './diagnostics';

export class CasefileHoverProvider implements vscode.HoverProvider {
    provideHover(document: vscode.TextDocument, position: vscode.Position, _token: vscode.CancellationToken): vscode.ProviderResult<vscode.Hover> {
        if (isDictionaryFile(document.fileName))
            return null;
        const found = statementAt(parseCas(document.getText()), position.line, position.character);
        if (!found)
            return null;
        const { statement } = found;

        // Prefer the module guessed from the file name, but search across every
        // loaded module so keywords from any module resolve.
        const matches = findDicoEntries(statement.keyword, detectModule(document));
        if (matches.length === 0)
            return null;
        const primary = matches[0];
        const markdown = getEntryDetails(primary.entry, primary.module, {
            currentValue: statement.valueText,
            french: isFrenchName(primary.entry, statement.keyword),
        });

        const others = matches.slice(1).map(m => MODULE_LABELS[m.module]);
        if (others.length > 0)
            markdown.appendMarkdown(`\n\n---\n\n*Also defined in: ${others.join(', ')}*`);

        const span = statement.keywordSpan;
        return new vscode.Hover(markdown, new vscode.Range(span.line, span.start, span.endLine, span.end));
    }
}
