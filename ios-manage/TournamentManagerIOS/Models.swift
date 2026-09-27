import Foundation

struct TeamMemberMeta: Decodable { let captain: Bool?; let gameId: String?; let preferredRole: String? }

struct TeamMember: Decodable, Identifiable {
    let id: String
    let nickname: String
    let teamId: String?
    let role: String
    let revision: Int
    let meta: TeamMemberMeta?
}
struct RosterTeam: Decodable, Identifiable {
    let id: String
    let name: String
    let code: String
    let members: [TeamMember]
    let checkedIn: Bool?
    let complete: Bool?
}
struct TeamRoster: Decodable {
    let teamSize: Int
    let reserveCount: Int
    let allowSoloRegistration: Bool
    let canEdit: Bool
    let teams: [RosterTeam]
    let unassigned: [TeamMember]
}
struct TeamRosterAction: Encodable {
    let action: String
    var name: String? = nil
    var nickname: String? = nil
    var id: String? = nil
    var revision: Int? = nil
    var teamId: String? = nil
    var role: String? = nil
    var enabled: Bool? = nil
    var members: [[String: String]]? = nil
    enum CodingKeys: String, CodingKey { case action, name, nickname, id, revision, teamId, role, enabled, members }
    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(action, forKey: .action)
        try c.encodeIfPresent(name, forKey: .name)
        try c.encodeIfPresent(nickname, forKey: .nickname)
        try c.encodeIfPresent(id, forKey: .id)
        try c.encodeIfPresent(revision, forKey: .revision)
        if action == "ADD_MEMBER" || action == "MOVE_MEMBER" { try c.encode(teamId, forKey: .teamId) }
        try c.encodeIfPresent(role, forKey: .role)
        try c.encodeIfPresent(enabled, forKey: .enabled)
        try c.encodeIfPresent(members, forKey: .members)
    }
}

enum ManagementThemeMode: String, Codable, CaseIterable, Identifiable {
    case system
    case light
    case dark

    var id: String { rawValue }
    var title: String { self == .system ? "System" : self == .light ? "Light" : "Dark" }
}

enum ManagementBracketRenderMode: String, CaseIterable, Identifiable {
    case classic
    case modern

    var id: String { rawValue }
    var title: String { self == .classic ? "Classic" : "Modern" }
}

struct TournamentImportSource: Codable {
    let provider: String
    let eventUrl: String?
    let entrantSize: Int?
    let hasPools: Bool?
}

struct StartggImportJob: Codable {
    var progress: ImportProgress? = nil
    let state: String
    let eventUrl: String
    let error: String?
}

struct TournamentSettings: Codable {
    var fortniteLobbySize: Int? = nil
    var fortniteGamesPerRound: Int? = nil
    var teamSize: Int? = nil
    var reserveCount: Int? = nil
    var allowSoloRegistration: Bool? = nil
    var displayEnabled: Bool? = nil
    var registrationEnabled: Bool? = nil
    var registrationUrl: String? = nil
    var importJob: StartggImportJob? = nil
    let format: String
    let bracketMode: String?
    let mkartAdvanceCount: Int?
    let mkartLosersAdvanceCount: Int?
    let setupCount: Int?
    var streamCount: Int? = nil
    let playAreaName: String?
    let bestOf: Int
    let winnersBestOf: Int?
    let losersBestOf: Int?
    let hasThirdPlaceMatch: Bool
    let checkInRequired: Bool
    let allowRematchReview: Bool
    let seedingMethod: String
    let autoCallMatches: Bool
    let callTimeoutMinutes: Int
    let autoDisqualifyAfterMinutes: Int?
    let manualSeedingLocked: Bool
    let playerMatchReportingEnabled: Bool?
}

struct TournamentListItem: Codable, Identifiable {
    let id: String
    let title: String
    let gameTitle: String
    let description: String
    let platform: String
    let status: String
    let maxParticipants: Int
    let settings: TournamentSettings
    let importSource: TournamentImportSource?

