const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const extension = path.join(root, 'extension', 'v2');
const read = file => fs.readFileSync(path.join(extension, file), 'utf8');

function assertUniqueIds(html, surface) {
	const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
	assert.equal(new Set(ids).size, ids.length, `${ surface } contains duplicate IDs`);
}

test('popup and options documents have complete local assets and unique controls', () => {
	for(const surface of ['menu/menu.html', 'settings/settings.html']) {
		const html = read(surface);
		assertUniqueIds(html, surface);
		for(const match of html.matchAll(/(?:href|src)="(\.\.[^"]+|[a-z][^:"]+\.(?:css|js))"/g)) {
			assert.equal(
				fs.existsSync(path.resolve(extension, path.dirname(surface), match[1])), true,
				`${ surface } references missing ${ match[1] }`
			);
		}
	}
});

test('standalone UI scripts parse and keep imported data away from HTML sinks', () => {
	for(const surface of ['menu/menu.js', 'settings/settings.js', 'background.js']) {
		const source = read(surface);
		assert.doesNotThrow(() => new vm.Script(source, { filename: surface }));
		assert.doesNotMatch(source, /\.innerHTML\s*=|insertAdjacentHTML\s*\(/);
	}
});

test('design system covers system themes, keyboard focus and narrow layouts', () => {
	const tokens = read('shared/theme.css');
	const settings = read('settings/settings.css');
	const popup = read('menu/menu.css');
	assert.match(tokens, /--dn-accent:/);
	assert.match(tokens, /prefers-color-scheme:\s*dark/);
	assert.match(tokens, /:focus-visible/);
	assert.match(settings, /@media\s*\(max-width:/);
	assert.match(popup, /body\s*\{[^}]*width:\s*292px/);
});

test('embedded command dock stays compact and free of generic button chrome', () => {
	const css = fs.readFileSync(path.join(root, 'src/modules/Css.js'), 'utf8');
	const panel = fs.readFileSync(path.join(root, 'src/modules/Panel.js'), 'utf8');

	assert.match(css, /\.de-panel-btn\s*\{[^}]*appearance:\s*none\s*!important/);
	assert.match(css, /\.de-panel-btn\s*\{[^}]*border:\s*0\s*!important/);
	assert.match(css, /\.de-abtn:not\(\.de-panel-btn\)/);
	assert.doesNotMatch(panel, /de-panel-wordmark/);
});
