// gif.js - Stable GIF export (web-safe palette + robust LZW)
// This implementation is based on the offline "確実な方法":
//  - White background compositing
//  - Web-safe 256-color palette (216 used)
//  - Fixed 9-bit output with frequent CLEAR to avoid decoder edge cases
//  - Chunk writer + yielding to reduce mobile freezes

const STEPS = [0, 51, 102, 153, 204, 255];

function u16le(v){ return [v & 255, (v >> 8) & 255]; }

function buildWebSafePalette256(){
  const pal = new Uint8Array(256 * 3);
  let idx = 0;
  for (let r=0; r<6; r++){
    for (let g=0; g<6; g++){
      for (let b=0; b<6; b++){
        pal[idx*3+0] = STEPS[r];
        pal[idx*3+1] = STEPS[g];
        pal[idx*3+2] = STEPS[b];
        idx++;
      }
    }
  }
  // Fill remaining slots with white (just in case something maps there)
  for (; idx < 256; idx++){
    pal[idx*3+0] = 255;
    pal[idx*3+1] = 255;
    pal[idx*3+2] = 255;
  }
  return pal;
}

function quantWebSafeIndex(r,g,b){
  const r6 = Math.max(0, Math.min(5, Math.round(r/51)));
  const g6 = Math.max(0, Math.min(5, Math.round(g/51)));
  const b6 = Math.max(0, Math.min(5, Math.round(b/51)));
  return (r6*36 + g6*6 + b6) & 255; // 0..215
}

class ChunkWriter{
  constructor(cap=1<<20){
    this.buf = new Uint8Array(cap);
    this.pos = 0;
    this.chunks = [];
  }
  byte(v){
    if (this.pos >= this.buf.length) this.flush();
    this.buf[this.pos++] = v & 255;
  }
  word(v){ this.byte(v); this.byte(v >> 8); }
  str(s){ for (let i=0;i<s.length;i++) this.byte(s.charCodeAt(i)); }
  bytes(u8){
    const n = u8.length;
    let i = 0;
    while (i < n){
      const room = this.buf.length - this.pos;
      if (room === 0){ this.flush(); continue; }
      const take = Math.min(room, n - i);
      this.buf.set(u8.subarray(i, i+take), this.pos);
      this.pos += take;
      i += take;
    }
  }
  flush(){
    if (this.pos > 0){
      this.chunks.push(this.buf.slice(0, this.pos));
      this.pos = 0;
    }
  }
  blob(type){
    this.flush();
    return new Blob(this.chunks, { type });
  }
}

function writeSubBlocks(w, data){
  let i=0;
  while (i < data.length){
    const n = Math.min(255, data.length - i);
    w.byte(n);
    w.bytes(data.subarray(i, i+n));
    i += n;
  }
  w.byte(0);
}

function lzwEncodeFixed(indices, minCodeSize){
  // Stability-first LZW:
  // - Keep codeSize fixed (= min+1) by inserting CLEAR frequently.
  // - Output only base codes (pixel indices), never dictionary codes.
  const CLEAR = 1 << minCodeSize;
  const EOI   = CLEAR + 1;
  const codeSize = minCodeSize + 1; // 256 colors => 9 bits fixed

  const out = [];
  let cur = 0;
  let bits = 0;

  const write = (code)=>{
    cur |= (code << bits);
    bits += codeSize;
    while (bits >= 8){
      out.push(cur & 255);
      cur >>= 8;
      bits -= 8;
    }
  };

  // After CLEAR, decoder dictionary starts building from 258.
  // If it grows past 512 entries, it would raise codeSize to 10 bits.
  // Keep it safely below that by clearing often.
  const CHUNK = 250;

  write(CLEAR);
  let n = 0;
  for (let i=0; i<indices.length; i++){
    write(indices[i] & 255);
    n++;
    if (n >= CHUNK){
      write(CLEAR);
      n = 0;
    }
  }
  write(EOI);

  if (bits > 0) out.push(cur & 255);
  return new Uint8Array(out);
}

