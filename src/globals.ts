import * as vscode from 'vscode';

class Globals {
    outputChannel!: vscode.LogOutputChannel;
}
export const GLOBALS = new Globals();
