import Foundation
import SwiftUI
import Combine
import Security


struct ManagementUser: Codable { let id: String; let username: String; let role: String }
struct ManagementLogin: Codable { let token: String; let expiresAt: Double; let user: ManagementUser }
protocol ManagementSessionStorage {
    func read() throws -> Data?
    func write(_ data: Data) throws
    func clear() throws
}

struct KeychainManagementSessionStorage: ManagementSessionStorage {
    var service = (Bundle.main.bundleIdentifier ?? "com.example.tournamentmanager") + ".management.session.v1"
    var backend = BackendConfig.baseURL.absoluteString
    private var query: [String: Any] {
        [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service,
         kSecAttrAccount as String: backend, kSecAttrSynchronizable as String: false]
    }
    func read() throws -> Data? {
        var query = query
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess else { throw ManagementSessionStorageError.unavailable }
        return result as? Data
    }
    func write(_ data: Data) throws {
        let attributes: [String: Any] = [kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly]
        var status = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
        if status == errSecItemNotFound {
            status = SecItemAdd(query.merging(attributes) { _, new in new } as CFDictionary, nil)
        }
        guard status == errSecSuccess else { throw ManagementSessionStorageError.unavailable }
    }
    func clear() throws {
        let status = SecItemDelete(query as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else { throw ManagementSessionStorageError.unavailable }
    }
}

enum ManagementSessionStorageError: Error, LocalizedError {
    case unavailable
    var errorDescription: String? { "Could not save the session securely. Unlock your device and try again." }
}

@MainActor
final class ManagementAccount: ObservableObject {
    static let shared = ManagementAccount()
    @Published private(set) var session: ManagementLogin?
    private let storage: ManagementSessionStorage
    private var generation = 0
    private static func valid(_ session: ManagementLogin) -> Bool {
        session.token.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil &&
        session.expiresAt > Date().timeIntervalSince1970 * 1000 &&
        !session.user.id.isEmpty && !session.user.username.isEmpty && ["SUPER_ADMIN", "MANAGER"].contains(session.user.role)
    }
    init(storage: ManagementSessionStorage = KeychainManagementSessionStorage()) {
        self.storage = storage
        do {
            if let data = try storage.read() {
                if let saved = try? JSONDecoder().decode(ManagementLogin.self, from: data), Self.valid(saved) {
                    session = saved
                } else { try? storage.clear() }
            }
        } catch { /* A locked/unavailable keychain must not delete an otherwise valid session. */ }
    }
    var token: String { session?.token ?? "" }
    func login(username: String, password: String) async throws {
        generation += 1
        let attempt = generation
        let result: ManagementLogin = try await ManagementAPIClient().post("api/management-auth/login", adminKey: "", body: ["username": username.trimmingCharacters(in: .whitespacesAndNewlines), "password": password])
        guard attempt == generation else { return }
        guard Self.valid(result) else { throw ManagementAPIError.invalidResponse }
        try storage.write(JSONEncoder().encode(result))
        session = result
    }
    func invalidate(_ sentToken: String) {
        if !sentToken.isEmpty && token == sentToken {
            generation += 1
            session = nil
            try? storage.clear()
        }
    }
    func logout() async {
        let old = token
        generation += 1
        session = nil
        try? storage.clear()
        guard !old.isEmpty else { return }
        try? await ManagementAPIClient().postVoid("api/management-auth/logout", adminKey: old, body: [String:String]())
    }
}

enum ManagementSettingsStore {
    private static let themeKey = "gestor_torneos_manage_theme"

    static func loadTheme() -> ManagementThemeMode {
        guard let raw = UserDefaults.standard.string(forKey: themeKey),
              let mode = ManagementThemeMode(rawValue: raw) else { return .system }
        return mode
    }

    static func saveTheme(_ mode: ManagementThemeMode) {
        UserDefaults.standard.set(mode.rawValue, forKey: themeKey)
    }


}

enum ManagementAPIError: Error, LocalizedError {
    case invalidResponse
    case http(Int, String)

    var errorDescription: String? {
        switch self {
        case .invalidResponse:
            return "Invalid backend response."
        case let .http(code, message):
            return message.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "HTTP \(code)" : message
        }
    }
}

final class ManagementServerClock {
    static let shared = ManagementServerClock()

    private let lock = NSLock()
    private var offsetFromDeviceNow: TimeInterval = 0

    private init() {}

    func update(serverDate: Date, receivedAt deviceDate: Date = Date()) {
        lock.lock()
        offsetFromDeviceNow = serverDate.timeIntervalSince(deviceDate)
        lock.unlock()
    }

    func now() -> Date {
        lock.lock()
        let offset = offsetFromDeviceNow
        lock.unlock()
        return Date().addingTimeInterval(offset)
    }
}

final class ManagementOperationNetwork {
    static let shared = ManagementOperationNetwork()
    private let lock = NSLock()
    private var counter = 0
    private var revisions: [String: (Int, String)] = [:]
    private var failures: [String] = []
    var version: String { Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "desarrollo" }

