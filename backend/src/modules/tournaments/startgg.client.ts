import { AsyncLocalStorage } from "node:async_hooks";
import type { MatchBracketStage, TournamentParticipantExternalRef, StartggStreamInfo } from "../../shared/types.js";

export interface ImportProgress { stage: string; message: string; completed?: number; total?: number; }
export type ImportProgressListener = (progress: ImportProgress) => Promise<void>;

const STARTGG_API_URL = "https://api.start.gg/gql/alpha";
const STARTGG_PHASE_GROUPS_PAGE_SIZE = 60;
const STARTGG_SEEDS_PAGE_SIZE = 100;
const STARTGG_SETS_PAGE_SIZE = 75;

interface StartggGraphQLError {
  message?: string;
}

export interface StartggImportPreview {
  eventId: string;
  eventName: string;
  eventSlug: string;
  eventUrl: string;
  gameTitle: string;
  entrantCount: number;
  entrantSize: number;
  hasPools: boolean;
  phaseId: string;
  phaseGroupId?: string;
  format: "SINGLE_ELIMINATION" | "DOUBLE_ELIMINATION" | "ROUND_ROBIN" | "GROUPS_PLAYOFF";
  bestOf: number;
  winnersBestOf: number;
  losersBestOf: number;
  participants: Array<{
    displayName: string;
    seed: number;
    externalRef: TournamentParticipantExternalRef;
  }>;
}

export interface StartggMirroredMatch {
  stream?: StartggStreamInfo;
  setId: string;
  identifier: string;
  hasPlaceholder: boolean;
  isPoolPhase: boolean;
  phaseId: string;
  phaseGroupId?: string;
  phaseName: string;
  phaseOrder: number;
  phaseGroupName?: string;
  phaseType: string;
  entrantSize: number;
  fullRoundText: string;
  bracketStage: MatchBracketStage;
  roundNumber: number;
  matchNumber: number;
  status: "PENDING" | "PLAYING" | "COMPLETED";
  bestOf: number;
  winnerEntrantId?: string;
  entrantIds: string[];
  gameWinnerEntrantIds: string[];
  gameCharacterSelections: Array<{
    gameNum: number;
    selections: Array<{
      entrantId: string;
      characterId: number;
      characterName: string;
    }>;
  }>;
  slots: Array<{
    slot: number;
    entrantId?: string;
    displayName: string;
    score: number;
    prereqId?: string;
    prereqPlacement?: number;
    prereqType?: string;
  }>;
}

export interface StartggImportedBracket extends StartggImportPreview {
  matches: StartggMirroredMatch[];
}

export interface StartggSetReferenceResolutionInput {
  phaseId: string;
  phaseGroupId?: string;
  identifier?: string;
  phaseName?: string;
  phaseOrder?: number;
  phaseGroupName?: string;
  phaseType?: string;
  isPoolPhase?: boolean;
  entrantSize?: number;
  bracketStage: MatchBracketStage;
  roundNumber: number;
  matchNumber: number;
  fullRoundText?: string;
}

export interface StartggMutationSyncResult {
  setId: string;
  updatedSetIds: string[];
}

export interface StartggRemoteSetState {
  state: number;
  winnerEntrantId?: string;
  disqualified: boolean;
  games: Array<{ winnerId: string; selections: Array<{ entrantId: string; characterId: number }> }>;
}

export interface StartggMirroredSourceRef {
  phaseId: string;
  phaseGroupId?: string;
  phaseName: string;
  phaseOrder: number;
  phaseType: string;
  isPoolPhase: boolean;
  phaseGroupName?: string;
  entrantSize: number;
}

interface StartggEventBasicsResponse {
  event: {
    id: string | number;
    name: string;
    tournament?: {
      name?: string | null;
      streamQueue?: Array<{ stream?: StartggStreamNode | null; sets?: Array<{id: string | number}> | null }> | null;
    } | null;
    numEntrants: number;
    entrantSizeMin: number;
    entrantSizeMax: number;
    videogame?: {
      displayName?: string | null;
      name?: string | null;
    } | null;
    phases?: Array<{
      id: string | number;
      name?: string | null;
      bracketType?: string | null;
      phaseOrder?: number | null;
      phaseGroups?: {
        nodes?: Array<{
          id: string | number;
          displayIdentifier?: string | null;
          bracketType?: string | null;
          seeds?: {
            pageInfo?: {
              total?: number | null;
            } | null;
          } | null;
        }> | null;
      } | null;
      seeds?: {
        pageInfo?: {
          total?: number | null;
        } | null;
      } | null;
    }> | null;
  } | null;
}

interface StartggPhaseGroupsResponse {
  phase: {
    id: string | number;
    phaseGroups?: {
      pageInfo?: {
        totalPages?: number | null;
      } | null;
      nodes?: Array<{
        id: string | number;
        displayIdentifier?: string | null;
        bracketType?: string | null;
        seeds?: {
          pageInfo?: {
            total?: number | null;
          } | null;
        } | null;
      }> | null;
    } | null;
  } | null;
}

interface StartggPhaseSeedsResponse {
  phase: {
    id: string | number;
    seeds?: {
      pageInfo?: {
        totalPages?: number | null;
      } | null;
      nodes?: Array<{
        seedNum?: number | null;
        entrant?: {
          id: string | number;
          name?: string | null;
          participants?: Array<{
            gamerTag?: string | null;
          }> | null;
        } | null;
      }> | null;
    } | null;
  } | null;
}

interface StartggPhaseGroupSeedsResponse {
  phaseGroup: {
    id: string | number;
    seeds?: {
      pageInfo?: {
        totalPages?: number | null;
      } | null;
      nodes?: Array<{
        seedNum?: number | null;
        entrant?: {
          id: string | number;
          name?: string | null;
          participants?: Array<{
            gamerTag?: string | null;
          }> | null;
        } | null;
      }> | null;
    } | null;
  } | null;
}

interface StartggPhaseSetsResponse {
  phase: {
    id: string | number;
    sets?: {
      pageInfo?: {
        totalPages?: number | null;
      } | null;
      nodes?: StartggSetNode[] | null;
    } | null;
  } | null;
}

interface StartggPhaseGroupSetsResponse {
  phaseGroup: {
    id: string | number;
    sets?: {
      pageInfo?: {
        totalPages?: number | null;
      } | null;
      nodes?: StartggSetNode[] | null;
    } | null;
  } | null;
}

interface StartggSetGamesResponse {
  id: string | number;
  games?: Array<{
    winnerId?: string | number | null;
    selections?: Array<{
      entrant?: {
        id: string | number;
      } | null;
      character?: {
        id: number;
        name?: string | null;
      } | null;
    }> | null;
  }> | null;
}

interface StartggStreamNode { id: string | number; streamName?: string | null; shortName?: string | null; streamSource?: string | null; }

function streamInfo(stream?: StartggStreamNode | null): StartggStreamInfo | undefined {
  return stream ? { id: String(stream.id), name: stream.shortName?.trim() || stream.streamName?.trim() || "Stream", source: stream.streamSource ?? undefined } : undefined;
}

interface StartggSetNode {
  stream?: StartggStreamNode | null;
  id: string | number;
  hasPlaceholder?: boolean | null;
  identifier?: string | null;
  fullRoundText?: string | null;
  round?: number | null;
  state?: number | null;
  totalGames?: number | null;
  games?: Array<{
    winnerId?: string | number | null;
    selections?: Array<{
      entrant?: {
        id: string | number;
      } | null;
      character?: {
        id: number;
        name?: string | null;
      } | null;
    }> | null;
  }> | null;
  slots?: Array<{
    entrant?: {
      id: string | number;
      name?: string | null;
      participants?: Array<{
        gamerTag?: string | null;
      }> | null;
    } | null;
    seed?: Record<string, never> | null;
    prereqId?: string | null;
    prereqPlacement?: number | null;
    prereqType?: string | null;
    standing?: {
      placement?: number | null;
    } | null;
  }> | null;
}

type SimplifiedSetReference =
  | {
      kind: "set";
      prereqId: string;
      prereqPlacement?: number;
    }
  | {
      kind: "entrant";
      entrantId: string;
      displayName: string;
    }
  | {
      kind: "seed";
      prereqId?: string;
    }
  | {
      kind: "bye";
    };

interface StartggPhaseSeedSourceSummary {
  phaseId: string;
  phaseGroupId?: string;
  phaseName: string;
  phaseOrder: number;
  phaseType: string;
  isPoolPhase: boolean;
  bracketType: "ROUND_ROBIN" | "SINGLE_ELIMINATION" | "DOUBLE_ELIMINATION";
  phaseGroupName?: string;
  seedCount: number;
}

type StartggSeedRow = {
  displayName: string;
  seed: number;
  externalRef: TournamentParticipantExternalRef;
};

export class StartggClient {
  private readonly importProgress = new AsyncLocalStorage<{ notify?: ImportProgressListener; last?: ImportProgress }>();
  private async emitProgress(progress: ImportProgress): Promise<void> {
    const context = this.importProgress.getStore();
    if (!context?.notify) return;
    if (progress.stage !== "WAITING") context.last = progress;
    await context.notify(progress);
  }

  private static readonly SET_GAMES_BATCH_SIZE = 20;
  private static readonly REQUEST_SPACING_MS = 800;
  private static readonly REQUEST_TIMEOUT_MS = 45000;
  private static readonly READ_ATTEMPTS = 5;
  private requestGate: Promise<void> = Promise.resolve();
  private lastRequestAt = 0;
  private requestsBlockedUntil = 0;

  constructor(private readonly apiToken?: string) {}

