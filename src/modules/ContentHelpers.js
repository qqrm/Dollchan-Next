// Preserve the board-compatible eight-character base32 format using only Web Crypto.
function generatePostPassword() {
	const bytes = new Uint8Array(8);
	crypto.getRandomValues(bytes);
	// 32 divides 256, so each low-five-bit character has equal probability.
	return Array.from(bytes, byte => (byte & 31).toString(32)).join('');
}

// Read an existing DOM tree without treating its text as markup.
function extractPostText(node) {
	if(node.nodeType === 3) {
		return node.nodeValue;
	}
	if(node.nodeType !== 1) {
		return '';
	}
	const tag = node.tagName.toLowerCase();
	if(tag === 'br') {
		return '\n';
	}
	const text = Array.from(node.childNodes, extractPostText).join('');
	return tag === 'p' || tag === 'li' ? '\n' + text + '\n' : text;
}

// Normalizes post text for persistent exact/fuzzy hiding rules.
function normalizePostText(text, fuzzy = false) {
	let value = String(text).toLowerCase().replace(/ё/g, 'е');
	if(value.normalize) {
		value = value.normalize('NFKC');
	}
	if(fuzzy) {
		value = value
			.replace(/https?:\/\/[^\s]+/g, ' url ')
			.replace(/>>\d+/g, ' ref ')
			.replace(/[^a-zа-я0-9]+/gi, ' ');
	}
	return value.replace(/\s+/g, ' ').trim();
}

function getTextSimilarity(textA, textB) {
	const a = normalizePostText(textA, true);
	const b = normalizePostText(textB, true);
	if(!a || !b) {
		return 0;
	}
	if(a === b) {
		return 1;
	}
	const makeGrams = text => {
		const value = ` ${ text } `;
		if(value.length <= 3) {
			return [value];
		}
		const grams = [];
		for(let i = 0; i <= value.length - 3; ++i) {
			grams.push(value.substr(i, 3));
		}
		return grams;
	};
	const dice = (left, right) => {
		const counts = new Map();
		let matches = 0;
		for(const item of left) {
			counts.set(item, (counts.get(item) || 0) + 1);
		}
		for(const item of right) {
			const count = counts.get(item) || 0;
			if(count) {
				matches++;
				counts.set(item, count - 1);
			}
		}
		return 2 * matches / (left.length + right.length);
	};
	const wordsA = a.split(' ');
	const wordsB = b.split(' ');
	const maxWords = Math.max(wordsA.length, wordsB.length);
	const minWords = Math.min(wordsA.length, wordsB.length);
	if(maxWords > minWords * 2) {
		return 0;
	}
	const charScore = dice(makeGrams(a), makeGrams(b));
	const wordScore = dice(wordsA, wordsB);
	return charScore * 0.65 + wordScore * 0.35;
}

function isPostTextSimilar(textA, textB) {
	const a = normalizePostText(textA, true);
	const b = normalizePostText(textB, true);
	if(!a || !b) {
		return false;
	}
	if(a === b) {
		return true;
	}
	const minWords = Math.min(a.split(' ').length, b.split(' ').length);
	const threshold = minWords <= 2 ? 0.88 : minWords <= 5 ? 0.72 : 0.66;
	return getTextSimilarity(a, b) >= threshold;
}

function getPerceptualHashDistance(hashA, hashB) {
	if(!/^[0-9a-f]{16}$/i.test(hashA) || !/^[0-9a-f]{16}$/i.test(hashB)) {
		return Infinity;
	}
	const bitCounts = [0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4];
	let distance = 0;
	for(let i = 0; i < 16; ++i) {
		distance += bitCounts[parseInt(hashA[i], 16) ^ parseInt(hashB[i], 16)];
	}
	return distance;
}

function normalizeHotKeyGroup(group) {
	const keys = Array.isArray(group) ? group : group ? [group] : [];
	return [...new Set(keys.filter(key => Number.isInteger(key) && key > 0))];
}

function normalizeHotKeySets(keys) {
	for(let i = 2; i <= 4; ++i) {
		keys[i] = keys[i].map(normalizeHotKeyGroup);
	}
	return keys;
}

function findHotKeyAction(groups, key) {
	return groups.findIndex(group => group.includes(key));
}

function generateImageHash([arrBuf, oldw, oldh]) {
	const buf = new Uint8Array(arrBuf);
	const size = oldw * oldh;
	for(let i = 0, j = 0; i < size; i++, j += 4) {
		buf[i] = buf[j] * 0.3 + buf[j + 1] * 0.59 + buf[j + 2] * 0.11;
	}
	const newh = 8;
	const neww = 8;
	const levels = 4;
	const areas = 256 / levels;
	const values = 256 / (levels - 1);
	let hash = 0;
	for(let i = 0; i < newh; ++i) {
		for(let j = 0; j < neww; ++j) {
			let temp = i / (newh - 1) * (oldh - 1);
			const l = Math.min(temp | 0, oldh - 2);
			const u = temp - l;
			temp = j / (neww - 1) * (oldw - 1);
			const c = Math.min(temp | 0, oldw - 2);
			const t = temp - c;
			hash = (hash << 4) + Math.min(values * (((buf[l * oldw + c] * ((1 - t) * (1 - u)) +
				buf[l * oldw + c + 1] * (t * (1 - u)) +
				buf[(l + 1) * oldw + c + 1] * (t * u) +
				buf[(l + 1) * oldw + c] * ((1 - t) * u)) / areas) | 0), 255);
			const g = hash & 0xF0000000;
			if(g) {
				hash ^= g >>> 24;
			}
			hash &= ~g;
		}
	}
	const sample = (x, y) => {
		let temp = y / 7 * (oldh - 1);
		const top = Math.min(temp | 0, oldh - 2);
		const vertical = temp - top;
		temp = x / 8 * (oldw - 1);
		const left = Math.min(temp | 0, oldw - 2);
		const horizontal = temp - left;
		return buf[top * oldw + left] * ((1 - horizontal) * (1 - vertical)) +
			buf[top * oldw + left + 1] * (horizontal * (1 - vertical)) +
			buf[(top + 1) * oldw + left + 1] * (horizontal * vertical) +
			buf[(top + 1) * oldw + left] * ((1 - horizontal) * vertical);
	};
	let perceptualHash = '';
	let bits = 0;
	let nibble = 0;
	for(let y = 0; y < 8; ++y) {
		let previous = sample(0, y);
		for(let x = 1; x < 9; ++x) {
			const current = sample(x, y);
			nibble = (nibble << 1) | (previous > current ? 1 : 0);
			previous = current;
			if(++bits === 4) {
				perceptualHash += nibble.toString(16);
				bits = 0;
				nibble = 0;
			}
		}
	}
	return { hash, perceptualHash };
}

// Node tests import the same standalone functions embedded by the Firefox build.
if(typeof module !== 'undefined' && module.exports) {
	module.exports = {
		generatePostPassword,
		extractPostText,
		normalizePostText,
		getTextSimilarity,
		isPostTextSimilar,
		getPerceptualHashDistance,
		normalizeHotKeyGroup,
		normalizeHotKeySets,
		findHotKeyAction,
		generateImageHash
	};
}
