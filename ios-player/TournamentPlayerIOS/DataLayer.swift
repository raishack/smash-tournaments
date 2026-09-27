import Foundation
import SwiftUI
import Combine
import UIKit

enum SessionStore {
    private static let sessionKey = "gestor_torneos_player_session"
    private static let themeKey = "gestor_torneos_player_theme"

    static func loadSession() -> PlayerSession? {
        guard let data = UserDefaults.standard.data(forKey: sessionKey) else { return nil }
        return try? JSONDecoder().decode(PlayerSession.self, from: data)
    }

    static func saveSession(_ session: PlayerSession) {
        if let data = try? JSONEncoder().encode(session) {
            UserDefaults.standard.set(data, forKey: sessionKey)
        }
    }

    static func clearSession() {
        UserDefaults.standard.removeObject(forKey: sessionKey)
    }

    static func loadTheme() -> PlayerThemeMode {
        guard let raw = UserDefaults.standard.string(forKey: themeKey),
              let mode = PlayerThemeMode(rawValue: raw) else { return .system }
        return mode
    }

    static func saveTheme(_ mode: PlayerThemeMode) {
        UserDefaults.standard.set(mode.rawValue, forKey: themeKey)
    }
}

enum PlayerAPIError: Error, LocalizedError {
    case invalidResponse
    case http(Int, String)

    var errorDescription: String? {
        switch self {
        case .invalidResponse:
            return "Invalid backend response."
        case let .http(code, message):
            return message.isEmpty ? "HTTP \(code)" : message
        }
    }
}

final class PlayerAPIClient {
    private let decoder = JSONDecoder()
    private let encoder = JSONEncoder()

    func get<T: Decodable>(_ path: String, bearerToken: String? = nil) async throws -> T {
        try await request(path: path, method: "GET", bearerToken: bearerToken, body: Optional<Int>.none)
    }

    func post<T: Decodable, Body: Encodable>(_ path: String, bearerToken: String? = nil, body: Body) async throws -> T {
        try await request(path: path, method: "POST", bearerToken: bearerToken, body: body)
    }

    private func request<T: Decodable, Body: Encodable>(
        path: String,
        method: String,
        bearerToken: String?,
        body: Body?
    ) async throws -> T {
        let url = BackendConfig.baseURL.appendingPathComponent(path)
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.timeoutInterval = 180
        if !BackendConfig.appClientKey.isEmpty {
            request.setValue(BackendConfig.appClientKey, forHTTPHeaderField: "X-App-Key")
        }
        if let bearerToken, !bearerToken.isEmpty {
            request.setValue("Bearer \(bearerToken)", forHTTPHeaderField: "Authorization")
        }
        if let body {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try encoder.encode(body)
        }

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw PlayerAPIError.invalidResponse }
        guard (200...299).contains(http.statusCode) else {
            let envelope = try? JSONDecoder().decode(PlayerErrorEnvelope.self, from: data)
            throw PlayerAPIError.http(http.statusCode, envelope?.error ?? envelope?.message ?? "Could not complete the operation (HTTP \(http.statusCode)).")
        }
        return try decoder.decode(T.self, from: data)
    }
}

final class PlayerRepository {
    private let api = PlayerAPIClient()

    func createStartggLogin() async throws -> URL {
        let response: PlayerStartggAuthStartResponse = try await api.post(
            "api/player/auth/startgg/mobile/start",
            body: PlayerStartggAuthStartRequest(redirectUri: BackendConfig.redirectURI)
        )
        guard let url = URL(string: response.authorizationUrl) else { throw PlayerAPIError.invalidResponse }
        return url
    }

    func getProfile(sessionToken: String) async throws -> PlayerProfile {
        try await api.get("api/player/me", bearerToken: sessionToken)
    }

    func getMyTournaments(sessionToken: String) async throws -> [PlayerTournament] {
        let response: PlayerTournamentListResponse = try await api.get("api/player/tournaments", bearerToken: sessionToken)
        return response.tournaments
    }

    func getMyTournament(sessionToken: String, tournamentId: String) async throws -> PlayerTournament {
        try await api.get("api/player/tournaments/\(tournamentId)", bearerToken: sessionToken)
    }

    func joinLadderQueue(sessionToken: String, tournamentId: String) async throws -> PlayerTournament {
        try await api.post("api/player/tournaments/\(tournamentId)/ladder/join", bearerToken: sessionToken, body: PlayerLadderActionRequest())
    }

    func leaveLadderQueue(sessionToken: String, tournamentId: String) async throws -> PlayerTournament {
        try await api.post("api/player/tournaments/\(tournamentId)/ladder/leave", bearerToken: sessionToken, body: PlayerLadderActionRequest())
    }

    func readyLadderMatch(sessionToken: String, tournamentId: String, matchId: String) async throws -> PlayerTournament {
        try await api.post("api/player/tournaments/\(tournamentId)/ladder/matches/\(matchId)/ready", bearerToken: sessionToken, body: PlayerLadderActionRequest())
    }