  async getTop8Standings(eventId: string) {
    const data = await this.graphql<{ event?: { state: string | number; standings?: { nodes?: Array<{ placement: number; entrant?: { id: string | number; name: string } }> } } }>(
      `query Top8Standings($eventId: ID!) { event(id: $eventId) { state standings(query: { page: 1, perPage: 8 }) { nodes { placement entrant { id name } } } } }`,
      { eventId }, 'Top8Standings');
    // Event.state is ActivityState (COMPLETED), unlike the numeric Set.state.
    if (data.event?.state !== 'COMPLETED' && data.event?.state !== 3) return [];
    return (data.event.standings?.nodes ?? []).filter(s => s.entrant && s.placement > 0)
      .map(s => ({ entrantId: String(s.entrant!.id), name: s.entrant!.name, placement: s.placement }));
  }

  isConfigured(): boolean {
    return Boolean(this.apiToken?.trim());
  }

  async previewEventImport(eventUrl: string): Promise<StartggImportPreview> {
    const imported = await this.importEventSnapshot(eventUrl, { includeGameDetails: false });
    return {
      eventId: imported.eventId,
      eventName: imported.eventName,
      eventSlug: imported.eventSlug,
      eventUrl: imported.eventUrl,
      gameTitle: imported.gameTitle,
      entrantCount: imported.entrantCount,
      entrantSize: imported.entrantSize,
      hasPools: imported.hasPools,
      phaseId: imported.phaseId,
      phaseGroupId: imported.phaseGroupId,
      format: imported.format,
      bestOf: imported.bestOf,
      winnersBestOf: imported.winnersBestOf,
      losersBestOf: imported.losersBestOf,
      participants: imported.participants,
    };
  }

  async importEventSnapshot(
    eventUrl: string,
    options: { includeGameDetails?: boolean; onProgress?: ImportProgressListener } = {},
  ): Promise<StartggImportedBracket> {
    return this.importProgress.run({ notify: options.onProgress }, async () => {
    await this.emitProgress({ stage: "EVENT", message: "Loading tournament information" });
    this.ensureConfigured();
    const eventSlug = parseStartggEventSlug(eventUrl);
    const basics = await this.fetchEventBasics(eventSlug);
    const event = basics.event;
    if (!event) {
      throw new Error("start.gg event not found");
    }
    const phasesWithGroups = await Promise.all(
      (event.phases ?? []).map(async (phase) => ({
        ...phase,
        phaseGroups: {
          nodes: await this.fetchPhaseGroups(String(phase.id)),
        },
      })),
    );
    const hydratedEvent = {
      ...event,
      phases: phasesWithGroups,
    };
    const entrantSize = Math.max(Number(event.entrantSizeMax ?? 1), Number(event.entrantSizeMin ?? 1), 1);
    const sources = this.collectPhaseSeedSources(hydratedEvent);
    if (sources.length === 0) {
      throw new Error("No public bracket or pools were found for this start.gg event");
    }

    const primarySource = this.pickPrimarySource(sources);
    const format = this.toImportedFormat(sources);
    const sourceResults: Array<{
      source: StartggPhaseSeedSourceSummary;
      seedRows: StartggSeedRow[];
      matches: StartggMirroredMatch[];
    }> = [];
    for (const source of sources) {
      await this.emitProgress({ stage: "PARTICIPANTS", message: `Downloading participants · ${source.phaseName}` });
      const seedRows = source.phaseGroupId
        ? await this.fetchPhaseGroupSeeds(source.phaseGroupId)
        : await this.fetchPhaseSeeds(source.phaseId);
      await this.emitProgress({ stage: "MATCHES", message: `Cargando matches · ${source.phaseName}` });
      const matches = await this.fetchMirroredSets(source, entrantSize, options.includeGameDetails ?? true);
      sourceResults.push({ source, seedRows, matches });
    }

    const allMatches = this.normalizePendingSlotDisplayNames(
      await this.simplifyHiddenSetDependencies(
        sourceResults.flatMap((result) => result.matches),
      ),
    );
    for (const queue of event.tournament?.streamQueue ?? []) {
      const info = streamInfo(queue.stream);
      if (!info) continue;
      const ids = new Set((queue.sets ?? []).map(set => String(set.id)));
      for (const match of allMatches) if (ids.has(match.setId)) match.stream = info;
    }
    const allSeeds = sourceResults.flatMap((result) => result.seedRows);
    if (allSeeds.length === 0 && allMatches.length === 0) {
      throw new Error("No public seeding or matches were found for this start.gg event");
    }

    const phaseSetInfo = this.computeSetConfiguration(allMatches, format);
    const participantRows = this.mergeParticipantsFromSeedsAndSets(allSeeds, allMatches);

    return {
      eventId: String(event.id),
      eventName: this.composeImportedEventName(
        event.tournament?.name?.trim(),
        event.name,
      ),
      eventSlug,
      eventUrl,
      gameTitle: event.videogame?.displayName?.trim() || event.videogame?.name?.trim() || event.name,
      entrantCount: event.numEntrants,
      entrantSize,
      hasPools: sources.some((source) => source.bracketType === "ROUND_ROBIN"),
      phaseId: String(primarySource.phaseId),
      phaseGroupId: primarySource.phaseGroupId ? String(primarySource.phaseGroupId) : undefined,
      format,
      bestOf: phaseSetInfo.bestOf,
      winnersBestOf: phaseSetInfo.winnersBestOf,
      losersBestOf: phaseSetInfo.losersBestOf,
      participants: participantRows,
      matches: allMatches,
    };

    });
  }

  async resolveSetReference(
    match: StartggSetReferenceResolutionInput,
  ): Promise<{
    setId: string;
    hasPlaceholder: boolean;
  } | undefined> {
    this.ensureConfigured();
    const source: StartggPhaseSeedSourceSummary = {
      phaseId: match.phaseId,
      phaseGroupId: match.phaseGroupId,
      phaseName: match.phaseName ?? match.phaseId,
      phaseOrder: match.phaseOrder ?? 0,
      phaseType: match.phaseType ?? "BRACKET",
      isPoolPhase: match.isPoolPhase ?? false,
      bracketType: "DOUBLE_ELIMINATION",
      phaseGroupName: match.phaseGroupName,
      seedCount: 0,
    };
    const sets = match.phaseGroupId
      ? await this.fetchPhaseGroupSets(match.phaseGroupId)
      : await this.fetchPhaseSets(match.phaseId);
    const mirroredSets = this.toMirroredMatches(sets, source, match.entrantSize ?? 1);
    if (mirroredSets.length === 0) {
      return undefined;
    }

    let resolved = mirroredSets.find((candidate) =>
      (!match.identifier || candidate.identifier === match.identifier)
      && (
      candidate.bracketStage === match.bracketStage
      && candidate.roundNumber === match.roundNumber
      && candidate.matchNumber === match.matchNumber
      && candidate.fullRoundText === (match.fullRoundText ?? candidate.fullRoundText)
      )
    );

    if (!resolved && match.identifier) {
      resolved = mirroredSets.find((candidate) =>
        candidate.identifier === match.identifier && candidate.identifier !== ""
      );
    }

    if (!resolved) {
      resolved = mirroredSets.find((candidate) =>
        candidate.bracketStage === match.bracketStage
        && candidate.roundNumber === match.roundNumber
        && candidate.matchNumber === match.matchNumber
      );
    }

    return resolved
      ? {
          setId: resolved.setId,
          hasPlaceholder: resolved.hasPlaceholder,
        }
      : undefined;
  }

  async resolveSetReferencesFromUpdatedIds(
    match: StartggSetReferenceResolutionInput,
    updatedSetIds: string[],
  ): Promise<StartggMirroredMatch[]> {
    this.ensureConfigured();
    if (updatedSetIds.length === 0) {
      return [];
    }
    const source: StartggPhaseSeedSourceSummary = {
      phaseId: match.phaseId,
      phaseGroupId: match.phaseGroupId,
      phaseName: match.phaseName ?? match.phaseId,
      phaseOrder: match.phaseOrder ?? 0,
      phaseType: match.phaseType ?? "BRACKET",
      isPoolPhase: match.isPoolPhase ?? false,
      bracketType: "DOUBLE_ELIMINATION",
      phaseGroupName: match.phaseGroupName,
      seedCount: 0,
    };
    const relevantSetIds = new Set(updatedSetIds);
    const nodes = match.phaseGroupId
      ? (await this.fetchPhaseGroupSets(match.phaseGroupId)).filter((node) => relevantSetIds.has(String(node.id)))
      : (await this.fetchPhaseSets(match.phaseId)).filter((node) => relevantSetIds.has(String(node.id)));
    return this.normalizePendingSlotDisplayNames(
      await this.simplifyHiddenSetDependencies(
        this.toMirroredMatches(nodes, source, match.entrantSize ?? 1),
      ),
    );
  }

  async importMatchesForSources(
    sources: StartggMirroredSourceRef[],
    options: { includeGameDetails?: boolean; onProgress?: ImportProgressListener } = {},
  ): Promise<StartggMirroredMatch[]> {
    this.ensureConfigured();
    const includeGameDetails = options.includeGameDetails ?? false;
    const uniqueSources = sources.filter((source, index, array) =>
      array.findIndex((candidate) =>
        candidate.phaseId === source.phaseId
        && (candidate.phaseGroupId ?? "") === (source.phaseGroupId ?? "")
      ) === index,
    );
    const matchesBySource = await Promise.all(
      uniqueSources.map(async (source) => {
        const sourceSummary: StartggPhaseSeedSourceSummary = {
          phaseId: source.phaseId,
          phaseGroupId: source.phaseGroupId,
          phaseName: source.phaseName,
          phaseOrder: source.phaseOrder,
          phaseType: source.phaseType,
          isPoolPhase: source.isPoolPhase,
          phaseGroupName: source.phaseGroupName,
          bracketType: this.normalizePhaseBracketType(source.phaseType),
          seedCount: 0,
        };
        return this.fetchMirroredSets(sourceSummary, source.entrantSize, includeGameDetails);
      }),
    );

    return this.normalizePendingSlotDisplayNames(
      await this.simplifyHiddenSetDependencies(matchesBySource.flatMap((matches) => matches)),
    );
  }

