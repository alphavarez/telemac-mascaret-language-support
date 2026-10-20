import * as vscode from 'vscode';

function get<T>(key: string): T | undefined {
    return vscode.workspace.getConfiguration('telemacMascaret').get<T>(key);
}

export class Config {
    static get telemacDirectory(): string | undefined { return get<string>('telemacDirectory'); }
    static get additionalDicoFiles(): string[] { return get<string[]>('additionalDicoFiles') ?? []; }
}
