// Generate a reproducible, local catalogue. Originals are cached by the backend on demand.
// Input: a sparse checkout of StreamHelperAssets with all games/**/config.json files.
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const source = path.resolve(process.argv[2] || 'build/top8-assets-review/upstream');
const destination = path.resolve(process.argv[3] || 'display-web/assets/top8-library');
const revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: source, encoding: 'utf8' }).trim();
if (!/^[a-f0-9]{40}$/.test(revision)) throw Error('Invalid upstream revision');
const read = async file => JSON.parse(await fs.readFile(path.join(source, file), 'utf8'));
const upstream = await read('assets.json');
const tree = execFileSync('git', ['ls-tree', '-rz', 'HEAD'], { cwd: source, maxBuffer: 64 * 1024 * 1024 }).toString('utf8');
const folders = new Map();
for (const line of tree.split('\0')) {
  const match = /^\d+ blob ([a-f0-9]{40})\t(.+)$/.exec(line);
  if (!match || !/\.(png|jpe?g|webp)$/i.test(match[2])) continue;
  const dir = path.posix.dirname(match[2]);
  if (!folders.has(dir)) folders.set(dir, []);
  folders.get(dir).push({ hash: match[1], path: match[2], file: path.posix.basename(match[2]) });
}
const normalize = value => String(value || '').normalize('NFKD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const safeId = code => /^[a-zA-Z0-9_-]{1,80}$/.test(code) ? code : 'c-' + createHash('sha1').update(code).digest('hex').slice(0, 16);
const characterIds = {};
for (const [game, file] of [['ssbu', 'smash-ultimate'], ['roa2', 'roa2']]) {
  const text = await fs.readFile(`backend/src/modules/tournaments/${file}.characters.ts`, 'utf8');
  characterIds[game] = new Map([...text.matchAll(/id:\s*(\d+),\s*name:\s*["']([^"']+)["']/g)].map(m => [normalize(m[2]), Number(m[1])]));
}
const aliases = { rosalinaandluma: 'rosalina', simon: 'simonbelmont', banjoandkazooie: 'banjokazooie', pyra: 'pyramythra', mythra: 'pyramythra' };
const preferred = { ssbu: ['website', 'mural_art', 'full', 'vs_renders', 'portrait'], roa2: ['full', 'art', 'costume'] };
const index = { version: 1, revision, source: 'https://joaorb64.github.io/StreamHelperAssets/', games: [] };
const images = {};
const report = { missingGames: [], skippedImages: [], games: 0, collections: 0, images: 0 };
await fs.mkdir(destination, { recursive: true });
for (const [id, summary] of Object.entries(upstream)) {
  const base = await read(`games/${id}/base_files/config.json`);
  const characters = Object.entries(base.character_to_codename || {}).filter(([name]) => !/^(random|none)$/i.test(name)).map(([name, value]) => {
    const code = String(value.codename || name), normal = normalize(value.smashgg_name || name);
    const startggId = characterIds[id]?.get(normal) ?? characterIds[id]?.get(aliases[normal]);
    return { id: safeId(code), code, name, ...(value.locale?.es ? { localName: value.locale.es } : {}), ...(startggId ? { startggId } : {}), skins: value.skin_name || {} };
  });
  const game = { id, name: summary.name, credits: base.credits || '', characters: [], collections: [] };
  const configFiles = [...folders.keys()].filter(dir => dir.startsWith(`games/${id}/`));
  for (const dir of configFiles) {
    let config;
    try { config = await read(`${dir}/config.json`); } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    const types = Array.isArray(config.type) ? config.type : [config.type || ''];
    if (types.some(t => /^(stage|variant)/.test(t))) continue;
    const collectionId = dir.slice(`games/${id}/`.length).replaceAll('/', '--');
    const icon = types.some(t => /icon|css|profile|stat/.test(t));
    if (['ssbu', 'roa2'].includes(id) && (icon || types.includes('portrait'))) continue;
    const pack = summary.assets[dir.split('/').at(-1)] || {};
    const collection = { id: collectionId, name: config.name || (icon ? 'Iconos' : collectionId), kind: icon ? 'icon' : types.some(t => /full|art|render|costume|website|mural/.test(t)) ? 'artwork' : 'portrait', description: config.description || pack.description || '', credits: config.credits || pack.credits || base.credits || '', source: `https://github.com/joaorb64/StreamHelperAssets/tree/${revision}/${dir}`, characters: {} };
    for (const character of characters) {
      const prefix = `${config.prefix || ''}${character.code}${config.postfix || ''}`;
      const available = [];
      for (const image of folders.get(dir)) {
        const stem = image.file.replace(/\.[^.]+$/, '');
        if (!stem.startsWith(prefix)) continue;
        const tail = stem.slice(prefix.length);
        if (!/^\d+$/.test(tail)) continue;
        const skin = String(Number(tail)), dimensions = config.image_sizes?.[character.code]?.[skin];
        if (!dimensions || !dimensions.x || !dimensions.y || dimensions.x * dimensions.y > 64000000) { report.skippedImages.push(image.path); continue; }
        const skinName = character.skins[skin]?.name || (skin === '0' ? 'Original' : `Variante ${Number(skin) + 1}`);
        available.push({ id: skin, label: skinName, image: image.hash, width: dimensions.x, height: dimensions.y });
        images[image.hash] ??= { path: image.path, width: dimensions.x, height: dimensions.y };
      }
      if (available.length) collection.characters[character.id] = available.sort((a, b) => Number(a.id) - Number(b.id));
    }
    if (Object.keys(collection.characters).length) game.collections.push(collection);
  }
  const score = c => { const n = (preferred[id] || ['full', 'art', 'render', 'website', 'costume']).indexOf(c.id); return n >= 0 ? n : c.kind === 'artwork' ? 10 : c.kind === 'portrait' ? 20 : 30; };
  game.collections.sort((a, b) => score(a) - score(b) || a.name.localeCompare(b.name));
  game.characters = characters.map(({ code, skins, ...c }) => c).sort((a, b) => a.name.localeCompare(b.name));
  if (!game.collections.length) report.missingGames.push(id);
  index.games.push({ id, name: game.name, collections: game.collections.length, characters: game.characters.length });
  report.collections += game.collections.length;
  await fs.writeFile(path.join(destination, id + '.json'), JSON.stringify(game));
}
index.games.sort((a, b) => a.name.localeCompare(b.name));
report.games = index.games.length; report.images = Object.keys(images).length;
await fs.writeFile(path.join(destination, 'index.json'), JSON.stringify(index));
await fs.writeFile(path.join(destination, 'images.json'), JSON.stringify({ revision, images }));
await fs.writeFile(path.join(destination, 'CREDITS.md'), `# StreamHelperAssets\n\nSource: ${index.source}\nRevision: ${revision}\n\nThe upstream project permits use in other projects with pack credits preserved.\nGame and collection JSON files retain the supplied credits and source links.\nArtwork belongs to its respective creators and game publishers.\nOriginal images are downloaded from the pinned revision and cached on the server;\nexisting tournament icons are independent of this library.\n`);
console.log(JSON.stringify(report, null, 2));
