const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'src/modules/Utils.js'), 'utf8');
const start = source.indexOf('// Normalizes post text');
const end = source.indexOf('// OTHER UTILS', start);
const context = {};
vm.runInNewContext(source.slice(start, end) +
	'globalThis.helpers = { normalizePostText, isPostTextSimilar };', context);
const { normalizePostText, isPostTextSimilar } = context.helpers;

const sourceRules = [
	...Array.from({ length: 250 }, (_, index) => `#ihash(${ 10_000_000 + index })`),
	...Array.from({ length: 20 }, (_, index) => `#texact(повторяющийся текст ${ index })`),
	...Array.from({ length: 12 }, (_, index) =>
		`#tmatch(семантически похожая повторяющаяся фраза вариант ${ index })`)
];

let compileCalls = 0;
function compileRules(rules) {
	compileCalls++;
	const imageHashes = new Set();
	const exactTexts = new Set();
	const fuzzyTexts = [];
	for(const rule of rules) {
		const [, type, value] = rule.match(/^#(ihash|texact|tmatch)\((.*)\)$/);
		if(type === 'ihash') {
			imageHashes.add(value);
		} else if(type === 'texact') {
			exactTexts.add(normalizePostText(value));
		} else {
			fuzzyTexts.push(normalizePostText(value, true));
		}
	}
	return { exactTexts, fuzzyTexts, imageHashes };
}

const compileStart = performance.now();
const compiled = compileRules(sourceRules);
const compileDuration = performance.now() - compileStart;
const posts = Array.from({ length: 2_000 }, (_, index) => index % 20 === 0 ?
	'Повторяющийся текст 3' : `Обычный пост номер ${ index % 140 } с разным содержанием`);
const resultCache = new Map();

function scan() {
	let hidden = 0;
	let maxChunkDuration = 0;
	for(let offset = 0; offset < posts.length; offset += 100) {
		const chunkStart = performance.now();
		for(const post of posts.slice(offset, offset + 100)) {
			const normalized = normalizePostText(post);
			let matches = resultCache.get(normalized);
			if(matches === undefined) {
				matches = compiled.exactTexts.has(normalized) ||
					compiled.fuzzyTexts.some(rule => isPostTextSimilar(rule, normalized));
				resultCache.set(normalized, matches);
			}
			hidden += matches;
		}
		maxChunkDuration = Math.max(maxChunkDuration, performance.now() - chunkStart);
	}
	return { hidden, maxChunkDuration };
}

const firstStart = performance.now();
const first = scan();
const firstDuration = performance.now() - firstStart;
const secondStart = performance.now();
const second = scan();
const secondDuration = performance.now() - secondStart;

assert.equal(compileCalls, 1);
assert.equal(compiled.imageHashes.size, 250);
assert.equal(first.hidden, 100);
assert.equal(second.hidden, first.hidden);
assert.ok(compileDuration < 50, `Rule compilation took ${ compileDuration.toFixed(2) }ms`);
assert.ok(first.maxChunkDuration < 50, `First scan chunk took ${ first.maxChunkDuration.toFixed(2) }ms`);
assert.ok(second.maxChunkDuration < 50, `Cached scan chunk took ${ second.maxChunkDuration.toFixed(2) }ms`);
assert.ok(secondDuration < firstDuration, 'Cached rescan should be faster than the first scan');
process.stdout.write(
	`rules=${ sourceRules.length } compile=${ compileDuration.toFixed(2) }ms ` +
	`first=${ firstDuration.toFixed(2) }ms cached=${ secondDuration.toFixed(2) }ms ` +
	`maxChunk=${ first.maxChunkDuration.toFixed(2) }ms\n`
);
