import { execFileSync } from 'node:child_process';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const trackedChanges = execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], {
	cwd     : root,
	encoding: 'utf8'
}).trim();

if(trackedChanges) {
	throw new Error(`Build changed tracked files:\n${ trackedChanges }`);
}
process.stdout.write('Build left tracked files unchanged\n');