    var setupCount: Int { max(1, settings.setupCount ?? 1) }
    var streamCount: Int { min(2, max(0, settings.streamCount ?? 0)) }
    var playAreaName: String? { settings.playAreaName?.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty }
    var callTimeoutMinutes: Int { max(1, settings.callTimeoutMinutes) }
    var isStartggMirrored: Bool { importSource?.provider == "START_GG" || settings.importJob != nil }
    var importEventUrl: String? { importSource?.eventUrl ?? settings.importJob?.eventUrl }
    var statusLabel: String {
        if status == "ARCHIVED" { return "Archived · read-only" }
        if settings.importJob?.state == "RUNNING" { return "Importing" }
        if settings.importJob?.state == "FAILED" { return "Import error" }
        return ["DRAFT": "Draft", "PUBLISHED": "Published", "CHECK_IN": "Attendance confirmation",
                "READY": "Ready to start", "IN_PROGRESS": "In progress", "COMPLETED": "Finished", "ARCHIVED": "Archived · read-only",
                "CANCELLED": "Cancelled"][status] ?? status
    }
    var nextStepHint: String? {
        if status == "READY" {
            return settings.bracketMode == "FORTNITE" ? "Open the Fortnite panel to start games and enter scores." : "The bracket is ready. Select Start tournament to begin."
        }
        if status == "IN_PROGRESS" {
            return settings.bracketMode == "FORTNITE" ? "Confirm score sheets and close the final in the Fortnite panel. You can then create the Top 8 image." : "The tournament finishes when all required matches are resolved. You can then create the Top 8 image."
        }
        return nil
    }
    var playerMatchReportingEnabledResolved: Bool { settings.playerMatchReportingEnabled ?? true }
}

struct TournamentParticipant: Codable, Identifiable {
    let id: String
    let displayName: String
    let seed: Int?
    let checkedIn: Bool
    let status: String
}

struct MatchParticipant: Codable, Identifiable {
    var id: String { participantId }
    let participantId: String
    let displayName: String
    let slot: Int
    let score: Int
}

struct MatchCall: Codable {
    let calledAt: String
    let calledByUserId: String
    let stationLabel: String?
    let startedAt: String?
    let startedByUserId: String?
}

struct MatchExternalRef: Codable {
    var entrantSize: Int? = nil
    var fullRoundText: String? = nil
    let phaseId: String?
    let phaseGroupId: String?
    let phaseName: String?
    let phaseGroupName: String?
    let phaseType: String?
    let phaseOrder: Int?
    let identifier: String?
    let hasPlaceholder: Bool?
    let isPoolPhase: Bool?
}

struct MatchCharacterSelection: Codable, Hashable {
    let participantId: String
    let characterId: Int
    let characterName: String
}

struct MatchGameCharacterSelections: Codable, Hashable {
    let gameNum: Int
    let selections: [MatchCharacterSelection]
}

struct Match: Codable, Identifiable {
    var operationRevision: String? = nil
    var syncStatus: MatchSyncStatus? = nil
    var displayIdentifier: String? = nil
    var displayLabel: String? = nil
    var startggStreamLabel: String? = nil
    var roundLabel: String? = nil
    let id: String
    let bracketStage: String
    let roundNumber: Int
    let matchNumber: Int
    let status: String
    let bestOf: Int
    let reportedBestOf: Int?
    let advancersRequired: Int
    let advancingParticipantIds: [String]?
    let participants: [MatchParticipant]
    let characterSelections: [MatchCharacterSelection]?
    let gameResults: [String]?
    let gameCharacterSelections: [MatchGameCharacterSelections]?
    let winnerParticipantId: String?
    let call: MatchCall?
    let externalRef: MatchExternalRef?