    func begin() -> Int { lock.lock(); defer { lock.unlock() }; counter += 1; return counter }
    func revision(_ id: String?) -> String? { lock.lock(); defer { lock.unlock() }; return id.flatMap { revisions[$0]?.1 } }
    func remember(_ id: String, revision: String?, request: Int) {
        lock.lock(); defer { lock.unlock() }
        if let revision, request >= (revisions[id]?.0 ?? 0) { revisions[id] = (request, revision) }
    }
    func failure(_ message: String) {
        lock.lock(); defer { lock.unlock() }
        let safe = message
            .replacingOccurrences(of: "Bearer\\s+[^\\s,;\"']+", with: "Bearer [oculto]", options: [.regularExpression, .caseInsensitive])
            .replacingOccurrences(of: "https?://[^\\s\"']+", with: "[URL omitida]", options: [.regularExpression, .caseInsensitive])
            .replacingOccurrences(of: "((?:token|password|secret|authorization|api[_-]?key|x-app-key|x-admin-key)[\"']?\\s*[=:]\\s*[\"']?)[^\\s,;&\"']+", with: "$1[oculto]", options: [.regularExpression, .caseInsensitive])
        failures.append("\(ISO8601DateFormatter().string(from: Date())) \(safe.prefix(1000))")
        if failures.count > 30 { failures.removeFirst(failures.count - 30) }
    }
    func diagnostics() -> String {
        lock.lock(); defer { lock.unlock() }
        return "Client: iOS \(version)\nRecent client errors:\n" + failures.joined(separator: "\n")
    }
}

final class ManagementAPIClient {
    private let decoder = JSONDecoder()
    private let encoder = JSONEncoder()
    private let serverDateFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        formatter.dateFormat = "EEE',' dd MMM yyyy HH':'mm':'ss z"
        return formatter
    }()

    func get<T: Decodable>(_ path: String, adminKey: String? = nil, queryItems: [URLQueryItem] = []) async throws -> T {
        try await request(path: path, method: "GET", adminKey: adminKey, body: Optional<Int>.none, queryItems: queryItems)
    }

    func post<T: Decodable, Body: Encodable>(_ path: String, adminKey: String? = nil, queryItems: [URLQueryItem] = [], body: Body) async throws -> T {
        try await request(path: path, method: "POST", adminKey: adminKey, body: body, queryItems: queryItems)
    }

    func postVoid<Body: Encodable>(_ path: String, adminKey: String? = nil, body: Body) async throws {
        let _: EmptyResponse = try await request(path: path, method: "POST", adminKey: adminKey, body: body)
    }

    private func request<T: Decodable, Body: Encodable>(
        path: String,
        method: String,
        adminKey: String?,
        body: Body?,
        queryItems: [URLQueryItem] = []
    ) async throws -> T {
        guard var components = URLComponents(url: BackendConfig.baseURL.appendingPathComponent(path), resolvingAgainstBaseURL: false) else {
            throw ManagementAPIError.invalidResponse
        }
        if !queryItems.isEmpty { components.queryItems = queryItems }
        guard let url = components.url else { throw ManagementAPIError.invalidResponse }
        var request = URLRequest(url: url)
        let operations = ManagementOperationNetwork.shared
        let requestNumber = operations.begin()
        let segments = path.split(separator: "/").map(String.init)
        let matchIndex = segments.firstIndex(of: "matches")
        let matchId = matchIndex.flatMap { $0 + 1 < segments.count ? segments[$0 + 1] : nil }
        request.setValue("iOS", forHTTPHeaderField: "X-Client-Platform")
        request.setValue(operations.version, forHTTPHeaderField: "X-App-Version")
        if method != "GET" {
            request.setValue(UUID().uuidString, forHTTPHeaderField: "X-Operation-Id")
            request.setValue(operations.revision(matchId), forHTTPHeaderField: "X-Match-Revision")
        }
        request.httpMethod = method
        request.timeoutInterval = 180
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if !BackendConfig.appClientKey.isEmpty {
            request.setValue(BackendConfig.appClientKey, forHTTPHeaderField: "X-App-Key")
        }
        let managementToken = await MainActor.run { adminKey ?? ManagementAccount.shared.token }
        if !managementToken.isEmpty { request.setValue("Bearer " + managementToken, forHTTPHeaderField: "Authorization") }
        if let body {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try encoder.encode(body)
        }
        let data: Data
        let response: URLResponse
        do { (data, response) = try await URLSession.shared.data(for: request) }
        catch { operations.failure("\(method) match=\(matchId ?? "-"): \(error.localizedDescription)"); throw error }
        guard let http = response as? HTTPURLResponse else { throw ManagementAPIError.invalidResponse }
        if let matchId { operations.remember(matchId, revision: http.value(forHTTPHeaderField: "X-Match-Revision"), request: requestNumber) }
        if let dateHeader = http.value(forHTTPHeaderField: "Date"),
           let serverDate = serverDateFormatter.date(from: dateHeader) {
            ManagementServerClock.shared.update(serverDate: serverDate)
        }
        if http.statusCode == 401 && !managementToken.isEmpty {
            await MainActor.run { ManagementAccount.shared.invalidate(managementToken) }
        }
        guard (200...299).contains(http.statusCode) else {
            let message = (try? decoder.decode(ManagementErrorResponse.self, from: data))?.message
            operations.failure("\(method) match=\(matchId ?? "-") HTTP \(http.statusCode): \(message ?? "Server error")")
            throw ManagementAPIError.http(http.statusCode, message ?? String(data: data, encoding: .utf8) ?? "")
        }
        if T.self == EmptyResponse.self, data.isEmpty {
            return EmptyResponse() as! T
        }
        if data.isEmpty {
            throw ManagementAPIError.invalidResponse
        }
        return try decoder.decode(T.self, from: data)
    }
}

