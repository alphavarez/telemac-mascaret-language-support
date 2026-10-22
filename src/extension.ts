import * as vscode from 'vscode';
import { CasefileCompletionItemProvider, COMPLETION_TRIGGERS } from './completion';
import { CONFIG_SECTION } from './config';
import { loadDico } from './dico';
import { CasDiagnostics, CasQuickFixes } from './diagnostics';
import { GLOBALS } from './globals';
import { CasefileHoverProvider } from './hover';
import { SELECT_VERSION_COMMAND, VersionStatus, selectVersion } from './status';

export async function activate(context: vscode.ExtensionContext) {
    // Set up globals
    // This must be done first to ensure definitive assignments are initialized
    GLOBALS.outputChannel = vscode.window.createOutputChannel('TELEMAC-MASCARET', { log: true });

    const diagnostics = new CasDiagnostics();
    const status = new VersionStatus();

    context.subscriptions.push(
        diagnostics,
        status,
        vscode.commands.registerCommand('telemacMascaret.reloadDico', () => reloadDico(context)),
        vscode.commands.registerCommand(SELECT_VERSION_COMMAND, selectVersion),
        vscode.languages.registerHoverProvider('casefile', new CasefileHoverProvider()),
        vscode.languages.registerCompletionItemProvider('casefile', new CasefileCompletionItemProvider(), ...COMPLETION_TRIGGERS),
        vscode.languages.registerCodeActionsProvider('casefile', new CasQuickFixes(), { providedCodeActionKinds: CasQuickFixes.kinds }),
        vscode.workspace.onDidChangeConfiguration(e => {
            if (['version', 'telemacDirectory', 'additionalDicoFiles'].some(k => e.affectsConfiguration(`${CONFIG_SECTION}.${k}`)))
                reloadDico(context);
            else if (e.affectsConfiguration(`${CONFIG_SECTION}.diagnostics`))
                diagnostics.validateAll();
        }),
    );

    await loadDico(context.extensionUri);
}

export function deactivate() {}

export async function reloadDico(context: vscode.ExtensionContext) {
    await loadDico(context.extensionUri);
}
