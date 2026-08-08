/* ==[ Main.js ]==============================================================================================
                                                     MAIN
=========================================================================================================== */

// XXX: Greasemonkey/Firemonkey hack to run in all frames
function runFrames() {
	if(!deWindow.frames[0] ||
		!(nav.scriptHandler.startsWith('Greasemonkey') || nav.scriptHandler.startsWith('FireMonkey'))
	) {
		return;
	}
	const deMainFuncFrame = frameEl => {
		const fDoc = frameEl.contentDocument;
		if(fDoc) {
			const deWindow = fDoc.defaultView;
			deMainFuncInner(
				deWindow,
				deWindow.FormData,
				(x, y) => deWindow.scrollTo(x, y),
				typeof localData === 'object' ? localData : null
			);
		}
	};
	for(let i = 0, len = deWindow.length; i < len; ++i) {
		const frameEl = deWindow.frames[i].frameElement;
		const fDoc = frameEl.contentDocument;
		if(fDoc) {
			if(String(fDoc.defaultView.location) === 'about:blank') {
				frameEl.onload = () => deMainFuncFrame(frameEl);
			} else if(fDoc.readyState === 'loading') {
				fDoc.addEventListener('DOMContentLoaded', () => deMainFuncFrame(frameEl));
			} else {
				deMainFuncFrame(frameEl);
			}
		}
	}
}

async function runMain(checkDomains, dataPromise) {
	Logger.initLogger();
	if(!doc.body || !aib && !(aib = getImageBoard(checkDomains, true))) {
		return;
	}
	const existingDollchan = $id('de-main-container');
	// dollchan.net ships its own in-page copy. The storage migration below disables that copy and reloads
	// the page, so it must not be treated as a competing extension/userscript instance.
	if(existingDollchan && !existingDollchan.classList.contains('de-runned-inpage')) {
		const warning = doc.createElement('div');
		warning.id = 'dn-conflict-warning';
		warning.textContent = 'Dollchan Next detected another active Dollchan copy. Disable the original extension and reload this page.';
		Object.assign(warning.style, {
			position: 'fixed',
			top: '12px',
			right: '12px',
			zIndex: '2147483647',
			maxWidth: '380px',
			padding: '12px 16px',
			border: '1px solid #ff7b8c',
			borderRadius: '10px',
			color: '#fff',
			background: '#671f2b',
			font: '14px/1.4 system-ui, sans-serif'
		});
		doc.body.append(warning);
		return;
	}
	if(!locStorage) {
		nav = initBrowser();
	}
	let formEl = $q(aib.qDelForm + ', [de-form]');
	if(!formEl) {
		runFrames();
		return;
	}
	if(aib.observeContent?.(checkDomains, dataPromise) === false) {
		return;
	}
	Logger.log('Imageboard check');
	const [favObj] = await (dataPromise || Promise.all([readFavorites(), readCfg()]));
	if(!Cfg.disabled && aib.init?.() || !localData && doc.body.classList.contains('de-runned-local')) {
		return;
	}
	if(nav.hasInPageDE) {
		// The disabled in-page copy leaves its panel, SVG sprite and three style elements behind.
		// Remove them before mounting Dollchan Next so duplicate IDs cannot make the legacy CSS win.
		$Q('#de-main, #de-main-container.de-runned-inpage:not([data-dollchan-next]), #de-svg-icons, ' +
			'#de-css, #de-css-dynamic, #de-css-user').forEach(el => el.remove());
	}
	Logger.log('Storage loading');
	addSVGIcons();
	if(Cfg.disabled) {
		Panel.initPanel(formEl);
		scriptCSS();
		return;
	}
	if('toJSON' in Array.prototype) {
		delete Array.prototype.toJSON;
	}
	initStorageEvent();
	DollchanAPI.initAPI();
	if(localData) {
		aib.protocol = 'http:';
		aib.host = aib.domain;
		aib.b = localData.b;
		aib.t = localData.t;
		aib.docExt = '.html';
	} else {
		aib.parseURL();
	}
	if(aib.t || !Cfg.scrollToTop) {
		doc.defaultView.addEventListener('beforeunload', () => {
			sesStorage['de-scroll-' + aib.b + (aib.t || '')] = deWindow.pageYOffset;
		});
	}
	Logger.log('Init');
	if(Cfg.correctTime) {
		dTime = new DateTime(Cfg.timePattern, Cfg.timeRPattern, Cfg.timeOffset, lang,
			rp => CfgSaver.save('timeRPattern', rp));
		Logger.log('Time correction');
	}
	MyPosts.readStorage();
	Logger.log('Read my posts');
	$hide(doc.body);
	formEl = aib.fixHTML(formEl, true);
	Logger.log('Replace delform');
	pByEl = new Map();
	pByNum = new Map();
	try {
		DelForm.last = DelForm.first = new DelForm(formEl, aib.page, null);
		if(!Thread.first) {
			console.error('No threads detected!');
		}
	} catch(err) {
		console.error('Delform parsing error:', getErrorMessage(err));
		$show(doc.body);
		return;
	}
	Logger.log('Parse delform');
	if(aib.t) {
		const storageName = `de-last-postscount-${ aib.b }-${ aib.t }`;
		if(sesStorage[storageName] > Thread.first.postsCount) {
			sesStorage.removeItem(storageName);
			deWindow.location.reload();
		}
	}
	postform = new PostForm($q(aib.qForm));
	Logger.log('Parse postform');
	if(Cfg.hotKeys) {
		HotKeys.enableHotKeys();
		Logger.log('Init keybinds');
	}
	initPage();
	Logger.log('Init page');
	Panel.initPanel(formEl);
	Logger.log('Add panel');
	embedPostMsgImages(DelForm.first.el);
	Logger.log('Image-links');
	DelForm.first.addStuff();
	readViewedPosts();
	scriptCSS();
	Logger.log('Apply CSS');
	$show(doc.body);
	Logger.log('Display page');
	Pages.toggleInfinityScroll();
	Logger.log('Infinity scroll');
	const { firstThr } = DelForm.first;
	if(firstThr) {
		readPostsData(firstThr.op, favObj);
	}
	Logger.log('Hide posts');
	scrollPage();
	Logger.log('Scroll page');
	if(localData) {
		$Q('.de-post-removed').forEach(el => {
			const post = pByEl.get(el);
			if(post) {
				post.deletePost(false);
			}
		});
		Logger.log('Local changings');
	}
	Logger.finish();
}

function initMain() {
	if(doc.readyState !== 'loading') {
		needScroll = false;
		runMain(true, null);
		return;
	}
	let dataPromise = null;
	if((aib = getImageBoard(true, false))) {
		nav = initBrowser();
		dataPromise = Promise.all([readFavorites(), readCfg()]);
	}
	needScroll = true;
	doc.addEventListener('onwheel' in doc.defaultView ? 'wheel' : 'mousewheel', function wFunc(e) {
		needScroll = false;
		doc.removeEventListener(e.type, wFunc);
	});
	doc.addEventListener('DOMContentLoaded', () => runMain(false, dataPromise));
}

initMain();
