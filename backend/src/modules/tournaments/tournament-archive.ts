import type { Tournament } from '../../shared/types.js';
import { OperationConflict } from './tournament-operations.js';

export class ArchivedTournamentError extends OperationConflict {
  readonly status = 409;
  constructor() { super('The tournament is archived and read-only. Unarchive it before making changes'); }
}

export function assertTournamentWritable(tournament: Tournament | undefined): void {
  if (tournament?.status === 'ARCHIVED') throw new ArchivedTournamentError();
}
