// Embeds an .mp3 as the grenade explosion sound in shell-goose-mod.user.js.
//   node embed-sound.mjs path/to/sound.mp3
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const src = process.argv[2];
if (!src) { console.error('usage: node embed-sound.mjs <sound.mp3>'); process.exit(1); }
const file = path.join(path.dirname(fileURLToPath(import.meta.url)), '../shell-goose-mod.user.js');
const bytes = fs.readFileSync(src);
if (bytes.length > 200 * 1024) { console.error('keep the sound under 200 KB (trim it or lower the bitrate)'); process.exit(1); }
let js = fs.readFileSync(file, 'utf8');
const START = '/* SOUND_DATA_START */', END = '/* SOUND_DATA_END */';
const a = js.indexOf(START), b = js.indexOf(END);
if (a < 0 || b < 0) throw new Error('SOUND_DATA markers not found');
js = js.slice(0, a + START.length) + ` '${bytes.toString('base64')}' ` + js.slice(b);
fs.writeFileSync(file, js);
console.log(`embedded ${path.basename(src)} (${Math.round(bytes.length / 1024)} KB)`);