  async reportMatchResult(
    setId: string,
    winnerEntrantId: string,
    gameData?: Array<{
      winnerId: string;
      gameNum: number;
      entrant1Score: number;
      entrant2Score: number;
      selections?: Array<{
        entrantId: string;
        characterId: number;
      }>;
    }>,
    isDQ?: boolean,
  ): Promise<StartggMutationSyncResult> {
    this.ensureConfigured();
    const response = await this.graphqlWithActionRecords<{ reportBracketSet?: { id?: string | number | null } | null }>(
      `
        mutation ReportSet($setId: ID!, $winnerId: ID!, $gameData: [BracketSetGameDataInput], $isDQ: Boolean) {
          reportBracketSet(setId: $setId, winnerId: $winnerId, gameData: $gameData, isDQ: $isDQ) {
            id
            state
          }
        }
      `,
      {
        setId,
        winnerId: winnerEntrantId,
        gameData,
        isDQ,
      },
      "ReportSet",
    );
    return {
      setId: String(response.data.reportBracketSet?.id ?? setId),
      updatedSetIds: this.extractUpdatedSetIds(response.actionRecords),
    };
  }

  async getSetState(setId: string): Promise<StartggRemoteSetState> {
    const response = await this.graphql<{ set: {
      state: number;
      slots: Array<{ entrant?: { id: string | number }; standing?: { placement?: number; stats?: { score?: { value?: number | string } } } }>;
      games?: Array<{ orderNum: number; winnerId: string | number; selections?: Array<{ entrant?: { id: string | number }; character?: { id: number } }> }>;
    } | null }>(`query OperationSetState($setId: ID!) {
      set(id: $setId) { state slots { entrant { id } standing { placement stats { score { value } } } }
        games { orderNum winnerId selections { entrant { id } character { id } } }
      }
    }`, { setId }, "OperationSetState");
    if (!response.set) throw new Error("Could not check set status on start.gg");
    return {
      state: response.set.state,
      winnerEntrantId: response.set.slots.find(slot => slot.standing?.placement === 1)?.entrant?.id?.toString(),
      disqualified: response.set.slots.some(slot => Number(slot.standing?.stats?.score?.value) < 0),
      games: [...(response.set.games ?? [])].sort((a,b) => a.orderNum - b.orderNum).map(game => ({
        winnerId: String(game.winnerId), selections: (game.selections ?? []).filter(s => s.entrant && s.character)
          .map(s => ({ entrantId: String(s.entrant!.id), characterId: Number(s.character!.id) })),
      })),
    };
  }

  async markSetCalled(setId: string): Promise<StartggMutationSyncResult> {
    this.ensureConfigured();
    const response = await this.graphqlWithActionRecords<{ markSetCalled?: { id?: string | number | null } | null }>(
      `
        mutation MarkSetCalled($setId: ID!) {
          markSetCalled(setId: $setId) {
            id
            state
          }
        }
      `,
      { setId },
      "MarkSetCalled",
    );
    return {
      setId: String(response.data.markSetCalled?.id ?? setId),
      updatedSetIds: this.extractUpdatedSetIds(response.actionRecords),
    };
  }

  async markSetInProgress(setId: string): Promise<StartggMutationSyncResult> {
    this.ensureConfigured();
    const response = await this.graphqlWithActionRecords<{ markSetInProgress?: { id?: string | number | null } | null }>(
      `
        mutation MarkSetInProgress($setId: ID!) {
          markSetInProgress(setId: $setId) {
            id
            state
          }
        }
      `,
      { setId },
      "MarkSetInProgress",
    );
    return {
      setId: String(response.data.markSetInProgress?.id ?? setId),
      updatedSetIds: this.extractUpdatedSetIds(response.actionRecords),
    };
  }

  async resetSet(setId: string, resetDependentSets: boolean = false): Promise<StartggMutationSyncResult> {
    this.ensureConfigured();
    const response = await this.graphqlWithActionRecords<{ resetSet?: { id?: string | number | null } | null }>(
      `
        mutation ResetSet($setId: ID!, $resetDependentSets: Boolean) {
          resetSet(setId: $setId, resetDependentSets: $resetDependentSets) {
            id
            state
          }
        }
      `,
      {
        setId,
        resetDependentSets,
      },
      "ResetSet",
    );
    return {
      setId: String(response.data.resetSet?.id ?? setId),
      updatedSetIds: this.extractUpdatedSetIds(response.actionRecords),
    };
  }

  private async fetchEventBasics(eventSlug: string) {
    return this.graphql<StartggEventBasicsResponse>(
      `
        query EventImportBasics($slug: String!) {
          event(slug: $slug) {
            id
            name
            tournament {
              name
              streamQueue { stream { id streamName shortName streamSource } sets { id } }
            }
            numEntrants
            entrantSizeMin
            entrantSizeMax
            videogame {
              displayName
              name
            }
            phases {
              id
              name
              bracketType
              phaseOrder
              seeds(query: { page: 1, perPage: 1 }) {
                pageInfo {
                  total
                }
              }
            }
          }
        }
      `,
      { slug: eventSlug },
      "EventImportBasics",
    );
  }

  private async fetchPhaseGroups(phaseId: string): Promise<NonNullable<NonNullable<NonNullable<StartggPhaseGroupsResponse["phase"]>["phaseGroups"]>["nodes"]>> {
    const firstPage = await this.graphql<StartggPhaseGroupsResponse>(
      `
        query PhaseGroups($phaseId: ID!, $page: Int!, $perPage: Int!) {
          phase(id: $phaseId) {
            id
            phaseGroups(query: { page: $page, perPage: $perPage }) {
              pageInfo {
                totalPages
              }
              nodes {
                id
                displayIdentifier
                bracketType
                seeds(query: { page: 1, perPage: 1 }) {
                  pageInfo {
                    total
                  }
                }
              }
            }
          }
        }
      `,
      {
        phaseId,
        page: 1,
        perPage: STARTGG_PHASE_GROUPS_PAGE_SIZE,
      },
      "PhaseGroups",
    );

    const firstNodes = firstPage.phase?.phaseGroups?.nodes ?? [];
    const totalPages = Number(firstPage.phase?.phaseGroups?.pageInfo?.totalPages ?? 1);
    const remainingNodes: typeof firstNodes = [];
    for (let page = 2; page <= totalPages; page += 1) {
      const response = await this.graphql<StartggPhaseGroupsResponse>(
        `
          query PhaseGroups($phaseId: ID!, $page: Int!, $perPage: Int!) {
            phase(id: $phaseId) {
              id
              phaseGroups(query: { page: $page, perPage: $perPage }) {
                nodes {
                  id
                  displayIdentifier
                  bracketType
                  seeds(query: { page: 1, perPage: 1 }) {
                    pageInfo {
                      total
                    }
                  }
                }
              }
            }
          }
        `,
        {
          phaseId,
          page,
          perPage: STARTGG_PHASE_GROUPS_PAGE_SIZE,
        },
        "PhaseGroups",
      );
      remainingNodes.push(...(response.phase?.phaseGroups?.nodes ?? []));
    }

    return [...firstNodes, ...remainingNodes];
  }

  private async fetchPhaseSeeds(phaseId: string): Promise<StartggSeedRow[]> {
    const firstPage = await this.graphql<StartggPhaseSeedsResponse>(
      `
        query PhaseSeeds($phaseId: ID!, $page: Int!, $perPage: Int!) {
          phase(id: $phaseId) {
            id
            seeds(query: { page: $page, perPage: $perPage }) {
              pageInfo {
                totalPages
              }
              nodes {
                seedNum
                entrant {
                  id
                  name
                  participants {
                    gamerTag
                  }
                }
              }
            }
          }
        }
      `,
      {
        phaseId,
        page: 1,
        perPage: STARTGG_SEEDS_PAGE_SIZE,
      },
      "PhaseSeeds",
    );

    const firstNodes = firstPage.phase?.seeds?.nodes ?? [];
    const totalPages = Number(firstPage.phase?.seeds?.pageInfo?.totalPages ?? 1);
    await this.emitProgress({ stage: "PARTICIPANTS", message: "Downloading participants · pages", completed: 1, total: totalPages });
    const remainingNodes: typeof firstNodes = [];
    for (let page = 2; page <= totalPages; page += 1) {
      const response = await this.graphql<StartggPhaseSeedsResponse>(
        `
          query PhaseSeeds($phaseId: ID!, $page: Int!, $perPage: Int!) {
            phase(id: $phaseId) {
              id
              seeds(query: { page: $page, perPage: $perPage }) {
                nodes {
                  seedNum
                  entrant {
                    id
                    name
                    participants {
                      gamerTag
                    }
                  }
                }
              }
            }
          }
        `,
        {
          phaseId,
          page,
          perPage: STARTGG_SEEDS_PAGE_SIZE,
        },
        "PhaseSeeds",
      );
      remainingNodes.push(...(response.phase?.seeds?.nodes ?? []));
      await this.emitProgress({ stage: "PARTICIPANTS", message: "Downloading participants · pages", completed: page, total: totalPages });
    }

    return this.mapSeedRows([...firstNodes, ...remainingNodes]);
  }