    var label: String { displayLabel ?? "Round \(roundNumber) · Set \(matchNumber)" }
    var participantsLabel: String {
        participants
            .sorted { $0.slot < $1.slot }
            .map { "\($0.displayName) \($0.score)" }
            .joined(separator: " - ")
    }
    var stationLabel: String? { call?.stationLabel }
    var calledAt: String? { call?.calledAt }
    var startedAt: String? { call?.startedAt }
    var participantIds: [String] { participants.sorted { $0.slot < $1.slot }.map(\.participantId) }
    var participantNames: [String] { participants.sorted { $0.slot < $1.slot }.map(\.displayName) }
    var isActiveForOperations: Bool { ["PENDING", "CALLED", "CHECKED_IN", "PLAYING", "RESULT_REPORTED", "UNDER_REVIEW"].contains(status) }
    var isCompletedLike: Bool { ["COMPLETED", "WALKOVER"].contains(status) }
    var effectiveBestOf: Int { reportedBestOf ?? bestOf }
    var isPoolPhaseMatch: Bool { externalRef?.isPoolPhase == true || bracketStage == "POOLS" }
    var isRoundRobinPhaseMatch: Bool { externalRef?.phaseType?.uppercased() == "ROUND_ROBIN" }
    var isGrandFinalReset: Bool { bracketStage == "FINALS" && roundNumber > 1 }
    var poolLabel: String? {
        guard isPoolPhaseMatch else { return nil }
        return externalRef?.phaseGroupName?.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty
            ?? externalRef?.phaseName?.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty
    }
    var poolAwareLabel: String { poolLabel.map { "\($0) · \(label)" } ?? label }
}

extension String {
    var nilIfEmpty: String? {
        isEmpty ? nil : self
    }
}

struct LadderSession: Codable {
    var options: LadderControlOptions? = nil
    let id: String
    let tournamentId: String
    let status: String
    let createdAt: String
    let startedAt: String
    let completedAt: String?
}

struct LadderQueueEntry: Codable, Identifiable {
    var waitingReason: String? = nil
    let id: String
    let participantId: String
    let displayName: String
    let queuedAt: String
}

struct LadderMatch: Codable, Identifiable {
    var stationLabel: String? = nil
    var details: LadderControlDetails? = nil
    let id: String
    let status: String
    let bestOf: Int
    let participants: [MatchParticipant]
    let readyDeadlineAt: String?
    let participantOneReadyAt: String?
    let participantTwoReadyAt: String?
    let winnerParticipantId: String?
    let gameResults: [String]?
    let characterSelections: [MatchCharacterSelection]?
    let gameCharacterSelections: [MatchGameCharacterSelections]?
    let startedAt: String?
    let completedAt: String?

    var label: String { "Ladder Bo\(bestOf)" }
    var participantsLabel: String { participants.sorted { $0.slot < $1.slot }.map(\.displayName).joined(separator: " vs ") }
}

struct LadderStanding: Codable, Identifiable {
    var rating: Int? = nil
    var eligible: Bool? = nil
    var winRate: Int? = nil
    var id: String { participantId }
    let participantId: String
    let displayName: String
    let matchesPlayed: Int
    let wins: Int
    let losses: Int
    let gamesWon: Int
    let gamesLost: Int
    let gameDifferential: Int
}

struct LadderOverview: Codable {
    var activity: [LadderControlEvent]? = nil
    let session: LadderSession?
    let queue: [LadderQueueEntry]
    let activeMatches: [LadderMatch]
    let completedMatches: [LadderMatch]
    let standings: [LadderStanding]
}

struct TournamentDetailResponse: Codable {
    let tournament: TournamentListItem
    let participants: [TournamentParticipant]
    let matches: [Match]
    let ladder: LadderOverview?
}

struct NotificationSettings: Codable {
    var telegramEnabled: Bool
    var whatsappEnabled: Bool
}

struct StartggPreviewParticipant: Codable, Identifiable {
    var id: String { "\(displayName)-\(seed)" }
    let displayName: String
    let seed: Int
}

struct StartggImportPreview: Codable {
    let eventId: String
    let eventName: String
    let eventSlug: String
    let eventUrl: String
    let gameTitle: String
    let entrantCount: Int
    let entrantSize: Int
    let hasPools: Bool
    let phaseGroupId: String?
    let format: String
    let bestOf: Int
    let winnersBestOf: Int
    let losersBestOf: Int
    let participants: [StartggPreviewParticipant]
}

