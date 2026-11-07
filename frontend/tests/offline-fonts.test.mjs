import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const assets = [
  ["Outfit-Variable.ttf", "OFL-Outfit.txt", "fc7287273e66929776e2ba54f144fe699080bec29f61bf649d70d871468aeade", 100],
  ["SourceSans3-Variable.ttf", "OFL-SourceSans3.txt", "042fe2cc0b933e328410d7acbd0aa6a1873dca5aef81875f4bc214b08825c7b9", 200],
];

test("Fonturile layoutului sunt locale și păstrează variabilele CSS existente", async () => {
  const layout = await readFile(new URL("../app/layout.js", import.meta.url), "utf8");
  assert.match(layout, /from "next\/font\/local"/);
  assert.doesNotMatch(layout, /next\/font\/google|https?:\/\/fonts\./);
  for (const [filename] of assets) {
    assert.ok(layout.includes('src: "./fonts/' + filename + '"'));
  }
  assert.match(layout, /variable: "--font-display"/);
  assert.match(layout, /variable: "--font-sans"/);
});

test("Fonturile variabile și licențele corespund sursei Google Fonts fixate", async () => {
  for (const [filename, license, expectedHash, minimum] of assets) {
    const font = await readFile(new URL("../app/fonts/" + filename, import.meta.url));
    assert.equal(createHash("sha256").update(font).digest("hex"), expectedHash);
    assert.equal(font.readUInt32BE(0), 0x00010000);
    let variationOffset;
    for (let table = 0; table < font.readUInt16BE(4); table++) {
      const record = 12 + 16 * table;
      if (font.toString("ascii", record, record + 4) === "fvar") {
        variationOffset = font.readUInt32BE(record + 8);
      }
    }
    assert.ok(variationOffset);
    const axis = variationOffset + font.readUInt16BE(variationOffset + 4);
    assert.equal(font.readUInt16BE(variationOffset + 8), 1);
    assert.equal(font.toString("ascii", axis, axis + 4), "wght");
    assert.equal(font.readInt32BE(axis + 4) / 65536, minimum);
    assert.equal(font.readInt32BE(axis + 12) / 65536, 900);
    const text = await readFile(new URL("../app/fonts/" + license, import.meta.url), "utf8");
    assert.match(text, /SIL OPEN FONT LICENSE Version 1\.1/);
  }
});