  private async fetchPhaseGroupSeeds(phaseGroupId: string): Promise<StartggSeedRow[]> {
    const firstPage = await this.graphql<StartggPhaseGroupSeedsResponse>(
      `
        query PhaseGroupSeeds($phaseGroupId: ID!, $page: Int!, $perPage: Int!) {
          phaseGroup(id: $phaseGroupId) {
            id
            seeds(query: { page: $page, perPage: $perPage }) {
              pageInfo {
                totalPages
              }
              nodes {
                seedNum
                entrant {
                  id
                  name
                  participants {
                    gamerTag
                  }
                }
              }
            }
          }
        }
      `,
      {
        phaseGroupId,
        page: 1,
        perPage: STARTGG_SEEDS_PAGE_SIZE,
      },
      "PhaseGroupSeeds",
    );

    const firstNodes = firstPage.phaseGroup?.seeds?.nodes ?? [];
    const totalPages = Number(firstPage.phaseGroup?.seeds?.pageInfo?.totalPages ?? 1);
    await this.emitProgress({ stage: "PARTICIPANTS", message: "Downloading participants · pages", completed: 1, total: totalPages });
    const remainingNodes: typeof firstNodes = [];
    for (let page = 2; page <= totalPages; page += 1) {
      const response = await this.graphql<StartggPhaseGroupSeedsResponse>(
        `
          query PhaseGroupSeeds($phaseGroupId: ID!, $page: Int!, $perPage: Int!) {
            phaseGroup(id: $phaseGroupId) {
              id
              seeds(query: { page: $page, perPage: $perPage }) {
                nodes {
                  seedNum
                  entrant {
                    id
                    name
                    participants {
                      gamerTag
                    }
                  }
                }
              }
            }
          }
        `,
        {
          phaseGroupId,
          page,
          perPage: STARTGG_SEEDS_PAGE_SIZE,
        },
        "PhaseGroupSeeds",
      );
      remainingNodes.push(...(response.phaseGroup?.seeds?.nodes ?? []));
      await this.emitProgress({ stage: "PARTICIPANTS", message: "Downloading participants · pages", completed: page, total: totalPages });
    }

    return this.mapSeedRows([...firstNodes, ...remainingNodes]);
  }

  private computeSetConfiguration(
    sets: StartggMirroredMatch[],
    format: StartggImportPreview["format"],
  ): { bestOf: number; winnersBestOf: number; losersBestOf: number } {
    const poolsBestOf = this.pickBestOf(
      sets.filter((set) => set.bracketStage === "POOLS").map((set) => set.bestOf),
      3,
    );
    const winnersBestOf = this.pickBestOf(
      sets.filter((set) => set.bracketStage === "WINNERS" || set.bracketStage === "FINALS").map((set) => set.bestOf),
      poolsBestOf,
    );
    const losersBestOf = format === "DOUBLE_ELIMINATION" || format === "GROUPS_PLAYOFF"
      ? this.pickBestOf(
          sets.filter((set) => set.bracketStage === "LOSERS").map((set) => set.bestOf),
          winnersBestOf,
        )
      : winnersBestOf;

    return {
      bestOf: format === "ROUND_ROBIN" ? poolsBestOf : winnersBestOf,
      winnersBestOf,
      losersBestOf,
    };
  }

  private async fetchMirroredSets(
    source: StartggPhaseSeedSourceSummary,
    entrantSize: number,
    includeGameDetails: boolean,
  ): Promise<StartggMirroredMatch[]> {
    const basicSets = source.phaseGroupId
      ? await this.fetchPhaseGroupSets(source.phaseGroupId)
      : await this.fetchPhaseSets(source.phaseId);
    const hydratedSets = includeGameDetails
      ? await this.hydrateSetGames(basicSets)
      : basicSets;
    return this.toMirroredMatches(hydratedSets, source, entrantSize);
  }

  private async fetchPhaseSets(phaseId: string): Promise<StartggSetNode[]> {
    const firstPage = await this.graphql<StartggPhaseSetsResponse>(
      `
        query PhaseSets($phaseId: ID!, $page: Int!, $perPage: Int!) {
          phase(id: $phaseId) {
            id
            sets(page: $page, perPage: $perPage, sortType: STANDARD) {
              pageInfo {
                totalPages
              }
              nodes {
                id
                hasPlaceholder
                identifier
                stream { id streamName shortName streamSource }
                fullRoundText
                round
                state
                totalGames
                slots {
                  entrant {
                    id
                    name
                    participants {
                      gamerTag
                    }
                  }
                  prereqId
                  prereqPlacement
                  prereqType
                  standing {
                    placement
                  }
                }
              }
            }
          }
        }
      `,
      {
        phaseId,
        page: 1,
        perPage: STARTGG_SETS_PAGE_SIZE,
      },
      "PhaseSets",
    );

    const firstNodes = firstPage.phase?.sets?.nodes ?? [];
    const totalPages = Number(firstPage.phase?.sets?.pageInfo?.totalPages ?? 1);
    await this.emitProgress({ stage: "MATCHES", message: "Loading matches · pages", completed: 1, total: totalPages });
    const remainingNodes: typeof firstNodes = [];
    for (let page = 2; page <= totalPages; page += 1) {
      const response = await this.graphql<StartggPhaseSetsResponse>(
        `
          query PhaseSets($phaseId: ID!, $page: Int!, $perPage: Int!) {
            phase(id: $phaseId) {
              id
              sets(page: $page, perPage: $perPage, sortType: STANDARD) {
                nodes {
                  id
                  hasPlaceholder
                  identifier
                  stream { id streamName shortName streamSource }
                  fullRoundText
                  round
                  state
                  totalGames
                  slots {
                    entrant {
                      id
                      name
                      participants {
                        gamerTag
                      }
                    }
                    prereqId
                    prereqPlacement
                    prereqType
                    standing {
                      placement
                    }
                  }
                }
              }
            }
          }
        `,
        {
          phaseId,
          page,
          perPage: STARTGG_SETS_PAGE_SIZE,
        },
        "PhaseSets",
      );
      remainingNodes.push(...(response.phase?.sets?.nodes ?? []));
      await this.emitProgress({ stage: "MATCHES", message: "Loading matches · pages", completed: page, total: totalPages });
    }
    return [...firstNodes, ...remainingNodes];
  }

  private async fetchPhaseGroupSets(phaseGroupId: string): Promise<StartggSetNode[]> {
    const firstPage = await this.graphql<StartggPhaseGroupSetsResponse>(
      `
        query PhaseGroupSets($phaseGroupId: ID!, $page: Int!, $perPage: Int!) {
          phaseGroup(id: $phaseGroupId) {
            id
            sets(page: $page, perPage: $perPage, sortType: STANDARD) {
              pageInfo {
                totalPages
              }
              nodes {
                id
                hasPlaceholder
                identifier
                stream { id streamName shortName streamSource }
                fullRoundText
                round
                state
                totalGames
                slots {
                  entrant {
                    id
                    name
                    participants {
                      gamerTag
                    }
                  }
                  prereqId
                  prereqPlacement
                  prereqType
                  standing {
                    placement
                  }
                }
              }
            }
          }
        }
      `,
      {
        phaseGroupId,
        page: 1,
        perPage: STARTGG_SETS_PAGE_SIZE,
      },
      "PhaseGroupSets",
    );

    const firstNodes = firstPage.phaseGroup?.sets?.nodes ?? [];
    const totalPages = Number(firstPage.phaseGroup?.sets?.pageInfo?.totalPages ?? 1);
    await this.emitProgress({ stage: "MATCHES", message: "Loading matches · pages", completed: 1, total: totalPages });
    const remainingNodes: typeof firstNodes = [];
    for (let page = 2; page <= totalPages; page += 1) {
      const response = await this.graphql<StartggPhaseGroupSetsResponse>(
        `
          query PhaseGroupSets($phaseGroupId: ID!, $page: Int!, $perPage: Int!) {
            phaseGroup(id: $phaseGroupId) {
              id
              sets(page: $page, perPage: $perPage, sortType: STANDARD) {
                nodes {
                  id
                  hasPlaceholder
                  identifier
                  stream { id streamName shortName streamSource }
                  fullRoundText
                  round
                  state
                  totalGames
                  slots {
                    entrant {
                      id
                      name
                      participants {
                        gamerTag
                      }
                    }
                    prereqId
                    prereqPlacement
                    prereqType
                    standing {
                      placement
                    }
                  }
                }
              }
            }
          }
        `,
        {
          phaseGroupId,
          page,
          perPage: STARTGG_SETS_PAGE_SIZE,
        },
        "PhaseGroupSets",
      );
      remainingNodes.push(...(response.phaseGroup?.sets?.nodes ?? []));
      await this.emitProgress({ stage: "MATCHES", message: "Loading matches · pages", completed: page, total: totalPages });
    }
    return [...firstNodes, ...remainingNodes];
  }

  private async fetchSetById(setId: string): Promise<StartggSetNode | undefined> {
    const response = await this.graphql<{ set?: StartggSetNode | null }>(
      `
        query DirectSet($setId: ID!) {
          set(id: $setId) {
            id
            hasPlaceholder
            identifier
            stream { id streamName shortName streamSource }
            fullRoundText
            round
            state
            totalGames
            slots {
              entrant {
                id
                name
                participants {
                  gamerTag
                }
              }
              prereqId
              prereqPlacement
              prereqType
              standing {
                placement
              }
            }
          }
        }
      `,
      { setId },
      "DirectSet",
    );
    return response.set ?? undefined;
  }

