export const libraryRoot = '/assets/top8-library/';
const games = new Map();
let indexPromise;
async function json(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw Error('Could not open the character library. Retry or use your own images.');
  return response.json();
}
export function loadIndex() {
  return indexPromise ??= json(libraryRoot + 'index.json?v=20260925-artwork').catch(error => { indexPromise = undefined; throw error; });
}
export async function loadGame(id) {
  if (id === 'custom') return { id, name: 'Custom images', characters: [], collections: [] };
  const index = await loadIndex();
  if (!index.games.some(game => game.id === id)) throw Error('This game is not in the library. Choose another or use your own images.');
  if (!games.has(id)) games.set(id, json(libraryRoot + id + '.json?v=' + index.revision).catch(error => { games.delete(id); throw error; }));
  return games.get(id);
}
export const imageUrl = (hash, size = 'full') => /^[a-f0-9]{40}$/.test(hash || '') && ['full', 'preview', 'thumb'].includes(size) ? `/api/top8/assets/${hash}/${size}` : '';
export const normalize = value => String(value || '').normalize('NFKD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^a-z0-9]/g, '');
export const collectionFor = (design, game) => game?.id === design.game ? game.collections.find(c => c.id === design.collection) : undefined;
export const variantsFor = (collection, character) => collection && Object.hasOwn(collection.characters, character) && Array.isArray(collection.characters[character]) ? collection.characters[character] : [];
export function selectionFor(design, game, player, slot) {
  const variants = variantsFor(collectionFor(design, game), player.characters[slot]);
  return player.skins?.[slot] ? variants.find(v => v.id === player.skins[slot]) : variants[0];
}
export function artworkIssues(design, game) {
  const issues = [];
  if (design.game !== 'custom' && !collectionFor(design, game)) issues.push('The saved collection is unavailable. Choose a collection for the entire poster.');
  for (const player of design.players) {
    if (player.portrait) continue;
    for (let slot = 0; slot < player.characters.length; slot++) {
      if (!selectionFor(design, game, player, slot)) {
        const name = game?.characters.find(c => c.id === player.characters[slot])?.name || player.characters[slot];
        issues.push(`${player.name || 'Player'}: ${name} has no matching variant in the selected collection. Choose another variant, remove the character or upload your own image.`);
      }
    }
  }
  return issues;
}
export function useCollection(design, game, id) {
  const collection = game.collections.find(c => c.id === id);
  if (!collection) throw Error('Collection unavailable');
  design.collection = id;
  let changes = 0;
  for (const player of design.players) {
    player.skins = player.characters.map((character, i) => {
      const variants = variantsFor(collection, character);
      if (variants.some(v => v.id === player.skins?.[i])) return player.skins[i];
      if (player.skins?.[i]) changes++;
      return variants[0]?.id || '0';
    });
  }
  return changes;
}
/** Migrate old icon IDs without losing names, ranks, portraits or team duplicates. */
export async function prepareDesign(design, data) {
  const oldGame = design.game;
  design.game = ({ smash: 'ssbu', rivals: 'roa2' })[oldGame] || oldGame;
  design.artFit ||= 'contain';
  const game = await loadGame(design.game);
  for (const player of design.players) {
    const oldCharacters = data?.catalog?.[oldGame] || [];
    player.characters = player.characters.map(id => {
      if (game.characters.some(c => c.id === id)) return id;
      const name = oldCharacters.find(c => String(c.id) === String(id))?.name;
      return game.characters.find(c => (c.startggId != null && String(c.startggId) === String(id)) || (name && normalize(c.name) === normalize(name)))?.id || String(id);
    });
    player.skins ||= [];
  }
  if (!design.collection && game.collections.length) useCollection(design, game, game.collections[0].id);
  design.collection ||= '';
  return game;
}

/** A bounded gallery: no thousands of DOM nodes or full-size images on mobile. */
export function openPicker({ game, collection, character, selected, onSelect }) {
  const dialog = document.getElementById('asset-picker');
  const search = document.getElementById('asset-search'), grid = document.getElementById('asset-grid');
  const title = document.getElementById('asset-picker-title');
  title.textContent = character ? `Variants for ${character.name}` : 'Choose character';
  document.getElementById('asset-picker-context').textContent = `${game.name} · ${collection.name} · same collection for the entire poster`;
  search.value = ''; let page = 0;
  const entries = character ? (collection.characters[character.id] || []).map(v => ({ character, variant: v, label: v.label })) : game.characters.filter(c => collection.characters[c.id]?.length).map(c => ({ character: c, variant: collection.characters[c.id][0], label: c.name }));
  function draw() {
    const query = normalize(search.value);
    const filtered = entries.filter(e => normalize(`${e.label} ${e.character.localName || ''} ${e.character.id}`).includes(query));
    const pages = Math.max(1, Math.ceil(filtered.length / 24)); page = Math.min(page, pages - 1);
    grid.replaceChildren();
    for (const entry of filtered.slice(page * 24, (page + 1) * 24)) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'asset-tile';
      button.classList.add('image-loading');
      button.setAttribute('aria-label', `${entry.character.name} · ${entry.variant.label}`);
      button.setAttribute('aria-pressed', String(selected === (character ? entry.variant.id : entry.character.id)));
      const img = document.createElement('img'); img.alt = ''; img.loading = 'lazy'; img.width = 160; img.height = 150; img.src = imageUrl(entry.variant.image, 'thumb');
      img.addEventListener('load', () => button.classList.remove('image-loading'));
      img.addEventListener('error', () => { img.hidden = true; button.classList.remove('image-loading'); button.classList.add('image-unavailable'); });
      const label = document.createElement('strong'); label.textContent = entry.label;
      const detail = document.createElement('small'); detail.textContent = `${entry.variant.width} × ${entry.variant.height} px`;
      button.append(img, label, detail);
      button.addEventListener('click', () => { dialog.close(); onSelect(entry.character.id, entry.variant.id); }); grid.append(button);
    }
    document.getElementById('asset-page').textContent = filtered.length ? `${filtered.length} options · Page ${page + 1} of ${pages}` : 'No results in this collection.';
    document.getElementById('asset-prev').disabled = page === 0;
    document.getElementById('asset-next').disabled = page >= pages - 1;
  }
  search.oninput = () => { page = 0; draw(); };
  document.getElementById('asset-prev').onclick = () => { page--; draw(); };
  document.getElementById('asset-next').onclick = () => { page++; draw(); };
  document.getElementById('asset-retry').onclick = draw;
  document.getElementById('asset-close').onclick = () => dialog.close();
  draw(); dialog.showModal(); search.focus();
}
