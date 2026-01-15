// client/gif.js
// Minimal GIF89a encoder (fixed palette + LZW). For private-local export.
// Not a general-purpose encoder.

const PALETTE = [
  [255,255,255], // 0 white
  [31,41,55],    // 1 ink
  [255,179,199], // 2 pink
  [255,214,165], // 3 peach
  [255,241,168], // 4 butter
  [202,255,191], // 5 mint
  [189,224,254], // 6 sky
  [215,186,255], // 7 lavender
  [184,242,230], // 8 aqua
];

const PAL_SIZE = 16; // 16 colors => min code size 4

function u16le(n){ return [n & 255, (n >> 8) & 255]; }

function nearestIndex(r,g,b){
  let best = 0, bestD = Infinity;
  for (let i=0;i<PALETTE.length;i++){
    const [pr,pg,pb] = PALETTE[i];
    const dr=r-pr, dg=g-pg, db=b-pb;
    const d = dr*dr + dg*dg + db*db;
    if (d < bestD){ bestD = d; best = i; }
  }
  return best;
}

function lzwEncode(indices, minCodeSize){
  const CLEAR = 1 << minCodeSize;
  const END = CLEAR + 1;

  const dict = new Map();
  function reset(){
    dict.clear();
    for (let i=0;i<CLEAR;i++) dict.set(String(i), i);
  }
  reset();

  let codeSize = minCodeSize + 1;
  let nextCode = END + 1;

  const codes = [];
  codes.push(CLEAR);

  let w = String(indices[0]);
  for (let i=1;i<indices.length;i++){
    const k = String(indices[i]);
    const wk = w + "," + k;
    if (dict.has(wk)){
      w = wk;
    } else {
      codes.push(dict.get(w));
      dict.set(wk, nextCode++);
      w = k;

      if (nextCode === (1 << codeSize) && codeSize < 12) codeSize++;
      if (nextCode >= 4096){
        codes.push(CLEAR);
        reset();
        codeSize = minCodeSize + 1;
        nextCode = END + 1;
      }
    }
  }
  codes.push(dict.get(w));
  codes.push(END);

  // pack codes LSB-first
  let curSize = minCodeSize + 1;
  let curNextThreshold = 1 << curSize;
  let curNextCode = END + 1;

  let bits = 0;
  let bitCount = 0;
  const out = [];

  function pushCode(code){
    bits |= (code << bitCount);
    bitCount += curSize;
    while (bitCount >= 8){
      out.push(bits & 255);
      bits >>= 8;
      bitCount -= 8;
    }
  }

  // simulate size growth
  reset();
  curSize = minCodeSize + 1;
  curNextThreshold = 1 << curSize;
  curNextCode = END + 1;

  for (let i=0;i<codes.length;i++){
    const code = codes[i];
    pushCode(code);

    if (code === CLEAR){
      reset();
      curSize = minCodeSize + 1;
      curNextThreshold = 1 << curSize;
      curNextCode = END + 1;
      continue;
    }
    if (code === END) break;

    if (curNextCode < 4096){
      curNextCode++;
      if (curNextCode === curNextThreshold && curSize < 12){
        curSize++;
        curNextThreshold = 1 << curSize;
      }
    }
  }

  if (bitCount > 0) out.push(bits & 255);
  return out;
}

function chunk(bytes){
  const blocks = [];
  for (let i=0;i<bytes.length;i+=255){
    const part = bytes.slice(i, i+255);
    blocks.push(part.length, ...part);
  }
  blocks.push(0);
  return blocks;
}

export function encodeGifFromRGBAFrames({ width, height, rgbaFrames, delayCs=8, loop=true }){
  const header = [];
  header.push(...[0x47,0x49,0x46,0x38,0x39,0x61]); // GIF89a
  header.push(...u16le(width), ...u16le(height));
  header.push(0xF3); // GCT on, 16 colors
  header.push(0x00, 0x00);

  const gct = [];
  for (let i=0;i<PAL_SIZE;i++){
    const p = PALETTE[i] || [255,255,255];
    gct.push(p[0], p[1], p[2]);
  }

  const body = [];

  if (loop){
    body.push(
      0x21,0xFF,0x0B,
      ...[0x4E,0x45,0x54,0x53,0x43,0x41,0x50,0x45,0x32,0x2E,0x30],
      0x03,0x01,0x00,0x00,0x00
    );
  }

  const minCodeSize = 4;

  for (let f=0; f<rgbaFrames.length; f++){
    const rgba = rgbaFrames[f];

    body.push(0x21,0xF9,0x04, 0x00, ...u16le(delayCs), 0x00, 0x00);
    body.push(0x2C, ...u16le(0), ...u16le(0), ...u16le(width), ...u16le(height), 0x00);
    body.push(minCodeSize);

    const indices = new Array(width*height);
    for (let i=0, p=0; i<indices.length; i++, p+=4){
      const r = rgba[p], g = rgba[p+1], b = rgba[p+2], a = rgba[p+3];
      if (a < 16){ indices[i] = 0; continue; }
      indices[i] = nearestIndex(r,g,b);
    }

    const lzw = lzwEncode(indices, minCodeSize);
    body.push(...chunk(lzw));
  }

  const trailer = [0x3B];
  return new Uint8Array([...header, ...gct, ...body, ...trailer]);
}

export async function exportGifFromDataUrls({ width, height, dataUrls, delayCs=8, filename="anim5s.gif" }){
  const off = document.createElement("canvas");
  off.width = width; off.height = height;
  const octx = off.getContext("2d", { willReadFrequently:true });

  const rgbaFrames = [];
  for (const url of dataUrls){
    octx.fillStyle = "#fff";
    octx.fillRect(0,0,width,height);

    if (url && typeof url === "string" && url.startsWith("data:image/")){
      const img = new Image();
      await new Promise((res) => { img.onload = () => res(); img.onerror = () => res(); img.src = url; });
      try{ octx.drawImage(img,0,0,width,height); }catch(e){}
    }

    const imgData = octx.getImageData(0,0,width,height);
    rgbaFrames.push(imgData.data);
  }

  const bytes = encodeGifFromRGBAFrames({ width, height, rgbaFrames, delayCs, loop:true });
  const blob = new Blob([bytes], { type:"image/gif" });

  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1200);
}
