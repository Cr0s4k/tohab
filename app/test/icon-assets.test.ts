import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

function rgba(path: string) {
	const png = readFileSync(new URL(path, import.meta.url));
	assert.equal(png.toString('ascii', 1, 4), 'PNG');
	let offset = 8;
	let width = 0;
	let height = 0;
	const idat: Buffer[] = [];
	while (offset < png.length) {
		const length = png.readUInt32BE(offset);
		const type = png.toString('ascii', offset + 4, offset + 8);
		const data = png.subarray(offset + 8, offset + 8 + length);
		if (type === 'IHDR') {
			width = data.readUInt32BE(0);
			height = data.readUInt32BE(4);
			assert.equal(data[8], 8);
			assert.equal(data[9], 6, `${path} must be RGBA`);
		}
		if (type === 'IDAT') idat.push(data);
		offset += 12 + length;
	}
	const packed = inflateSync(Buffer.concat(idat));
	const stride = width * 4;
	const pixels = Buffer.alloc(stride * height);
	let input = 0;
	for (let y = 0; y < height; y += 1) {
		const filter = packed[input++];
		for (let x = 0; x < stride; x += 1) {
			const raw = packed[input++];
			const left = x >= 4 ? pixels[y * stride + x - 4] : 0;
			const up = y ? pixels[(y - 1) * stride + x] : 0;
			const upperLeft = y && x >= 4 ? pixels[(y - 1) * stride + x - 4] : 0;
			let value = raw;
			if (filter === 1) value += left;
			else if (filter === 2) value += up;
			else if (filter === 3) value += Math.floor((left + up) / 2);
			else if (filter === 4) {
				const p = left + up - upperLeft;
				const pa = Math.abs(p - left), pb = Math.abs(p - up), pc = Math.abs(p - upperLeft);
				value += pa <= pb && pa <= pc ? left : pb <= pc ? up : upperLeft;
			}
			pixels[y * stride + x] = value & 255;
		}
	}
	return { width, height, pixels };
}

for (const path of ['../static/icons/icon-192.png', '../static/icons/icon-512.png', '../static/icons/icon-512-maskable.png', '../static/icons/apple-touch-icon.png']) {
	const image = rgba(path);
	for (const [x, y] of [[0, 0], [image.width - 1, 0], [0, image.height - 1], [image.width - 1, image.height - 1]]) {
		assert.equal(image.pixels[(y * image.width + x) * 4 + 3], 255, `${path} must be full bleed for platform masking`);
	}
	let brightBottomPixels = 0;
	for (let y = Math.floor(image.height * 0.9); y < image.height; y += 1) {
		for (let x = 0; x < image.width; x += 1) {
			const i = (y * image.width + x) * 4;
			if (image.pixels[i] > 225 && image.pixels[i + 1] > 225 && image.pixels[i + 2] > 225) brightBottomPixels += 1;
		}
	}
	assert.equal(brightBottomPixels, 0, `${path} must not contain a baked white mask edge`);
}

console.log('ok full-bleed icon assets');