  private async fetchSetsByIds(setIds: string[]): Promise<StartggSetNode[]> {
    if (setIds.length === 0) {
      return [];
    }
    const variableDefinitions = setIds.map((_, index) => `$set${index}: ID!`).join(", ");
    const queryBody = setIds.map((_, index) => `
        set${index}: set(id: $set${index}) {
          id
          hasPlaceholder
          identifier
          stream { id streamName shortName streamSource }
          fullRoundText
          round
          state
          totalGames
          slots {
            entrant {
              id
              name
              participants {
                gamerTag
              }
            }
            prereqId
            prereqPlacement
            prereqType
            standing {
              placement
            }
          }
        }`).join("\n");
    const variables = Object.fromEntries(setIds.map((setId, index) => [`set${index}`, setId]));
    const response = await this.graphql<Record<string, StartggSetNode | null>>(
      `
        query SetsByIds(${variableDefinitions}) {
          ${queryBody}
        }
      `,
      variables,
      "SetsByIds",
    );
    return Object.values(response).filter((item): item is StartggSetNode => item !== null);
  }

  private async hydrateSetGames(sets: StartggSetNode[]): Promise<StartggSetNode[]> {
    const candidates = sets.filter((set) => this.shouldFetchGameDetails(set));
    if (candidates.length === 0) {
      return sets;
    }

    const setGamesById = new Map<string, NonNullable<StartggSetNode["games"]>>();
    for (let index = 0; index < candidates.length; index += StartggClient.SET_GAMES_BATCH_SIZE) {
      const batch = candidates.slice(index, index + StartggClient.SET_GAMES_BATCH_SIZE);
      await this.emitProgress({ stage: "DETAILS", message: "Loading match details · sets", completed: index, total: candidates.length });
      const details = await this.fetchSetGamesBatch(batch.map((set) => String(set.id)));
      for (const detail of details) {
        setGamesById.set(String(detail.id), detail.games ?? []);
      }
    }

    return sets.map((set) => {
      const games = setGamesById.get(String(set.id));
      return games
        ? {
            ...set,
            games,
          }
        : set;
    });
  }

  private shouldFetchGameDetails(set: StartggSetNode): boolean {
    if ((set.slots ?? []).some((slot) => Number(slot.standing?.placement ?? 0) > 0)) {
      return true;
    }
    const state = Number(set.state ?? 0);
    return state >= 3;
  }

  private async fetchSetGamesBatch(setIds: string[]): Promise<StartggSetGamesResponse[]> {
    if (setIds.length === 0) {
      return [];
    }

    const variableDefinitions = setIds.map((_, index) => `$set${index}: ID!`).join(", ");
    const queryBody = setIds.map((_, index) => `
        set${index}: set(id: $set${index}) {
          id
          games {
            winnerId
            selections {
              entrant {
                id
              }
              character {
                id
                name
              }
            }
          }
        }`).join("\n");
    const variables = Object.fromEntries(setIds.map((setId, index) => [`set${index}`, setId]));
    const response = await this.graphql<Record<string, StartggSetGamesResponse | null>>(
      `
        query SetGamesBatch(${variableDefinitions}) {
          ${queryBody}
        }
      `,
      variables,
      "SetGamesBatch",
    );

    return Object.values(response).filter((item): item is StartggSetGamesResponse => item !== null);
  }

  private mapSeedRows(
    nodes: Array<{
      seedNum?: number | null;
      entrant?: {
        id: string | number;
        name?: string | null;
        participants?: Array<{
          gamerTag?: string | null;
        }> | null;
      } | null;
    }>,
  ): StartggSeedRow[] {
    const rows: Array<StartggSeedRow | undefined> = nodes
      .map((node) => {
        const entrantId = node.entrant?.id != null ? String(node.entrant.id) : undefined;
        const seedNum = Number(node.seedNum ?? 0);
        const displayName = this.toEntrantDisplayName(node.entrant);
        if (!entrantId || !seedNum || !displayName) {
          return undefined;
        }
        return {
          displayName,
          seed: seedNum,
          externalRef: {
            provider: "START_GG" as const,
            entrantId,
            seedNum,
          },
        };
      });
    return rows.filter((item): item is StartggSeedRow => item !== undefined);
  }

  private mergeParticipantsFromSeedsAndSets(seeds: StartggSeedRow[], matches: StartggMirroredMatch[]): StartggSeedRow[] {
    const byEntrantId = new Map(seeds.map((seed) => [seed.externalRef.entrantId, seed]));
    let nextSeed = seeds.reduce((max, item) => Math.max(max, item.seed), 0);

    for (const match of matches) {
      for (const slot of match.slots) {
        if (!slot.entrantId || byEntrantId.has(slot.entrantId)) {
          continue;
        }
        nextSeed += 1;
        byEntrantId.set(slot.entrantId, {
          displayName: slot.displayName,
          seed: nextSeed,
          externalRef: {
            provider: "START_GG",
            entrantId: slot.entrantId,
            seedNum: nextSeed,
          },
        });
      }
    }

    return [...byEntrantId.values()].sort((left, right) => left.seed - right.seed);
  }

  private toMirroredMatches(
    sets: StartggSetNode[],
    source: StartggPhaseSeedSourceSummary,
    entrantSize: number,
  ): StartggMirroredMatch[] {
    const setMetadata = sets.map((set) => {
      const fullRoundText = set.fullRoundText?.trim() || set.identifier?.trim() || "Set";
      const bracketStage = this.toBracketStage(fullRoundText, source.phaseType);
      return {
        setId: String(set.id),
        fullRoundText,
        bracketStage,
        roundValue: Number(set.round ?? 0),
        identifier: set.identifier?.trim() || "",
      };
    });
    const setDisplayRefs = new Map<string, {
      bracketStage: MatchBracketStage;
      roundNumber: number;
      matchNumber: number;
    }>();

    for (const stage of ["POOLS", "WINNERS", "LOSERS", "FINALS"] as const) {
      const stageSets = setMetadata.filter((item) => item.bracketStage === stage);
      const roundEntries = [...new Map(
        stageSets.map((item) => [
          item.fullRoundText,
          {
            fullRoundText: item.fullRoundText,
            roundValue: item.roundValue,
          },
        ]),
      ).values()].sort((left, right) => this.compareStageRounds(stage, left, right));

      roundEntries.forEach((entry, index) => {
        const roundNumber = index + 1;
        stageSets
          .filter((item) => item.fullRoundText === entry.fullRoundText)
          .sort((left, right) => this.compareStageMatchOrder(left, right))
          .forEach((item, matchIndex) => {
            setDisplayRefs.set(item.setId, {
              bracketStage: item.bracketStage,
              roundNumber,
              matchNumber: matchIndex + 1,
            });
          });
      });
    }

    return sets.map((set) => {
      const fullRoundText = set.fullRoundText?.trim() || set.identifier?.trim() || "Set";
      const setDisplayRef = setDisplayRefs.get(String(set.id));
      const bracketStage = setDisplayRef?.bracketStage ?? this.toBracketStage(fullRoundText, source.phaseType);
      const roundNumber = setDisplayRef?.roundNumber ?? 1;
      const matchNumber = setDisplayRef?.matchNumber ?? 1;
      const bestOf = this.normalizeBestOf(Number(set.totalGames ?? 0));

      const slots: StartggMirroredMatch["slots"] = (set.slots ?? []).slice(0, 2).map((slot, index) => {
        const displayName = this.toEntrantDisplayName(slot.entrant)
          || this.toPendingSlotDisplayName(slot, index + 1, setDisplayRefs, source.phaseType);
        const score = slot.standing?.placement === 1 ? 1 : 0;
        return {
          slot: index + 1,
          entrantId: slot.entrant?.id != null ? String(slot.entrant.id) : undefined,
          displayName,
          score,
          prereqId: slot.prereqId?.trim() || undefined,
          prereqPlacement: slot.prereqPlacement ?? undefined,
          prereqType: slot.prereqType?.trim() || undefined,
        };
      });
      while (slots.length < 2) {
        slots.push({
          slot: slots.length + 1,
          displayName: "Qualifier pending",
          score: 0,
        });
      }

      const gameWinnerEntrantIds = (set.games ?? [])
        .map((game) => game.winnerId != null ? String(game.winnerId) : undefined)
        .filter((winnerId): winnerId is string => Boolean(winnerId));
      const standingWinnerEntrantId = this.resolveWinnerFromStandings(slots);
      const gameCharacterSelections = (set.games ?? []).map((game, index) => ({
        gameNum: index + 1,
        selections: (game.selections ?? [])
          .map((selection) => {
            if (selection.entrant?.id == null || selection.character?.id == null) {
              return undefined;
            }
            return {
              entrantId: String(selection.entrant.id),
              characterId: selection.character.id,
              characterName: selection.character.name?.trim() || "Unknown character",
            };
          })
          .filter((selection): selection is NonNullable<typeof selection> => selection !== undefined),
      }));
      const entrant1Id = slots[0]?.entrantId;
      const entrant2Id = slots[1]?.entrantId;
      if (gameWinnerEntrantIds.length > 0) {
        if (slots[0]) {
          slots[0].score = entrant1Id ? gameWinnerEntrantIds.filter((winnerId) => winnerId === entrant1Id).length : 0;
        }
        if (slots[1]) {
          slots[1].score = entrant2Id ? gameWinnerEntrantIds.filter((winnerId) => winnerId === entrant2Id).length : 0;
        }
      }
      const winsRequired = Math.ceil(bestOf / 2);
      const winnerEntrantId = gameWinnerEntrantIds.length > 0
        ? this.resolveWinnerFromGameScores(slots, winsRequired) ?? standingWinnerEntrantId
        : standingWinnerEntrantId;
      const status = winnerEntrantId
        ? "COMPLETED"
        : slots.some((slot) => slot.entrantId)
          ? "PENDING"
          : "PENDING";

      return {
        setId: String(set.id),
        identifier: set.identifier?.trim() || "",
        stream: streamInfo(set.stream),
        hasPlaceholder: Boolean(set.hasPlaceholder),
        isPoolPhase: source.isPoolPhase,
        phaseId: source.phaseId,
        phaseGroupId: source.phaseGroupId,
        phaseName: source.phaseName,
        phaseOrder: source.phaseOrder,
        phaseGroupName: source.phaseGroupName,
        phaseType: source.phaseType,
        entrantSize,
        fullRoundText,
        bracketStage,
        roundNumber,
        matchNumber,
        status,
        bestOf,
        winnerEntrantId,
        entrantIds: slots.map((slot) => slot.entrantId).filter((item): item is string => Boolean(item)),
        gameWinnerEntrantIds,
        gameCharacterSelections,
        slots,
      };
    });
  }

