import * as vscode from 'vscode';
import { CasefileHoverProvider } from './hover';
import { loadDico } from './dico';
import { GLOBALS } from './globals';
import { CasefileCompletionItemProvider } from './completion';

export async function activate(context: vscode.ExtensionContext) {
    // Set up globals
    // This must be done first to ensure definitive assignments are initialized
    GLOBALS.outputChannel = vscode.window.createOutputChannel('TELEMAC-MASCARET', { log: true });

    // Register services
    const disposables = vscode.Disposable.from(
        // Commands
        vscode.commands.registerCommand('telemacMascaret.reloadDico', () => reloadDico(context)),
        // Hover provider
        vscode.languages.registerHoverProvider(
            'casefile',
            new CasefileHoverProvider(),
        ),
        // Completion item provider
        vscode.languages.registerCompletionItemProvider(
            'casefile',
            new CasefileCompletionItemProvider(),
        ),
        // Reload when the relevant settings change
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('telemacMascaret.telemacDirectory') || e.affectsConfiguration('telemacMascaret.additionalDicoFiles'))
                reloadDico(context);
        }),
    );
    await loadDico(context.extensionUri);

    context.subscriptions.push(disposables);
}

export function deactivate() {}

export async function reloadDico(context: vscode.ExtensionContext) {
    await loadDico(context.extensionUri);
}
