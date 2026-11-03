const RATE = 8000;

export function rms16(pcm) {
  const samples = Math.floor(pcm.length / 2);
  if (samples === 0) return 0;
  let sum = 0;
  for (let index = 0; index < samples; index += 1) {
    const sample = pcm.readInt16LE(index * 2);
    sum += sample * sample;
  }
  return Math.sqrt(sum / samples);
}

export function wrapPcmAsWav(pcm, sampleRate = RATE) {
  const body = Buffer.isBuffer(pcm) ? pcm : Buffer.from(pcm);
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + body.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(body.length, 40);
  return Buffer.concat([header, body]);
}

export function parseWav(buffer) {
  if (buffer.length < 44 || buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error("wav");
  }
  let format = null;
  let data = null;
  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const id = buffer.toString("ascii", offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (start + size > buffer.length) break;
    if (id === "fmt ") {
      format = {
        audioFormat: buffer.readUInt16LE(start),
        channels: buffer.readUInt16LE(start + 2),
        sampleRate: buffer.readUInt32LE(start + 4),
        bits: buffer.readUInt16LE(start + 14),
      };
    } else if (id === "data") {
      data = buffer.subarray(start, start + size);
    }
    offset = start + size + (size % 2);
  }
  if (!format || !data || format.audioFormat !== 1 || format.bits !== 16 || format.channels < 1) {
    throw new Error("wav");
  }
  return { pcm: Buffer.from(data), sampleRate: format.sampleRate, channels: format.channels };
}

export function toPhonePcm(input, mime = "") {
  const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input);
  const kind = String(mime || "").toLowerCase();
  if (kind.includes("mpeg") || (buffer.length > 2 && buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0) || buffer.toString("ascii", 0, 3) === "ID3") {
    const error = new Error("mp3");
    error.code = "TTS_FORMAT";
    throw error;
  }
  if (buffer.toString("ascii", 0, 4) === "RIFF") {
    const wav = parseWav(buffer);
    return downsample16(wav.pcm, wav.sampleRate, wav.channels);
  }
  if (buffer.length % 2 !== 0) {
    throw new Error("pcm");
  }
  return buffer;
}

export function downsample16(pcm, sampleRate, channels = 1) {
  const frame = channels * 2;
  const frames = Math.floor(pcm.length / frame);
  const mono = new Int16Array(frames);
  for (let index = 0; index < frames; index += 1) {
    let sum = 0;
    for (let channel = 0; channel < channels; channel += 1) {
      sum += pcm.readInt16LE(index * frame + channel * 2);
    }
    mono[index] = Math.round(sum / channels);
  }
  if (sampleRate === RATE) {
    return Buffer.from(mono.buffer, mono.byteOffset, mono.byteLength);
  }
  const outLength = Math.max(1, Math.round((mono.length * RATE) / sampleRate));
  const out = Buffer.alloc(outLength * 2);
  for (let index = 0; index < outLength; index += 1) {
    const source = (index * sampleRate) / RATE;
    const left = Math.floor(source);
    const right = Math.min(mono.length - 1, left + 1);
    const mix = source - left;
    const value = Math.round(mono[left] * (1 - mix) + mono[right] * mix);
    out.writeInt16LE(Math.max(-32768, Math.min(32767, value)), index * 2);
  }
  return out;
}