  private compareStageRounds(
    stage: MatchBracketStage,
    left: { fullRoundText: string; roundValue: number },
    right: { fullRoundText: string; roundValue: number },
  ): number {
    if (stage === "LOSERS") {
      if (left.roundValue !== right.roundValue) {
        return right.roundValue - left.roundValue;
      }
    } else {
      if (left.roundValue !== right.roundValue) {
        return left.roundValue - right.roundValue;
      }
    }

    if (stage === "FINALS") {
      const priorityDiff = this.finalRoundPriority(left.fullRoundText) - this.finalRoundPriority(right.fullRoundText);
      if (priorityDiff !== 0) {
        return priorityDiff;
      }
    }

    return left.fullRoundText.localeCompare(right.fullRoundText);
  }

  private compareStageMatchOrder(
    left: { identifier: string; setId: string },
    right: { identifier: string; setId: string },
  ): number {
    const identifierDiff = left.identifier.localeCompare(right.identifier, undefined, { numeric: true, sensitivity: "base" });
    if (identifierDiff !== 0) {
      return identifierDiff;
    }
    return left.setId.localeCompare(right.setId, undefined, { numeric: true, sensitivity: "base" });
  }

  private finalRoundPriority(fullRoundText: string): number {
    const normalized = fullRoundText.trim().toLowerCase();
    if (normalized.includes("grand final reset") || normalized.includes("true final")) {
      return 2;
    }
    if (normalized.includes("grand final")) {
      return 1;
    }
    return 0;
  }

  private resolveWinnerFromGameScores(
    slots: StartggMirroredMatch["slots"],
    winsRequired: number,
  ): string | undefined {
    const sortedSlots = [...slots]
      .filter((slot) => slot.entrantId)
      .sort((left, right) => right.score - left.score);
    const leader = sortedSlots[0];
    const runnerUp = sortedSlots[1];
    if (!leader?.entrantId) {
      return undefined;
    }
    if (leader.score < winsRequired) {
      return undefined;
    }
    if ((runnerUp?.score ?? 0) >= leader.score) {
      return undefined;
    }
    return leader.entrantId;
  }

  private resolveWinnerFromStandings(slots: StartggMirroredMatch["slots"]): string | undefined {
    const standingWinners = slots.filter((slot) => slot.entrantId && slot.score > 0);
    return standingWinners.length === 1
      ? standingWinners[0]?.entrantId
      : undefined;
  }

  private toPendingSlotDisplayName(
    slot: NonNullable<StartggSetNode["slots"]>[number],
    fallbackSlot: number,
    setDisplayRefs: Map<string, {
      bracketStage: MatchBracketStage;
      roundNumber: number;
      matchNumber: number;
    }>,
    phaseType?: string,
  ): string {
    const prereqType = slot.prereqType?.trim().toLowerCase();
    const prereqId = slot.prereqId?.trim();
    if (prereqType === "seed") {
      return "Qualified by seeding";
    }
    if (prereqType && prereqType !== "set") {
      return "Qualifier pending";
    }
    if (!prereqId) {
      return fallbackSlot === 1 ? "Qualifier pending" : "Qualifier pending";
    }

    const source = setDisplayRefs.get(prereqId);
    if (!source) {
      return "Qualifier pending";
    }

    if (this.isRoundRobinPhaseType(phaseType)) {
      const prereqPlacement = Number(slot.prereqPlacement ?? 0);
      return prereqPlacement > 0 ? `Qualified ${prereqPlacement}` : "Qualifier pending";
    }

    const stagePrefix = source.bracketStage === "LOSERS"
      ? "L"
      : source.bracketStage === "POOLS"
        ? "P"
      : source.bracketStage === "FINALS"
        ? "F"
        : "W";
    const sourceLabel = `${stagePrefix}${source.roundNumber}M${source.matchNumber}`;
    const prereqPlacement = Number(slot.prereqPlacement ?? 0);
    if (prereqPlacement === 1) {
      return `Winner ${sourceLabel}`;
    }
    if (prereqPlacement === 2) {
      return `Loser ${sourceLabel}`;
    }
    if (prereqPlacement > 0) {
      return `Qualified ${prereqPlacement} ${sourceLabel}`;
    }
    return "Qualifier pending";
  }

  private normalizePendingSlotDisplayNames(matches: StartggMirroredMatch[]): StartggMirroredMatch[] {
    const globalSetDisplayRefs = new Map<string, {
      bracketStage: MatchBracketStage;
      roundNumber: number;
      matchNumber: number;
    }>();

    matches.forEach((match) => {
      globalSetDisplayRefs.set(match.setId, {
        bracketStage: match.bracketStage,
        roundNumber: match.roundNumber,
        matchNumber: match.matchNumber,
      });
    });

    return matches.map((match) => ({
      ...match,
      slots: match.slots.map((slot) => {
        if (slot.entrantId) {
          return slot;
        }
        const prereqType = slot.prereqType?.trim().toLowerCase();
        if (prereqType === "seed") {
          return {
            ...slot,
            displayName: "Qualified by seeding",
          };
        }
        if (prereqType && prereqType !== "set") {
          return {
            ...slot,
            displayName: "Qualifier pending",
          };
        }
        const prereqId = slot.prereqId?.trim();
        if (!prereqId) {
          return {
            ...slot,
            displayName: "Qualifier pending",
          };
        }
        const source = globalSetDisplayRefs.get(prereqId);
        if (!source) {
          return {
            ...slot,
            displayName: "Qualifier pending",
          };
        }
        if (this.isRoundRobinPhaseType(match.phaseType)) {
          const prereqPlacement = Number(slot.prereqPlacement ?? 0);
          return {
            ...slot,
            displayName: prereqPlacement > 0 ? `Qualified ${prereqPlacement}` : "Qualifier pending",
          };
        }
        const stagePrefix = source.bracketStage === "LOSERS"
          ? "L"
          : source.bracketStage === "POOLS"
            ? "P"
            : source.bracketStage === "FINALS"
              ? "F"
              : "W";
        const sourceLabel = `${stagePrefix}${source.roundNumber}M${source.matchNumber}`;
        const prereqPlacement = Number(slot.prereqPlacement ?? 0);
        if (prereqPlacement === 1) {
          return {
            ...slot,
            displayName: `Winner ${sourceLabel}`,
          };
        }
        if (prereqPlacement === 2) {
          return {
            ...slot,
            displayName: `Loser ${sourceLabel}`,
          };
        }
        if (prereqPlacement > 0) {
          return {
            ...slot,
            displayName: `Qualified ${prereqPlacement} ${sourceLabel}`,
          };
        }
        return {
          ...slot,
          displayName: "Qualifier pending",
        };
      }),
    }));
  }

