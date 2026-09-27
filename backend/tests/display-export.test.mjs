import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import sharp from 'sharp';
import { renderBracketSvg } from '../dist/modules/tournaments/bracket-svg.js';
import { renderBracketExport, renderSvgPng, svgDimensions } from '../dist/modules/tournaments/bracket-export.js';
import { renderPngInBands } from '../dist/modules/tournaments/png-bands.js';
import { TelegramTournamentNotifier, WhatsAppTournamentNotifier, whatsappDocumentArgs } from '../dist/modules/tournaments/tournament-notifier.js';
import { displayFixture } from './fixtures/display-fixtures.mjs';
const require = createRequire(import.meta.url);
const core = require('../../display-web/display-core.js');

test('one complete canvas covers all 256-player matches once and preserves every team name', () => {
  const { tournament, matches } = displayFixture(256);
  const svg = renderBracketSvg(tournament, matches);
  const ids = [...svg.matchAll(/data-match-id="([^"]+)"/g)].map(match => match[1]);
  assert.deepEqual(ids.sort(), matches.map(match => match.id).sort());
  const text = svg.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
  for (let team = 1; team <= 256; team++) {
    assert(text.includes(`Equipo ${team} · Jugador Álvarez / Jugador Fernández`));
  }
});

test('high-resolution exports keep the entire canvas in one PNG shared by both channels', async () => {
  const { tournament, matches } = displayFixture(16);
  const first = renderBracketExport(tournament, matches);
  assert.equal(first, renderBracketExport(tournament, matches));
  const png = await first;
  const metadata = await sharp(png).metadata();
  const size = svgDimensions(renderBracketSvg(tournament, matches));
  assert.equal(metadata.width, size.width * 2);
  assert.equal(metadata.height, size.height * 2);
  assert.equal(metadata.format, 'png');
  assert(png.length < 49_000_000);
});

test('small brackets stay complete in a single high-density PNG', async () => {
  const { tournament, matches } = displayFixture(4);
  const exported = await renderBracketExport(tournament, matches);
  const size = svgDimensions(renderBracketSvg(tournament, matches));
  const png = await sharp(exported).metadata();
  assert.equal(png.width, size.width * 2);
  assert.equal(png.height, size.height * 2);
});

test('Telegram sends one complete original PNG with bounded caption and retries an explicit rate limit', async () => {
  const original = globalThis.fetch;
  const sent = [];
  let attempts = 0;
  let rejected;
  globalThis.fetch = async (url, init) => {
    attempts++;
    if (attempts === 1) {
      rejected = init.body;
      return new Response(JSON.stringify({ parameters: { retry_after: 0 } }), { status: 429 });
    }
    if (attempts === 2) assert.equal(init.body, rejected);
    sent.push({ url, body: init.body });
    return new Response('{}');
  };
  try {
    const { tournament, matches } = displayFixture(16);
    const templates = {
      getNotificationSettings: async () => ({ telegramEnabled: true }),
      readState: async () => ({ messageTemplates: { telegramTournamentStartedCaption: 'Aviso '.repeat(300) } }),
    };
    await new TelegramTournamentNotifier({ token: 'fake-test-token', chatId: 'fake-test-chat', templates }).notifyTournamentStarted(tournament, matches);
    const exported = await renderBracketExport(tournament, matches);
    assert.equal(sent.length, 1);
    assert.equal(attempts, 2);
    assert(sent.every(request => request.url.endsWith('/sendDocument')));
    for (const request of sent) {
      const image = request.body.get('document');
      assert.equal(image.type, 'image/png');
      assert(image.name.endsWith('-inicio-bracket.png'));
      assert(!image.name.includes('-parte-'));
      assert(request.body.get('caption').length <= 1024);
      assert.equal((await sharp(Buffer.from(await image.arrayBuffer())).metadata()).format, 'png');
      assert(Buffer.from(await image.arrayBuffer()).equals(Buffer.from(exported)));
    }
  } finally { globalThis.fetch = original; }
});

test('Telegram bounds rate-limit retries and does not retry ambiguous failures', async () => {
  const original = globalThis.fetch;
  const { tournament, matches } = displayFixture(4);
  const notifier = new TelegramTournamentNotifier({ token: 'fake-test-token', chatId: 'fake-test-chat' });
  try {
    for (const status of [429, 500]) {
      let attempts = 0;
      globalThis.fetch = async () => {
        attempts++;
        return new Response(JSON.stringify({ parameters: { retry_after: 0 } }), { status });
      };
      await assert.rejects(notifier.notifyMatchCalled(tournament, matches[0]), new RegExp(String(status)));
      assert.equal(attempts, status === 429 ? 4 : 1);
    }
  } finally { globalThis.fetch = original; }
});

test('WhatsApp sends exactly one complete original PNG', async () => {
  const { tournament, matches } = displayFixture(16);
  const notifier = new WhatsAppTournamentNotifier({ groupJid: 'fake-test-group' });
  const sent = [];
  // Replace only the transport: exercise the real notification and export path.
  notifier.sendDocument = async (bytes, filename, caption) => { sent.push({ bytes, filename, caption }); };
  await notifier.notifyTournamentStarted(tournament, matches);
  const exported = await renderBracketExport(tournament, matches);
  assert.equal(sent.length, 1);
  assert(sent[0].filename.endsWith('-inicio-bracket.png'));
  assert(!sent[0].filename.includes('-parte-'));
  assert(Buffer.from(sent[0].bytes).equals(Buffer.from(exported)));
});

