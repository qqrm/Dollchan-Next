import { deflateSync } from 'node:zlib';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const sizes = [16, 32, 48, 64, 96, 128, 256];
const outputDir = path.resolve(import.meta.dirname, '..', 'extension', 'v2', 'icons');

function crc32(data) {
	let crc = 0xffffffff;
	for(const byte of data) {
		crc ^= byte;
		for(let bit = 0; bit < 8; ++bit) {
			crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
		}
	}
	return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
	const name = Buffer.from(type);
	const body = Buffer.concat([name, data]);
	const result = Buffer.alloc(data.length + 12);
	result.writeUInt32BE(data.length, 0);
	body.copy(result, 4);
	result.writeUInt32BE(crc32(body), result.length - 4);
	return result;
}

function pointInPolygon(x, y, points) {
	let inside = false;
	for(let i = 0, j = points.length - 1; i < points.length; j = i++) {
		const [xi, yi] = points[i];
		const [xj, yj] = points[j];
		if((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) {
			inside = !inside;
		}
	}
	return inside;
}

function roundedRect(x, y, left, top, right, bottom, radius) {
	const cx = Math.max(left + radius, Math.min(right - radius, x));
	const cy = Math.max(top + radius, Math.min(bottom - radius, y));
	return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2;
}

function drawPixel(nx, ny, disabled) {
	if(!roundedRect(nx, ny, 6, 6, 122, 122, 30)) {
		return [0, 0, 0, 0];
	}
	let color = disabled ? [51, 55, 68, 255] : [23, 25, 35, 255];
	const outerD = nx >= 25 && nx <= 83 && ny >= 31 && ny <= 97 &&
		(nx <= 46 || ((nx - 49) / 34) ** 2 + ((ny - 64) / 33) ** 2 <= 1);
	const innerD = nx >= 44 && ((nx - 49) / 17) ** 2 + ((ny - 64) / 17) ** 2 <= 1;
	if(outerD && !innerD) {
		const ratio = Math.max(0, Math.min(1, (nx + ny - 40) / 135));
		const start = disabled ? [123, 126, 146] : [139, 124, 255];
		const end = disabled ? [104, 138, 148] : [54, 196, 217];
		color = start.map((value, index) => Math.round(value + (end[index] - value) * ratio));
		color.push(255);
	}
	const nMask = nx >= 70 && nx <= 84 && ny >= 31 && ny <= 97 ||
		nx >= 103 && nx <= 117 && ny >= 31 && ny <= 97 ||
		pointInPolygon(nx, ny, [[79, 31], [95, 31], [108, 97], [92, 97]]);
	if(nMask) {
		color = disabled ? [192, 195, 205, 255] : [247, 247, 251, 255];
	}
	return color;
}

function createPng(size, disabled) {
	const raw = Buffer.alloc((size * 4 + 1) * size);
	for(let y = 0; y < size; ++y) {
		const row = y * (size * 4 + 1);
		for(let x = 0; x < size; ++x) {
			const color = drawPixel((x + 0.5) * 128 / size, (y + 0.5) * 128 / size, disabled);
			for(let channel = 0; channel < 4; ++channel) {
				raw[row + 1 + x * 4 + channel] = color[channel];
			}
		}
	}
	const header = Buffer.alloc(13);
	header.writeUInt32BE(size, 0);
	header.writeUInt32BE(size, 4);
	header[8] = 8;
	header[9] = 6;
	return Buffer.concat([
		Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
		chunk('IHDR', header),
		chunk('IDAT', deflateSync(raw, { level: 9 })),
		chunk('IEND', Buffer.alloc(0))
	]);
}

await mkdir(outputDir, { recursive: true });
for(const size of sizes) {
	await Promise.all([
		writeFile(path.join(outputDir, `dn-${ size }.png`), createPng(size, false)),
		writeFile(path.join(outputDir, `dn-disabled-${ size }.png`), createPng(size, true))
	]);
}
process.stdout.write(`Generated ${ sizes.length * 2 } Dollchan Next icons\n`);
