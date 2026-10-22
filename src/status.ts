import * as vscode from 'vscode';
import { CONFIG_SECTION, Config } from './config';
import {
    BUNDLED_VERSIONS, DEFAULT_VERSION, VERSION_LABELS, dicoEntries, dicoSource, findLocalTelemacUri,
    MODULE_LABELS, onDicoLoaded, versionLabel,
} from './dico';

export const SELECT_VERSION_COMMAND = 'telemacMascaret.selectVersion';

/** Status bar item showing the TELEMAC-MASCARET version used for steering files. */
export class VersionStatus implements vscode.Disposable {
    private readonly item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    private readonly disposables: vscode.Disposable[] = [];

    constructor() {
        this.item.command = SELECT_VERSION_COMMAND;
        this.item.name = 'TELEMAC-MASCARET version';
        this.disposables.push(
            this.item,
            onDicoLoaded(() => this.update()),
            vscode.window.onDidChangeActiveTextEditor(() => this.update()),
        );
        this.update();
    }

    update(): void {
        const keywords = Object.values(dicoEntries).reduce((n, list) => n + list.length, 0);
        this.item.text = `$(book) TELEMAC ${versionLabel()}`;
        const lines = [
            `**TELEMAC-MASCARET ${versionLabel()}**: ${keywords} keywords`,
            dicoSource.kind === 'installation'
                ? `Dictionaries from the installation at \`${dicoSource.location}\``
                : 'Dictionaries bundled with the extension',
        ];
        if (dicoSource.fallbackModules.length)
            lines.push(`Bundled ${VERSION_LABELS[dicoSource.bundledVersion]} used for: ${dicoSource.fallbackModules.map(m => MODULE_LABELS[m]).join(', ')}`);
        if (dicoSource.unavailableModules.length)
            lines.push(`Not in this version: ${dicoSource.unavailableModules.map(m => MODULE_LABELS[m]).join(', ')}`);
        lines.push('', 'Click to change the version');
        this.item.tooltip = new vscode.MarkdownString(lines.join('  \n'));

        const editor = vscode.window.activeTextEditor;
        if (editor && editor.document.languageId === 'casefile')
            this.item.show();
        else
            this.item.hide();
    }

    dispose(): void {
        for (const d of this.disposables)
            d.dispose();
    }
}

interface VersionPick extends vscode.QuickPickItem {
    value: string;
}

/** Lets the user choose the bundled version or a local installation. */
export async function selectVersion(): Promise<void> {
    const current = Config.version;
    const installation = await findLocalTelemacUri();
    const picks: VersionPick[] = [
        ...BUNDLED_VERSIONS.map(v => ({
            value: v,
            label: `${v === current ? '$(check) ' : ''}TELEMAC-MASCARET ${VERSION_LABELS[v]}`,
            description: v === DEFAULT_VERSION ? 'bundled, latest release' : 'bundled',
            detail: v === '8p4' ? 'Includes SISYPHE (removed in v9)' : 'TELEMAC-2D, TELEMAC-3D, GAIA, TOMAWAC, ARTEMIS, KHIONE, WAQTEL, MASCARET, POSTEL-3D, STBTEL',
        })),
        {
            value: 'installation',
            label: `${current === 'installation' ? '$(check) ' : ''}Local installation`,
            description: installation ? installation.fsPath : 'not found',
            detail: installation
                ? 'Uses the .dico files of your TELEMAC-MASCARET installation (any version)'
                : 'Set "telemacMascaret.telemacDirectory", or start VS Code from a terminal where the TELEMAC environment (HOMETEL) is loaded',
        },
    ];
    const pick = await vscode.window.showQuickPick(picks, { title: 'TELEMAC-MASCARET version for steering files', placeHolder: `Current: ${current}` });
    if (!pick || pick.value === current)
        return;

    // Update the setting at the level where it is currently defined.
    const inspected = vscode.workspace.getConfiguration(CONFIG_SECTION).inspect<string>('version');
    const target = inspected?.workspaceFolderValue !== undefined
        ? vscode.ConfigurationTarget.WorkspaceFolder
        : inspected?.workspaceValue !== undefined
            ? vscode.ConfigurationTarget.Workspace
            : vscode.ConfigurationTarget.Global;
    await vscode.workspace.getConfiguration(CONFIG_SECTION).update('version', pick.value, target);
}
