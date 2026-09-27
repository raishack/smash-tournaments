import type { Match, Tournament, TournamentParticipant } from '../../shared/types.js';
import { SMASH_ULTIMATE_CHARACTERS } from '../tournaments/smash-ultimate.characters.js';
import { ROA2_CHARACTERS } from '../tournaments/roa2.characters.js';

export type Top8Standing = { entrantId: string; name: string; placement: number };
export const top8Game = (title: string) => /rivals of aether ii|rivals of aether 2|rivals ii|rivals 2|\broa\s*2\b/i.test(title) ? 'rivals' : /smash|ultimate/i.test(title) ? 'smash' : 'custom';
export function top8Catalog() {
  // Only identities are shared with match reporting. Top artwork has its own library.
  return Object.fromEntries(Object.entries({ smash: SMASH_ULTIMATE_CHARACTERS, rivals: ROA2_CHARACTERS, custom: [] }).map(([game, entries]) =>
      [game, entries.filter(c => !/random/i.test(c.name)).map(c => ({ ...c, image: '' }))]));
}

/** Rank elimination rounds, preserving ties. Never rank by match update time or seed. */
export function localTop8(tournament: Tournament, participants: TournamentParticipant[], matches: Match[]) {
  if (!tournament.importSource && matches.length) {
    const drawn = new Set(matches.flatMap(match => match.participants.map(p => p.participantId)));
    participants = participants.filter(participant => drawn.has(participant.id));
  }
  const ranked = new Map<string, number>();
  const phaseGroups = new Set(matches.filter(m => !m.externalRef?.isPoolPhase).map(m => m.externalRef?.phaseGroupId).filter(Boolean));
  if (tournament.settings.bracketMode === 'MKART' || !['SINGLE_ELIMINATION', 'DOUBLE_ELIMINATION'].includes(tournament.settings.format) || phaseGroups.size > 1) {
    return participants.slice(0, 8).map(p => ({ participant: p, placement: null as number | null }));
  }
  const known = new Set(participants.map(p => p.id));
  const completed = matches.filter(m => !m.externalRef?.isPoolPhase && ['COMPLETED', 'WALKOVER'].includes(m.status));
  const progress = (m: Match) => ({ POOLS: 0, WINNERS: 1000, LOSERS: 100000, FINALS: 1000000 }[m.bracketStage]) + m.roundNumber;
  const finals = completed.filter(m => m.winnerParticipantId && known.has(m.winnerParticipantId)).sort((a,b) => progress(b)-progress(a));
  const final = finals[0];
  if (!final || completed.filter(m => progress(m) === progress(final)).length !== 1) {
    return participants.slice(0, 8).map(p => ({ participant: p, placement: null as number | null }));
  }
  ranked.set(final.winnerParticipantId!, 1);
  const eliminated = new Map<number, Set<string>>();
  const last = new Map<string, Match>();
  for (const m of completed) for (const p of m.participants) {
    if (known.has(p.participantId) && (!last.has(p.participantId) || progress(m) > progress(last.get(p.participantId)!))) last.set(p.participantId, m);
  }
  for (const [id,m] of last) if (!ranked.has(id) && m.winnerParticipantId !== id) {
    const group = eliminated.get(progress(m)) ?? new Set<string>(); group.add(id); eliminated.set(progress(m), group);
  }
  let place = 2;
  for (const [,ids] of [...eliminated].sort(([a],[b]) => b-a)) { for (const id of ids) ranked.set(id, place); place += ids.size; }
  return participants.map(p => ({ participant: p, placement: ranked.get(p.id) ?? null }))
    .sort((a,b) => (a.placement ?? 999999)-(b.placement ?? 999999) || a.participant.displayName.localeCompare(b.participant.displayName)).slice(0,8);
}

function charactersFor(id: string, matches: Match[]) {
  const counts = new Map<number, { id: number; name: string; count: number; copies: number }>();
  for (const match of matches) {
    if (!['COMPLETED','WALKOVER'].includes(match.status)) continue;
    const games = match.gameCharacterSelections?.length ? match.gameCharacterSelections.map(g => g.selections) : [match.characterSelections ?? []];
    for (const selections of games) {
      const copies = new Map<number, number>();
      for (const c of selections.filter(s => s.participantId === id)) {
        const row = counts.get(c.characterId) ?? { id: c.characterId, name: c.characterName, count: 0, copies: 1 };
        row.count++; copies.set(c.characterId, (copies.get(c.characterId) ?? 0) + 1);
        row.copies = Math.max(row.copies, copies.get(c.characterId)!); counts.set(c.characterId, row);
      }
    }
  }
  return [...counts.values()].sort((a,b) => b.count-a.count || a.id-b.id).flatMap(c => Array.from({ length: c.copies }, () => ({ id: c.id, name: c.name }))).slice(0,4);
}

export function buildTop8Data(tournament: Tournament, participants: TournamentParticipant[], matches: Match[], standings?: Top8Standing[]) {
  const game = top8Game(tournament.gameTitle);
  const warnings: string[] = [];
  const imported = tournament.importSource?.provider === 'START_GG';
  const rows = standings?.length ? standings.slice(0,8).map(s => ({
    participant: participants.find(p => String(p.externalRef?.entrantId) === s.entrantId) ?? { id: `startgg-${s.entrantId}`, displayName: s.name }, placement: s.placement,
  })) : localTop8(tournament, participants, matches);
  if (imported && !standings?.length) warnings.push('No se ha podido obtener la clasificación final de start.gg. Revisa los puestos calculados con los cruces disponibles.');
  if (rows.some(r => r.placement === null)) warnings.push('Hay puestos que no se pueden determinar con estos cruces. Complétalos antes de exportar.');
  if (matches.some(m => m.syncStatus && m.syncStatus.state !== 'SYNCED')) warnings.push('Hay resultados pendientes de sincronización. Revisa la clasificación antes de publicar.');
  const catalog = top8Catalog();
  const players = rows.map(({participant, placement}) => ({ id: participant.id, name: participant.displayName, placement,
    roster:[] as Array<{nickname:string;role:string}>,characters: imported && game !== 'custom' ? charactersFor(participant.id, matches) : [] }));
  if (imported && game !== 'custom' && players.some(p => !p.characters.length)) warnings.push('Faltan personajes registrados para algunos jugadores. Puedes seleccionarlos o subir sus imágenes en el editor.');
  if (players.some(p => p.characters.some(c => !catalog[game].some(entry => entry.id === c.id)))) warnings.push('Hay personajes que aún no están en el catálogo de imágenes. Selecciona una alternativa o sube su retrato.');
  return {
    teamTournament:(tournament.settings.teamSize??1)>1,topCount:players.length,version: 1, tournamentId: tournament.id, title: tournament.title, gameTitle: tournament.gameTitle, game,
    date: tournament.startsAt, participantCount: participants.length, source: standings?.length ? 'start.gg' : 'bracket', warnings,
    players, catalog,
  };
}
