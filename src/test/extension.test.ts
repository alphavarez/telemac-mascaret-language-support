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

function labels(list: vscode.CompletionList): string[] {
    return list.items.map(i => typeof i.label === 'string' ? i.label : i.label.label);
}

async function diagnosticsOf(doc: vscode.TextDocument, expected: number): Promise<vscode.Diagnostic[]> {
    for (let i = 0; i < 40; i++) {
        const diags = vscode.languages.getDiagnostics(doc.uri);
        if (diags.length >= expected)
            return diags;
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    return vscode.languages.getDiagnostics(doc.uri);
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

    test('hover shows the reference, current value and allowed values', async () => {
        const doc = await openSteeringFile('LAW OF BOTTOM FRICTION = 4\n');
        const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
            'vscode.executeHoverProvider', doc.uri, new vscode.Position(0, 3));
        const text = hoverText(hovers);
        assert.ok(text.includes('LAW OF BOTTOM FRICTION'), text);
        assert.ok(text.includes('`4` MANNING'), text);
        assert.ok(text.includes('v9.1.2'), text);
    });

    test('French keyword names resolve to the English keyword', async () => {
        const doc = await openSteeringFile('CONVECTION = OUI\n');
        const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
            'vscode.executeHoverProvider', doc.uri, new vscode.Position(0, 3));
        assert.ok(hoverText(hovers).includes('ADVECTION'));
    });

    test('keyword completion', async () => {
        const doc = await openSteeringFile('BED\n');
        const list = await vscode.commands.executeCommand<vscode.CompletionList>(
            'vscode.executeCompletionItemProvider', doc.uri, new vscode.Position(0, 3));
        assert.ok(labels(list).includes('BED LOAD FOR ALL SANDS'), labels(list).slice(0, 20).join(', '));
    });

    test('value completion after "="', async () => {
        const doc = await openSteeringFile('LAW OF BOTTOM FRICTION = ');
        const list = await vscode.commands.executeCommand<vscode.CompletionList>(
            'vscode.executeCompletionItemProvider', doc.uri, new vscode.Position(0, 25));
        for (const code of ['0', '1', '2', '3', '4', '5', '6'])
            assert.ok(labels(list).includes(code), labels(list).join(', '));
    });

    test('error checking', async () => {
        const doc = await openSteeringFile('LAW OF BOTOM FRICTION = 4\nLAW OF BOTTOM FRICTION = 9\nTIDAL FLATS = MAYBE\n');
        const diags = await diagnosticsOf(doc, 3);
        const codes = diags.map(d => String(typeof d.code === 'object' ? d.code.value : d.code)).sort();
        assert.deepStrictEqual(codes, ['invalid-type', 'invalid-value', 'unknown-keyword'], diags.map(d => d.message).join('\n'));
    });

    test('commands are registered', async () => {
        const commands = await vscode.commands.getCommands(true);
        assert.ok(commands.includes('telemacMascaret.reloadDico'));
        assert.ok(commands.includes('telemacMascaret.selectVersion'));
    });
});
