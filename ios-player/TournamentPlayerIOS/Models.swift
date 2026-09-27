import Foundation

struct PlayerSession: Codable, Equatable {
    let sessionToken: String
    let displayName: String
    let gamerTag: String
}

struct PlayerProfile: Codable {
    let displayName: String
    let gamerTag: String
    let provider: String
}

struct PlayerTournamentListResponse: Codable {
    let tournaments: [PlayerTournament]
}

struct PlayerTournament: Codable, Identifiable, Equatable {
    var id: String { tournamentId }
    let callTimeoutMinutes: Int
    let tournamentId: String
    let title: String
    let gameTitle: String
    let status: String
    let startsAt: String
    let myParticipantId: String
    let myDisplayName: String
    let pendingMatches: [PlayerMatch]
    let activeMatches: [PlayerMatch]
    let completedMatches: [PlayerMatch]
    let bracketMatches: [PlayerBracketMatch]
    let ladder: PlayerLadder?

    enum CodingKeys: String, CodingKey {
        case callTimeoutMinutes
        case tournamentId
        case title
        case gameTitle
        case status
        case startsAt
        case myParticipantId
        case myDisplayName
        case pendingMatches
        case activeMatches
        case completedMatches
        case bracketMatches
        case ladder
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        callTimeoutMinutes = try container.decodeIfPresent(Int.self, forKey: .callTimeoutMinutes) ?? 10
        tournamentId = try container.decode(String.self, forKey: .tournamentId)
        title = try container.decode(String.self, forKey: .title)
        gameTitle = try container.decode(String.self, forKey: .gameTitle)
        status = try container.decode(String.self, forKey: .status)
        startsAt = try container.decode(String.self, forKey: .startsAt)
        myParticipantId = try container.decode(String.self, forKey: .myParticipantId)
        myDisplayName = try container.decode(String.self, forKey: .myDisplayName)
        pendingMatches = try container.decodeIfPresent([PlayerMatch].self, forKey: .pendingMatches) ?? []
        activeMatches = try container.decodeIfPresent([PlayerMatch].self, forKey: .activeMatches) ?? []
        completedMatches = try container.decodeIfPresent([PlayerMatch].self, forKey: .completedMatches) ?? []
        bracketMatches = try container.decodeIfPresent([PlayerBracketMatch].self, forKey: .bracketMatches) ?? []
        ladder = try container.decodeIfPresent(PlayerLadder.self, forKey: .ladder)
    }
}

struct PlayerBracketMatchParticipant: Codable, Equatable, Identifiable {
    var id: String { participantId + ":\(slot)" }
    let participantId: String
    let displayName: String
    let slot: Int
    let score: Int
}

struct PlayerBracketMatch: Codable, Equatable, Identifiable {
    let displayIdentifier: String?
    let startggStreamLabel: String?
    let id: String
    let tournamentId: String
    let bracketStage: String
    let roundNumber: Int
    let matchNumber: Int
    let label: String
    let status: String
    let bestOf: Int
    let reportedBestOf: Int?
    let advancersRequired: Int
    let participants: [PlayerBracketMatchParticipant]
    let advancingParticipantIds: [String]
    let winnerParticipantId: String?
    let stationLabel: String?
    let calledAt: String?
    let startedAt: String?
    let callTimeoutSeconds: Int?
    let characterSelections: [PlayerMatchCharacterSelection]?
    let gameCharacterSelections: [PlayerGameCharacterSelections]?
    let gameResults: [String]?
    let phaseId: String?
    let phaseName: String?
    let phaseOrder: Int?
    let phaseGroupId: String?
    let phaseGroupName: String?
    let phaseType: String?
    let isPoolPhase: Bool
    let fullRoundText: String?

    var effectiveBestOf: Int { reportedBestOf ?? bestOf }
    var participantIds: [String] { participants.sorted { $0.slot < $1.slot }.map(\.participantId) }
    var participantNames: [String] { participants.sorted { $0.slot < $1.slot }.map(\.displayName) }
    var isRoundRobinPhaseMatch: Bool { phaseType?.uppercased() == "ROUND_ROBIN" }
    var isGrandFinalReset: Bool { bracketStage == "FINALS" && roundNumber > 1 }
    var poolLabel: String? {
        guard isPoolPhase else { return nil }
        return phaseGroupName?.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty
            ?? phaseName?.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty
    }

