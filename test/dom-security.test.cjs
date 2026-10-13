const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { extractPostText } = require('../src/modules/ContentHelpers.js');

function loadModule(name, globals = {}) {
	const context = vm.createContext(globals);
	vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/modules', name), 'utf8'), context);
	return context;
}

test('remote error popup appends text without interpreting HTML', () => {
	const appended = [];
	const calls = [];
	const context = loadModule('MenuPopups.js', { doc: { createTextNode: text => ({ textContent: text }) } });
	context.$popup = (...args) => {
		calls.push(args);
		return { append: node => appended.push(node) };
	};
	const payload = '<img src=x onerror="alert(1)">&amp;';
	context.$popupText('error', payload, true);
	assert.deepEqual(calls, [['error', '', true]]);
	assert.deepEqual(appended, [{ textContent: payload }]);
});

test('filename truncation decodes entities once and escapes the result', () => {
	const context = loadModule('PostBuilders.js');
	const fix = vm.runInContext('_4chanPostsBuilder.fixFileName', context);
	const result = fix('&amp;lt;' + 'x'.repeat(40), 25);
	assert.equal(result.isFixed, true);
	assert.equal(result.name, '&amp;lt;' + 'x'.repeat(21));
	assert.equal(fix('&lt;img&gt;' + 'x'.repeat(40), 25).name.startsWith('&lt;img&gt;'), true);
	assert.equal(fix('short&amp;name', 25).name, 'short&amp;name');
});

test('post text reads DOM text and preserves paragraph and line breaks', () => {
	const text = nodeValue => ({ nodeType: 3, nodeValue });
	const el = (tagName, ...childNodes) => ({ nodeType: 1, tagName, childNodes });
	const node = el('DIV', el('P', text('<img src=x> & literal')), el('BR'),
		el('LI', text('second'), el('B', text(' bold'))), { nodeType: 8, nodeValue: 'comment' });
	assert.equal(extractPostText(node).trim(), '<img src=x> & literal\n\n\nsecond bold');
});

test('date format grammar rejects HTML and arbitrary regex metacharacters', () => {
	const context = loadModule('TimeCorrection.js');
	const check = vm.runInContext('DateTime.checkPattern', context);
	assert.equal(check('dd+nn+yyyy+hh+ii'), false);
	for(const suffix of ['<img>', '[x]', '.', '*', '\\', '(', '$']) {
		assert.equal(check('dd+nn+yyyy+hh+ii' + suffix), true);
	}
});