  private async simplifyHiddenSetDependencies(matches: StartggMirroredMatch[]): Promise<StartggMirroredMatch[]> {
    const visibleSetIds = new Set(matches.map((match) => match.setId));
    const hiddenSetCache = new Map<string, StartggSetNode | undefined>();

    const fetchHiddenSet = async (setId: string): Promise<StartggSetNode | undefined> => {
      if (hiddenSetCache.has(setId)) {
        return hiddenSetCache.get(setId);
      }
      const hiddenSet = await this.fetchSetById(setId);
      hiddenSetCache.set(setId, hiddenSet);
      return hiddenSet;
    };

    const simplifyReference = async (
      prereqId: string,
      prereqPlacement: number | undefined,
      seen = new Set<string>(),
    ): Promise<SimplifiedSetReference | undefined> => {
      const cacheKey = `${prereqId}:${prereqPlacement ?? 0}`;
      if (seen.has(cacheKey)) {
        return undefined;
      }
      if (visibleSetIds.has(prereqId)) {
        return {
          kind: "set",
          prereqId,
          prereqPlacement,
        };
      }

      seen.add(cacheKey);
      const hiddenSet = await fetchHiddenSet(prereqId);
      if (!hiddenSet) {
        return undefined;
      }

      const slots = (hiddenSet.slots ?? []).slice(0, 2);
      const slotReferences = slots.map((slot) => {
        if (slot.entrant?.id != null) {
          return {
            kind: "entrant" as const,
            entrantId: String(slot.entrant.id),
            displayName: this.toEntrantDisplayName(slot.entrant) || "Qualifier pending",
          };
        }
        const slotPrereqType = slot.prereqType?.trim().toLowerCase();
        const slotPrereqId = slot.prereqId?.trim();
        if (slotPrereqType === "bye") {
          return { kind: "bye" as const };
        }
        if (slotPrereqType === "seed") {
          return { kind: "seed" as const, prereqId: slotPrereqId };
        }
        if (slotPrereqType === "set" && slotPrereqId) {
          return {
            kind: "set" as const,
            prereqId: slotPrereqId,
            prereqPlacement: slot.prereqPlacement ?? undefined,
          };
        }
        return undefined;
      });

      const nonByeReferences = slotReferences.filter((reference) => reference?.kind !== "bye");
      if (prereqPlacement === 1 && nonByeReferences.length === 1) {
        const onlyReference = nonByeReferences[0];
        if (!onlyReference) {
          return undefined;
        }
        if (onlyReference.kind === "set") {
          return simplifyReference(onlyReference.prereqId, onlyReference.prereqPlacement, seen);
        }
        return onlyReference;
      }

      if (prereqPlacement === 2 && nonByeReferences.length === 1) {
        return { kind: "bye" };
      }

      return {
        kind: "set",
        prereqId,
        prereqPlacement,
      };
    };

    return Promise.all(matches.map(async (match) => ({
      ...match,
      slots: await Promise.all(match.slots.map(async (slot) => {
        if (slot.entrantId || slot.prereqType?.trim().toLowerCase() !== "set" || !slot.prereqId) {
          return slot;
        }
        const simplified = await simplifyReference(
          slot.prereqId,
          slot.prereqPlacement,
        );
        if (!simplified) {
          return slot;
        }
        if (simplified.kind === "entrant") {
          return {
            ...slot,
            entrantId: simplified.entrantId,
            displayName: simplified.displayName,
            prereqId: undefined,
            prereqPlacement: undefined,
            prereqType: undefined,
          };
        }
        if (simplified.kind === "set") {
          return {
            ...slot,
            prereqId: simplified.prereqId,
            prereqPlacement: simplified.prereqPlacement,
            prereqType: "set",
          };
        }
        if (simplified.kind === "seed") {
          return {
            ...slot,
            prereqId: simplified.prereqId,
            prereqPlacement: undefined,
            prereqType: "seed",
            displayName: "Qualified by seeding",
          };
        }
        return {
          ...slot,
          displayName: "Qualifier pending",
        };
      })),
    })));
  }

  private toBracketStage(fullRoundText: string, phaseType?: string): MatchBracketStage {
    if (phaseType?.toUpperCase() === "ROUND_ROBIN") {
      return "POOLS";
    }
    const normalized = fullRoundText.toLowerCase();
    if (normalized.includes("losers")) {
      return "LOSERS";
    }
    if (normalized.includes("grand final") || normalized.includes("true final") || normalized === "final") {
      return "FINALS";
    }
    return "WINNERS";
  }

  private toEntrantDisplayName(
    entrant:
      | {
          name?: string | null;
          participants?: Array<{
            gamerTag?: string | null;
          }> | null;
        }
      | null
      | undefined,
  ): string {
    if (!entrant) {
      return "";
    }
    const playerNames = (entrant.participants ?? [])
      .map((participant) => participant.gamerTag?.trim() || "")
      .filter(Boolean);
    if (playerNames.length > 1) {
      return playerNames.join(" / ");
    }
    return playerNames[0]
      || entrant.name?.trim()
      || "";
  }

  private async graphql<T>(
    query: string,
    variables: Record<string, unknown> = {},
    operationName?: string,
  ): Promise<T> {
    // Retry this read/page, keeping previously downloaded pages. Mutations use
    // graphqlWithActionRecords and must not be replayed by this retry loop.
    for (let attempt = 0; ; attempt += 1) {
      await this.waitForRequestSlot();
      let retryable = false;
      let retryAfter: string | null = null;
      let rateLimited = false;
      try {
        const response = await fetch(STARTGG_API_URL, {
          method: "POST",
          signal: AbortSignal.timeout(StartggClient.REQUEST_TIMEOUT_MS),
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${this.apiToken}`,
          },
          body: JSON.stringify({ query, operationName, variables }),
        });
        retryAfter = response.headers.get("retry-after");
        if (!response.ok) {
          rateLimited = response.status === 429;
          retryable = rateLimited || response.status === 408 || response.status >= 500;
          await response.body?.cancel();
          throw new Error(`start.gg request failed with status ${response.status}`);
        }
        const payload = await response.json() as { data?: T; errors?: StartggGraphQLError[] };
        if (payload.errors?.length) {
          const message = payload.errors.map((error) => error.message).filter(Boolean).join("; ");
          rateLimited = /rate.?limit|too many requests/i.test(message);
          retryable = rateLimited;
          throw new Error(message || "start.gg returned an error");
        }
        if (!payload.data) throw new Error("start.gg returned an empty response");
        return payload.data;
      } catch (error) {
        retryable ||= error instanceof TypeError || (error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name));
        if (!retryable) throw error;
        const seconds = retryAfter === null ? NaN : Number(retryAfter);
        const headerDelay = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(retryAfter ?? "") - Date.now();
        const backoff = Math.min(60000, (rateLimited ? 10000 : 2000) * 2 ** attempt);
        const delay = Number.isFinite(headerDelay) ? Math.max(backoff, headerDelay) : backoff;
        await this.emitProgress({ stage: "WAITING", message: "Waiting for the start.gg rate limit; the import will resume automatically" });
        // All queries share the cooldown so concurrent imports cannot bypass it.
        this.requestsBlockedUntil = Math.max(this.requestsBlockedUntil, Date.now() + delay);
        if (attempt + 1 >= StartggClient.READ_ATTEMPTS) throw error;
      }
    }
  }

  private async graphqlWithActionRecords<T>(
    query: string,
    variables: Record<string, unknown> = {},
    operationName?: string,
  ): Promise<{ data: T; actionRecords?: Record<string, unknown> }> {
    await this.waitForRequestSlot();
    const response = await fetch(STARTGG_API_URL, {
      method: "POST",
      signal: AbortSignal.timeout(StartggClient.REQUEST_TIMEOUT_MS),
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.apiToken}`,
      },
      body: JSON.stringify({
        query,
        operationName,
        variables,
      }),
    });

    if (!response.ok) {
      throw new Error(`start.gg request failed with status ${response.status}`);
    }

    const payload = await response.json() as { data?: T; errors?: StartggGraphQLError[]; actionRecords?: Record<string, unknown> };
    if (payload.errors?.length) {
      const message = payload.errors.map((error) => error.message).filter(Boolean).join("; ");
      throw new Error(message || "start.gg returned an error");
    }
    if (!payload.data) {
      throw new Error("start.gg returned an empty response");
    }
    return {
      data: payload.data,
      actionRecords: payload.actionRecords,
    };
  }

  private extractUpdatedSetIds(actionRecords: Record<string, unknown> | undefined): string[] {
    const update = actionRecords?.["update"];
    if (!update || typeof update !== "object") {
      return [];
    }
    const sets = (update as Record<string, unknown>)["sets"];
    if (!Array.isArray(sets)) {
      return [];
    }
    return sets
      .map((value) => value == null ? undefined : String(value))
      .filter((value): value is string => Boolean(value));
  }

  private ensureConfigured() {
    if (!this.isConfigured()) {
      throw new Error("STARTGG_API_TOKEN is not configured in the backend");
    }
  }

  private async waitForRequestSlot(): Promise<void> {
    const slot = this.requestGate.then(async () => {
      for (;;) {
        const waitMs = Math.max(this.lastRequestAt + StartggClient.REQUEST_SPACING_MS, this.requestsBlockedUntil) - Date.now();
        if (waitMs <= 0) break;
        if (this.requestsBlockedUntil > Date.now() && this.importProgress.getStore()?.notify) await this.emitProgress({ stage: "WAITING", message: "Waiting for the start.gg rate limit; the import will resume automatically" });
        await new Promise((resolve) => setTimeout(resolve, waitMs));
      }
      const previousProgress = this.importProgress.getStore()?.last;
      if (previousProgress) await this.emitProgress(previousProgress);
      this.lastRequestAt = Date.now();
    });
    this.requestGate = slot.catch(() => undefined);
    await slot;
  }

  private collectPhaseSeedSources(event: NonNullable<StartggEventBasicsResponse["event"]>): StartggPhaseSeedSourceSummary[] {
    return (event.phases ?? [])
      .flatMap((phase) => {
        const normalizedBracketType = this.normalizePhaseBracketType(phase.bracketType);
        const phaseOrder = Number(phase.phaseOrder ?? 0);
        const groupCount = phase.phaseGroups?.nodes?.length ?? 0;
        const hasLaterPhase = (event.phases ?? []).some((candidate) =>
          Number(candidate.phaseOrder ?? 0) > phaseOrder,
        );
        const isPoolPhase = normalizedBracketType === "ROUND_ROBIN"
          || (groupCount > 1 && hasLaterPhase);
        const results: StartggPhaseSeedSourceSummary[] = [];
        if ((phase.phaseGroups?.nodes?.length ?? 0) === 0) {
          const phaseSeedCount = Number(phase.seeds?.pageInfo?.total ?? 0);
          results.push({
            phaseId: String(phase.id),
            phaseName: phase.name?.trim() || `Phase ${phase.id}`,
            phaseOrder,
            phaseType: phase.bracketType?.trim() || normalizedBracketType,
            isPoolPhase,
            bracketType: normalizedBracketType,
            seedCount: phaseSeedCount,
          });
        }
        for (const group of phase.phaseGroups?.nodes ?? []) {
          const groupSeedCount = Number(group.seeds?.pageInfo?.total ?? 0);
          results.push({
            phaseId: String(phase.id),
            phaseGroupId: String(group.id),
            phaseName: phase.name?.trim() || `Phase ${phase.id}`,
            phaseOrder,
            phaseType: phase.bracketType?.trim() || normalizedBracketType,
            isPoolPhase,
            bracketType: this.normalizePhaseBracketType(group.bracketType ?? phase.bracketType),
            phaseGroupName: group.displayIdentifier?.trim()
              ? isPoolPhase
                ? phase.bracketType === "ROUND_ROBIN"
                  ? `Pool ${group.displayIdentifier.trim()}`
                  : `Group ${group.displayIdentifier.trim()}`
                : undefined
              : undefined,
            seedCount: groupSeedCount,
          });
        }
        return results;
      })
      .sort((left, right) => {
        if (left.phaseOrder !== right.phaseOrder) {
          return left.phaseOrder - right.phaseOrder;
        }
        if (left.bracketType === "ROUND_ROBIN" && right.bracketType !== "ROUND_ROBIN") {
          return -1;
        }
        if (left.bracketType !== "ROUND_ROBIN" && right.bracketType === "ROUND_ROBIN") {
          return 1;
        }
        if (right.seedCount !== left.seedCount) {
          return right.seedCount - left.seedCount;
        }
        if (!left.phaseGroupId && right.phaseGroupId) {
          return -1;
        }
        if (left.phaseGroupId && !right.phaseGroupId) {
          return 1;
        }
        return 0;
      });
  }

  private pickPrimarySource(sources: StartggPhaseSeedSourceSummary[]): StartggPhaseSeedSourceSummary {
    return [...sources]
      .sort((left, right) => {
        const leftPriority = left.bracketType === "DOUBLE_ELIMINATION" ? 3 : left.bracketType === "SINGLE_ELIMINATION" ? 2 : 1;
        const rightPriority = right.bracketType === "DOUBLE_ELIMINATION" ? 3 : right.bracketType === "SINGLE_ELIMINATION" ? 2 : 1;
        if (rightPriority !== leftPriority) {
          return rightPriority - leftPriority;
        }
        if (right.phaseOrder !== left.phaseOrder) {
          return right.phaseOrder - left.phaseOrder;
        }
        return right.seedCount - left.seedCount;
      })[0]!;
  }

  private toImportedFormat(sources: StartggPhaseSeedSourceSummary[]): StartggImportPreview["format"] {
    const hasPools = sources.some((source) => source.bracketType === "ROUND_ROBIN");
    const hasDoubleElimination = sources.some((source) => source.bracketType === "DOUBLE_ELIMINATION");
    const hasSingleElimination = sources.some((source) => source.bracketType === "SINGLE_ELIMINATION");
    if (hasPools && (hasDoubleElimination || hasSingleElimination)) {
      return "GROUPS_PLAYOFF";
    }
    if (hasPools) {
      return "ROUND_ROBIN";
    }
    if (hasDoubleElimination) {
      return "DOUBLE_ELIMINATION";
    }
    return "SINGLE_ELIMINATION";
  }

  private normalizePhaseBracketType(bracketType?: string | null): StartggPhaseSeedSourceSummary["bracketType"] {
    if (bracketType === "ROUND_ROBIN") {
      return "ROUND_ROBIN";
    }
    if (bracketType === "DOUBLE_ELIMINATION") {
      return "DOUBLE_ELIMINATION";
    }
    return "SINGLE_ELIMINATION";
  }

  private isRoundRobinPhaseType(phaseType?: string | null): boolean {
    return phaseType?.trim().toUpperCase() === "ROUND_ROBIN";
  }

  private normalizeBestOf(totalGames: number): number {
    if (totalGames <= 1) return 1;
    if (totalGames === 2) return 3;
    if (totalGames % 2 === 0) return totalGames + 1;
    return totalGames;
  }

  private composeImportedEventName(tournamentName: string | undefined, eventName: string): string {
    const normalizedTournamentName = tournamentName?.trim() || "";
    const normalizedEventName = eventName.trim();
    if (!normalizedTournamentName) {
      return normalizedEventName;
    }
    if (!normalizedEventName || normalizedTournamentName.localeCompare(normalizedEventName, undefined, { sensitivity: "base" }) === 0) {
      return normalizedTournamentName;
    }
    return `${normalizedTournamentName} - ${normalizedEventName}`;
  }

  private pickBestOf(values: number[], fallback: number): number {
    if (values.length === 0) return fallback;
    const counts = new Map<number, number>();
    values.forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1));
    return [...counts.entries()]
      .sort((left, right) => {
        if (right[1] !== left[1]) return right[1] - left[1];
        return right[0] - left[0];
      })[0]?.[0] ?? fallback;
  }
}

