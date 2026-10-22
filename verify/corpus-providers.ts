// Calls the real hover and completion providers on every statement of a folder of .cas files.
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { activate } from '../src/extension';
import { parseCas } from '../src/casParser';
import { findDicoEntries, detectModule } from '../src/dico';
/* eslint-disable @typescript-eslint/no-explicit-any */
const stub = vscode as any; const state = stub.__state;
const [folder, version] = process.argv.slice(2).filter(a => a !== '--');
const walk = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith('.cas') ? [path.join(d, e.name)] : []);
(async () => {
    state.config['telemacMascaret.version'] = version;
    await activate({ extensionUri: vscode.Uri.file(path.join(__dirname, '..')), subscriptions: [] } as any);
    const hover = state.hoverProviders[0][1]; const completion = state.completionProviders[0][1];
    let statements = 0, hovers = 0, missingHover = 0, valueLists = 0, errors = 0; const t0 = Date.now(); const samples: string[] = [];
    for (const f of walk(folder)) {
        const text = fs.readFileSync(f, 'utf8');
        const doc = stub.__makeDocument(f, text);
        const module = detectModule(doc);
        for (const st of parseCas(text).statements) {
            statements++;
            try {
                const h = hover.provideHover(doc, new vscode.Position(st.keywordSpan.line, st.keywordSpan.start), {});
                const known = findDicoEntries(st.keyword, module).length > 0;
                if (h) hovers++;
                else if (known) { missingHover++; if (samples.length < 5) samples.push(`${f}: ${st.keyword}`); }
                const items = completion.provideCompletionItems(doc, new vscode.Position(st.separator.line, st.separator.end), {}, {});
                if (items && items.length) valueLists++;
            } catch (e) { errors++; if (samples.length < 5) samples.push(`EXCEPTION ${f}: ${st.keyword}: ${(e as Error).stack?.split('\n').slice(0, 3).join(' ')}`); }
        }
    }
    console.log(`${version}: ${statements} statements, ${hovers} hovers, ${missingHover} known keywords without hover, ${valueLists} value completions, ${errors} exceptions, ${Date.now() - t0} ms`);
    samples.forEach(s => console.log('  ' + s));
    process.exit(errors || missingHover ? 1 : 0);
})();
