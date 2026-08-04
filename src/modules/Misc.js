/* ==[ Misc.js ]==============================================================================================
                                                MISCELLANEOUS
=========================================================================================================== */

// You can use Dollchan API listeners in Your external scripts and apps
// More info: https://github.com/SthephanShinkufag/Dollchan-Extension-Tools/wiki/dollchan-api
const DollchanAPI = {
	initAPI() {
		this.hasListeners = false;
		if(!('MessageChannel' in deWindow)) {
			return;
		}
		const channel = new MessageChannel();
		this.port = channel.port1;
		this.port.onmessage = this._handleMessage;
		this.activeListeners = new Set();
		const port = channel.port2;
		doc.defaultView.addEventListener('message', e => {
			if(e.data === 'de-request-api-message') {
				this.hasListeners = true;
				doc.defaultView.postMessage('de-answer-api-message', '*', [port]);
			}
		});
	},
	hasListener: name => DollchanAPI.hasListeners && DollchanAPI.activeListeners.has(name),
	notify(name, data) {
		if(this.hasListener(name)) {
			this.port.postMessage({ name, data });
		}
	},

	_handleMessage({ data: arg }) {
		if(!arg?.name) {
			return;
		}
		let rv = null;
		const { name, data } = arg;
		switch(name.toLowerCase()) {
		case 'registerapi':
			if(data) {
				rv = {};
				for(const aName of data) {
					rv[aName] = DollchanAPI._register(aName.toLowerCase());
				}
			}
			break;
		}
		DollchanAPI.port.postMessage({ name, data: rv });
	},
	_register(name) {
		switch(name) {
		case 'expandmedia':
		case 'filechange':
		case 'newpost':
		case 'submitform': break;
		default: return false;
		}
		this.activeListeners.add(name);
		return true;
	}
};

function initPage() {
	if(aib.t) {
		if(Cfg.rePageTitle && Thread.first) {
			doc.title = `/${ aib.b } - ${ Thread.first.op.title }`;
		}
		if(!localData) {
			Cfg.stats.view++;
			CfgSaver.saveObj(aib.domain, loadedCfg => {
				loadedCfg.stats.view++;
				return loadedCfg;
			});
		}
	} else {
		thrNavPanel.initThrNav();
	}
	if(!localData) {
		updater = initThreadUpdater(doc.title, aib.t && Cfg.ajaxUpdThr && !aib.isArchived);
	}
}

function scrollPage() {
	if(!aib.t && Cfg.scrollToTop) {
		scrollTo(0, 1);
		return;
	}
	setTimeout(() => {
		let post, num;
		const { hash } = deWindow.location;
		if(hash && (num = hash.match(/#[ip]?(\d+)$/)) &&
			(num = +num[1]) && (post = pByNum.get(num)) && !post.isOp
		) {
			post.selectAndScrollTo();
			return;
		}
		const id = 'de-scroll-' + aib.b + (aib.t || '');
		const val = +sesStorage[id];
		if(val && needScroll && Cfg.saveScroll) {
			scrollTo(0, val);
			sesStorage.removeItem(id);
		}
	}, 0);
}
