import type { Match, Tournament, TournamentParticipant } from '../../shared/types.js';
import type { TeamMember } from '../teams/team-types.js';
import type { RegistrationRecord } from '../registration/registration-record.js';
import { fortniteStandings, type FortniteState } from '../fortnite/fortnite-model.js';
import { localTop8 } from '../top8/top8-data.js';
import type { SyncJob } from './tournament-operations.js';

type ReviewLevel = 'OK' | 'WARNING' | 'BLOCKED' | 'INFO';
type ReviewItem = { id: string; title: string; detail: string; level: ReviewLevel; target: string; actionLabel: string };

/** Read-only guidance. Existing mutation endpoints remain the authority for validation. */
export function tournamentReview(input: {
  tournament: Tournament; participants: TournamentParticipant[]; matches: Match[];
  members: TeamMember[]; registrations: RegistrationRecord[]; jobs: SyncJob[];
  fortnite: FortniteState | null; activeLadder: boolean; importing: boolean;
}, now = Date.now()) {
  const { tournament: t, participants, matches, members, registrations, jobs } = input;
  const mirrored = t.importSource?.provider === 'START_GG', fortnite = t.settings.bracketMode === 'FORTNITE';
  const archived = t.status === 'ARCHIVED', completed = ['COMPLETED', 'ARCHIVED'].includes(t.status);
  const preparing = !completed && !['IN_PROGRESS', 'CANCELLED'].includes(t.status);
  const editable = !mirrored && preparing && !input.importing && !(fortnite && input.fortnite?.rounds.length);
  const active = participants.filter(p => p.status === 'ACTIVE');
  const eligible = active.filter(p => !t.settings.checkInRequired || p.checkedIn);
  const missingAttendance = active.filter(p => !p.checkedIn);
  const items: ReviewItem[] = [];
  const add = (id: string, title: string, detail: string, level: ReviewLevel, target = '', actionLabel = 'Revisar') =>
    items.push({ id, title, detail, level, target: archived ? '' : target, actionLabel });
  const names = (rows: { displayName: string }[]) => rows.slice(0, 6).map(p => p.displayName).join(', ') + (rows.length > 6 ? ` y ${rows.length - 6} más` : '');
  if (input.importing) add('import', 'Importación en curso', 'Espera a que termine antes de modificar el torneo.', 'BLOCKED', 'COMPETITION', 'Ver importación');
  else if (t.settings.importJob?.state === 'FAILED') add('import', 'Importación interrumpida', 'Revisa el error y reintenta la importación.', 'BLOCKED', 'COMPETITION', 'Ver importación');
  if (preparing && !mirrored) {
    add('participants', 'Participantes para competir', `${eligible.length} disponibles de ${participants.length} inscritos. Solo entran los activos${t.settings.checkInRequired ? ' con asistencia confirmada' : ''}.`, eligible.length < 2 ? 'BLOCKED' : 'OK', 'PARTICIPANTS', 'Ver participantes');
    add('attendance', 'Asistencia', missingAttendance.length ? `${missingAttendance.length} sin confirmar: ${names(missingAttendance)}.${t.settings.checkInRequired ? ' Quedarán fuera del sorteo.' : ' El check-in es opcional.'}` : 'Todos los participantes activos tienen asistencia confirmada.', missingAttendance.length ? 'WARNING' : 'OK', 'PARTICIPANTS', 'Revisar asistencia');
    if ((t.settings.teamSize ?? 1) > 1) {
      const incomplete = active.filter(p => members.filter(m => m.teamId === p.id && m.role === 'PLAYER').length !== t.settings.teamSize || members.filter(m => m.teamId === p.id && m.role === 'RESERVE').length > (t.settings.reserveCount ?? 0));
      add('teams', 'Plantillas de equipos', incomplete.length ? `Revisa titulares y reservas: ${names(incomplete)}.` : 'Titulares y reservas dentro de los límites.', incomplete.some(p => eligible.includes(p)) ? 'BLOCKED' : incomplete.length ? 'WARNING' : 'OK', 'TEAMS', 'Gestionar equipos');
      const solo = members.filter(m => !m.teamId).length;
      if (solo) add('solo', 'Jugadores sin equipo', `${solo} jugadores esperan asignación. No ocupan plaza en la bracket.`, 'WARNING', 'TEAMS', 'Asignar jugadores');
    }
    const open = !!t.settings.registrationEnabled && (!t.settings.registrationClosesAt || Date.parse(t.settings.registrationClosesAt) > now);
    add('registration', 'Inscripciones online', open ? 'Siguen abiertas. Puedes cerrarlas antes de preparar la competición.' : 'Inscripciones cerradas.', open ? 'WARNING' : 'OK', 'REGISTRATION', 'Gestionar inscripción');
    const waiting = registrations.filter(r => r.meta?.waitingAt && !r.meta.cancelledAt).length;
    const unconfirmed = registrations.filter(r => !r.confirmedAt && !r.meta?.cancelledAt && !r.meta?.waitingAt && Date.parse(r.expiresAt) > now).length;
    if (waiting || unconfirmed) add('waiting', 'Solicitudes pendientes', `${waiting} en lista de espera · ${unconfirmed} correos pendientes de verificar. No cuentan como inscritos confirmados.`, 'WARNING', 'REGISTRATION', 'Ver solicitudes');
    const drawn = fortnite ? !!input.fortnite?.rounds.length : matches.length > 0;
    add('draw', fortnite ? 'Grupos y partidas' : 'Bracket preparada', drawn ? 'Sorteo preparado. Comprueba participantes y configuración antes de iniciar.' : 'Todavía falta generar el sorteo.', drawn ? 'OK' : 'BLOCKED', fortnite ? 'FORTNITE' : 'COMPETITION', fortnite ? 'Abrir Fortnite' : 'Preparar competición');
  }
  const currentJobs = jobs.filter(j => ['PENDING', 'RUNNING'].includes(j.state) || (j.state === 'FAILED' && matches.some(m => m.id === j.matchId && (m.externalRef?.localSyncVersion ?? 0) === j.version)));
  if (mirrored) add('sync', 'Envíos a start.gg', currentJobs.length ? `${currentJobs.length} envíos pendientes o fallidos. Resuélvelos antes de archivar.` : 'Sin envíos pendientes ni fallidos actuales.', currentJobs.length ? 'BLOCKED' : 'OK', 'SYNC', 'Revisar envíos');
  if (!preparing) {
    add('results', 'Resultados y clasificación', completed ? 'Competición finalizada. Revisa los puestos antes de compartir el cartel.' : t.status === 'CANCELLED' ? 'Torneo cancelado.' : 'La competición sigue en curso. Revisa las partidas pendientes.', completed ? 'OK' : 'INFO', fortnite ? 'FORTNITE' : 'BRACKET', 'Ver resultados');
    if (input.activeLadder) add('ladder', 'Ladder abierta', 'Finaliza la ladder antes de archivar este torneo.', 'BLOCKED', 'LADDER', 'Abrir ladder');
    if (completed && !archived) {
      add('top8', 'Imagen Top 8', 'Abre el editor para revisar la clasificación, editar el diseño y exportar el PNG.', 'INFO', 'TOP8', 'Crear / editar Top 8');
      add('archive', 'Archivo del torneo', 'Al archivar quedará en solo lectura y fuera del display. Podrás desarchivarlo expresamente.', currentJobs.length || input.activeLadder || input.importing ? 'BLOCKED' : 'OK', 'ARCHIVE', 'Archivar torneo');
    }
  }
  let standings: { name: string; placement: number | null }[] = [];
  if (completed && !mirrored) {
    const final = input.fortnite?.rounds.find(r => r.final && r.closed);
    standings = fortnite ? (final?.groups[0] ? fortniteStandings(final.groups[0]).filter(p => !p.excluded).slice(0, 8).map(p => ({ name: participants.find(entry => entry.id === p.participantId)?.displayName ?? 'Participante', placement: p.rank })) : []) : localTop8(t, participants, matches).map(p => ({ name: p.participant.displayName, placement: p.placement }));
  }
  return { tournamentId: t.id, status: t.status, phase: preparing ? 'PREPARATION' : completed ? 'CLOSING' : 'PLAYING',
    title: preparing ? 'Antes de empezar' : completed ? 'Revisión de cierre' : 'Seguimiento del torneo',
    checkedAt: new Date(now).toISOString(), editable, items, standings,
    participants: participants.map(p => ({ id: p.id, name: p.displayName, checkedIn: p.checkedIn, status: p.status })),
    standingsNote: mirrored ? 'La clasificación oficial de start.gg se consulta al abrir el editor Top 8.' : standings.some(p => p.placement === null) ? 'Hay puestos que requieren revisión en el editor Top 8.' : '' };
}