    func reviewLadder(sessionToken: String, tournamentId: String, matchId: String, input: PlayerLadderReview) async throws -> PlayerTournament {
        try await api.post("api/player/tournaments/\(tournamentId)/ladder/matches/\(matchId)/review", bearerToken: sessionToken, body: input)
    }
    func cancelLadderMatch(sessionToken: String, tournamentId: String, matchId: String) async throws -> PlayerTournament {
        try await api.post("api/player/tournaments/\(tournamentId)/ladder/matches/\(matchId)/cancel", bearerToken: sessionToken, body: PlayerLadderActionRequest())
    }

    func reportDetailedResult(sessionToken: String, tournamentId: String, matchId: String, bestOfOverride: Int?, games: [QuickReportGame]) async throws -> PlayerMatch {
        try await api.post("api/player/tournaments/\(tournamentId)/matches/\(matchId)/report-detailed", bearerToken: sessionToken, body: PlayerDetailedReportRequest(
            bestOfOverride: bestOfOverride,
            games: games.map {
                PlayerDetailedReportGame(
                    winnerParticipantId: $0.winnerParticipantId,
                    selections: $0.selections.isEmpty ? nil : $0.selections.map {
                        PlayerDetailedReportSelection(participantId: $0.key, characterName: $0.value)
                    }
                )
            }
        ))
    }

    func reportLadderDetailedResult(sessionToken: String, tournamentId: String, matchId: String, bestOfOverride: Int?, games: [QuickReportGame]) async throws -> PlayerTournament {
        try await api.post("api/player/tournaments/\(tournamentId)/ladder/matches/\(matchId)/report-detailed", bearerToken: sessionToken, body: PlayerDetailedReportRequest(
            bestOfOverride: bestOfOverride,
            games: games.map {
                PlayerDetailedReportGame(
                    winnerParticipantId: $0.winnerParticipantId,
                    selections: $0.selections.isEmpty ? nil : $0.selections.map {
                        PlayerDetailedReportSelection(participantId: $0.key, characterName: $0.value)
                    }
                )
            }
        ))
    }
}

@MainActor
final class PlayerAppViewModel: ObservableObject {
    enum Section: String, CaseIterable {
        case dashboard = "Home"
        case tournaments = "Tournaments"
        case bracket = "Bracket"
        case profile = "Profile"
    }

    @Published var currentSection: Section = .dashboard
    @Published var session: PlayerSession? = SessionStore.loadSession()
    @Published var profile: PlayerProfile?
    @Published var tournaments: [PlayerTournament] = []
    @Published var themeMode: PlayerThemeMode = SessionStore.loadTheme()
    @Published var loginURL: URL?
    @Published var error: String?
    @Published var isMutating = false

    private let repository = PlayerRepository()
    private var refreshTask: Task<Void, Never>?
    private var isReloading = false
    private var latestRefreshRequestId = 0
    private var mutationChain: Task<Void, Never>?
    private var pendingMutations = 0

    func beginStartggLogin() async {
        guard loginURL == nil else { return }
        do {
            loginURL = try await repository.createStartggLogin()
        } catch {
            self.error = error.localizedDescription
        }
    }

    func completeLogin(sessionToken: String, displayName: String, gamerTag: String) async {
        loginURL = nil
        let newSession = PlayerSession(sessionToken: sessionToken, displayName: displayName, gamerTag: gamerTag)
        SessionStore.saveSession(newSession)
        _ = nextRefreshRequestId()
        profile = nil
        tournaments = []
        session = newSession
        await reloadAll()
        startPollingIfNeeded()
    }

    func handleLoginCallback(_ url: URL) {
        guard url.scheme == "tournamentplayer" else { return }
        let components = URLComponents(url: url, resolvingAgainstBaseURL: false)
        let sessionToken = components?.queryItems?.first(where: { $0.name == "sessionToken" })?.value
        let displayName = components?.queryItems?.first(where: { $0.name == "displayName" })?.value ?? ""
        let gamerTag = components?.queryItems?.first(where: { $0.name == "gamerTag" })?.value ?? ""
        let errorMessage = components?.queryItems?.first(where: { $0.name == "error" })?.value
        loginURL = nil
        if let sessionToken, !sessionToken.isEmpty {
            Task {
                await self.completeLogin(
                    sessionToken: sessionToken,
                    displayName: displayName,
                    gamerTag: gamerTag
                )
            }
            return
        }
        if let errorMessage, !errorMessage.isEmpty {
            error = errorMessage
        }
    }

    func reloadAll() async {
        guard let session else { return }
        if isReloading { return }
        let requestId = nextRefreshRequestId()
        isReloading = true
        defer { isReloading = false }
        do {
            async let profileTask = repository.getProfile(sessionToken: session.sessionToken)
            async let tournamentsTask = repository.getMyTournaments(sessionToken: session.sessionToken)
            let loadedProfile = try await profileTask
            let loadedTournaments = try await tournamentsTask
            guard requestId == latestRefreshRequestId, self.session?.sessionToken == session.sessionToken else { return }
            profile = loadedProfile
            tournaments = loadedTournaments
            PlayerLocalNotifications.syncNotifications(for: tournaments)
            error = nil
        } catch {
            guard requestId == latestRefreshRequestId, self.session?.sessionToken == session.sessionToken, !(error is CancellationError) else { return }
            self.error = error.localizedDescription
        }
    }

