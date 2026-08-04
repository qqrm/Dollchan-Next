const sendMessage = message => new Promise(resolve => chrome.runtime.sendMessage(message, resolve));
const getStored = id => new Promise(resolve => chrome.storage.local.get(id, local => {
	if(Object.prototype.hasOwnProperty.call(local, id)) {
		resolve(local[id]);
	} else {
		chrome.storage.sync.get(id, synced => resolve(synced[id]));
	}
}));

function matchesScope(url, scope) {
	const matches = list => (list || '').split(/\r?\n/).filter(Boolean).some(pattern => {
		const expression = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
		return new RegExp(`^${ expression }$`).test(url);
	});
	return matches(scope.includes || '*') && !matches(scope.excludes || '');
}

document.addEventListener('DOMContentLoaded', async () => {
	const toggle = document.getElementById('extension-toggle');
	const status = document.getElementById('extension-status');
	const setStatus = enabled => {
		toggle.checked = enabled;
		status.dataset.enabled = String(enabled);
		status.textContent = enabled ? 'Enabled' : 'Disabled';
	};
	const state = await sendMessage({ 'de-messsage': 'getDollchanNextStatus' });
	setStatus(Boolean(state?.enabled));
	toggle.addEventListener('change', async () => {
		const answer = await sendMessage({ 'de-messsage': 'toggleDollchan' });
		setStatus(Boolean(answer?.answer));
	});
	document.getElementById('open-settings').addEventListener('click', () =>
		chrome.runtime.openOptionsPage());

	chrome.tabs.query({ active: true, currentWindow: true }, async tabs => {
		const url = tabs[0]?.url;
		if(!url?.startsWith('http')) {
			return;
		}
		const parsed = new URL(url);
		document.getElementById('current-site').textContent = parsed.hostname;
		const scope = await getStored('DESU_scope') || { includes: '*', excludes: '' };
		document.getElementById('site-state').textContent = matchesScope(url, scope) ?
			'Included in extension scope.' : 'Excluded from extension scope.';
	});
});
