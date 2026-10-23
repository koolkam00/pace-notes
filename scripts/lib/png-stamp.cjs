// PNG chunks for generated images: keep only the image chunks and add one tEXt stamp (no time or other varying chunk),
// so a re-render of unchanged inputs gives the same bytes and a check can read what an image was made from.
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
function crc32(buffer) {
  let c = 0xFFFFFFFF;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function pngChunks(buffer) {
  if (buffer.length < 33 || !buffer.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error('not a PNG file');
  const chunks = [];
  for (let at = 8; at < buffer.length;) {
    const length = buffer.readUInt32BE(at);
    const type = buffer.toString('latin1', at + 4, at + 8);
    chunks.push({ type, data: buffer.subarray(at + 8, at + 8 + length) });
    at += 12 + length;
    if (type === 'IEND') break;
  }
  return chunks;
}
function chunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'latin1');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
}
function stampPng(buffer, key, value) {
  const keep = pngChunks(buffer).filter((c) => ['IHDR', 'PLTE', 'tRNS', 'IDAT', 'IEND'].includes(c.type));
  // tEXt is Latin-1: escape everything outside ASCII so titles with curly quotes or dashes survive.
  const json = JSON.stringify(value).replace(/[\u007f-￿]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
  const text = Buffer.concat([Buffer.from(key, 'latin1'), Buffer.from([0]), Buffer.from(json, 'latin1')]);
  return Buffer.concat([PNG_SIGNATURE, ...keep.filter((c) => c.type !== 'IEND').map((c) => chunk(c.type, c.data)), chunk('tEXt', text), chunk('IEND', Buffer.alloc(0))]);
}
function readPng(buffer, key) {
  const chunks = pngChunks(buffer);
  const ihdr = chunks[0];
  if (!ihdr || ihdr.type !== 'IHDR') throw new Error('PNG without IHDR');
  const text = chunks.find((c) => c.type === 'tEXt' && c.data.toString('latin1').startsWith(key + '\0'));
  let stamp = null;
  if (text) { try { stamp = JSON.parse(text.data.toString('latin1').slice(key.length + 1)); } catch { stamp = null; } }
  return { width: ihdr.data.readUInt32BE(0), height: ihdr.data.readUInt32BE(4), stamp };
}

module.exports = { crc32, stampPng, readPng };
