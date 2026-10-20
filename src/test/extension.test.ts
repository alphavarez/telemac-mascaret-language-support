import * as assert from 'assert';
import * as vscode from 'vscode';

// End-to-end tests run inside a real VS Code instance (`pnpm test`).
const EXTENSION_ID = 'alphavarez.telemac-mascaret';

async function openSteeringFile(content: string): Promise<vscode.TextDocument> {
    const doc = await vscode.workspace.openTextDocument({ language: 'casefile', content });
    await vscode.window.showTextDocument(doc);
    return doc;
}

function hoverText(hovers: vscode.Hover[]): string {
    return hovers
        .flatMap(h => h.contents)
        .map(c => typeof c === 'string' ? c : c.value)
        .join('\n');
}

suite('TELEMAC-MASCARET Language Support', () => {
    suiteSetup(async () => {
        await vscode.extensions.getExtension(EXTENSION_ID)?.activate();
    });

    test('extension is installed and active', () => {
        const extension = vscode.extensions.getExtension(EXTENSION_ID);
        assert.ok(extension, `${EXTENSION_ID} not found`);
        assert.ok(extension.isActive, 'extension did not activate');
    });

    test('hover shows the bundled v8p4 reference', async () => {
        const doc = await openSteeringFile('ABSCISSAE OF SOURCES = 100.;200.\n');
        const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
            'vscode.executeHoverProvider', doc.uri, new vscode.Position(0, 3));
        const text = hoverText(hovers);
        assert.ok(text.includes('ABSCISSAE OF SOURCES'), text);
        assert.ok(text.includes('nearest node'), text);
    });

    test('French keyword names resolve to the English keyword', async () => {
        const doc = await openSteeringFile('CONVECTION = OUI\n');
        const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
            'vscode.executeHoverProvider', doc.uri, new vscode.Position(0, 3));
        assert.ok(hoverText(hovers).includes('ADVECTION'));
    });

    test('completion offers keywords from the sediment modules', async () => {
        const doc = await openSteeringFile('BED\n');
        const list = await vscode.commands.executeCommand<vscode.CompletionList>(
            'vscode.executeCompletionItemProvider', doc.uri, new vscode.Position(0, 3));
        const labels = list.items.map(i => typeof i.label === 'string' ? i.label : i.label.label);
        assert.ok(labels.includes('BED-LOAD TRANSPORT FORMULA'));
    });

    test('reload command is registered', async () => {
        const commands = await vscode.commands.getCommands(true);
        assert.ok(commands.includes('telemacMascaret.reloadDico'));
    });
});
