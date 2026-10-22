import * as vscode from 'vscode';

export const CONFIG_SECTION = 'telemacMascaret';

function get<T>(key: string): T | undefined {
    return vscode.workspace.getConfiguration(CONFIG_SECTION).get<T>(key);
}

export class Config {
    /** '9.1.2', '8p4' or 'installation'. */
    static get version(): string { return get<string>('version') || '9.1.2'; }
    static get telemacDirectory(): string | undefined { return get<string>('telemacDirectory'); }
    static get additionalDicoFiles(): string[] { return get<string[]>('additionalDicoFiles') ?? []; }
    static get diagnosticsEnabled(): boolean { return get<boolean>('diagnostics.enabled') ?? true; }
    /** 0 disables the check. */
    static get maxLineLength(): number { return get<number>('diagnostics.maxLineLength') ?? 72; }
}
