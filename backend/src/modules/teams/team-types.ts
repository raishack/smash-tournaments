import type { TournamentSettings } from '../../shared/types.js';

export interface TeamMember {
  id: string;
  tournamentId: string;
  nickname: string;
  teamId: string | null;
  role: 'PLAYER' | 'RESERVE';
  revision: number;
  meta?: { captain?:boolean; gameId?:string; preferredRole?:string };
}
export interface TeamRegistration {
  mode: 'TEAM_CREATE' | 'TEAM_JOIN' | 'SOLO';
  teamName?: string;
  teamId?: string;
  role?: 'PLAYER' | 'RESERVE';
}
export const nickKey = (value: string) => value.normalize('NFKC').trim().toLowerCase();
export function teamSettings(settings: TournamentSettings) {
  const teamSize = settings.teamSize ?? 1;
  const reserveCount = settings.reserveCount ?? 0;
  if (!Number.isInteger(teamSize) || teamSize < 1 || teamSize > 20 || !Number.isInteger(reserveCount) || reserveCount < 0 || reserveCount > 20) throw Error('El tamaño de equipo y los reservas deben estar entre los límites permitidos (1–20 y 0–20)');
  if (teamSize === 1 && (reserveCount || settings.allowSoloRegistration)) throw Error('Las reservas y la lista sin equipo requieren un torneo por equipos');
  if (teamSize > 1 && settings.bracketMode === 'MKART') throw Error('El modo por equipos utiliza la bracket estándar');
  return { teamSize, reserveCount, allowSoloRegistration: settings.allowSoloRegistration ?? false };
}
