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

test('download menus pass filenames through DOM properties before serialization', () => {
	const filename = '"><img src=x onerror=alert(1)>.png';
	const metadata = '"><svg onload=alert(2)>';
	const links = [];
	const context = loadModule('MenuPopups.js', {
		doc: {
			createElement: tag => {
				assert.equal(tag, 'a');
				const anchor = {
					attributes: {},
					setAttribute(key, value) {
						this.attributes[key] = value;
					}
				};
				Object.defineProperty(anchor, 'outerHTML', {
					get() {
						links.push(anchor);
						return '<a>serialized by DOM</a>';
					}
				});
				return anchor;
			}
		},
		Lng: {
			searchIn : ['Search'],
			saveAs   : ['Save'],
			origName : ['Original'],
			metaName : ['Metadata'],
			boardName: ['Board']
		},
		lang       : 0,
		aib        : { domain: 'board.example' },
		getFileExt : () => 'png',
		getFileName: () => 'board.png',
		$q         : () => ({ textContent: metadata })
	});
	const menu = vm.runInContext('Menu', context);
	const link = {
		href        : 'https://cdn.example/board.png',
		textContent : filename,
		classList   : { contains: value => value === 'de-fullimg-link' },
		getAttribute: () => null
	};
	const result = menu.getMenuImg({ nextSibling: link }, true);
	assert.equal(result, '<a>serialized by DOM</a>'.repeat(3));
	assert.equal(links[0].download, filename);
	assert.equal(links[1].download, metadata + '.png');
	assert.equal(links[2].download, 'board.png');
	assert.equal(links[0].attributes.info, 'img-load');
	assert.equal(links[0].href, link.href);
	assert.equal(links[0].target, '_blank');
	assert.ok(links[0].textContent.startsWith('Save "'));
});
