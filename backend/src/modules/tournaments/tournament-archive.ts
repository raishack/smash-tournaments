import type { Tournament } from '../../shared/types.js';
import { OperationConflict } from './tournament-operations.js';

export class ArchivedTournamentError extends OperationConflict {
  readonly status = 409;
  constructor() { super('El torneo está archivado y es de solo lectura. Desarchívalo antes de hacer cambios'); }
}

export function assertTournamentWritable(tournament: Tournament | undefined): void {
  if (tournament?.status === 'ARCHIVED') throw new ArchivedTournamentError();
}