test('band rendering preserves gradients, text and shadows across seams within raster rounding', async () => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="4300" viewBox="0 0 96 4300">
    <defs><linearGradient id="bg" x2="1" y2="1"><stop stop-color="#07111f"/><stop offset="1" stop-color="#56aaff"/></linearGradient>
    <filter id="shadow"><feDropShadow dx="0" dy="8" stdDeviation="10"/></filter></defs>
    <rect width="100%" height="100%" fill="url(#bg)"/>
    <rect x="8" y="2020" width="80" height="70" rx="10" fill="#fff" filter="url(#shadow)"/>
    <text x="10" y="4097" font-size="18" fill="#fff">Álvarez</text></svg>`;
  const png = await renderPngInBands(svg, 96, 4300, 96, 4300, 1_000_000);
  const actual = await sharp(png).raw().toBuffer();
  const expected = await sharp(Buffer.from(svg)).flatten({ background: '#07111f' }).raw().toBuffer();
  assert.equal(actual.length, expected.length);
  let maxDifference = 0;
  for (let index = 0; index < actual.length; index++) maxDifference = Math.max(maxDifference, Math.abs(actual[index] - expected[index]));
  // Translating the SVG viewport can round a gradient channel by one level.
  assert(maxDifference <= 1, `Missing or altered seam pixels: maximum difference ${maxDifference}`);
});

test('very tall PNG retains both ends at native text scale without the SVG height limit', async () => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="40000">
    <rect width="24" height="40000" fill="#ff0000"/><rect y="39900" width="24" height="100" fill="#0000ff"/></svg>`;
  const png = await renderSvgPng(svg);
  const metadata = await sharp(png).metadata();
  assert.equal(metadata.width, 48);
  assert.equal(metadata.height, 80000);
  assert.deepEqual([...await sharp(png).extract({ left: 0, top: 0, width: 1, height: 1 }).raw().toBuffer()], [255, 0, 0]);
  assert.deepEqual([...await sharp(png).extract({ left: 0, top: 79999, width: 1, height: 1 }).raw().toBuffer()], [0, 0, 255]);
});

test('PNG size limits fail explicitly and a failed render does not block later exports', async () => {
  const huge = '<svg width="32768" height="1000000"></svg>';
  await assert.rejects(renderSvgPng(huge), /tamaño máximo/);
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20" fill="red"/></svg>';
  await assert.rejects(renderPngInBands(svg, 20, 20, 20, 20, 40), /49 MB/);
  assert.equal((await sharp(await renderSvgPng(svg)).metadata()).format, 'png');
});

test('team characters retain duplicate selections and choose the latest numbered game', () => {
  const match = { gameCharacterSelections: [{ gameNum: 2, selections: [{ participantId: 'team', characterName: 'Mario' }, { participantId: 'team', characterName: 'Mario' }] }, { gameNum: 1, selections: [{ participantId: 'team', characterName: 'Luigi' }] }] };
  assert.deepEqual(core.characters(match, 'team'), ['Mario', 'Mario']);
  assert.deepEqual(core.characters({ characterSelections: [{ participantId: 'team', characterName: 'Mario / Luigi' }] }, 'team'), ['Mario', 'Luigi']);
});

test('WhatsApp explicitly sends PNG as an original document using pinned wacli flags', () => {
  assert.deepEqual(whatsappDocumentArgs('test-group', 'bracket.png', 'Aviso', 'image/png'),
    ['send', 'file', '--to', 'test-group', '--file', 'bracket.png', '--caption', 'Aviso', '--as', 'document', '--mime', 'image/png']);
});

test('screen pagination covers all matches in separate winners/losers pages at any screen resolution', () => {
  const { matches } = displayFixture(256);
  const clusters = ['WINNERS', 'LOSERS'].map(stage => ({ id: stage, label: stage,
    columns: [...new Set(matches.filter(m => m.bracketStage === stage).map(m => m.roundNumber))].map(round => ({ round, matches: matches.filter(m => m.bracketStage === stage && m.roundNumber === round) })) }));
  const pages = core.paginateSections([{ label: 'Pool A', clusters }], 1852, 840, 1);
  const ids = pages.flatMap(sections => sections.flatMap(s => s.clusters.flatMap(c => c.columns.flatMap(col => col.matches.map(m => m.id)))));
  assert.deepEqual([...new Set(ids)].sort(), matches.map(m => m.id).sort());
  assert(pages.every(page => page.length === 1 && page[0].clusters.length === 1));
  assert.equal(pages[0][0].clusters[0].id, 'WINNERS');
  assert(pages.some(page => page[0].clusters[0].id === 'LOSERS'));
  assert.deepEqual(core.paginateSections([{ label: 'Pool A', clusters }], 3704, 1680, 2), pages);
});

test('queued events expire, discard canceled calls and reject outdated corrected results', () => {
  const { tournament, matches } = displayFixture(4);
  const match = { ...matches[0], status: 'CALLED', call: { calledAt: 'now' } };
  const map = new Map([[tournament.id, new Map([[match.id, match]])]]);
  const call = { type: 'call', tournament, match: structuredClone(match), queuedAt: 100 };
  assert.equal(core.validQueuedEvent(call, map, 1000), true);
  match.status = 'PLAYING';
  assert.equal(core.validQueuedEvent(call, map, 1000), false);
  match.status = 'COMPLETED';
  const result = { ...call, type: 'result', fingerprint: core.resultFingerprint(match) };
  assert.equal(core.validQueuedEvent(result, map, 1000), true);
  assert.equal(core.validQueuedEvent(result, map, 121000), false);
  match.participants[0].score = 9;
  assert.equal(core.validQueuedEvent(result, map, 1000), false);
});