private struct EmptyResponse: Codable {}
private struct ManagementErrorResponse: Decodable { let message: String? }

final class TournamentManagementRepository {
    private let api = ManagementAPIClient()

    func updateAttendance(_ tournamentId: String, participant: TournamentReviewParticipant, checkedIn: Bool) async throws {
        let _: TournamentParticipant = try await api.post("api/tournaments/\(tournamentId)/participants/\(participant.id)/attendance",
            body: ["checkedIn": checkedIn])
    }
    func getReview(_ tournamentId: String) async throws -> TournamentReviewData {
        try await api.get("api/tournaments/\(tournamentId)/review")
    }

    func getActivity(_ tournamentId: String) async throws -> TournamentActivity {
        try await api.get("api/tournaments/\(tournamentId)/activity")
    }

    func retrySync(tournamentId: String, matchId: String) async throws {
        let _: [String: Bool] = try await api.post("api/tournaments/\(tournamentId)/matches/\(matchId)/retry-sync", body: [String: String]())
    }

    func getTournaments() async throws -> [TournamentListItem] {
        try await api.get("api/tournaments", queryItems: [URLQueryItem(name: "includeArchived", value: "true")])
    }

    func setArchived(tournamentId: String, archived: Bool) async throws -> TournamentListItem {
        try await api.post("api/tournaments/\(tournamentId)/archive", body: ["archived": archived])
    }

    func validateAdminDeleteKey(_ key: String) async throws {
        try await api.postVoid("api/tournaments/admin/validate-delete-key", adminKey: key, body: [String: String]())
    }

    func getNotificationSettings(adminKey: String) async throws -> NotificationSettings {
        try await api.get("api/admin/notification-settings", adminKey: adminKey)
    }

    func updateNotificationSettings(adminKey: String, telegramEnabled: Bool, whatsappEnabled: Bool) async throws -> NotificationSettings {
        try await api.post(
            "api/admin/notification-settings",
            adminKey: adminKey,
            body: UpdateNotificationSettingsRequest(telegramEnabled: telegramEnabled, whatsappEnabled: whatsappEnabled)
        )
    }

    func getTournament(_ tournamentId: String) async throws -> TournamentDetailResponse {
        let request = ManagementOperationNetwork.shared.begin()
        let detail: TournamentDetailResponse = try await api.get("api/tournaments/\(tournamentId)")
        detail.matches.forEach { ManagementOperationNetwork.shared.remember($0.id, revision: $0.operationRevision, request: request) }
        return detail
    }

    func createTournament(input: CreateTournamentInput) async throws -> TournamentListItem {
        let startsAt = ISO8601DateFormatter().string(from: Date().addingTimeInterval(86400))
        let settings = TournamentSettings(
            fortniteLobbySize: input.fortniteLobbySize, fortniteGamesPerRound: input.fortniteGamesPerRound,
            teamSize: input.teamSize, reserveCount: input.reserveCount, allowSoloRegistration: input.allowSoloRegistration,
            format: input.format,
            bracketMode: input.bracketMode,
            mkartAdvanceCount: input.mkartAdvanceCount,
            mkartLosersAdvanceCount: input.mkartLosersAdvanceCount,
            setupCount: input.setupCount,
            streamCount: input.streamCount,
            playAreaName: input.playAreaName.trimmingCharacters(in: .whitespacesAndNewlines),
            bestOf: input.bestOf,
            winnersBestOf: input.winnersBestOf,
            losersBestOf: input.losersBestOf,
            hasThirdPlaceMatch: false,
            checkInRequired: true,
            allowRematchReview: true,
            seedingMethod: input.seedingMethod,
            autoCallMatches: false,
            callTimeoutMinutes: input.callTimeoutMinutes,
            autoDisqualifyAfterMinutes: 15,
            manualSeedingLocked: false,
            playerMatchReportingEnabled: input.playerMatchReportingEnabled
        )
        let request = CreateTournamentRequest(
            ownerId: "user_admin",
            title: input.title,
            gameTitle: input.gameTitle,
            description: input.description,
            platform: input.platform,
            startsAt: startsAt,
            maxParticipants: input.maxParticipants,
            isPublic: true,
            settings: settings
        )
        return try await api.post("api/tournaments", body: request)
    }

