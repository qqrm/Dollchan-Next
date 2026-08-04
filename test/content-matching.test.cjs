const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const utilsSource = fs.readFileSync(path.join(root, 'src/modules/Utils.js'), 'utf8');
const helpersStart = utilsSource.indexOf('// Normalizes post text');
const helpersEnd = utilsSource.indexOf('// OTHER UTILS', helpersStart);
const helpersSource = utilsSource.slice(helpersStart, helpersEnd) +
	'globalThis.helpers = { normalizePostText, getTextSimilarity, isPostTextSimilar, ' +
	'getPerceptualHashDistance };';
const helperContext = {};
vm.runInNewContext(helpersSource, helperContext);
const {
	normalizePostText,
	getTextSimilarity,
	isPostTextSimilar,
	getPerceptualHashDistance
} = helperContext.helpers;

const imageSource = fs.readFileSync(path.join(root, 'src/modules/PostImages.js'), 'utf8');
const hashFunctionMatch = imageSource.match(
	/_genImgHash: (\(\[arrBuf, oldw, oldh\]\) => \{[\s\S]*?\n\t\}),\n\tasync _getImageHashes/);
assert.ok(hashFunctionMatch, 'image hash worker function should be discoverable');
const generateImageHash = vm.runInNewContext(hashFunctionMatch[1]);

const spellsSource = fs.readFileSync(path.join(root, 'src/modules/Spells.js'), 'utf8');
const namesMatch = spellsSource.match(/get names\(\) \{\s*return (\[[\s\S]*?\]);\s*\},/);
const needArgMatch = spellsSource.match(/get needArg\(\) \{\s*return (\[[\s\S]*?\]);\s*\},/);
const codegenStart = spellsSource.indexOf('class SpellsCodegen');
const codegenEnd = spellsSource.indexOf('class SpellsRunner', codegenStart);
assert.ok(namesMatch && needArgMatch && codegenStart !== -1 && codegenEnd !== -1,
	'spell parser should be discoverable');
const spellContext = {
	Lng        : new Proxy({}, { get: () => ['', '', ''] }),
	lang       : 1,
	strToRegExp: value => {
		const slash = value.lastIndexOf('/');
		return new RegExp(value.slice(1, slash), value.slice(slash + 1));
	}
};
vm.createContext(spellContext);
spellContext.Spells = {
	names  : vm.runInContext(namesMatch[1], spellContext),
	needArg: vm.runInContext(needArgMatch[1], spellContext)
};
vm.runInContext(spellsSource.slice(codegenStart, codegenEnd) +
	'globalThis.SpellsCodegen = SpellsCodegen;', spellContext);
const interpreterStart = spellsSource.indexOf('class SpellsInterpreter');
const imageHashCalls = { legacy: 0, perceptual: 0 };
const interpreterContext = {
	AttachedImage    : class AttachedImage {},
	ImagesHashStorage: {
		async getHash() {
			imageHashCalls.legacy++;
			return 123;
		},
		async getPerceptualHash() {
			imageHashCalls.perceptual++;
			return '0123456789abcdef';
		}
	},
	getPerceptualHashDistance
};
vm.createContext(interpreterContext);
vm.runInContext(spellsSource.slice(interpreterStart) +
	'globalThis.SpellsInterpreter = SpellsInterpreter;', interpreterContext);

const hotkeysSource = fs.readFileSync(path.join(root, 'src/modules/Hotkeys.js'), 'utf8');
const hotkeysHelpersEnd = hotkeysSource.indexOf('const HotKeys');
const hotkeysContext = {};
vm.runInNewContext(hotkeysSource.slice(0, hotkeysHelpersEnd) +
	'globalThis.hotkeyHelpers = { normalizeHotKeyGroup, normalizeHotKeySets, findHotKeyAction };',
hotkeysContext);
const { normalizeHotKeyGroup, normalizeHotKeySets, findHotKeyAction } = hotkeysContext.hotkeyHelpers;