struct CreateTournamentInput {
    var fortniteLobbySize = 20
    var fortniteGamesPerRound = 3
    var teamSize = 1
    var reserveCount = 0
    var allowSoloRegistration = false
    var title = ""
    var gameTitle = ""
    var description = ""
    var platform = ""
    var maxParticipants = 16
    var format = "SINGLE_ELIMINATION"
    var bracketMode = "STANDARD"
    var mkartAdvanceCount = 1
    var mkartLosersAdvanceCount = 1
    var bestOf = 3
    var winnersBestOf = 3
    var losersBestOf = 3
    var seedingMethod = "MANUAL"
    var callTimeoutMinutes = 10
    var setupCount = 1
    var streamCount = 0
    var playAreaName = ""
    var playerMatchReportingEnabled = true
}

struct CreateTournamentRequest: Encodable {
    let ownerId: String
    let title: String
    let gameTitle: String
    let description: String
    let platform: String
    let startsAt: String
    let maxParticipants: Int
    let isPublic: Bool
    let settings: TournamentSettings
}

struct StartggImportPreviewRequest: Encodable { let eventUrl: String }
struct StartggImportRequest: Encodable {
    let eventUrl: String
    let syncResults: Bool
    let preserveTournamentTitle: Bool
}

struct UpdateTournamentRequest: Encodable {
    let title: String
    let gameTitle: String
    let description: String
    let platform: String
    let maxParticipants: Int
    let settings: TournamentSettings
}

struct CreateParticipantRequest: Encodable {
    let displayName: String
    let seed: Int?
}

struct UpdateParticipantRequest: Encodable {
    let displayName: String
    let seed: Int?
    let checkedIn: Bool?
    let status: String?
    let clearSeed: Bool
}

struct CallMatchRequest: Encodable {
    let calledByUserId: String
    let stationLabel: String?
}

struct StartMatchRequest: Encodable { let startedByUserId: String }
struct RecordGameWinRequest: Encodable { let participantId: String }
struct SelectMarioKartAdvancerRequest: Encodable { let participantId: String }
struct ResolveAbsenceRequest: Encodable { let outcome: String }
struct MatchScoreRequest: Encodable { let participantId: String; let score: Int }
struct ReportResultRequest: Encodable { let winnerParticipantId: String; let scores: [MatchScoreRequest] }
struct UpdateMatchCharacterSelectionRequest: Encodable { let participantId: String; let characterName: String }
struct UpdateMatchCharactersRequest: Encodable { let selections: [UpdateMatchCharacterSelectionRequest] }
struct DetailedReportSelectionRequest: Encodable { let participantId: String; let characterName: String }
struct DetailedReportGameRequest: Encodable {
    var expectedRevision: String? = nil
    enum CodingKeys: String, CodingKey { case winnerParticipantId, selections }
    let winnerParticipantId: String
    let selections: [DetailedReportSelectionRequest]?
}
struct DetailedReportRequest: Encodable {
    var expectedRevision: String? = nil
    let bestOfOverride: Int?
    let games: [DetailedReportGameRequest]
}
struct UpdateNotificationSettingsRequest: Encodable { let telegramEnabled: Bool; let whatsappEnabled: Bool }
struct LadderActionRequest: Encodable {
    let startedByUserId: String?
    let completedByUserId: String?
}

struct TournamentSetupStatus: Identifiable {
    let id: String
    let label: String
    let occupyingMatchLabel: String?
    let occupyingParticipants: String?
}

