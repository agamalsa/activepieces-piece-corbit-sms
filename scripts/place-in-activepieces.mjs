// Copies this piece into a checkout of the Activepieces monorepo and registers it in
// tsconfig.base.json, so it can be built, tested and bundled with the official tools.
// Usage: node scripts/place-in-activepieces.mjs <path-to-activepieces-checkout>
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const target = resolve(process.argv[2] ?? '');
if (!process.argv[2]) {
  console.error('Usage: node scripts/place-in-activepieces.mjs <path-to-activepieces-checkout>');
  process.exit(1);
}

const pieceDir = join(target, 'packages/pieces/community/corbit-sms');
rmSync(pieceDir, { recursive: true, force: true });
mkdirSync(pieceDir, { recursive: true });
for (const entry of ['src', 'test', 'package.json', 'README.md', 'vitest.config.ts', 'tsconfig.json', 'tsconfig.lib.json', '.eslintrc.json']) {
  cpSync(join(here, entry), join(pieceDir, entry), { recursive: true });
}

cpSync(join(here, 'LICENSE'), join(pieceDir, 'LICENSE'));
cpSync(join(here, 'scripts/corbit-bundle.ts'), join(target, 'tools/scripts/pieces/corbit-bundle.ts'));

const tsconfigPath = join(target, 'tsconfig.base.json');
const tsconfig = JSON.parse(readFileSync(tsconfigPath, 'utf8'));
tsconfig.compilerOptions.paths['@corbit2/piece-corbit-sms'] = ['packages/pieces/community/corbit-sms/src/index.ts'];
writeFileSync(tsconfigPath, `${JSON.stringify(tsconfig, null, 2)}\n`);
console.log(`Placed the piece in ${pieceDir}`);
