// Shared by the Android and iOS native bracket renderers. No network access.
function installModernBracketSearch(activateSection, layoutSections) {
  const root = document.querySelector('.root');
  const cards = Array.from(root.querySelectorAll('.match-card[data-match-id]'));
  const style = document.createElement('style');
  style.textContent = '.bracket-search{flex:none;display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:8px;color:var(--text);background:var(--bg)}' +
    '.bracket-search input{flex:1 1 190px;min-width:0;min-height:44px;box-sizing:border-box;font:inherit;font-size:16px;padding:8px;border:1px solid var(--muted);border-radius:8px;background:var(--panel);color:var(--text)}' +
    '.bracket-search button{min-height:44px;min-width:44px;padding:8px;font:inherit;border:1px solid var(--muted);border-radius:8px;background:var(--panel);color:var(--text)}' +
    '.bracket-search button:disabled{opacity:.45}.bracket-search output{flex-basis:100%;font-size:13px;overflow-wrap:anywhere}' +
    '.match-card.search-hit{outline:2px dashed var(--text);outline-offset:3px}.match-card.search-current{outline:4px solid var(--text);outline-offset:4px}' +
    '.bracket-search input:focus-visible,.bracket-search button:focus-visible{outline:3px solid var(--text);outline-offset:2px}';
  document.head.appendChild(style);
  const bar = document.createElement('div');
  bar.className = 'bracket-search';
  bar.setAttribute('role', 'search');
  const input = document.createElement('input');
  input.type = 'search'; input.placeholder = 'Buscar jugador o equipo';
  input.setAttribute('aria-label', 'Buscar jugador o equipo en todas las fases');
  input.autocomplete = 'off'; input.maxLength = 120;
  const button = (label, action) => {
    const node = document.createElement('button'); node.type = 'button'; node.textContent = label;
    node.addEventListener('click', action); return node;
  };
  let hits = [], currentId = null, focusRevision = 0;
  const previous = button('Anterior', () => step(-1));
  const next = button('Siguiente', () => step(1));
  const clear = button('Limpiar', () => { input.value = ''; update(false); input.focus(); });
  const output = document.createElement('output');
  output.setAttribute('aria-live', 'polite'); output.setAttribute('aria-atomic', 'true');
  bar.append(input, previous, next, clear, output); root.prepend(bar);
  const normalized = text => String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase();
  function update(center) {
    ++focusRevision; // Cancel a queued center after clearing/changing the search.
    const query = normalized(input.value);
    hits = query ? cards.filter(card => normalized(card.dataset.searchNames).includes(query)) : [];
    if (!hits.some(card => card.dataset.matchId === currentId)) currentId = hits[0]?.dataset.matchId || null;
    const hitSet = new Set(hits);
    cards.forEach(card => {
      card.classList.toggle('search-hit', hitSet.has(card));
      card.classList.toggle('search-current', !!query && card.dataset.matchId === currentId);
    });
    const index = hits.findIndex(card => card.dataset.matchId === currentId);
    const current = hits[index];
    const phase = current?.closest('.bracket-section')?.querySelector('.section-title')?.textContent || '';
    const matchLabel = current?.querySelector('.match-header span')?.textContent || '';
    output.textContent = !query ? 'Busca en todas las fases. Enter: siguiente; Mayús + Enter: anterior.' :
      current ? (index + 1) + ' de ' + hits.length + ' · ' + phase + ' · ' + matchLabel : 'Sin coincidencias';
    previous.disabled = next.disabled = hits.length < 2; clear.disabled = !input.value;
    if (center && current) centerCard(current);
  }
  function centerCard(card) {
    const revision = ++focusRevision;
    const section = card.closest('.bracket-section');
    activateSection(section.id);
    requestAnimationFrame(() => {
      if (revision !== focusRevision) return;
      layoutSections();
      requestAnimationFrame(() => {
        if (revision !== focusRevision) return;
        const viewport = section.querySelector('.unified-viewport');
        const target = card.getBoundingClientRect(), bounds = viewport.getBoundingClientRect();
        viewport.scrollLeft += target.left + target.width / 2 - bounds.left - viewport.clientWidth / 2;
        viewport.scrollTop += target.top + target.height / 2 - bounds.top - viewport.clientHeight / 2;
      });
    });
  }
  function step(direction) {
    if (!hits.length) return;
    const index = hits.findIndex(card => card.dataset.matchId === currentId);
    currentId = hits[(index + direction + hits.length) % hits.length].dataset.matchId;
    update(true);
  }
  input.addEventListener('input', () => { currentId = null; update(true); });
  input.addEventListener('keydown', event => {
    if (event.key === 'Enter') { event.preventDefault(); step(event.shiftKey ? -1 : 1); }
    if (event.key === 'Escape') { input.value = ''; update(false); }
  });
  window.__gttBracketSearch = {
    capture: () => ({ query: input.value, currentId, focused: document.activeElement === input }),
    restore: state => {
      if (!state) return;
      input.value = String(state.query || '').slice(0, 120); currentId = state.currentId;
      update(false); // Preserve the user's zoom/pan after polling, not only the search.
      if (state.focused) input.focus({ preventScroll: true });
    }
  };
  update(false);
}
