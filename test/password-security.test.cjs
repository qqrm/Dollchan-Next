const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const helperSource = read('src/modules/ContentHelpers.js');
const helperFunction = helperSource.match(/function generatePostPassword\(\) \{[\s\S]*?\n\}/)[0];

function helperContext(crypto) {
	const context = vm.createContext({ crypto });
	vm.runInContext(helperSource, context);
	vm.runInContext('Math.random = () => { throw new Error("insecure random source"); };', context);
	return context;
}

function applicationContext(password, crypto) {
	const context = helperContext(crypto);
	const store = {
		DESU_Config : JSON.stringify({ 'board.example': { passwValue: password, userPassw: 1 } }),
		DESU_Privacy: '{}',
		DN_theme    : 'system'
	};
	const state = { showSettings: false, input: { value: password } };
	Object.assign(context, {
		nav        : { isInPage: true, hasOldGM: true },
		navigator  : { language: 'en' },
		aib        : { domain: 'board.example', timePattern: 'dd+mm+yyyy' },
		defaultCfg : { language: 1 },
		deWindow   : { FormData() {}, Notification() {} },
		commit     : 'test',
		postform   : { passw: { value: 'old-post-password' } },
		DelForm    : [{ passEl: { value: 'old-delete-password' } }, { passEl: null }],
		GM_getValue: key => store[key],
		GM_setValue: (key, value) => {
			store[key] = value;
		},
		$isEmpty: value => Object.keys(value).length === 0,
		$hasProp: (value, key) => Object.hasOwn(value, key),
		$q      : selector => {
			assert.equal(selector, 'input[info="passwValue"]');
			return state.showSettings ? state.input : null;
		}
	});
	for(const file of ['Storage.js', 'Form.js', 'WindowSettings.js']) {
		vm.runInContext(read('src/modules/' + file), context);
	}
	return { context, store, state };
}

const clickGenerate = context => vm.runInContext(`CfgWindow.handleEvent({
	type: 'click', target: { tagName: 'INPUT', type: 'button', id: 'de-cfg-button-pass', classList: {} }
})`, context);

test('every byte maps uniformly to the existing lowercase base32 alphabet with fixed width', () => {
	const alphabet = '0123456789abcdefghijklmnopqrstuv';
	const counts = new Map();
	let entropy = 0;
	let calls = 0;
	const crypto = {
		getRandomValues(bytes) {
			assert.equal(this, crypto);
			assert.equal(Object.prototype.toString.call(bytes), '[object Uint8Array]');
			assert.equal(bytes.length, 8);
			bytes.fill(entropy);
			calls++;
			return bytes;
		}
	};
	const context = helperContext(crypto);
	for(; entropy < 256; entropy++) {
		const value = context.generatePostPassword();
		assert.equal(value, alphabet[entropy % 32].repeat(8));
		counts.set(value[0], (counts.get(value[0]) || 0) + 1);
	}
	assert.equal(calls, 256);
	assert.equal(counts.size, 32);
	assert.ok([...counts.values()].every(count => count === 8));
});

test('each character consumes fresh Web Crypto output, including leading zero and high bytes', () => {
	let calls = 0;
	const context = helperContext({
		getRandomValues(bytes) {
			bytes.set(calls++ ? [31, 30, 20, 10, 9, 1, 0, 32] : [0, 1, 9, 10, 20, 30, 31, 255]);
			return bytes;
		}
	});
	assert.equal(context.generatePostPassword(), '019akuvv');
	assert.equal(context.generatePostPassword(), 'vuka9100');
	assert.equal(calls, 2);
});

test('initial configuration persists and applies the secure posting/deletion password', async () => {
	let calls = 0;
	const { context, store } = applicationContext('', {
		getRandomValues(bytes) {
			calls++;
			return bytes.fill(255);
		}
	});
	await context.readCfg();
	assert.equal(context.Cfg.passwValue, 'vvvvvvvv');
	assert.equal(JSON.parse(store.DESU_Config)['board.example'].passwValue, 'vvvvvvvv');
	await vm.runInContext('PostForm.setUserPassw()', context);
	assert.equal(context.postform.passw.value, 'vvvvvvvv');
	assert.equal(context.DelForm[0].passEl.value, 'vvvvvvvv');
	await context.readCfg();
	assert.equal(calls, 1);
});

test('saved passwords are preserved even when Web Crypto is unavailable', async () => {
	for(const password of ['0', 'oldpass', 'custom-existing-password!']) {
		const { context, store } = applicationContext(password, undefined);
		await context.readCfg();
		await vm.runInContext('PostForm.setUserPassw()', context);
		assert.equal(context.Cfg.passwValue, password);
		assert.equal(JSON.parse(store.DESU_Config)['board.example'].passwValue, password);
		assert.equal(context.postform.passw.value, password);
	}
});

test('regeneration saves and applies a secure password through the real form handler', async () => {
	let calls = 0;
	const { context, store, state } = applicationContext('previous', {
		getRandomValues(bytes) {
			calls++;
			return bytes.fill(10);
		}
	});
	await context.readCfg();
	assert.equal(calls, 0);
	state.showSettings = true;
	await clickGenerate(context);
	assert.equal(calls, 1);
	assert.equal(state.input.value, 'aaaaaaaa');
	assert.equal(context.Cfg.passwValue, 'aaaaaaaa');
	assert.equal(JSON.parse(store.DESU_Config)['board.example'].passwValue, 'aaaaaaaa');
	assert.equal(context.postform.passw.value, 'aaaaaaaa');
	assert.equal(context.DelForm[0].passEl.value, 'aaaaaaaa');
});

test('missing or failed Web Crypto never falls back or replaces an existing password', async () => {
	for(const crypto of [undefined, {}, {
		getRandomValues() {
			throw new Error('entropy unavailable');
		}
	}]) {
		const empty = applicationContext('', crypto);
		await assert.rejects(empty.context.readCfg());
		assert.equal(empty.context.Cfg.passwValue, '');
		assert.equal(JSON.parse(empty.store.DESU_Config)['board.example'].passwValue, '');
		const saved = applicationContext('previous', crypto);
		await saved.context.readCfg();
		saved.state.showSettings = true;
		await assert.rejects(clickGenerate(saved.context));
		assert.equal(saved.state.input.value, 'previous');
		assert.equal(saved.context.Cfg.passwValue, 'previous');
		assert.equal(JSON.parse(saved.store.DESU_Config)['board.example'].passwValue, 'previous');
		assert.equal(saved.context.postform.passw.value, 'old-post-password');
	}
});

test('legacy tracked bundle uses the identical secure helper for both password consumers', () => {
	const source = read('extension/v3/Dollchan_Extension_Tools.es6.user.js');
	assert.equal(source.match(/function generatePostPassword\(\) \{[\s\S]*?\n\}/)[0], helperFunction);
	assert.equal(source.match(/= generatePostPassword\(\);/g).length, 2);
	assert.match(source, /Cfg\.passwValue = generatePostPassword\(\);/);
	assert.match(source, /\$q\('input\[info="passwValue"\]'\)\.value = generatePostPassword\(\);/);
	assert.doesNotMatch(source, /Math\.round\(Math\.random\(\) \* 1e12\)\.toString\(32\)/);
	const context = vm.createContext({ crypto: { getRandomValues: bytes => bytes.fill(31) } });
	vm.runInContext(helperFunction, context);
	assert.equal(context.generatePostPassword(), 'vvvvvvvv');
});
