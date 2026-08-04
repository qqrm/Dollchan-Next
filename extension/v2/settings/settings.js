const $id = id => document.getElementById(id);
let pendingImport = null;
const hasExtensionStorage = typeof chrome !== 'undefined' && chrome.storage?.local;

const getStored = id => !hasExtensionStorage ? Promise.resolve(undefined) :
	new Promise(resolve => chrome.storage.local.get(id, local => {
		if(Object.prototype.hasOwnProperty.call(local, id)) {
			resolve(local[id]);
		} else {
			chrome.storage.sync.get(id, synced => resolve(synced[id]));
		}
	}));

const setStored = (id, value) => !hasExtensionStorage ? Promise.resolve() : new Promise(resolve => {
	const data = { [id]: value };
	chrome.storage.sync.set(data, () => {
		if(chrome.runtime.lastError) {
			chrome.storage.local.set(data, resolve);
			chrome.storage.sync.remove(id);
		} else {
			chrome.storage.local.remove(id, resolve);
		}
	});
});

function parseStored(value, fallback = {}) {
	if(!value) {
		return fallback;
	}
	if(typeof value === 'string') {
		try {
			return JSON.parse(value);
		} catch(err) {
			return fallback;
		}
	}
	return value;
}

function setState(message, isError = false) {
	const state = $id('save-state');
	state.textContent = message;
	state.style.color = isError ? 'var(--dn-danger)' : '';
}

function countRules(config) {
	const values = Object.values(config || {});
	const spellText = values.map(value => value?.spells || '').join('\n');
	return spellText.split(/\r?\n|\s+\|\s+/).filter(Boolean).length;
}

function countHotkeys(hotkeys) {
	if(!Array.isArray(hotkeys)) {
		return 0;
	}
	return hotkeys.slice(2).flat(2).filter(Number.isInteger).length;
}

async function loadSettings() {
	const [scope, privacy, theme] = await Promise.all([
		getStored('DESU_scope'),
		getStored('DESU_Privacy'),
		getStored('DN_theme')
	]);
	$id('scope-includes').value = scope?.includes || '*';
	$id('scope-excludes').value = scope?.excludes || '';
	$id('external-services').checked = Boolean(parseStored(privacy).externalServices);
	$id('theme').value = theme || 'system';
	document.documentElement.dataset.theme = theme || 'system';
}

async function saveScope() {
	await setStored('DESU_scope', {
		includes: $id('scope-includes').value.trim() || '*',
		excludes: $id('scope-excludes').value.trim()
	});
	setState('Scope saved');
}

async function savePrivacy() {
	const externalServices = $id('external-services').checked;
	const theme = $id('theme').value;
	await Promise.all([
		setStored('DESU_Privacy', JSON.stringify({ schemaVersion: 1, externalServices })),
		setStored('DN_theme', theme)
	]);
	document.documentElement.dataset.theme = theme;
	setState('Privacy settings saved');
}

function normalizeImport(data) {
	const settings = data.settings || (!data.schemaVersion && !data.favorites ? data : null);
	return {
		settings,
		hotkeys  : data.hotkeys || null,
		favorites: data.favorites || null,
		scope    : data.scope || null,
		privacy  : data.privacy || null,
		theme    : data.theme || null
	};
}

async function previewImport(file) {
	try {
		const data = JSON.parse(await file.text());
		pendingImport = normalizeImport(data);
		if(!pendingImport.settings && !pendingImport.hotkeys && !pendingImport.favorites) {
			throw new Error('No supported Dollchan data found');
		}
		const settings = parseStored(pendingImport.settings);
		const hotkeys = parseStored(pendingImport.hotkeys, []);
		const favorites = parseStored(pendingImport.favorites);
		$id('import-summary').textContent = [
			`Domains: ${ Object.keys(settings).filter(key =>
				!['global', 'commit', 'schemaVersion'].includes(key)).length }`,
			`Rules: ${ countRules(settings) }`,
			`Hotkey bindings: ${ countHotkeys(hotkeys) }`,
			`Favourite boards: ${ Object.keys(favorites).length }`
		].join('\n');
		$id('import-preview').hidden = false;
		$id('apply-import').disabled = false;
		setState('Backup checked; review the preview');
	} catch(err) {
		pendingImport = null;
		$id('import-preview').hidden = true;
		$id('apply-import').disabled = true;
		setState(`Import failed: ${ err.message }`, true);
	}
}

async function applyImport() {
	if(!pendingImport) {
		return;
	}
	const writes = [];
	if(pendingImport.settings) {
		const settings = parseStored(pendingImport.settings);
		settings.schemaVersion = 1;
		writes.push(setStored('DESU_Config', JSON.stringify(settings)));
	}
	if(pendingImport.hotkeys) {
		writes.push(setStored('DESU_keys', JSON.stringify(parseStored(pendingImport.hotkeys, []))));
	}
	if(pendingImport.favorites) {
		writes.push(setStored('DESU_Favorites', JSON.stringify(parseStored(pendingImport.favorites))));
	}
	if(pendingImport.scope) {
		writes.push(setStored('DESU_scope', pendingImport.scope));
	}
	if(pendingImport.privacy) {
		writes.push(setStored('DESU_Privacy', JSON.stringify(pendingImport.privacy)));
	}
	if(pendingImport.theme) {
		writes.push(setStored('DN_theme', pendingImport.theme));
	}
	await Promise.all(writes);
	setState('Import complete; reload open imageboard tabs');
	await loadSettings();
}

async function exportData() {
	const [settings, hotkeys, favorites, scope, privacy, theme] = await Promise.all([
		getStored('DESU_Config'), getStored('DESU_keys'), getStored('DESU_Favorites'),
		getStored('DESU_scope'), getStored('DESU_Privacy'), getStored('DN_theme')
	]);
	const backup = {
		schemaVersion: 1,
		product      : 'Dollchan Next',
		exportedAt   : new Date().toISOString(),
		settings     : parseStored(settings),
		hotkeys      : parseStored(hotkeys, []),
		favorites    : parseStored(favorites),
		scope        : scope || { includes: '*', excludes: '' },
		privacy      : parseStored(privacy),
		theme        : theme || 'system'
	};
	const url = URL.createObjectURL(new Blob(
		[JSON.stringify(backup, null, 2)], { type: 'application/json' }
	));
	const link = document.createElement('a');
	link.href = url;
	link.download = `dollchan-next-${ new Date().toISOString().slice(0, 10) }.json`;
	link.click();
	URL.revokeObjectURL(url);
	setState('Backup downloaded');
}

document.addEventListener('DOMContentLoaded', () => {
	loadSettings().catch(err => setState(err.message, true));
	document.querySelectorAll('.dn-nav-item').forEach(button => button.addEventListener('click', () => {
		document.querySelectorAll('.dn-nav-item').forEach(item => item.removeAttribute('aria-current'));
		document.querySelectorAll('.dn-section').forEach(section => delete section.dataset.visible);
		button.setAttribute('aria-current', 'page');
		$id(`section-${ button.dataset.section }`).dataset.visible = 'true';
	}));
	$id('save-scope').addEventListener('click', () =>
		saveScope().catch(err => setState(err.message, true)));
	$id('save-privacy').addEventListener('click', () =>
		savePrivacy().catch(err => setState(err.message, true)));
	$id('import-file').addEventListener('change', event => {
		const file = event.target.files[0];
		if(file) {
			previewImport(file);
		}
	});
	$id('apply-import').addEventListener('click', () =>
		applyImport().catch(err => setState(err.message, true)));
	$id('export-data').addEventListener('click', () =>
		exportData().catch(err => setState(err.message, true)));
});