    func previewStartggImport(eventURL: String) async throws -> StartggImportPreview {
        try await api.post("api/tournaments/import/startgg-preview", body: StartggImportPreviewRequest(eventUrl: eventURL))
    }

    func createStartggTournament(eventURL: String, callTimeoutMinutes: Int, setupCount: Int, streamCount: Int, playerMatchReportingEnabled: Bool) async throws -> TournamentDetailResponse {
        struct ImportRequest: Encodable {
            let eventUrl: String
            let callTimeoutMinutes: Int
            let setupCount: Int
            let streamCount: Int
            let playerMatchReportingEnabled: Bool
        }
        return try await api.post("api/tournaments/import/startgg", body: ImportRequest(
            eventUrl: eventURL, callTimeoutMinutes: callTimeoutMinutes,
            setupCount: setupCount, streamCount: streamCount, playerMatchReportingEnabled: playerMatchReportingEnabled
        ))
    }

    func importStartggEvent(tournamentId: String, eventURL: String, syncResults: Bool = true, preserveTournamentTitle: Bool = false) async throws -> TournamentDetailResponse {
        try await api.post(
            "api/tournaments/\(tournamentId)/import/startgg",
            queryItems: [URLQueryItem(name: "background", value: "true")],
            body: StartggImportRequest(eventUrl: eventURL, syncResults: syncResults, preserveTournamentTitle: preserveTournamentTitle)
        )
    }

    func updateSetups(tournamentId: String, count: Int, streamCount: Int) async throws -> TournamentListItem {
        try await api.post("api/tournaments/\(tournamentId)/setups", body: ["setupCount": count, "streamCount": streamCount])
    }

    func createRegistrationAdminSession(tournamentId: String, adminKey: String) async throws -> URL {
        let result: [String: String] = try await api.post("api/tournaments/\(tournamentId)/registration-admin/session", adminKey: adminKey, body: [String: String]())
        guard let value = result["url"], let url = URL(string: value), url.scheme == "https" else { throw URLError(.badServerResponse) }
        return url
    }

    func createFortniteSession(tournamentId: String) async throws -> URL {
        let result: [String: String] = try await api.post("api/tournaments/\(tournamentId)/fortnite/session", body: [String: String]())
        guard let value = result["url"], let url = URL(string: value), url.scheme == "https" else { throw URLError(.badServerResponse) }
        return url
    }

    func createTop8Session(tournamentId: String) async throws -> URL {
        let result: [String: String] = try await api.post("api/tournaments/\(tournamentId)/top8-session", body: [String: String]())
        guard let link = result["url"], let url = URL(string: link), url.scheme == "https" else {
            throw URLError(.badServerResponse)
        }
        return url
    }

    func teamRoster(_ tournamentId: String) async throws -> TeamRoster {
        try await api.get("api/tournaments/\(tournamentId)/team-roster")
    }

    func teamAction(_ tournamentId: String, _ action: TeamRosterAction) async throws -> TeamRoster {
        try await api.post("api/tournaments/\(tournamentId)/team-roster", body: action)
    }

    func updatePublicOptions(tournamentId: String, adminKey: String, options: [String: Bool]) async throws -> TournamentListItem {
        try await api.post("api/tournaments/\(tournamentId)/public-options", adminKey: adminKey, body: options)
    }

    func updateTournament(tournamentId: String, tournament: TournamentListItem, settings: TournamentSettings) async throws -> TournamentListItem {
        try await api.post(
            "api/tournaments/\(tournamentId)/update",
            body: UpdateTournamentRequest(
                title: tournament.title,
                gameTitle: tournament.gameTitle,
                description: tournament.description,
                platform: tournament.platform,
                maxParticipants: tournament.maxParticipants,
                settings: settings
            )
        )
    }

    func deleteTournament(tournamentId: String, adminKey: String) async throws {
        try await api.postVoid("api/tournaments/\(tournamentId)/delete", adminKey: adminKey, body: [String: String]())
    }

    func addParticipant(tournamentId: String, displayName: String, seed: Int?) async throws -> TournamentParticipant {
        try await api.post("api/tournaments/\(tournamentId)/participants", body: CreateParticipantRequest(displayName: displayName, seed: seed))
    }

    func updateParticipant(tournamentId: String, participantId: String, displayName: String, seed: Int?, checkedIn: Bool?, status: String?) async throws -> TournamentParticipant {
        try await api.post(
            "api/tournaments/\(tournamentId)/participants/\(participantId)/update",
            body: UpdateParticipantRequest(displayName: displayName, seed: seed, checkedIn: checkedIn, status: status, clearSeed: seed == nil)
        )
    }

