import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve(import.meta.dirname, '..');
const sourceDir = path.join(root, 'extension', 'v2');
const outputDir = path.join(root, 'dist', 'firefox');
const modulesDir = path.join(root, 'src', 'modules');
const packageData = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const version = process.env.BUILD_VERSION || packageData.version;
const commit = process.env.GITHUB_SHA?.slice(0, 7) ||
	execFileSync('git', ['rev-parse', '--short=7', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();

if(!/^\d+(?:\.\d+){1,3}$/.test(version)) {
	throw new Error(`Firefox manifest version is invalid: ${ version }`);
}

await rm(outputDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });
await cp(sourceDir, outputDir, {
	recursive: true,
	filter   : source => path.basename(source) !== 'Dollchan_Extension_Tools.es6.user.js'
});
await Promise.all([
	cp(path.join(root, 'signal.ogg'), path.join(outputDir, 'signal.ogg')),
	cp(path.join(root, 'LICENSE'), path.join(outputDir, 'LICENSE')),
	cp(path.join(root, 'NOTICE'), path.join(outputDir, 'NOTICE')),
	cp(path.join(root, 'PRIVACY.md'), path.join(outputDir, 'PRIVACY.md'))
]);

let wrapper = await readFile(path.join(modulesDir, 'Wrap.js'), 'utf8');
const markers = [...wrapper.matchAll(/\/\* ==\[ (.+?) \]== \*\//g)]
	.map(match => match[1])
	.filter(moduleName => moduleName.endsWith('.js'));
for(const moduleName of markers) {
	const moduleSource = await readFile(path.join(modulesDir, moduleName), 'utf8');
	wrapper = wrapper.replace(`/* ==[ ${ moduleName } ]== */`, moduleSource);
}
wrapper = wrapper
	.replace(/^const version = '[^']*';$/m, `const version = '${ version }';`)
	.replace(/^const commit = '[^']*';$/m, `const commit = '${ commit }';`);
await writeFile(path.join(outputDir, 'Dollchan_Next.js'), wrapper, 'utf8');

const manifestPath = path.join(outputDir, 'manifest.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
manifest.version = version;
await writeFile(manifestPath, `${ JSON.stringify(manifest, null, '\t') }\n`, 'utf8');

const menuPath = path.join(outputDir, 'menu', 'menu.html');
const menu = (await readFile(menuPath, 'utf8')).replace('{{VERSION}}', version);
await writeFile(menuPath, menu, 'utf8');
const settingsPath = path.join(outputDir, 'settings', 'settings.html');
const settings = (await readFile(settingsPath, 'utf8')).replace('{{VERSION}}', version);
await writeFile(settingsPath, settings, 'utf8');

process.stdout.write(`Built Dollchan Next ${ version } (${ commit }) in dist/firefox\n`);