    enum CodingKeys: String, CodingKey {
        case displayIdentifier
        case startggStreamLabel
        case id
        case tournamentId
        case bracketStage
        case roundNumber
        case matchNumber
        case label
        case status
        case bestOf
        case reportedBestOf
        case advancersRequired
        case participants
        case advancingParticipantIds
        case winnerParticipantId
        case stationLabel
        case calledAt
        case startedAt
        case callTimeoutSeconds
        case characterSelections
        case gameCharacterSelections
        case gameResults
        case phaseId
        case phaseName
        case phaseOrder
        case phaseGroupId
        case phaseGroupName
        case phaseType
        case isPoolPhase
        case fullRoundText
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        displayIdentifier = try container.decodeIfPresent(String.self, forKey: .displayIdentifier)
        startggStreamLabel = try container.decodeIfPresent(String.self, forKey: .startggStreamLabel)
        id = try container.decode(String.self, forKey: .id)
        tournamentId = try container.decode(String.self, forKey: .tournamentId)
        bracketStage = try container.decode(String.self, forKey: .bracketStage)
        roundNumber = try container.decode(Int.self, forKey: .roundNumber)
        matchNumber = try container.decode(Int.self, forKey: .matchNumber)
        label = try container.decode(String.self, forKey: .label)
        status = try container.decode(String.self, forKey: .status)
        bestOf = try container.decode(Int.self, forKey: .bestOf)
        reportedBestOf = try container.decodeIfPresent(Int.self, forKey: .reportedBestOf)
        advancersRequired = try container.decode(Int.self, forKey: .advancersRequired)
        participants = try container.decodeIfPresent([PlayerBracketMatchParticipant].self, forKey: .participants) ?? []
        advancingParticipantIds = try container.decodeIfPresent([String].self, forKey: .advancingParticipantIds) ?? []
        winnerParticipantId = try container.decodeIfPresent(String.self, forKey: .winnerParticipantId)
        stationLabel = try container.decodeIfPresent(String.self, forKey: .stationLabel)
        calledAt = try container.decodeIfPresent(String.self, forKey: .calledAt)
        startedAt = try container.decodeIfPresent(String.self, forKey: .startedAt)
        callTimeoutSeconds = try container.decodeIfPresent(Int.self, forKey: .callTimeoutSeconds)
        characterSelections = try container.decodeIfPresent([PlayerMatchCharacterSelection].self, forKey: .characterSelections)
        gameCharacterSelections = try container.decodeIfPresent([PlayerGameCharacterSelections].self, forKey: .gameCharacterSelections)
        gameResults = try container.decodeIfPresent([String].self, forKey: .gameResults)
        phaseId = try container.decodeIfPresent(String.self, forKey: .phaseId)
        phaseName = try container.decodeIfPresent(String.self, forKey: .phaseName)
        phaseOrder = try container.decodeIfPresent(Int.self, forKey: .phaseOrder)
        phaseGroupId = try container.decodeIfPresent(String.self, forKey: .phaseGroupId)
        phaseGroupName = try container.decodeIfPresent(String.self, forKey: .phaseGroupName)
        phaseType = try container.decodeIfPresent(String.self, forKey: .phaseType)
        isPoolPhase = try container.decodeIfPresent(Bool.self, forKey: .isPoolPhase) ?? false
        fullRoundText = try container.decodeIfPresent(String.self, forKey: .fullRoundText)
    }
}

