import { mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const outputDir = path.join(root, 'dist', 'source');
const output = path.join(outputDir, 'dollchan-next-source.zip');

await mkdir(outputDir, { recursive: true });
execFileSync('git', [
	'archive',
	'--format=zip',
	`--output=${ output }`,
	'HEAD',
	'--',
	'.nvmrc',
	'AMO_REVIEW.md',
	'BUILD.md',
	'LICENSE',
	'NOTICE',
	'PRIVACY.md',
	'README.markdown',
	'amo-metadata.json',
	'eslint.config.mjs',
	'extension/v2',
	'gulpfile.js',
	'package.json',
	'package-lock.json',
	'scripts',
	'src/modules',
	'test'
], { cwd: root, stdio: 'inherit' });
process.stdout.write(`${ output }\n`);