    func deleteParticipant(tournamentId: String, participantId: String) async throws {
        try await api.postVoid("api/tournaments/\(tournamentId)/participants/\(participantId)/delete", body: [String: String]())
    }

    func resetTournament(tournamentId: String) async throws -> TournamentListItem {
        try await api.post("api/tournaments/\(tournamentId)/reset", body: [String: String]())
    }

    func generateBracket(tournamentId: String) async throws -> [Match] {
        try await api.post("api/tournaments/\(tournamentId)/bracket", body: [String: String]())
    }

    func startTournament(tournamentId: String) async throws -> TournamentListItem {
        try await api.post("api/tournaments/\(tournamentId)/start", body: [String: String]())
    }

    func startLadder(tournamentId: String) async throws -> LadderOverview {
        try await api.post("api/tournaments/\(tournamentId)/ladder/start", body: LadderActionRequest(startedByUserId: "user_admin", completedByUserId: nil))
    }

    func finalizeLadder(tournamentId: String) async throws -> LadderOverview {
        try await api.post("api/tournaments/\(tournamentId)/ladder/finalize", body: LadderActionRequest(startedByUserId: nil, completedByUserId: "user_admin"))
    }

    func callMatch(tournamentId: String, matchId: String, stationLabel: String?) async throws -> Match {
        try await api.post(
            "api/tournaments/\(tournamentId)/matches/\(matchId)/call",
            body: CallMatchRequest(calledByUserId: "user_admin", stationLabel: stationLabel)
        )
    }

    func cancelCall(tournamentId: String, matchId: String) async throws -> Match {
        try await api.post("api/tournaments/\(tournamentId)/matches/\(matchId)/cancel-call", body: [String: String]())
    }

    func startMatch(tournamentId: String, matchId: String) async throws -> Match {
        try await api.post("api/tournaments/\(tournamentId)/matches/\(matchId)/start", body: StartMatchRequest(startedByUserId: "user_admin"))
    }

    func updateMatchCharacters(tournamentId: String, matchId: String, selections: [UpdateMatchCharacterSelectionRequest]) async throws -> Match {
        try await api.post("api/tournaments/\(tournamentId)/matches/\(matchId)/characters", body: UpdateMatchCharactersRequest(selections: selections))
    }

    func recordGameWin(tournamentId: String, matchId: String, participantId: String) async throws -> Match {
        try await api.post("api/tournaments/\(tournamentId)/matches/\(matchId)/game-win", body: RecordGameWinRequest(participantId: participantId))
    }

    func selectMarioKartAdvancer(tournamentId: String, matchId: String, participantId: String) async throws -> Match {
        try await api.post("api/tournaments/\(tournamentId)/matches/\(matchId)/mkart-advance", body: SelectMarioKartAdvancerRequest(participantId: participantId))
    }

    func resolveAbsence(tournamentId: String, matchId: String, outcome: String) async throws -> Match {
        try await api.post("api/tournaments/\(tournamentId)/matches/\(matchId)/absence", body: ResolveAbsenceRequest(outcome: outcome))
    }

    func resetMatch(tournamentId: String, matchId: String) async throws -> Match {
        try await api.post("api/tournaments/\(tournamentId)/matches/\(matchId)/reset", body: [String: String]())
    }

    func reportResult(tournamentId: String, matchId: String, winnerParticipantId: String, scores: [MatchScoreRequest]) async throws -> Match {
        try await api.post("api/tournaments/\(tournamentId)/matches/\(matchId)/result", body: ReportResultRequest(winnerParticipantId: winnerParticipantId, scores: scores))
    }

    func reportDetailedResult(tournamentId: String, matchId: String, bestOfOverride: Int?, games: [DetailedReportGameRequest]) async throws -> Match {
        try await api.post("api/tournaments/\(tournamentId)/matches/\(matchId)/result-detailed", body: DetailedReportRequest(expectedRevision: games.first?.expectedRevision, bestOfOverride: bestOfOverride, games: games))
    }
}

@MainActor
final class TournamentManagerViewModel: ObservableObject {
    enum Tab: String, CaseIterable {
        case dashboard = "Home"
        case tournaments = "Tournaments"
        case operations = "Match operations"
        case settings = "Settings"
    }

    @Published var currentTab: Tab = .dashboard
    @Published var themeMode: ManagementThemeMode = ManagementSettingsStore.loadTheme()
    var adminDeleteKey: String { ManagementAccount.shared.token }
    @Published var tournaments: [TournamentListItem] = []
    @Published var selectedTournamentDetail: TournamentDetailResponse?
    @Published var notificationSettings = NotificationSettings(telegramEnabled: false, whatsappEnabled: false)
    @Published var startggPreview: StartggImportPreview?
    @Published var isLoading = false
    @Published var isMutating = false
    @Published var error: String?
    @Published var transientMessage: String?

    private let repository = TournamentManagementRepository()
    private var latestRefreshRequestId: Int = 0
    private var mutationChain: Task<Void, Never>?
    private var pendingMutations: Int = 0
    private var refreshTask: Task<Void, Never>?