struct PlayerMatch: Codable, Identifiable, Equatable {
    let ladderRevision: String?
    let canReviewLadderResult: Bool?
    let ladderMessage: String?
    let entrantSize: Int
    let gameTitle: String
    let id: String
    let tournamentId: String
    let tournamentTitle: String
    let tournamentStatus: String
    let startsAt: String
    let roundLabel: String
    let bracketStage: String
    let status: String
    let bestOf: Int
    let reportedBestOf: Int?
    let stationLabel: String?
    let calledAt: String?
    let startedAt: String?
    let callTimeoutSeconds: Int?
    let readyDeadlineAt: String?
    let participantOneReadyAt: String?
    let participantTwoReadyAt: String?
    let myParticipantId: String
    let mySlot: Int
    let myDisplayName: String
    let myScore: Int
    let opponentParticipantId: String?
    let opponentSlot: Int?
    let opponentDisplayName: String?
    let opponentScore: Int?
    let winnerParticipantId: String?
    let canPlayerReportMatch: Bool
    let canReportCharacters: Bool
    let characterSelections: [PlayerMatchCharacterSelection]?
    let gameCharacterSelections: [PlayerGameCharacterSelections]?
    let gameResults: [String]?

    enum CodingKeys: String, CodingKey {
        case ladderRevision, canReviewLadderResult, ladderMessage
        case entrantSize
        case gameTitle
        case id
        case tournamentId
        case tournamentTitle
        case tournamentStatus
        case startsAt
        case roundLabel
        case bracketStage
        case status
        case bestOf
        case reportedBestOf
        case stationLabel
        case calledAt
        case startedAt
        case callTimeoutSeconds
        case readyDeadlineAt
        case participantOneReadyAt
        case participantTwoReadyAt
        case myParticipantId
        case mySlot
        case myDisplayName
        case myScore
        case opponentParticipantId
        case opponentSlot
        case opponentDisplayName
        case opponentScore
        case winnerParticipantId
        case canPlayerReportMatch
        case canReportCharacters
        case characterSelections
        case gameCharacterSelections
        case gameResults
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        ladderRevision = try container.decodeIfPresent(String.self, forKey: .ladderRevision)
        canReviewLadderResult = try container.decodeIfPresent(Bool.self, forKey: .canReviewLadderResult)
        ladderMessage = try container.decodeIfPresent(String.self, forKey: .ladderMessage)
        entrantSize = try container.decodeIfPresent(Int.self, forKey: .entrantSize) ?? 1
        gameTitle = try container.decodeIfPresent(String.self, forKey: .gameTitle) ?? ""
        id = try container.decode(String.self, forKey: .id)
        tournamentId = try container.decode(String.self, forKey: .tournamentId)
        tournamentTitle = try container.decode(String.self, forKey: .tournamentTitle)
        tournamentStatus = try container.decode(String.self, forKey: .tournamentStatus)
        startsAt = try container.decode(String.self, forKey: .startsAt)
        roundLabel = try container.decode(String.self, forKey: .roundLabel)
        bracketStage = try container.decode(String.self, forKey: .bracketStage)
        status = try container.decode(String.self, forKey: .status)
        bestOf = try container.decode(Int.self, forKey: .bestOf)
        reportedBestOf = try container.decodeIfPresent(Int.self, forKey: .reportedBestOf)
        stationLabel = try container.decodeIfPresent(String.self, forKey: .stationLabel)
        calledAt = try container.decodeIfPresent(String.self, forKey: .calledAt)
        startedAt = try container.decodeIfPresent(String.self, forKey: .startedAt)
        callTimeoutSeconds = try container.decodeIfPresent(Int.self, forKey: .callTimeoutSeconds)
        readyDeadlineAt = try container.decodeIfPresent(String.self, forKey: .readyDeadlineAt)
        participantOneReadyAt = try container.decodeIfPresent(String.self, forKey: .participantOneReadyAt)
        participantTwoReadyAt = try container.decodeIfPresent(String.self, forKey: .participantTwoReadyAt)
        myParticipantId = try container.decode(String.self, forKey: .myParticipantId)
        mySlot = try container.decode(Int.self, forKey: .mySlot)
        myDisplayName = try container.decode(String.self, forKey: .myDisplayName)
        myScore = try container.decode(Int.self, forKey: .myScore)
        opponentParticipantId = try container.decodeIfPresent(String.self, forKey: .opponentParticipantId)
        opponentSlot = try container.decodeIfPresent(Int.self, forKey: .opponentSlot)
        opponentDisplayName = try container.decodeIfPresent(String.self, forKey: .opponentDisplayName)
        opponentScore = try container.decodeIfPresent(Int.self, forKey: .opponentScore)
        winnerParticipantId = try container.decodeIfPresent(String.self, forKey: .winnerParticipantId)
        canPlayerReportMatch = try container.decodeIfPresent(Bool.self, forKey: .canPlayerReportMatch) ?? true
        canReportCharacters = try container.decodeIfPresent(Bool.self, forKey: .canReportCharacters) ?? true
        characterSelections = try container.decodeIfPresent([PlayerMatchCharacterSelection].self, forKey: .characterSelections)
        gameCharacterSelections = try container.decodeIfPresent([PlayerGameCharacterSelections].self, forKey: .gameCharacterSelections)
        gameResults = try container.decodeIfPresent([String].self, forKey: .gameResults)
    }

