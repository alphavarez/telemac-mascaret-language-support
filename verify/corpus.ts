// Runs the steering-file checks over a folder of real .cas files and reports
// what they flag, to find false positives.
//
// Usage: node verify/corpus.cjs <folder with .cas files> <version: 9.1.2|8p4> [--details]
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { detectModule, loadDico, MODULE_LABELS } from '../src/dico';
import { checkSteeringFile } from '../src/diagnostics';
import { GLOBALS } from '../src/globals';

/* eslint-disable @typescript-eslint/no-explicit-any */
const state = (vscode as any).__state;
const [folder, version, flag] = process.argv.slice(2).filter(a => a !== '--');

function walk(dir: string): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap(d =>
        d.isDirectory() ? walk(path.join(dir, d.name)) : d.name.toLowerCase().endsWith('.cas') ? [path.join(dir, d.name)] : []);
}

async function main() {
    GLOBALS.outputChannel = vscode.window.createOutputChannel('x', { log: true }) as unknown as typeof GLOBALS.outputChannel;
    state.config['telemacMascaret.version'] = version;
    await loadDico(vscode.Uri.file(path.join(__dirname, '..')));

    const files = walk(folder);
    const byCode = new Map<string, number>();
    const filesWith = new Map<string, Set<string>>();
    const samples = new Map<string, string[]>();
    const undetected: string[] = [];
    let clean = 0;
    for (const f of files) {
        const text = fs.readFileSync(f, 'utf8');
        const doc = { uri: vscode.Uri.file(f), fileName: f } as unknown as vscode.TextDocument;
        const module = detectModule(doc);
        if (!module)
            undetected.push(path.relative(folder, f));
        const checks = checkSteeringFile(text, module, 72);
        if (checks.length === 0)
            clean++;
        for (const c of checks) {
            byCode.set(c.code, (byCode.get(c.code) ?? 0) + 1);
            if (!filesWith.has(c.code))
                filesWith.set(c.code, new Set());
            filesWith.get(c.code)!.add(f);
            const list = samples.get(c.code) ?? [];
            const lineText = text.split(/\r?\n/)[c.line] ?? '';
            list.push(`${path.relative(folder, f)}:${c.line + 1} [${module ? MODULE_LABELS[module] : 'any'}] ${c.message}\n        | ${lineText.trim().slice(0, 110)}`);
            samples.set(c.code, list);
        }
    }
    console.log(`${version}: ${files.length} files, ${clean} without any finding, ${undetected.length} with undetected module`);
    for (const [code, n] of [...byCode.entries()].sort((a, b) => b[1] - a[1]))
        console.log(`  ${code.padEnd(20)} ${String(n).padStart(5)} findings in ${String(filesWith.get(code)!.size).padStart(4)} files`);
    if (flag === '--dump') {
        for (const list of samples.values())
            for (const s of list)
                console.log(s.replace(/\n\s+\| /, ' || '));
        return;
    }
    if (flag === '--details') {
        for (const [code, list] of samples) {
            console.log(`\n=== ${code} (${list.length}) ===`);
            const seen = new Set<string>();
            for (const s of list) {
                const key = s.split('] ')[1]?.split('\n')[0] ?? s;
                if (seen.has(key))
                    continue;
                seen.add(key);
                console.log('  ' + s);
                if (seen.size >= 25)
                    break;
            }
        }
        if (undetected.length)
            console.log(`\n=== undetected module ===\n  ${undetected.slice(0, 30).join('\n  ')}`);
    }
}
main().catch(e => { console.error(e); process.exit(1); });