func normalizeSetupLabel(_ raw: String?) -> String? {
    let normalized = (raw ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
    guard !normalized.isEmpty else { return nil }
    let digits = normalized.filter(\.isNumber)
    if normalized.lowercased().hasPrefix("stream"), let number = Int(digits) { return "Stream \(number)" }
    if let number = Int(digits) {
        return "Setup \(number)"
    }
    return normalized
}

func buildTournamentSetups(detail: TournamentDetailResponse) -> [TournamentSetupStatus] {
    let count = max(1, detail.tournament.setupCount)
    let occupied = Dictionary(uniqueKeysWithValues: detail.matches.compactMap { match -> (String, TournamentSetupStatus)? in
        guard let setup = normalizeSetupLabel(match.stationLabel), isSetupOccupying(match) else { return nil }
        return (
            setup,
            TournamentSetupStatus(
                id: setup,
                label: setup,
                occupyingMatchLabel: match.poolAwareLabel,
                occupyingParticipants: match.participantsLabel
            )
        )
    })
    let labels = (1...count).map { "Setup \($0)" } + (0..<detail.tournament.streamCount).map { "Stream \($0 + 1)" }
    return labels.map { label in
        return occupied[label] ?? TournamentSetupStatus(id: label, label: label, occupyingMatchLabel: nil, occupyingParticipants: nil)
    }
}

func availableSetups(for detail: TournamentDetailResponse, matchId: String?) -> [String] {
    let occupied = Set(detail.matches.compactMap { match -> String? in
        guard match.id != matchId, isSetupOccupying(match) else { return nil }
        return normalizeSetupLabel(match.stationLabel)
    })
    return buildTournamentSetups(detail: detail).map(\.label).filter { !occupied.contains($0) }
}

func isSetupOccupying(_ match: Match) -> Bool {
    guard normalizeSetupLabel(match.stationLabel) != nil else { return false }
    return ["CALLED", "CHECKED_IN", "PLAYING", "RESULT_REPORTED", "UNDER_REVIEW"].contains(match.status)
}

func isPlaceholderParticipantId(_ participantId: String) -> Bool {
    participantId.hasPrefix("winner_of_")
        || participantId.hasPrefix("loser_of_")
        || participantId.hasPrefix("advance_")
        || participantId.hasPrefix("drop_")
}

func hasResolvedContenders(_ match: Match) -> Bool {
    match.participantIds.count >= 2
        && match.participantNames.count >= 2
        && match.participantIds.allSatisfy { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !isPlaceholderParticipantId($0) }
}

func matchStageLabel(_ stage: String) -> String? {
    switch stage.trimmingCharacters(in: .whitespacesAndNewlines).uppercased() {
    case "POOLS": return "Pools"
    case "WINNERS": return "Bracket Winners"
    case "LOSERS": return "Bracket Losers"
    case "FINALS": return "Bracket Finals"
    case "LADDER": return "Internal ladder"
    default: return nil
    }
}

func latestCharacterForParticipant(_ match: Match, participantId: String) -> String? {
    guard !participantId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return nil }
    if let latestFromGames = match.gameCharacterSelections?
        .sorted(by: { $0.gameNum > $1.gameNum })
        .compactMap({ game in
            game.selections.last(where: { $0.participantId == participantId })?.characterName
        })
        .first(where: { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }) {
        return latestFromGames
    }

    return match.characterSelections?
        .last(where: { $0.participantId == participantId })?
        .characterName
}

func isWalkoverLoser(_ match: Match, participantId: String, isAdvanced: Bool = false) -> Bool {
    match.status == "WALKOVER"
        && !participantId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        && participantId != match.winnerParticipantId
        && !isAdvanced
}

func activeMatchPriority(_ match: Match) -> Int {
    switch match.status {
    case "PLAYING": return 0
    case "CALLED": return 1
    case "CHECKED_IN": return 2
    case "PENDING": return 3
    default: return 4
    }
}

func parseIsoMillis(_ value: String?) -> Int64? {
    guard let value, !value.isEmpty else { return nil }
    return parsePlayerDate(value).map { Int64($0.timeIntervalSince1970 * 1000) }
}

func activeMatchTimelineAnchor(_ match: Match) -> Int64? {
    parseIsoMillis(match.startedAt) ?? parseIsoMillis(match.calledAt)
}

