const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('Firefox manifest has an independent AMO identity and consent declaration', () => {
	const manifest = JSON.parse(read('extension/v2/manifest.json'));
	assert.equal(manifest.name, 'Dollchan Next');
	assert.equal(manifest.version, '1.0.0');
	assert.equal(manifest.author, 'qqrm');
	assert.equal(manifest.browser_specific_settings.gecko.id, 'dollchan-next@qqrm.github.io');
	assert.equal(manifest.browser_specific_settings.gecko.strict_min_version, '140.0');
	assert.equal(manifest.browser_specific_settings.gecko_android.strict_min_version, '142.0');
	assert.deepEqual(manifest.browser_specific_settings.gecko.data_collection_permissions.required, [
		'personalCommunications', 'browsingActivity', 'websiteContent'
	]);
	assert.equal(manifest.options_ui.page, 'settings/settings.html');
	assert.equal('update_url' in manifest.browser_specific_settings.gecko, false);
});

test('external services are disabled before explicit consent', () => {
	const defaults = read('src/modules/DefaultCfg.js');
	assert.match(defaults, /imgSrcBtns\s+: 0/);
	assert.match(defaults, /YTubeTitles\s+: 0/);
	assert.match(defaults, /addVimeo\s+: 0/);
	assert.match(defaults, /externalServices:\s*0/);
	const storage = read('src/modules/Storage.js');
	assert.match(storage, /getStoredObj\('DESU_Privacy'\)/);
	assert.match(storage, /if\(!Cfg\.externalServices\)/);
	const players = read('src/modules/Players.js');
	assert.match(players, /if\(!Cfg\.YTubeTitles\)\s*{\s*return null;/);
});

test('storage adds schema and migrates legacy presentation without deleting old fields', () => {
	const storage = read('src/modules/Storage.js');
	assert.match(storage, /val\.schemaVersion = 1/);
	assert.match(storage, /obj\.scriptStyle === 4 \? 'dark' : 'system'/);
	assert.match(storage, /setStored\('DN_theme', Cfg\.theme\)/);
	assert.doesNotMatch(storage, /delete obj\.scriptStyle/);
});

test('popup and settings expose the release-critical controls', () => {
	const popup = read('extension/v2/menu/menu.html');
	const settings = read('extension/v2/settings/settings.html');
	for(const id of ['extension-toggle', 'current-site', 'open-settings']) {
		assert.match(popup, new RegExp(`id="${ id }"`));
	}
	for(const id of ['scope-includes', 'external-services', 'import-file', 'apply-import', 'export-data']) {
		assert.match(settings, new RegExp(`id="${ id }"`));
	}
});

test('the built-in dollchan.net copy is migrated instead of blocking Dollchan Next', () => {
	const main = read('src/modules/Main.js');
	assert.match(main, /existingDollchan\.classList\.contains\('de-runned-inpage'\)/);
	assert.match(main, /Disable the original extension and reload this page/);
	assert.match(main, /#de-main-container\.de-runned-inpage:not\(\[data-dollchan-next\]\)/);
	assert.match(main, /#de-css, #de-css-dynamic, #de-css-user/);
	assert.match(read('src/modules/Panel.js'), /data-dollchan-next/);
	const storage = read('src/modules/Storage.js');
	assert.match(storage, /locObj\.disabled = 1/);
	assert.match(storage, /deWindow\.location\.reload\(\)/);
});

test('release metadata identifies the derivative and omits upstream donation/update endpoints', () => {
	const metadata = read('amo-metadata.json');
	assert.match(metadata, /independent, modernised fork/i);
	assert.doesNotMatch(read('src/modules/Misc.js'), /showDonateMsg|checkForUpdates/);
	assert.doesNotMatch(read('src/modules/GlobalVars.js'), /SthephanShinkufag/);
});