function makeGradient(width, height, reverse = false) {
	const data = new Uint8Array(width * height * 4);
	for(let y = 0; y < height; ++y) {
		for(let x = 0; x < width; ++x) {
			const offset = (y * width + x) * 4;
			const value = Math.round((reverse ? width - 1 - x : x) / (width - 1) * 255);
			data[offset] = value;
			data[offset + 1] = value;
			data[offset + 2] = value;
			data[offset + 3] = 255;
		}
	}
	return data.buffer;
}

test('exact text normalization ignores case, Unicode width and whitespace', () => {
	assert.equal(normalizePostText('  ТЕСТ\nтекста  '), 'тест текста');
	assert.equal(normalizePostText('ＡＢＣ'), 'abc');
});

test('fuzzy matching catches punctuation, references and small inflection changes', () => {
	assert.equal(isPostTextSimilar('Слава России!', 'слава   россии'), true);
	assert.equal(isPostTextSimilar('>>123 опять этот тупой пост', '>>999 опять этот тупейший пост'), true);
	assert.ok(getTextSimilarity('опять этот тупой пост', 'совсем другая тема') < 0.5);
});

test('short unrelated phrases are not treated as similar', () => {
	assert.equal(isPostTextSimilar('куплю гараж', 'продам гараж'), false);
	assert.equal(isPostTextSimilar('кот', 'код'), false);
});

test('perceptual hash distance counts differing bits', () => {
	assert.equal(getPerceptualHashDistance('0000000000000000', '0000000000000000'), 0);
	assert.equal(getPerceptualHashDistance('0000000000000000', 'ffffffffffffffff'), 64);
	assert.equal(getPerceptualHashDistance('invalid', '0000000000000000'), Infinity);
});

test('image fingerprint survives resizing and separates opposite gradients', () => {
	const small = generateImageHash([makeGradient(32, 32), 32, 32]).perceptualHash;
	const large = generateImageHash([makeGradient(128, 64), 128, 64]).perceptualHash;
	const reverse = generateImageHash([makeGradient(32, 32, true), 32, 32]).perceptualHash;
	assert.match(small, /^[0-9a-f]{16}$/);
	assert.equal(small, large);
	assert.ok(getPerceptualHashDistance(small, reverse) > 8);
});

test('spell parser accepts legacy/new image hashes and persistent text rules', () => {
	const parse = rule => {
		const parser = new spellContext.SpellsCodegen(rule);
		const generated = parser.generate();
		assert.equal(parser.hasError, false, `${ rule }: ${ parser.errorSpell }`);
		return generated[0][0];
	};
	assert.equal(parse('#ihash(123456)')[1], 123456);
	assert.equal(parse('#ihash(p:0123456789abcdef)')[1], 'p:0123456789abcdef');
	const exact = parse('#texact[abc](test\\) value)');
	assert.equal(exact[0], 19);
	assert.equal(exact[1], 'test) value');
	assert.deepEqual(Array.from(exact[2]), ['abc', false]);
	assert.equal(parse('#tmatch(foo)')[0], 20);
});

test('hotkey schema accepts multiple unique keys per command and migrates scalar keys', () => {
	assert.deepEqual(Array.from(normalizeHotKeyGroup([74, 40, 74])), [74, 40]);
	const keys = normalizeHotKeySets([8, false, [74, [40, 88], 0], [90], [85]]);
	assert.deepEqual(Array.from(keys[2][0]), [74]);
	assert.deepEqual(Array.from(keys[2][1]), [40, 88]);
	assert.deepEqual(Array.from(keys[2][2]), []);
	assert.equal(findHotKeyAction(keys[2], 88), 1);
	assert.equal(findHotKeyAction(keys[2], 99), -1);
});

test('image spell hashes each attached image only once per hash generation', async () => {
	const image = new interpreterContext.AttachedImage();
	const interpreter = new interpreterContext.SpellsInterpreter({ images: [image] }, []);
	assert.equal(await interpreter._ihash(123), true);
	assert.equal(interpreter._ihash(999), false);
	assert.equal(imageHashCalls.legacy, 1);
	assert.equal(await interpreter._ihash('p:0123456789abcdef'), true);
	assert.equal(interpreter._ihash('p:ffffffffffffffff'), false);
	assert.equal(imageHashCalls.perceptual, 1);
});