    func loadInitial() async {
        guard !adminDeleteKey.isEmpty else { return }
        await reloadTournaments()
        await loadNotificationSettingsIfPossible()
    }

    func startPollingIfNeeded() {
        guard !adminDeleteKey.isEmpty else { return }
        guard refreshTask == nil else { return }
        refreshTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(3))
                guard !Task.isCancelled else { break }
                guard let self else { break }
                if UIApplication.shared.applicationState == .active && !self.isMutating {
                    await self.reloadTournaments()
                }
            }
        }
    }

    func stopPolling() {
        refreshTask?.cancel()
        refreshTask = nil
    }

    func handleScenePhase(_ phase: ScenePhase) {
        switch phase {
        case .active:
            startPollingIfNeeded()
            Task {
                await self.reloadTournaments()
                await self.loadNotificationSettingsIfPossible()
            }
        case .background, .inactive:
            stopPolling()
        @unknown default:
            break
        }
    }

    func reloadTournaments() async {
        guard !adminDeleteKey.isEmpty else { return }
        isLoading = true
        defer { isLoading = false }
        do {
            let loaded = try await self.repository.getTournaments()
            tournaments = loaded
            if let currentId = selectedTournamentDetail?.tournament.id {
                if loaded.contains(where: { $0.id == currentId }) {
                    try await refreshTournament(currentId)
                } else {
                    selectedTournamentDetail = nil
                }
            }
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }

    func refreshTournament(_ tournamentId: String? = nil) async throws {
        let targetId = tournamentId ?? selectedTournamentDetail?.tournament.id
        guard let targetId else { return }
        let requestId = nextRefreshRequestId()
        let detail = try await self.repository.getTournament(targetId)
        guard requestId == latestRefreshRequestId else { return }
        selectedTournamentDetail = detail
    }

    func selectTournament(_ tournamentId: String) async {
        do {
            try await refreshTournament(tournamentId)
        } catch {
            self.error = error.localizedDescription
        }
    }

    func setTheme(_ mode: ManagementThemeMode) {
        themeMode = mode
        ManagementSettingsStore.saveTheme(mode)
    }


    func loadNotificationSettingsIfPossible() async {
        guard !adminDeleteKey.isEmpty else { return }
        do {
            notificationSettings = try await self.repository.getNotificationSettings(adminKey: adminDeleteKey)
        } catch {
            // Quiet: this screen may not be configured yet.
        }
    }

    func saveNotificationSettings() async {
        guard !adminDeleteKey.isEmpty else {
            error = "You need admin access to save notification settings."
            return
        }
        await mutate("Notification settings saved") {
            self.notificationSettings = try await self.repository.updateNotificationSettings(
                adminKey: self.adminDeleteKey,
                telegramEnabled: self.notificationSettings.telegramEnabled,
                whatsappEnabled: self.notificationSettings.whatsappEnabled
            )
        }
    }

    func previewStartgg(_ eventURL: String) async {
        guard !eventURL.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        await mutate(nil) {
            self.startggPreview = try await self.repository.previewStartggImport(eventURL: eventURL)
        }
    }

    func createTournament(input: CreateTournamentInput) async {
        await mutate("Tournament created") {
            let created = try await self.repository.createTournament(input: input)
            self.tournaments.insert(created, at: 0)
            try await self.refreshTournament(created.id)
        }
    }

    func createStartggTournament(eventURL: String, callTimeoutMinutes: Int, setupCount: Int, streamCount: Int, playerMatchReportingEnabled: Bool) async {
        await mutate("Import started") {
            let detail = try await self.repository.createStartggTournament(
                eventURL: eventURL,
                callTimeoutMinutes: callTimeoutMinutes,
                setupCount: setupCount, streamCount: streamCount,
                playerMatchReportingEnabled: playerMatchReportingEnabled
            )
            self.selectedTournamentDetail = detail
            await self.reloadTournaments()
        }
    }

    func updateTournament(_ tournament: TournamentListItem, settings: TournamentSettings) async {
        await mutate("Tournament updated") {
            _ = try await self.repository.updateTournament(tournamentId: tournament.id, tournament: tournament, settings: settings)
            try await self.refreshTournament(tournament.id)
            await self.reloadTournaments()
        }
    }

    func deleteSelectedTournament() async {
        guard let tournamentId = selectedTournamentDetail?.tournament.id else { return }
        guard !adminDeleteKey.isEmpty else {
            error = "Sign in to delete tournaments."
            return
        }
        await mutate("Tournament deleted") {
            try await self.repository.validateAdminDeleteKey(self.adminDeleteKey)
            try await self.repository.deleteTournament(tournamentId: tournamentId, adminKey: self.adminDeleteKey)
            self.selectedTournamentDetail = nil
            await self.reloadTournaments()
        }
    }

    func addParticipant(displayName: String, seed: Int?) async {
        guard let tournamentId = selectedTournamentDetail?.tournament.id else { return }
        await mutate("Participant added") {
            _ = try await self.repository.addParticipant(tournamentId: tournamentId, displayName: displayName, seed: seed)
            try await self.refreshTournament(tournamentId)
            await self.reloadTournaments()
        }
    }

    func updateParticipant(_ participant: TournamentParticipant, displayName: String, seed: Int?, checkedIn: Bool?, status: String?) async {
        guard let tournamentId = selectedTournamentDetail?.tournament.id else { return }
        await mutate("Participant updated") {
            _ = try await self.repository.updateParticipant(
                tournamentId: tournamentId,
                participantId: participant.id,
                displayName: displayName,
                seed: seed,
                checkedIn: checkedIn,
                status: status
            )
            try await self.refreshTournament(tournamentId)
        }
    }

    func deleteParticipant(_ participant: TournamentParticipant) async {
        guard let tournamentId = selectedTournamentDetail?.tournament.id else { return }
        await mutate("Participant deleted") {
            try await self.repository.deleteParticipant(tournamentId: tournamentId, participantId: participant.id)
            try await self.refreshTournament(tournamentId)
        }
    }

    func generateBracket() async {
        guard let tournamentId = selectedTournamentDetail?.tournament.id else { return }
        await mutate("Bracket generated") {
            _ = try await self.repository.generateBracket(tournamentId: tournamentId)
            try await self.refreshTournament(tournamentId)
            await self.reloadTournaments()
        }
    }

    func resetAndGenerateBracket() async {
        guard let tournamentId = selectedTournamentDetail?.tournament.id else { return }
        await mutate("Bracket regenerated") {
            _ = try await self.repository.resetTournament(tournamentId: tournamentId)
            _ = try await self.repository.generateBracket(tournamentId: tournamentId)
            try await self.refreshTournament(tournamentId)
            await self.reloadTournaments()
        }
    }

    func startTournament() async {
        guard let tournamentId = selectedTournamentDetail?.tournament.id else { return }
        await mutate("Tournament started") {
            _ = try await self.repository.startTournament(tournamentId: tournamentId)
            try await self.refreshTournament(tournamentId)
            await self.reloadTournaments()
        }
    }

    func resetTournament() async {
        guard let tournamentId = selectedTournamentDetail?.tournament.id else { return }
        await mutate("Tournament reset") {
            _ = try await self.repository.resetTournament(tournamentId: tournamentId)
            try await self.refreshTournament(tournamentId)
            await self.reloadTournaments()
        }
    }

    func setArchived(_ archived: Bool) async {
        guard let tournamentId = selectedTournamentDetail?.tournament.id else { return }
        await mutate(archived ? "Tournament archived" : "Tournament unarchived") {
            _ = try await self.repository.setArchived(tournamentId: tournamentId, archived: archived)
            try await self.refreshTournament(tournamentId)
            await self.reloadTournaments()
        }
    }

    func reimportStartggBracket() async {
        guard let detail = selectedTournamentDetail else { return }
        guard let eventURL = detail.tournament.importEventUrl,
              !eventURL.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            error = "This tournament has no valid start.gg URL to reimport."
            return
        }

        await mutate("Import started") {
            _ = try await self.repository.importStartggEvent(
                tournamentId: detail.tournament.id,
                eventURL: eventURL,
                syncResults: true,
                preserveTournamentTitle: true
            )
            try await self.refreshTournament(detail.tournament.id)
            await self.reloadTournaments()
        }
    }

    func startLadder() async {
        guard BackendConfig.supportsLadder, let tournamentId = selectedTournamentDetail?.tournament.id else { return }
        await mutate("Ladder started") {
            _ = try await self.repository.startLadder(tournamentId: tournamentId)
            try await self.refreshTournament(tournamentId)
        }
    }

    func finalizeLadder() async {
        guard BackendConfig.supportsLadder, let tournamentId = selectedTournamentDetail?.tournament.id else { return }
        await mutate("Ladder registration closed") {
            _ = try await self.repository.finalizeLadder(tournamentId: tournamentId)
            try await self.refreshTournament(tournamentId)
        }
    }

    func callMatch(_ match: Match, stationLabel: String?) async {
        guard let tournamentId = selectedTournamentDetail?.tournament.id else { return }
        await mutate(nil) {
            _ = try await self.repository.callMatch(tournamentId: tournamentId, matchId: match.id, stationLabel: stationLabel)
            try await self.refreshTournament(tournamentId)
        }
    }

    func cancelCall(_ match: Match) async {
        guard let tournamentId = selectedTournamentDetail?.tournament.id else { return }
        await mutate(nil) {
            _ = try await self.repository.cancelCall(tournamentId: tournamentId, matchId: match.id)
            try await self.refreshTournament(tournamentId)
        }
    }

    func startMatch(_ match: Match) async {
        guard let tournamentId = selectedTournamentDetail?.tournament.id else { return }
        await mutate(nil) {
            _ = try await self.repository.startMatch(tournamentId: tournamentId, matchId: match.id)
            try await self.refreshTournament(tournamentId)
        }
    }

    func saveCharacters(_ match: Match, selections: [UpdateMatchCharacterSelectionRequest], gameWinnerParticipantId: String? = nil) async -> Bool {
        guard let tournamentId = selectedTournamentDetail?.tournament.id else { return false }
        var saved = false
        await mutate(nil) {
            _ = try await self.repository.updateMatchCharacters(tournamentId: tournamentId, matchId: match.id, selections: selections)
            if let gameWinnerParticipantId {
                _ = try await self.repository.recordGameWin(tournamentId: tournamentId, matchId: match.id, participantId: gameWinnerParticipantId)
            }
            saved = true
            try await self.refreshTournament(tournamentId)
        }
        return saved
    }

    func recordGameWin(_ match: Match, participantId: String) async {
        guard let tournamentId = selectedTournamentDetail?.tournament.id else { return }
        await mutate(nil) {
            _ = try await self.repository.recordGameWin(tournamentId: tournamentId, matchId: match.id, participantId: participantId)
            try await self.refreshTournament(tournamentId)
        }
    }

    func updateSetups(_ count: Int, streamCount: Int) async {
        guard let tournamentId = selectedTournamentDetail?.tournament.id else { return }
        await mutate("Setups saved") {
            _ = try await self.repository.updateSetups(tournamentId: tournamentId, count: count, streamCount: streamCount)
            try await self.refreshTournament(tournamentId)
        }
    }

    func updatePublicOptions(_ options: [String: Bool]) async {
        guard let tournamentId = selectedTournamentDetail?.tournament.id else { return }
        await mutate("Public options saved") {
            _ = try await self.repository.updatePublicOptions(tournamentId: tournamentId, adminKey: self.adminDeleteKey, options: options)
            try await self.refreshTournament(tournamentId)
        }
    }

    func reportResult(_ match: Match, winnerParticipantId: String, scores: [MatchScoreRequest]) async {
        guard let tournamentId = selectedTournamentDetail?.tournament.id else { return }
        await mutate(nil) {
            _ = try await self.repository.reportResult(tournamentId: tournamentId, matchId: match.id, winnerParticipantId: winnerParticipantId, scores: scores)
            try await self.refreshTournament(tournamentId)
        }
    }

    func reportDetailedResult(_ match: Match, bestOfOverride: Int?, games: [DetailedReportGameRequest]) async -> Bool {
        guard let tournamentId = selectedTournamentDetail?.tournament.id else { return false }
        var saved = false
        await mutate(nil) {
            _ = try await self.repository.reportDetailedResult(tournamentId: tournamentId, matchId: match.id, bestOfOverride: bestOfOverride, games: games)
            saved = true
            try await self.refreshTournament(tournamentId)
        }
        return saved
    }

    func selectMarioKartAdvancer(_ match: Match, participantId: String) async {
        guard let tournamentId = selectedTournamentDetail?.tournament.id else { return }
        await mutate(nil) {
            _ = try await self.repository.selectMarioKartAdvancer(tournamentId: tournamentId, matchId: match.id, participantId: participantId)
            try await self.refreshTournament(tournamentId)
        }
    }

    func resolveAbsence(_ match: Match, outcome: String) async {
        guard let tournamentId = selectedTournamentDetail?.tournament.id else { return }
        await mutate(nil) {
            _ = try await self.repository.resolveAbsence(tournamentId: tournamentId, matchId: match.id, outcome: outcome)
            try await self.refreshTournament(tournamentId)
        }
    }

    func retrySync(_ match: Match) async {
        guard let tournamentId = selectedTournamentDetail?.tournament.id else { return }
        await mutate(nil) {
            try await self.repository.retrySync(tournamentId: tournamentId, matchId: match.id)
            try await self.refreshTournament(tournamentId)
        }
    }

    func resetMatch(_ match: Match) async {
        guard let tournamentId = selectedTournamentDetail?.tournament.id else { return }
        await mutate(nil) {
            _ = try await self.repository.resetMatch(tournamentId: tournamentId, matchId: match.id)
            try await self.refreshTournament(tournamentId)
        }
    }

    private func mutate(_ successMessage: String?, operation: @escaping () async throws -> Void) async {
        let previous = mutationChain
        pendingMutations += 1
        isMutating = true
        error = nil

        let task = Task { @MainActor [weak self] in
            _ = await previous?.value
            guard let self else { return }

            do {
                try await operation()
                self.error = nil
                self.transientMessage = successMessage
            } catch {
                self.error = error.localizedDescription
            }

            self.pendingMutations = max(0, self.pendingMutations - 1)
            self.isMutating = self.pendingMutations > 0
        }

        mutationChain = task
        await task.value
    }

    private func nextRefreshRequestId() -> Int {
        latestRefreshRequestId += 1
        return latestRefreshRequestId
    }
}