    var effectiveBestOf: Int { reportedBestOf ?? bestOf }
}

struct PlayerMatchCharacterSelection: Codable, Equatable {
    let participantId: String
    let characterId: Int
    let characterName: String
}

struct PlayerGameCharacterSelections: Codable, Equatable {
    let gameNum: Int
    let selections: [PlayerMatchCharacterSelection]
}

struct PlayerLadder: Codable, Equatable {
    let options: PlayerLadderOptions?
    let waitingReason: String?
    let queuePosition: Int?
    let canJoin: Bool?
    let status: String
    let queuedAt: String?
    let readyCheckMatch: PlayerMatch?
    let activeMatch: PlayerMatch?
    let history: [PlayerMatch]
    let standings: [PlayerLadderStanding]
}

struct PlayerLadderStanding: Codable, Equatable, Identifiable {
    let rating: Int?
    let eligible: Bool?
    let winRate: Int?
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

struct PlayerStartggAuthStartRequest: Codable {
    let redirectUri: String
}

struct PlayerStartggAuthStartResponse: Codable {
    let authorizationUrl: String
}

struct PlayerDetailedReportSelection: Codable, Equatable {
    let participantId: String
    let characterName: String
}

struct PlayerDetailedReportGame: Codable, Equatable {
    let winnerParticipantId: String
    let selections: [PlayerDetailedReportSelection]?
}

struct PlayerDetailedReportRequest: Codable {
    let bestOfOverride: Int?
    let games: [PlayerDetailedReportGame]
}

struct PlayerLadderActionRequest: Codable {}

struct QuickReportGame: Identifiable, Equatable {
    let id = UUID()
    var winnerParticipantId: String
    var selections: [String: String]
}

func latestCharacterForParticipant(_ match: PlayerMatch, participantId: String?) -> String {
    guard let participantId, !participantId.isEmpty else { return "" }
    if let latestPerGame = match.gameCharacterSelections?
        .sorted(by: { $0.gameNum > $1.gameNum })
        .compactMap({ game in
            game.selections.filter { $0.participantId == participantId }.map(\.characterName).joined(separator: " / ")
        })
        .first(where: { !$0.isEmpty }) {
        return latestPerGame
    }
    return (match.characterSelections ?? []).filter { $0.participantId == participantId }.map(\.characterName).joined(separator: " / ")
}

func latestCharacterForParticipant(_ match: PlayerBracketMatch, participantId: String?) -> String {
    guard let participantId, !participantId.isEmpty else { return "" }
    if let latestPerGame = match.gameCharacterSelections?
        .sorted(by: { $0.gameNum > $1.gameNum })
        .compactMap({ game in
            game.selections.filter { $0.participantId == participantId }.map(\.characterName).joined(separator: " / ")
        })
        .first(where: { !$0.isEmpty }) {
        return latestPerGame
    }
    return (match.characterSelections ?? []).filter { $0.participantId == participantId }.map(\.characterName).joined(separator: " / ")
}

func playerMatchScoreLabel(_ match: PlayerMatch, participantId: String?, score: Int?) -> String {
    if match.status.trimmingCharacters(in: .whitespacesAndNewlines).uppercased() == "WALKOVER",
       let participantId,
       let winnerParticipantId = match.winnerParticipantId,
       participantId != winnerParticipantId {
        return "DQ"
    }
    return String(score ?? 0)
}

func playerBracketScoreLabel(_ match: PlayerBracketMatch, participantId: String?, score: Int?) -> String {
    if match.status.trimmingCharacters(in: .whitespacesAndNewlines).uppercased() == "WALKOVER",
       let participantId,
       let winnerParticipantId = match.winnerParticipantId,
       participantId != winnerParticipantId {
        return "DQ"
    }
    return String(score ?? 0)
}

func activePlayerMatchPriority(_ match: PlayerMatch) -> Int {
    switch match.status.trimmingCharacters(in: .whitespacesAndNewlines).uppercased() {
    case "PLAYING":
        return 0
    case "READY_CHECK":
        return 1
    case "CALLED":
        return 2
    case "CHECKED_IN":
        return 3
    default:
        return 4
    }
}

func parsePlayerIsoDate(_ value: String?) -> Date? {
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

func activePlayerMatchTimelineAnchor(_ match: PlayerMatch) -> TimeInterval {
    let anchor: Date?
    switch match.status.trimmingCharacters(in: .whitespacesAndNewlines).uppercased() {
    case "PLAYING":
        anchor = parsePlayerIsoDate(match.startedAt)
    case "CALLED":
        anchor = parsePlayerIsoDate(match.calledAt)
    case "READY_CHECK":
        anchor = parsePlayerIsoDate(match.readyDeadlineAt)
    default:
        anchor = nil
    }
    return anchor?.timeIntervalSince1970 ?? .greatestFiniteMagnitude
}

enum PlayerThemeMode: String, Codable, CaseIterable {
    case system, light, dark
    var title: String { switch self { case .system: return "System"; case .light: return "Light"; case .dark: return "Dark" } }
}

enum PlayerBracketRenderMode: String, CaseIterable, Identifiable {
    case classic
    case modern

    var id: String { rawValue }
    var title: String { self == .classic ? "Classic" : "Modern" }
}

private extension String {
    var nilIfEmpty: String? {
        isEmpty ? nil : self
    }
}

let smashUltimateCharacterNames: [String] = [
    "Bayonetta", "Bowser Jr.", "Bowser", "Captain Falcon", "Cloud", "Corrin", "Daisy",
    "Dark Pit", "Diddy Kong", "Donkey Kong", "Dr. Mario", "Duck Hunt", "Falco", "Fox",
    "Ganondorf", "Greninja", "Ice Climbers", "Ike", "Inkling", "Jigglypuff", "King Dedede",
    "Kirby", "Link", "Little Mac", "Lucario", "Lucas", "Lucina", "Luigi", "Mario", "Marth",
    "Mega Man", "Meta Knight", "Mewtwo", "Mii Brawler", "Ness", "Olimar", "Pac-Man",
    "Palutena", "Peach", "Pichu", "Pikachu", "Pit", "Pokemon Trainer", "Ridley", "R.O.B.",
    "Robin", "Rosalina", "Roy", "Ryu", "Samus", "Sheik", "Shulk", "Snake", "Sonic",
    "Toon Link", "Villager", "Wario", "Wii Fit Trainer", "Wolf", "Yoshi", "Young Link",
    "Zelda", "Zero Suit Samus", "Mr. Game & Watch", "Incineroar", "King K. Rool", "Dark Samus",
    "Chrom", "Ken", "Simon Belmont", "Richter", "Isabelle", "Mii Swordfighter", "Mii Gunner",
    "Piranha Plant", "Joker", "Hero", "Banjo-Kazooie", "Terry", "Byleth", "Random Character",
    "Min Min", "Steve", "Sephiroth", "Pyra & Mythra", "Kazuya", "Sora"
]

struct PlayerLadderSettings: Codable, Equatable { let mode: String; let bestOf: Int; let minimumSets: Int; let requireConfirmation: Bool }
struct PlayerLadderOptions: Codable, Equatable { let settings: PlayerLadderSettings; let paused: Bool?; let closing: Bool? }
struct PlayerLadderReview: Encodable { let action: String; let expectedRevision: String; let reason: String? }
