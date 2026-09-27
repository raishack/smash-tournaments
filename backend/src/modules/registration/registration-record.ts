export interface RegistrationRecord {
  tournamentId: string;
  email: string;
  nickname: string;
  tokenHash: string;
  expiresAt: string;
  sentAt: string;
  participantId?: string | null;
  confirmedAt?: string | null;
  memberId?: string | null;
  meta?: { waitingAt?:string; cancelledAt?:string; gameId?:string; preferredRole?:string };
  teamData?: import('../teams/team-types.js').TeamRegistration | null;
}
