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
  const add = (id: string, title: string, detail: string, level: ReviewLevel, target = '', actionLabel = 'Review') =>
    items.push({ id, title, detail, level, target: archived ? '' : target, actionLabel });
  const names = (rows: { displayName: string }[]) => rows.slice(0, 6).map(p => p.displayName).join(', ') + (rows.length > 6 ? ` and ${rows.length - 6} more` : '');
  if (input.importing) add('import', 'Import in progress', 'Wait for it to finish before changing the tournament.', 'BLOCKED', 'COMPETITION', 'View import');
  else if (t.settings.importJob?.state === 'FAILED') add('import', 'Import interrupted', 'Review the error and retry the import.', 'BLOCKED', 'COMPETITION', 'View import');
  if (preparing && !mirrored) {
    add('participants', 'Competing participants', `${eligible.length} available out of ${participants.length} registered. Only active entrants are included${t.settings.checkInRequired ? ' with confirmed attendance' : ''}.`, eligible.length < 2 ? 'BLOCKED' : 'OK', 'PARTICIPANTS', 'View participants');
    add('attendance', 'Attendance', missingAttendance.length ? `${missingAttendance.length} unconfirmed: ${names(missingAttendance)}.${t.settings.checkInRequired ? ' They will be left out of the draw.' : ' Check-in is optional.'}` : 'All active participants have confirmed attendance.', missingAttendance.length ? 'WARNING' : 'OK', 'PARTICIPANTS', 'Review attendance');
    if ((t.settings.teamSize ?? 1) > 1) {
      const incomplete = active.filter(p => members.filter(m => m.teamId === p.id && m.role === 'PLAYER').length !== t.settings.teamSize || members.filter(m => m.teamId === p.id && m.role === 'RESERVE').length > (t.settings.reserveCount ?? 0));
      add('teams', 'Team rosters', incomplete.length ? `Review starters and reserves: ${names(incomplete)}.` : 'Starters and reserves are within limits.', incomplete.some(p => eligible.includes(p)) ? 'BLOCKED' : incomplete.length ? 'WARNING' : 'OK', 'TEAMS', 'Manage teams');
      const solo = members.filter(m => !m.teamId).length;
      if (solo) add('solo', 'Solo players', `${solo} players are awaiting assignment. They do not occupy bracket places.`, 'WARNING', 'TEAMS', 'Assign players');
    }
    const open = !!t.settings.registrationEnabled && (!t.settings.registrationClosesAt || Date.parse(t.settings.registrationClosesAt) > now);
    add('registration', 'Online registration', open ? 'Still open. You can close registration before preparing the competition.' : 'Registration closed.', open ? 'WARNING' : 'OK', 'REGISTRATION', 'Manage registration');
    const waiting = registrations.filter(r => r.meta?.waitingAt && !r.meta.cancelledAt).length;
    const unconfirmed = registrations.filter(r => !r.confirmedAt && !r.meta?.cancelledAt && !r.meta?.waitingAt && Date.parse(r.expiresAt) > now).length;
    if (waiting || unconfirmed) add('waiting', 'Pending requests', `${waiting} waitlisted · ${unconfirmed} emails awaiting verification. These do not count as confirmed entrants.`, 'WARNING', 'REGISTRATION', 'View requests');
    const drawn = fortnite ? !!input.fortnite?.rounds.length : matches.length > 0;
    add('draw', fortnite ? 'Groups and games' : 'Bracket ready', drawn ? 'Draw prepared. Check participants and settings before starting.' : 'The draw still needs to be generated.', drawn ? 'OK' : 'BLOCKED', fortnite ? 'FORTNITE' : 'COMPETITION', fortnite ? 'Open Fortnite' : 'Prepare competition');
  }
  const currentJobs = jobs.filter(j => ['PENDING', 'RUNNING'].includes(j.state) || (j.state === 'FAILED' && matches.some(m => m.id === j.matchId && (m.externalRef?.localSyncVersion ?? 0) === j.version)));
  if (mirrored) add('sync', 'start.gg submissions', currentJobs.length ? `${currentJobs.length} pending or failed submissions. Resolve them before archiving.` : 'No current pending or failed submissions.', currentJobs.length ? 'BLOCKED' : 'OK', 'SYNC', 'Review submissions');
  if (!preparing) {
    add('results', 'Results and standings', completed ? 'Competition finished. Review placements before sharing the poster.' : t.status === 'CANCELLED' ? 'Tournament cancelled.' : 'The competition is still in progress. Review pending games.', completed ? 'OK' : 'INFO', fortnite ? 'FORTNITE' : 'BRACKET', 'View results');
    if (input.activeLadder) add('ladder', 'Ladder open', 'Finish the ladder before archiving this tournament.', 'BLOCKED', 'LADDER', 'Open ladder');
    if (completed && !archived) {
      add('top8', 'Imagen Top 8', 'Open the editor to review standings, edit the design and export a PNG.', 'INFO', 'TOP8', 'Create / edit Top 8');
      add('archive', 'Tournament archive', 'Archiving makes this tournament read-only and hides it from the display. You can explicitly unarchive it later.', currentJobs.length || input.activeLadder || input.importing ? 'BLOCKED' : 'OK', 'ARCHIVE', 'Archive tournament');
    }
  }
  let standings: { name: string; placement: number | null }[] = [];
  if (completed && !mirrored) {
    const final = input.fortnite?.rounds.find(r => r.final && r.closed);
    standings = fortnite ? (final?.groups[0] ? fortniteStandings(final.groups[0]).filter(p => !p.excluded).slice(0, 8).map(p => ({ name: participants.find(entry => entry.id === p.participantId)?.displayName ?? 'Participant', placement: p.rank })) : []) : localTop8(t, participants, matches).map(p => ({ name: p.participant.displayName, placement: p.placement }));
  }
  return { tournamentId: t.id, status: t.status, phase: preparing ? 'PREPARATION' : completed ? 'CLOSING' : 'PLAYING',
    title: preparing ? 'Before you start' : completed ? 'Completion review' : 'Tournament tracking',
    checkedAt: new Date(now).toISOString(), editable, items, standings,
    participants: participants.map(p => ({ id: p.id, name: p.displayName, checkedIn: p.checkedIn, status: p.status })),
    standingsNote: mirrored ? 'Official start.gg standings are fetched when you open the Top 8 editor.' : standings.some(p => p.placement === null) ? 'Some placements need review in the Top 8 editor.' : '' };
}