    func setTheme(_ mode: PlayerThemeMode) {
        themeMode = mode
        SessionStore.saveTheme(mode)
    }

    func startPollingIfNeeded() {
        guard refreshTask == nil else { return }
        refreshTask = Task { [weak self] in
            while !Task.isCancelled {
                guard let self else { break }
                if self.session != nil && UIApplication.shared.applicationState == .active && !self.isMutating {
                    await self.reloadAll()
                }
                try? await Task.sleep(for: .seconds(3))
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
            Task { await self.reloadAll() }
        case .background, .inactive:
            stopPolling()
        @unknown default:
            break
        }
    }

    func logout() {
        clearLocalSession()
    }

    func deleteAccount() async {
        clearLocalSession()
    }

    private func clearLocalSession() {
        _ = nextRefreshRequestId()
        SessionStore.clearSession()
        session = nil
        profile = nil
        tournaments = []
        loginURL = nil
        error = nil
        stopPolling()
    }

    func queueForLadder(_ tournament: PlayerTournament) async {
        guard let session else { return }
        await mutate {
            let updated = try await self.repository.joinLadderQueue(sessionToken: session.sessionToken, tournamentId: tournament.tournamentId)
            self.replaceTournament(updated, sessionToken: session.sessionToken)
        }
    }

    func leaveLadder(_ tournament: PlayerTournament) async {
        guard let session else { return }
        await mutate {
            let updated = try await self.repository.leaveLadderQueue(sessionToken: session.sessionToken, tournamentId: tournament.tournamentId)
            self.replaceTournament(updated, sessionToken: session.sessionToken)
        }
    }

    func readyLadder(_ tournament: PlayerTournament, match: PlayerMatch) async {
        guard let session else { return }
        await mutate {
            let updated = try await self.repository.readyLadderMatch(sessionToken: session.sessionToken, tournamentId: tournament.tournamentId, matchId: match.id)
            self.replaceTournament(updated, sessionToken: session.sessionToken)
        }
    }

    func reviewLadder(_ tournament: PlayerTournament, match: PlayerMatch, action: String, reason: String?) async {
        guard let session, let revision = match.ladderRevision, !isMutating else { return }
        await mutate {
            let updated = try await self.repository.reviewLadder(sessionToken: session.sessionToken, tournamentId: tournament.tournamentId, matchId: match.id, input: PlayerLadderReview(action: action, expectedRevision: revision, reason: reason))
            self.replaceTournament(updated, sessionToken: session.sessionToken)
        }
    }
    func cancelReadyCheck(_ tournament: PlayerTournament, match: PlayerMatch) async {
        guard let session else { return }
        await mutate {
            let updated = try await self.repository.cancelLadderMatch(sessionToken: session.sessionToken, tournamentId: tournament.tournamentId, matchId: match.id)
            self.replaceTournament(updated, sessionToken: session.sessionToken)
        }
    }

    func reportDetailedResult(_ tournament: PlayerTournament, match: PlayerMatch, bestOfOverride: Int?, games: [QuickReportGame], ladder: Bool) async {
        guard let session, !isMutating else { return }
        await mutate {
            if ladder {
                let updated = try await self.repository.reportLadderDetailedResult(
                    sessionToken: session.sessionToken,
                    tournamentId: tournament.tournamentId,
                    matchId: match.id,
                    bestOfOverride: bestOfOverride,
                    games: games
                )
                self.replaceTournament(updated, sessionToken: session.sessionToken)
            } else {
                _ = try await self.repository.reportDetailedResult(
                    sessionToken: session.sessionToken,
                    tournamentId: tournament.tournamentId,
                    matchId: match.id,
                    bestOfOverride: bestOfOverride,
                    games: games
                )
                let refreshed = try await self.repository.getMyTournament(sessionToken: session.sessionToken, tournamentId: tournament.tournamentId)
                self.replaceTournament(refreshed, sessionToken: session.sessionToken)
            }
        }
    }

    private func replaceTournament(_ updated: PlayerTournament, sessionToken: String) {
        guard session?.sessionToken == sessionToken else { return }
        tournaments = tournaments.map { $0.tournamentId == updated.tournamentId ? updated : $0 }
    }

    private func mutate(_ operation: @escaping () async throws -> Void) async {
        let sessionToken = session?.sessionToken
        let previous = mutationChain
        pendingMutations += 1
        isMutating = true
        error = nil

        let task = Task { @MainActor [weak self] in
            await previous?.value
            guard let self else { return }
            do {
                if self.session?.sessionToken == sessionToken { try await operation() }
            } catch {
                if self.session?.sessionToken == sessionToken, !(error is CancellationError) { self.error = error.localizedDescription }
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

private struct PlayerErrorEnvelope: Decodable { let error: String?; let message: String? }