function normalizeMaybeDataUrl(src){
  if (!src || typeof src !== "string") return null;
  if (src.startsWith("data:image/")) return src;

  // raw base64 -> assume png
  if (/^[A-Za-z0-9+/=]+$/.test(src) && src.length > 64){
    return "data:image/png;base64," + src;
  }
  return null;
}

async function loadImage(src){
  return await new Promise((resolve, reject)=>{
    const im = new Image();
    im.decoding = "async";
    im.onload = ()=> resolve(im);
    im.onerror = ()=> reject(new Error("image load failed"));
    im.src = src;
  });
}

function makeDelays(count, fps){
  // Centered on the offline method:
  // distribute integer centiseconds so total duration matches exactly.
  const delays = new Uint16Array(count);
  const ideal = 100 / fps;
  const target = Math.round((count / fps) * 100); // centiseconds
  let rem = 0;
  let sum = 0;

  for (let i=0; i<count; i++){
    rem += ideal;
    let d = Math.floor(rem + 1e-6);
    rem -= d;
    if (d < 1) d = 1;
    delays[i] = d;
    sum += d;
  }
  const fix = target - sum;
  delays[count-1] = Math.max(1, delays[count-1] + fix);
  return delays;
}

export async function exportGifFromDataUrls({
  width,
  height,
  dataUrls,
  filename = "anim5s.gif",
  fps = 12,
  yieldEvery = 4,
}){
  const W = Math.max(1, width|0);
  const H = Math.max(1, height|0);
  const frames = Array.isArray(dataUrls) ? dataUrls : [];
  const COUNT = frames.length || 60;

  const pal = buildWebSafePalette256();
  const delays = makeDelays(COUNT, fps);
  const bgIndex = 215; // white-ish in web-safe palette (index 215 = 255,255,255)

  const w = new ChunkWriter(1<<20);

  // Header + Logical Screen Descriptor
  w.str("GIF89a");
  w.word(W); w.word(H);
  w.byte(0b11110111); // GCT on, 256 colors
  w.byte(bgIndex);
  w.byte(0);

  // Global Color Table
  w.bytes(pal);

  // Loop extension (infinite)
  w.byte(0x21); w.byte(0xFF); w.byte(11);
  w.str("NETSCAPE2.0");
  w.byte(3); w.byte(1); w.word(0); w.byte(0);

  // Offscreen compositor
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const ctx = c.getContext("2d", { willReadFrequently:true });
  ctx.imageSmoothingEnabled = false;

  for (let fi=0; fi<COUNT; fi++){
    // White background
    ctx.clearRect(0,0,W,H);
    ctx.fillStyle = "#fff";
    ctx.fillRect(0,0,W,H);

    const src = normalizeMaybeDataUrl(frames[fi]);
    if (src){
      try{
        const im = await loadImage(src);
        ctx.drawImage(im, 0, 0, W, H);
      }catch(_e){
        // ignore broken frame
      }
    }

    const data = ctx.getImageData(0,0,W,H).data;
    const idxs = new Uint8Array(W*H);
    let p = 0;
    for (let i=0; i<data.length; i+=4){
      idxs[p++] = quantWebSafeIndex(data[i], data[i+1], data[i+2]);
    }

    // Graphics Control Extension
    w.byte(0x21); w.byte(0xF9); w.byte(4);
    w.byte(0b00001000); // disposal method 2-ish, no transparency
    w.word(delays[fi]);
    w.byte(0); // transparent index
    w.byte(0);

    // Image Descriptor
    w.byte(0x2C);
    w.word(0); w.word(0);
    w.word(W); w.word(H);
    w.byte(0);

    // Image Data
    const minCodeSize = 8;
    w.byte(minCodeSize);
    const lzw = lzwEncodeFixed(idxs, minCodeSize);
    writeSubBlocks(w, lzw);

    if (yieldEvery > 0 && (fi % yieldEvery) === (yieldEvery - 1)){
      await new Promise((r)=>setTimeout(r, 0));
    }
  }

  // Trailer
  w.byte(0x3B);

  const blob = w.blob("image/gif");
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();

  setTimeout(()=>URL.revokeObjectURL(url), 1500);
}
