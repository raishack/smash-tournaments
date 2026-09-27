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
  if (!Number.isInteger(teamSize) || teamSize < 1 || teamSize > 20 || !Number.isInteger(reserveCount) || reserveCount < 0 || reserveCount > 20) throw Error('Team size and reserves must be within the allowed limits (1–20 and 0–20)');
  if (teamSize === 1 && (reserveCount || settings.allowSoloRegistration)) throw Error('Reserves and the solo player list require a team tournament');
  if (teamSize > 1 && settings.bracketMode === 'MKART') throw Error('Team mode uses the standard bracket');
  return { teamSize, reserveCount, allowSoloRegistration: settings.allowSoloRegistration ?? false };
}