func calledCountdownSeconds(match: Match, callTimeoutMinutes: Int, referenceDate: Date = ManagementServerClock.shared.now()) -> Int? {
    guard match.status == "CALLED",
          let calledAt = parsePlayerDate(match.calledAt) else {
        return nil
    }
    let timeout = TimeInterval(max(1, callTimeoutMinutes) * 60)
    return max(0, Int((calledAt.addingTimeInterval(timeout)).timeIntervalSince(referenceDate)))
}

func playingElapsedSeconds(match: Match, referenceDate: Date = ManagementServerClock.shared.now()) -> Int? {
    guard match.status == "PLAYING",
          let startedAt = parsePlayerDate(match.startedAt ?? match.calledAt) else {
        return nil
    }
    return max(0, Int(referenceDate.timeIntervalSince(startedAt)))
}

func formatMatchTimer(_ seconds: Int) -> String {
    let minutes = seconds / 60
    let remainingSeconds = seconds % 60
    return String(format: "%02d:%02d", minutes, remainingSeconds)
}

func parsePlayerDate(_ value: String?) -> Date? {
    guard let value, !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return nil }
    let fractional = ISO8601DateFormatter()
    fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    if let parsed = fractional.date(from: value) {
        return parsed
    }
    let fallback = ISO8601DateFormatter()
    fallback.formatOptions = [.withInternetDateTime]
    return fallback.date(from: value)
}

func isDormantGrandFinalReset(allMatches: [Match], match: Match) -> Bool {
    guard match.isGrandFinalReset else { return false }

    let hasActivity =
        match.isCompletedLike
        || match.calledAt != nil
        || match.startedAt != nil
        || match.winnerParticipantId != nil
        || !(match.advancingParticipantIds ?? []).isEmpty
        || !(match.gameResults ?? []).isEmpty
        || !(match.characterSelections ?? []).isEmpty
        || !(match.gameCharacterSelections ?? []).isEmpty
        || match.participants.contains(where: { $0.score > 0 })
    if hasActivity {
        return false
    }

    guard let grandFinal = allMatches.first(where: {
        $0.bracketStage == "FINALS" && $0.roundNumber == 1 && $0.matchNumber == match.matchNumber
    }) else {
        return true
    }
    guard let grandFinalWinnerId = grandFinal.winnerParticipantId, !grandFinalWinnerId.isEmpty else {
        return true
    }
    guard let losersSideParticipantId = grandFinal.participantIds.dropFirst().first, !losersSideParticipantId.isEmpty else {
        return true
    }

    return grandFinalWinnerId != losersSideParticipantId
}

func joinedCharacterSelections(_ selections: [MatchCharacterSelection]) -> [String: String] {
    Dictionary(grouping: selections, by: \.participantId).mapValues { $0.map(\.characterName).joined(separator: " / ") }
}

struct ImportProgress: Codable {
    let stage: String
    let message: String
    let completed: Int?
    let total: Int?
    var label: String { if let completed, let total { return "\(message) (\(completed)/\(total))" }; return message }
}
struct MatchSyncStatus: Codable {
    let state: String
    let message: String
    let error: String?
    let canRetry: Bool?
}
struct ActivityEntry: Decodable, Identifiable {
    let matchLabel: String?
    let id: String
    let createdAt: String
    let matchId: String?
    let summary: String
    let detail: String
}
struct TournamentActivity: Decodable {
    let entries: [ActivityEntry]
    let diagnosticText: String
}

struct TournamentReviewData: Decodable {
    let editable: Bool
    let participants: [TournamentReviewParticipant]
    let title: String
    let phase: String
    let checkedAt: String
    let items: [TournamentReviewItem]
    let standings: [TournamentReviewStanding]
    let standingsNote: String
}
struct TournamentReviewItem: Decodable, Identifiable {
    let id: String
    let title: String
    let detail: String
    let level: String
    let target: String
    let actionLabel: String
}
struct TournamentReviewStanding: Decodable {
    let name: String
    let placement: Int?
}

struct TournamentReviewParticipant: Decodable, Identifiable { let id: String; let name: String; let checkedIn: Bool; let status: String }
