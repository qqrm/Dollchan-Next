import { execFileSync } from 'node:child_process';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const executable = path.join(
	root, 'node_modules', '.bin', process.platform === 'win32' ? 'web-ext.cmd' : 'web-ext'
);
const result = JSON.parse(execFileSync(executable, [
	'lint',
	'--source-dir', path.join(root, 'dist', 'firefox'),
	'--self-hosted',
	'--output', 'json'
], { cwd: root, encoding: 'utf8' }));

if(result.errors.length) {
	throw new Error(`web-ext lint found ${ result.errors.length } error(s)`);
}
const unexpected = result.warnings.filter(warning => warning.code !== 'UNSAFE_VAR_ASSIGNMENT');
if(unexpected.length) {
	throw new Error(`web-ext lint found unexpected warnings:\n${
		unexpected.map(warning => `${ warning.code }: ${ warning.message }`).join('\n') }`);
}
const warningBudget = 56;
if(result.warnings.length > warningBudget) {
	throw new Error(
		`Dynamic HTML warning budget increased: ${ result.warnings.length } > ${ warningBudget }`
	);
}
process.stdout.write(
	`web-ext lint: 0 errors, ${ result.warnings.length } reviewed dynamic-markup warning(s)\n`
);