export interface StartggSyncClient {
  getSetState(setId: string): Promise<StartggRemoteSetState>;
  isConfigured(): boolean;
  previewEventImport(eventUrl: string): Promise<StartggImportPreview>;
  importEventSnapshot(
    eventUrl: string,
    options?: { includeGameDetails?: boolean; onProgress?: ImportProgressListener },
  ): Promise<StartggImportedBracket>;
  resolveSetReference(match: StartggSetReferenceResolutionInput): Promise<{
    setId: string;
    hasPlaceholder: boolean;
  } | undefined>;
  resolveSetReferencesFromUpdatedIds(
    match: StartggSetReferenceResolutionInput,
    updatedSetIds: string[],
  ): Promise<StartggMirroredMatch[]>;
  importMatchesForSources(
    sources: StartggMirroredSourceRef[],
    options?: { includeGameDetails?: boolean; onProgress?: ImportProgressListener },
  ): Promise<StartggMirroredMatch[]>;
  reportMatchResult(
    setId: string,
    winnerEntrantId: string,
    gameData?: Array<{
      winnerId: string;
      gameNum: number;
      entrant1Score: number;
      entrant2Score: number;
      selections?: Array<{
        entrantId: string;
        characterId: number;
      }>;
    }>,
    isDQ?: boolean,
  ): Promise<StartggMutationSyncResult>;
  markSetCalled(setId: string): Promise<StartggMutationSyncResult>;
  markSetInProgress(setId: string): Promise<StartggMutationSyncResult>;
  resetSet(setId: string, resetDependentSets?: boolean): Promise<StartggMutationSyncResult>;
}

export class NoopStartggClient implements StartggSyncClient {
  async getSetState(_setId: string): Promise<StartggRemoteSetState> { throw new Error("STARTGG_API_TOKEN is not configured"); }
  isConfigured(): boolean {
    return false;
  }

  async previewEventImport(_eventUrl: string): Promise<StartggImportPreview> {
    throw new Error("STARTGG_API_TOKEN is not configured in the backend");
  }

  async importEventSnapshot(
    _eventUrl: string,
    _options?: { includeGameDetails?: boolean; onProgress?: ImportProgressListener },
  ): Promise<StartggImportedBracket> {
    throw new Error("STARTGG_API_TOKEN is not configured in the backend");
  }

  async resolveSetReference(
    _match: StartggSetReferenceResolutionInput,
  ): Promise<{
    setId: string;
    hasPlaceholder: boolean;
  } | undefined> {
    throw new Error("STARTGG_API_TOKEN is not configured in the backend");
  }

  async resolveSetReferencesFromUpdatedIds(
    _match: StartggSetReferenceResolutionInput,
    _updatedSetIds: string[],
  ): Promise<StartggMirroredMatch[]> {
    throw new Error("STARTGG_API_TOKEN is not configured in the backend");
  }

  async importMatchesForSources(
    _sources: StartggMirroredSourceRef[],
    _options?: { includeGameDetails?: boolean; onProgress?: ImportProgressListener },
  ): Promise<StartggMirroredMatch[]> {
    throw new Error("STARTGG_API_TOKEN is not configured in the backend");
  }

  async reportMatchResult(
    _setId: string,
    _winnerEntrantId: string,
    _gameData?: Array<{
      winnerId: string;
      gameNum: number;
      entrant1Score: number;
      entrant2Score: number;
      selections?: Array<{
        entrantId: string;
        characterId: number;
      }>;
    }>,
    _isDQ?: boolean,
  ): Promise<StartggMutationSyncResult> {
    throw new Error("STARTGG_API_TOKEN is not configured in the backend");
  }

  async markSetCalled(_setId: string): Promise<StartggMutationSyncResult> {
    throw new Error("STARTGG_API_TOKEN is not configured in the backend");
  }

  async markSetInProgress(_setId: string): Promise<StartggMutationSyncResult> {
    throw new Error("STARTGG_API_TOKEN is not configured in the backend");
  }

  async resetSet(_setId: string, _resetDependentSets?: boolean): Promise<StartggMutationSyncResult> {
    throw new Error("STARTGG_API_TOKEN is not configured in the backend");
  }
}

export function parseStartggEventSlug(eventUrl: string): string {
  const normalized = eventUrl.trim();
  let url: URL;
  try {
    url = new URL(normalized);
  } catch {
    throw new Error("Invalid start.gg event URL");
  }

  if (!/(\.|^)start\.gg$/i.test(url.hostname)) {
    throw new Error("URL must belong to start.gg");
  }

  const segments = url.pathname.split("/").filter(Boolean);
  const tournamentIndex = segments.indexOf("tournament");
  const eventIndex = segments.indexOf("event");
  if (tournamentIndex === -1 || eventIndex === -1 || eventIndex <= tournamentIndex || eventIndex + 1 >= segments.length) {
    throw new Error("The URL must point to a start.gg event");
  }

  return segments.slice(tournamentIndex, eventIndex + 2).join("/");
}
