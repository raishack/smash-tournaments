import Foundation
import SwiftUI
import Combine
import AuthenticationServices
#if canImport(FirebaseCore)
import FirebaseCore
#endif
import UserNotifications
import WebKit

final class AppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        #if canImport(FirebaseCore)
        if Bundle.main.path(forResource: "GoogleService-Info", ofType: "plist") != nil { FirebaseApp.configure() }
        #endif
        UNUserNotificationCenter.current().delegate = self
        PlayerLocalNotifications.requestAuthorizationIfNeeded()
        return true
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        completionHandler([.banner, .sound, .badge])
    }
}

enum PlayerPalette {
    static func adaptive(_ light: UInt32, _ dark: UInt32) -> Color {
        Color(uiColor: UIColor { traits in
            let value = traits.userInterfaceStyle == .dark ? dark : light
            return UIColor(red: CGFloat((value >> 16) & 255) / 255, green: CGFloat((value >> 8) & 255) / 255, blue: CGFloat(value & 255) / 255, alpha: 1)
        })
    }
    // Filled actions keep white labels; links use the adaptive accent below.
    static let primaryAction = adaptive(0x3345A4, 0x3345A4)
    static let accent = adaptive(0x3345A4, 0xB5C2FF)
    static let screenBackground = adaptive(0xF3F5FA, 0x0F1724)
    static let surfaceBackground = adaptive(0xFFFFFF, 0x182334)
    static let secondarySurfaceBackground = adaptive(0xE8ECF4, 0x243247)
    static let border = adaptive(0x64748B, 0x93A4BC)
    static let cardBorder = adaptive(0xCBD5E1, 0x43536A)
    static let mutedBorder = cardBorder
    static let secondaryText = adaptive(0x475569, 0xC2CEDF)
    static let success = adaptive(0x17643B, 0x8DE2B0)
    static let successFill = adaptive(0xDCF5E5, 0x163D2C)
    static let warning = adaptive(0x805400, 0xF5CB72)
    static let warningFill = adaptive(0xFFF0CC, 0x43351C)
    static let danger = adaptive(0xB42335, 0xFFB2BA)
    static let dangerFill = adaptive(0xFFE4E8, 0x522735)
    static let heroTitle = adaptive(0x18255C, 0xE2E7FF)
    static let heroBody = secondaryText
    static let heroFill = adaptive(0xE2E7FF, 0x283C70)
    static let heroStroke = cardBorder
    static let quickReportBackground = screenBackground
    static let quickReportCardBackground = surfaceBackground
    static let quickReportDeselectedPill = secondarySurfaceBackground
    static let quickReportIconBadgeBackground = secondarySurfaceBackground
    static let disabledAction = secondarySurfaceBackground
}

enum PlayerTextSize: String, CaseIterable, Identifiable {
    case normal, large, extraLarge
    var id: String { rawValue }
    var title: String { switch self { case .normal: return "Normal"; case .large: return "Large"; case .extraLarge: return "Extra large" } }
    var minimumSize: DynamicTypeSize { switch self { case .normal: return .xSmall; case .large: return .xLarge; case .extraLarge: return .xxxLarge } }
}

@main
struct tournamentplayerApp: App {
    @AppStorage("player_text_size") private var textSize: PlayerTextSize = .normal
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var delegate
    @StateObject private var viewModel = PlayerAppViewModel()
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(viewModel)
                .preferredColorScheme(viewModel.themeMode == .system ? nil : viewModel.themeMode == .dark ? .dark : .light)
                .dynamicTypeSize(textSize.minimumSize...)
                .tint(PlayerPalette.accent)
                .task {
                    await viewModel.reloadAll()
                    viewModel.startPollingIfNeeded()
                }
                .onChange(of: scenePhase) { _, newValue in
                    viewModel.handleScenePhase(newValue)
                }
                .onOpenURL { url in
                    viewModel.handleLoginCallback(url)
                }
        }
    }
}

@MainActor
final class StartggLoginSession: NSObject, ObservableObject, ASWebAuthenticationPresentationContextProviding {
    private var session: ASWebAuthenticationSession?

    func start(url: URL, completion: @escaping (URL?, Error?) -> Void) {
        session?.cancel()
        let authSession = ASWebAuthenticationSession(
            url: url,
            callbackURLScheme: "tournamentplayer"
        ) { [weak self] callbackURL, error in
            Task { @MainActor in
                self?.session = nil
                completion(callbackURL, error)
            }
        }
        authSession.presentationContextProvider = self
        authSession.prefersEphemeralWebBrowserSession = false
        session = authSession
        if !authSession.start() {
            session = nil
            completion(nil, PlayerLoginPresentationError())
        }
    }

    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap(\.windows)
            .first { $0.isKeyWindow } ?? ASPresentationAnchor()
    }
}

private struct PlayerLoginPresentationError: LocalizedError {
    var errorDescription: String? {
        "Could not open secure start.gg sign-in."
    }
}

struct ContentView: View {
    @EnvironmentObject private var viewModel: PlayerAppViewModel
    @StateObject private var startggLoginSession = StartggLoginSession()

    var body: some View {
        TabView(selection: $viewModel.currentSection) {
            DashboardView()
                .tabItem { Label("Home", systemImage: "house.fill") }
                .tag(PlayerAppViewModel.Section.dashboard)

            TournamentsView()
                .tabItem { Label("Tournaments", systemImage: "list.bullet.rectangle") }
                .tag(PlayerAppViewModel.Section.tournaments)

            BracketView()
                .tabItem { Label("Bracket", systemImage: "square.grid.2x2") }
                .tag(PlayerAppViewModel.Section.bracket)

            ProfileView()
                .tabItem { Label("Profile", systemImage: "person.crop.circle") }
                .tag(PlayerAppViewModel.Section.profile)
        }
        .onChange(of: viewModel.loginURL) { _, newValue in
            guard let url = newValue else { return }
            startggLoginSession.start(url: url) { callbackURL, error in
                viewModel.loginURL = nil
                if let callbackURL {
                    viewModel.handleLoginCallback(callbackURL)
                    return
                }
                if let authError = error as? ASWebAuthenticationSessionError,
                   authError.code == .canceledLogin {
                    return
                }
                if let error {
                    viewModel.error = error.localizedDescription
                }
            }
        }
        .alert("Error", isPresented: Binding(
            get: { viewModel.error != nil },
            set: { if !$0 { viewModel.error = nil } }
        )) {
            Button("Accept", role: .cancel) {}
        } message: {
            Text(viewModel.error ?? "")
        }
    }
}

private struct DashboardMatchEntry: Identifiable {
    let tournament: PlayerTournament
    let match: PlayerMatch
    let ladder: Bool

    var id: String {
        "\(tournament.tournamentId):\(match.id):\(ladder)"
    }
}

private struct DashboardQuickReportSelection: Identifiable {
    let tournament: PlayerTournament
    let match: PlayerMatch
    let ladder: Bool

    var id: String {
        "\(tournament.tournamentId):\(match.id):\(ladder)"
    }
}

private func playerMatchStageLabel(_ match: PlayerMatch) -> String? {
    switch match.bracketStage.trimmingCharacters(in: .whitespacesAndNewlines).uppercased() {
    case "POOLS":
        return "Pools"
    case "WINNERS":
        return "Bracket Winners"
    case "LOSERS":
        return "Bracket Losers"
    case "FINALS":
        return "Bracket Finals"
    case "LADDER":
        return "Internal ladder"
    default:
        return nil
    }
}

private func cleanedSessionTitleForDisplay(session: PlayerSession?, profile: PlayerProfile?) -> String {
    guard let session else {
        return "No session"
    }

    func clean(_ value: String) -> String {
        var text = value
            .replacingOccurrences(of: "+Â¦+", with: " | ")
            .replacingOccurrences(of: "+|+", with: " | ")
            .replacingOccurrences(of: "Â¦", with: "|")
            .replacingOccurrences(of: "Ã‚|", with: "|")
            .replacingOccurrences(of: "Ã‚Â¦", with: "|")
            .replacingOccurrences(of: "+", with: " ")
        while text.contains("  ") {
            text = text.replacingOccurrences(of: "  ", with: " ")
        }
        text = text
            .replacingOccurrences(of: " | ", with: "|")
            .replacingOccurrences(of: "| ", with: "|")
            .replacingOccurrences(of: " |", with: "|")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        if text.contains("|") {
            let parts = text
                .split(separator: "|")
                .map { String($0).trimmingCharacters(in: .whitespacesAndNewlines) }
                .filter { !$0.isEmpty }
            return parts.joined(separator: " | ")
        }
        return text
    }

    let cleanedDisplayName = clean(profile?.displayName ?? session.displayName)
    let cleanedGamerTag = clean(profile?.gamerTag ?? session.gamerTag)
    if cleanedDisplayName.isEmpty {
        return cleanedGamerTag
    }
    if cleanedGamerTag.isEmpty {
        return cleanedDisplayName
    }
    let normalizedDisplay = cleanedDisplayName.lowercased()
    let normalizedTag = cleanedGamerTag.lowercased()
    if normalizedDisplay == normalizedTag || normalizedDisplay.contains("| \(normalizedTag)") {
        return cleanedDisplayName
    }
    return "\(cleanedDisplayName) | \(cleanedGamerTag)"
}

struct DashboardView: View {
    @EnvironmentObject private var viewModel: PlayerAppViewModel
    @State private var quickReportSelection: DashboardQuickReportSelection?
    @State private var pendingQuickReportSelection: DashboardQuickReportSelection?
    @State private var quickReportBestOfOverride: Int?
    @State private var showQuickReportModeDialog = false

    private var activeMatches: [DashboardMatchEntry] {
        viewModel.tournaments.flatMap { tournament in
            tournament.activeMatches.map {
                DashboardMatchEntry(tournament: tournament, match: $0, ladder: false)
            } + [
                tournament.ladder?.readyCheckMatch.map {
                    DashboardMatchEntry(tournament: tournament, match: $0, ladder: true)
                },
                tournament.ladder?.activeMatch.map {
                    DashboardMatchEntry(tournament: tournament, match: $0, ladder: true)
                }
            ].compactMap { $0 }
        }.sorted {
            let lhsPriority = activePlayerMatchPriority($0.match)
            let rhsPriority = activePlayerMatchPriority($1.match)
            if lhsPriority != rhsPriority {
                return lhsPriority < rhsPriority
            }
            let lhsAnchor = activePlayerMatchTimelineAnchor($0.match)
            let rhsAnchor = activePlayerMatchTimelineAnchor($1.match)
            if lhsAnchor != rhsAnchor {
                return lhsAnchor < rhsAnchor
            }
            if $0.match.roundLabel != $1.match.roundLabel {
                return $0.match.roundLabel.localizedStandardCompare($1.match.roundLabel) == .orderedAscending
            }
            return $0.id < $1.id
        }
    }

    private var pendingMatches: [PlayerMatch] {
        viewModel.tournaments.flatMap(\.pendingMatches).sorted {
            if $0.roundLabel != $1.roundLabel {
                return $0.roundLabel.localizedStandardCompare($1.roundLabel) == .orderedAscending
            }
            return $0.id < $1.id
        }
    }

    private var sessionTitle: String {
        guard let session = viewModel.session else {
            return "No session"
        }
        let cleanedDisplayName = cleanedIdentityText(viewModel.profile?.displayName ?? session.displayName)
        let cleanedGamerTag = cleanedIdentityText(viewModel.profile?.gamerTag ?? session.gamerTag)
        if cleanedDisplayName.isEmpty {
            return cleanedGamerTag
        }
        if cleanedGamerTag.isEmpty {
            return cleanedDisplayName
        }
        let normalizedDisplay = cleanedDisplayName.lowercased()
        let normalizedTag = cleanedGamerTag.lowercased()
        if normalizedDisplay == normalizedTag || normalizedDisplay.contains("| \(normalizedTag)") {
            return cleanedDisplayName
        }
        return "\(cleanedDisplayName) | \(cleanedGamerTag)"
    }

    private func cleanedIdentityText(_ value: String) -> String {
        var text = value
            .replacingOccurrences(of: "+¦+", with: " | ")
            .replacingOccurrences(of: "+|+", with: " | ")
            .replacingOccurrences(of: "¦", with: "|")
            .replacingOccurrences(of: "Â|", with: "|")
            .replacingOccurrences(of: "Â¦", with: "|")
            .replacingOccurrences(of: "+", with: " ")
        while text.contains("  ") {
            text = text.replacingOccurrences(of: "  ", with: " ")
        }
        text = text
            .replacingOccurrences(of: " | ", with: "|")
            .replacingOccurrences(of: "| ", with: "|")
            .replacingOccurrences(of: " |", with: "|")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        if text.contains("|") {
            let parts = text
                .split(separator: "|")
                .map { String($0).trimmingCharacters(in: .whitespacesAndNewlines) }
                .filter { !$0.isEmpty }
            return parts.joined(separator: " | ")
        }
        return text
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    if viewModel.session == nil {
                        SectionCard(title: "Player access") {
                            Text("You need a start.gg account to follow imported sets and play ladder.")
                            Text("You can sign in or create a start.gg account in a secure window within the app.")
                                .font(.footnote)
                                .foregroundStyle(.secondary)
                            Button("Sign in with start.gg") {
                                Task { await viewModel.beginStartggLogin() }
                            }
                            .playerPrimaryButton()
                        }
                    } else {
                        SectionCard(title: "Active session") {
                            Text(sessionTitle)
                        }
                        SectionCard(title: "Playing or called") {
                            if activeMatches.isEmpty {
                                Text("You have no active sets right now.")
                            } else {
                                ForEach(activeMatches) { entry in
                                    MatchSummaryView(match: entry.match)
                                    if entry.ladder {
                                        Text(playerLadderStatus(entry.match.status))
                                        if entry.match.canReviewLadderResult == true { PlayerLadderReviewButtons(tournament: entry.tournament, match: entry.match) }
                                        if entry.match.status == "PLAYING", entry.match.canPlayerReportMatch,
                                           entry.match.opponentParticipantId != nil {
                                            Button("Quick report") {
                                                pendingQuickReportSelection = DashboardQuickReportSelection(
                                                    tournament: entry.tournament,
                                                    match: entry.match,
                                                    ladder: true
                                                )
                                                quickReportBestOfOverride = entry.match.reportedBestOf
                                                showQuickReportModeDialog = true
                                            }
                                            .playerPrimaryButton()
                                        }
                                    } else if entry.match.canPlayerReportMatch && entry.match.opponentParticipantId != nil {
                                        Button("Quick report") {
                                            pendingQuickReportSelection = DashboardQuickReportSelection(
                                                tournament: entry.tournament,
                                                match: entry.match,
                                                ladder: false
                                            )
                                            quickReportBestOfOverride = entry.match.reportedBestOf
                                            showQuickReportModeDialog = true
                                        }
                                        .playerPrimaryButton()
                                    }
                                }
                            }
                        }
                        SectionCard(title: "Pending") {
                            if pendingMatches.isEmpty {
                                Text("No pending sets have an assigned opponent.")
                            } else {
                                ForEach(pendingMatches) { MatchSummaryView(match: $0) }
                            }
                        }
                    }
                }
                .padding()
            }
            .navigationTitle(BackendConfig.appTitle)
        }
        .confirmationDialog("Set format", isPresented: $showQuickReportModeDialog, titleVisibility: .visible) {
            if let selection = pendingQuickReportSelection {
                Button("Tournament format (Bo\(selection.match.effectiveBestOf))") {
                    quickReportBestOfOverride = nil
                    quickReportSelection = selection
                    pendingQuickReportSelection = nil
                }
                Button("Bo1") {
                    quickReportBestOfOverride = 1
                    quickReportSelection = selection
                    pendingQuickReportSelection = nil
                }
                Button("Bo3") {
                    quickReportBestOfOverride = 3
                    quickReportSelection = selection
                    pendingQuickReportSelection = nil
                }
                Button("Bo5") {
                    quickReportBestOfOverride = 5
                    quickReportSelection = selection
                    pendingQuickReportSelection = nil
                }
            }
            Button("Cancel", role: .cancel) {
                pendingQuickReportSelection = nil
            }
        } message: {
            Text("Select whether this set used the default tournament format or a different one.")
        }
        .sheet(item: $quickReportSelection) { selection in
            QuickReportView(match: selection.match, effectiveBestOf: quickReportBestOfOverride ?? selection.match.effectiveBestOf) { games in
                Task {
                    await viewModel.reportDetailedResult(
                        selection.tournament,
                        match: selection.match,
                        bestOfOverride: quickReportBestOfOverride,
                        games: games,
                        ladder: selection.ladder
                    )
                    quickReportSelection = nil
                }
            }
        }
    }
}

struct TournamentsView: View {
    @EnvironmentObject private var viewModel: PlayerAppViewModel

    var body: some View {
        NavigationStack {
            List(viewModel.tournaments) { tournament in
                NavigationLink(tournament.title) {
                    TournamentDetailView(tournament: tournament)
                }
            }
            .navigationTitle("Tournaments")
            .toolbar {
                Button("Reload") {
                    Task { await viewModel.reloadAll() }
                }
            }
        }
    }
}

private func playerBracketStageLabel(_ stage: String) -> String? {
    switch stage.trimmingCharacters(in: .whitespacesAndNewlines).uppercased() {
    case "POOLS":
        return "Pools"
    case "WINNERS":
        return "Bracket Winners"
    case "LOSERS":
        return "Bracket Losers"
    case "FINALS":
        return "Bracket Finals"
    default:
        return nil
    }
}

private func playerBracketStageSortOrder(_ stage: String) -> Int {
    switch stage.trimmingCharacters(in: .whitespacesAndNewlines).uppercased() {
    case "POOLS": return 0
    case "WINNERS": return 1
    case "LOSERS": return 2
    case "FINALS": return 3
    default: return 4
    }
}

private func playerNaturalLabelParts(_ value: String) -> [String] {
    let pattern = #"\d+|\D+"#
    let regex = try? NSRegularExpression(pattern: pattern)
    let range = NSRange(location: 0, length: value.utf16.count)
    return (regex?.matches(in: value, range: range) ?? []).compactMap { match in
        guard let range = Range(match.range, in: value) else { return nil }
        return String(value[range])
    }
}

private func playerNaturalLabelLessThan(_ left: String, _ right: String) -> Bool {
    let leftParts = playerNaturalLabelParts(left)
    let rightParts = playerNaturalLabelParts(right)
    let count = min(leftParts.count, rightParts.count)
    for index in 0..<count {
        let leftChunk = leftParts[index]
        let rightChunk = rightParts[index]
        if let leftNumber = Int(leftChunk.trimmingCharacters(in: .whitespacesAndNewlines)),
           let rightNumber = Int(rightChunk.trimmingCharacters(in: .whitespacesAndNewlines)),
           leftNumber != rightNumber {
            return leftNumber < rightNumber
        }
        if leftChunk != rightChunk {
            return leftChunk.localizedStandardCompare(rightChunk) == .orderedAscending
        }
    }
    return leftParts.count < rightParts.count
}

private func playerBracketMatchOrder(_ left: PlayerBracketMatch, _ right: PlayerBracketMatch) -> Bool {
    if playerBracketStageSortOrder(left.bracketStage) != playerBracketStageSortOrder(right.bracketStage) {
        return playerBracketStageSortOrder(left.bracketStage) < playerBracketStageSortOrder(right.bracketStage)
    }
    if (left.poolLabel ?? "") != (right.poolLabel ?? "") {
        return playerNaturalLabelLessThan(left.poolLabel ?? "", right.poolLabel ?? "")
    }
    if left.roundNumber != right.roundNumber {
        return left.roundNumber < right.roundNumber
    }
    return left.matchNumber < right.matchNumber
}

struct BracketView: View {
    @EnvironmentObject private var viewModel: PlayerAppViewModel

    private var tournamentsWithBracket: [PlayerTournament] {
        viewModel.tournaments.filter { !$0.bracketMatches.isEmpty }
    }

    var body: some View {
        NavigationStack {
            Group {
                if tournamentsWithBracket.isEmpty {
                    ScrollView {
                        VStack(alignment: .leading, spacing: 16) {
                            SectionCard(title: "Bracket") {
                                Text("No brackets are currently available.")
                                Text("Once you load a tournament in management, its classic and modern brackets will appear here.")
                                    .foregroundStyle(.secondary)
                            }
                        }
                        .padding()
                    }
                } else {
                    List(tournamentsWithBracket) { tournament in
                        NavigationLink(tournament.title) {
                            PlayerTournamentBracketView(tournament: tournament)
                        }
                    }
                }
            }
            .navigationTitle("Bracket")
            .toolbar {
                Button("Reload") {
                    Task { await viewModel.reloadAll() }
                }
            }
        }
    }
}

private struct PlayerTournamentBracketView: View {
    @EnvironmentObject private var viewModel: PlayerAppViewModel
    let tournament: PlayerTournament
    @State private var renderMode: PlayerBracketRenderMode = .classic

    private var currentTournament: PlayerTournament {
        viewModel.tournaments.first(where: { $0.tournamentId == tournament.tournamentId }) ?? tournament
    }

    private var sortedBracketMatches: [PlayerBracketMatch] {
        currentTournament.bracketMatches.sorted(by: playerBracketMatchOrder)
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                SectionCard(title: currentTournament.title) {
                    Text(currentTournament.gameTitle)
                    Text(currentTournament.status)
                        .foregroundStyle(.secondary)
                }

                SectionCard(title: "Bracket view") {
                    HStack(spacing: 12) {
                        ForEach(PlayerBracketRenderMode.allCases) { option in
                            Button(option == renderMode ? "[\(option.title)]" : option.title) {
                                renderMode = option
                            }
                            .buttonStyle(.bordered)
                            .tint(renderMode == option ? PlayerPalette.accent : PlayerPalette.secondaryText)
                            .accessibilityValue(renderMode == option ? "Selected" : "")
                        }
                    }
                }

                SectionCard(title: "Tournament bracket") {
                    PlayerBracketPanel(
                        tournament: currentTournament,
                        matches: sortedBracketMatches,
                        renderMode: renderMode
                    )
                }
            }
            .padding()
        }
        .navigationTitle("Bracket")
    }
}

private struct PlayerBracketPanel: View {
    let tournament: PlayerTournament
    let matches: [PlayerBracketMatch]
    let renderMode: PlayerBracketRenderMode

    var body: some View {
        if matches.isEmpty {
            Text("The bracket is not available for this tournament yet.")
                .foregroundStyle(.secondary)
        } else if renderMode == .modern {
            PlayerModernBracketPanel(
                tournament: tournament,
                matches: matches
            )
        } else {
            let groupedStages = Dictionary(grouping: matches) { $0.bracketStage }
            VStack(alignment: .leading, spacing: 18) {
                ForEach(groupedStages.keys.sorted(by: {
                    if playerBracketStageSortOrder($0) != playerBracketStageSortOrder($1) {
                        return playerBracketStageSortOrder($0) < playerBracketStageSortOrder($1)
                    }
                    return playerNaturalLabelLessThan($0, $1)
                }), id: \.self) { stage in
                    if let stageMatches = groupedStages[stage] {
                        PlayerBracketStageSection(stage: stage, matches: stageMatches, renderMode: renderMode)
                    }
                }
            }
        }
    }
}

private struct PlayerModernBracketPanel: View {
    let tournament: PlayerTournament
    let matches: [PlayerBracketMatch]
    @Environment(\.colorScheme) private var colorScheme
    @ScaledMetric(relativeTo: .body) private var bracketTextSize: Double = 14
    @State private var fullscreen = false
    @StateObject private var browser = ModernBracketBrowserHandle()

    private var html: String {
        buildModernBracketHTML(tournament: tournament,
            matches: matches.filter { !playerIsDormantGrandFinalReset(allMatches: matches, match: $0) },
            selectableMatchIds: [], darkTheme: colorScheme == .dark, readingScale: bracketTextSize / 14)
    }
    private var board: some View {
        ModernBracketWebView(html: html, stateKey: "player:\(tournament.tournamentId)", browser: browser, onMatchTap: { _ in })
    }
    var body: some View {
        VStack(spacing: 8) {
            HStack {
                Spacer()
                Button("Fullscreen", systemImage: "arrow.up.left.and.arrow.down.right") {
                    browser.capture { fullscreen = true }
                }
            }
            if fullscreen { Color.clear.frame(height: 680) }
            else { board.frame(height: 680).clipShape(RoundedRectangle(cornerRadius: 20)) }
        }
        .fullScreenCover(isPresented: $fullscreen) {
            VStack(spacing: 0) {
                HStack {
                    Text(tournament.title).font(.headline).lineLimit(2)
                    Spacer()
                    Button("Close", systemImage: "arrow.down.right.and.arrow.up.left") {
                        browser.capture { fullscreen = false }
                    }
                }.padding()
                board
            }
            .background(Color(uiColor: .systemBackground))
        }
    }
}

private final class ModernBracketBrowserHandle: ObservableObject {
    let objectWillChange = ObservableObjectPublisher()
    weak var webView: WKWebView?
    var nativeViewport: ModernBracketWebView.Coordinator.NativeViewportState?

    func capture(completion: @escaping () -> Void) {
        guard let webView else { completion(); return }
        nativeViewport = ModernBracketWebView.Coordinator.NativeViewportState(scrollView: webView.scrollView)
        let coordinator = webView.navigationDelegate as? ModernBracketWebView.Coordinator
        webView.evaluateJavaScript("window.__gttModernBracketCaptureState ? window.__gttModernBracketCaptureState() : null") { result, _ in
            if let state = result as? String { coordinator?.cacheViewportState(state) }
            completion()
        }
    }
}

private struct ModernBracketWebView: UIViewRepresentable {
    let html: String
    let stateKey: String
    let browser: ModernBracketBrowserHandle
    let onMatchTap: (String) -> Void

    func makeCoordinator() -> Coordinator {
        Coordinator(stateKey: stateKey, onMatchTap: onMatchTap)
    }

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.defaultWebpagePreferences.allowsContentJavaScript = true
        configuration.userContentController.add(context.coordinator, name: "viewportState")
        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.isOpaque = false
        webView.backgroundColor = .clear
        webView.scrollView.backgroundColor = .clear
        webView.scrollView.showsHorizontalScrollIndicator = true
        webView.scrollView.showsVerticalScrollIndicator = true
        webView.navigationDelegate = context.coordinator
        webView.allowsBackForwardNavigationGestures = false
        browser.webView = webView
        return webView
    }

    static func dismantleUIView(_ webView: WKWebView, coordinator: Coordinator) {
        webView.configuration.userContentController.removeScriptMessageHandler(forName: "viewportState")
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        context.coordinator.stateKey = stateKey
        context.coordinator.onMatchTap = onMatchTap
        let nextHTMLFingerprint = Coordinator.viewportStableHTMLFingerprint(html)
        if context.coordinator.currentHTMLFingerprint != nextHTMLFingerprint {
            let hadRenderedHTML = !context.coordinator.currentHTMLFingerprint.isEmpty
            context.coordinator.currentHTMLFingerprint = nextHTMLFingerprint

            guard hadRenderedHTML else {
                context.coordinator.pendingViewportState = Coordinator.cachedViewportState(for: stateKey)
                context.coordinator.pendingNativeViewportState = browser.nativeViewport
                webView.loadHTMLString(html, baseURL: Bundle.main.bundleURL)
                return
            }

            let coordinator = context.coordinator
            coordinator.pendingNativeViewportState = Coordinator.NativeViewportState(scrollView: webView.scrollView)
            webView.evaluateJavaScript("window.__gttModernBracketCaptureState ? window.__gttModernBracketCaptureState() : null") { result, _ in
                if let state = result as? String, !state.isEmpty {
                    coordinator.pendingViewportState = state
                    coordinator.cacheViewportState(state)
                }
                webView.loadHTMLString(html, baseURL: Bundle.main.bundleURL)
            }
        }
    }

    final class Coordinator: NSObject, WKNavigationDelegate, WKScriptMessageHandler {
        private static var viewportStateByKey: [String: String] = [:]
        var stateKey: String
        var onMatchTap: (String) -> Void
        var currentHTMLFingerprint: String = ""
        var pendingViewportState: String?
        var pendingNativeViewportState: NativeViewportState?

        init(stateKey: String, onMatchTap: @escaping (String) -> Void) {
            self.stateKey = stateKey
            self.onMatchTap = onMatchTap
        }

        static func cachedViewportState(for key: String) -> String? {
            viewportStateByKey[key]
        }

        func cacheViewportState(_ state: String) {
            guard !state.isEmpty else { return }
            Self.viewportStateByKey[stateKey] = state
        }

        func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
            guard message.name == "viewportState", let state = message.body as? String else { return }
            cacheViewportState(state)
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            guard pendingViewportState != nil || pendingNativeViewportState != nil else { return }
            let state = pendingViewportState
            let nativeState = pendingNativeViewportState
            pendingViewportState = nil
            pendingNativeViewportState = nil

            restoreViewportState(webView: webView, htmlState: state, nativeState: nativeState)
            DispatchQueue.main.async { [weak webView] in
                guard let webView else { return }
                self.restoreViewportState(webView: webView, htmlState: state, nativeState: nativeState)
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.12) { [weak webView] in
                guard let webView else { return }
                self.restoreViewportState(webView: webView, htmlState: state, nativeState: nativeState)
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) { [weak webView] in
                guard let webView else { return }
                self.restoreViewportState(webView: webView, htmlState: state, nativeState: nativeState)
            }
        }

        func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            if let url = navigationAction.request.url, url.scheme == "gtt-match" {
                let matchId = url.host?.removingPercentEncoding ?? url.absoluteString.replacingOccurrences(of: "gtt-match://", with: "")
                onMatchTap(matchId)
                decisionHandler(.cancel)
                return
            }
            decisionHandler(.allow)
        }

        private func restoreViewportState(webView: WKWebView, htmlState: String?, nativeState: NativeViewportState?) {
            if let htmlState {
                webView.evaluateJavaScript(
                    "window.__gttModernBracketRestoreState && window.__gttModernBracketRestoreState(\(Self.javascriptStringLiteral(htmlState)))",
                    completionHandler: nil
                )
            }

            guard let nativeState else { return }
            let scrollView = webView.scrollView
            let maxOffsetX = max(0, scrollView.contentSize.width - scrollView.bounds.width)
            let maxOffsetY = max(0, scrollView.contentSize.height - scrollView.bounds.height)
            let offset = CGPoint(
                x: min(max(0, nativeState.contentOffset.x), maxOffsetX),
                y: min(max(0, nativeState.contentOffset.y), maxOffsetY)
            )
            let zoomScale = min(max(scrollView.minimumZoomScale, nativeState.zoomScale), scrollView.maximumZoomScale)
            if zoomScale.isFinite, zoomScale > 0, abs(scrollView.zoomScale - zoomScale) > 0.001 {
                scrollView.setZoomScale(zoomScale, animated: false)
            }
            scrollView.setContentOffset(offset, animated: false)
        }

        struct NativeViewportState {
            let contentOffset: CGPoint
            let zoomScale: CGFloat

            init(scrollView: UIScrollView) {
                self.contentOffset = scrollView.contentOffset
                self.zoomScale = scrollView.zoomScale
            }
        }

        static func viewportStableHTMLFingerprint(_ html: String) -> String {
            html
                .replacingOccurrences(
                    of: #"data-rendered-at-ms="\d+""#,
                    with: #"data-rendered-at-ms="0""#,
                    options: .regularExpression
                )
                .replacingOccurrences(
                    of: #"data-initial-timer-seconds="-?\d+""#,
                    with: #"data-initial-timer-seconds="0""#,
                    options: .regularExpression
                )
        }

        private static func javascriptStringLiteral(_ value: String) -> String {
            let escaped = value
                .replacingOccurrences(of: "\\", with: "\\\\")
                .replacingOccurrences(of: "'", with: "\\'")
                .replacingOccurrences(of: "\n", with: "\\n")
                .replacingOccurrences(of: "\r", with: "\\r")
            return "'\(escaped)'"
        }
    }
}

private struct PlayerBracketStageSection: View {
    let stage: String
    let matches: [PlayerBracketMatch]
    let renderMode: PlayerBracketRenderMode

    private var rounds: [(Int, [PlayerBracketMatch])] {
        Dictionary(grouping: matches, by: \.roundNumber)
            .sorted { $0.key < $1.key }
            .map { ($0.key, $0.value.sorted { $0.matchNumber < $1.matchNumber }) }
    }

    private var poolGroups: [(String, [PlayerBracketMatch])] {
        Dictionary(grouping: matches) { $0.poolLabel ?? "Pool" }
            .sorted { playerNaturalLabelLessThan($0.key, $1.key) }
            .map { ($0.key, $0.value.sorted { lhs, rhs in
                if lhs.roundNumber != rhs.roundNumber { return lhs.roundNumber < rhs.roundNumber }
                return lhs.matchNumber < rhs.matchNumber
            }) }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if let label = playerBracketStageLabel(stage) {
                Text(label)
                    .font(.headline)
            }

            if poolGroups.count > 1 {
                VStack(alignment: .leading, spacing: 18) {
                    ForEach(poolGroups, id: \.0) { groupName, groupMatches in
                        let groupedRounds = Dictionary(grouping: groupMatches, by: \.roundNumber)
                            .sorted { $0.key < $1.key }
                            .map { ($0.key, $0.value.sorted { $0.matchNumber < $1.matchNumber }) }

                        VStack(alignment: .leading, spacing: 12) {
                            Text(groupName)
                                .font(.title3.weight(.bold))

                            ScrollView(.horizontal, showsIndicators: true) {
                                HStack(alignment: .top, spacing: 18) {
                                    ForEach(Array(groupedRounds.enumerated()), id: \.offset) { index, round in
                                        VStack(alignment: .leading, spacing: 12) {
                                            Text("Round \(round.0)")
                                                .font(.subheadline.weight(.semibold))
                                                .foregroundStyle(.secondary)

                                            ForEach(round.1) { match in
                                                PlayerBracketMatchCard(match: match, renderMode: renderMode)
                                            }
                                        }
                                        .frame(width: 260, alignment: .topLeading)

                                        if index < groupedRounds.count - 1 {
                                            Image(systemName: "arrow.right")
                                                .font(.title3.weight(.semibold))
                                                .foregroundStyle(.secondary)
                                                .padding(.top, 60)
                                        }
                                    }
                                }
                                .padding(.vertical, 4)
                            }
                        }
                        .padding(14)
                        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 18))
                    }
                }
            } else {
                ScrollView(.horizontal, showsIndicators: true) {
                    HStack(alignment: .top, spacing: 18) {
                        ForEach(Array(rounds.enumerated()), id: \.offset) { index, round in
                            VStack(alignment: .leading, spacing: 12) {
                                Text("Round \(round.0)")
                                    .font(.subheadline.weight(.semibold))
                                    .foregroundStyle(.secondary)

                                ForEach(round.1) { match in
                                    PlayerBracketMatchCard(match: match, renderMode: renderMode)
                                }
                            }
                            .frame(width: 260, alignment: .topLeading)

                            if index < rounds.count - 1 {
                                Image(systemName: "arrow.right")
                                    .font(.title3.weight(.semibold))
                                    .foregroundStyle(.secondary)
                                    .padding(.top, 60)
                            }
                        }
                    }
                    .padding(.vertical, 4)
                }
            }
        }
    }
}

private struct PlayerBracketMatchCard: View {
    let match: PlayerBracketMatch
    let renderMode: PlayerBracketRenderMode

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(match.label)
                .font(.headline)

            VStack(alignment: .leading, spacing: 8) {
                ForEach(match.participants.sorted { $0.slot < $1.slot }) { participant in
                    PlayerBracketParticipantRow(match: match, participant: participant, modern: renderMode == .modern)
                }
            }
            .padding(10)
            .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 12))

            HStack {
                Text(match.status)
                    .font(.caption.weight(.semibold))
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(Capsule().fill(renderMode == .modern ? Color.mint.opacity(0.18) : Color.blue.opacity(0.15)))
                Spacer()
                if let station = match.stationLabel {
                    Text(station)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16))
    }
}

private struct PlayerBracketParticipantRow: View {
    let match: PlayerBracketMatch
    let participant: PlayerBracketMatchParticipant
    let modern: Bool

    var body: some View {
        let participantId = participant.participantId
        let isAdvanced = match.advancingParticipantIds.contains(participantId)
        let isWinner = participantId == match.winnerParticipantId || isAdvanced
        let isWalkoverLoser = match.status.trimmingCharacters(in: .whitespacesAndNewlines).uppercased() == "WALKOVER"
            && participantId != match.winnerParticipantId
            && !isAdvanced
        let lastCharacter = latestCharacterForParticipant(match, participantId: participantId)

        HStack(spacing: 10) {
            ForEach(Array(lastCharacter.components(separatedBy: " / ").enumerated()), id: \.offset) { _, name in SmashCharacterIcon(name: name, size: 24) }
            Text(participant.displayName)
                .lineLimit(1)
                .fontWeight(isWinner ? .semibold : .regular)
            Spacer(minLength: 8)
            Text(playerBracketScoreLabel(match, participantId: participantId, score: participant.score))
                .fontWeight(.semibold)
                .foregroundStyle(isWalkoverLoser ? Color.red : Color.primary)
        }
        .font(.subheadline)
        .padding(.horizontal, modern ? 12 : 0)
        .padding(.vertical, modern ? 10 : 0)
        .background {
            if modern {
                RoundedRectangle(cornerRadius: 12)
                    .fill(
                        isWinner
                            ? Color.green.opacity(0.12)
                            : isWalkoverLoser
                                ? Color.red.opacity(0.10)
                                : Color.purple.opacity(0.10)
                    )
            }
        }
        .foregroundStyle(isWinner ? PlayerPalette.success : Color.primary)
    }
}

private struct IOSModernSection: Identifiable {
    let id: String
    let label: String
    let clusters: [IOSModernCluster]
}

private struct IOSModernCluster: Identifiable {
    let id: String
    let label: String
    let rounds: [IOSModernRound]
}

private struct IOSModernRound: Identifiable {
    let id: String
    let title: String
    let matches: [PlayerBracketMatch]
}

private func buildModernBracketHTML(
    tournament: PlayerTournament,
    matches: [PlayerBracketMatch],
    selectableMatchIds: Set<String>,
    darkTheme: Bool,
    readingScale: Double
) -> String {
    let appearanceClass = darkTheme ? "theme-dark" : "theme-light"
    let sections = buildIOSModernSections(matches: matches)
    let sectionButtons = sections.map { section in
        #"<button class="section-tab" data-target="\#(escapeModernHTML(section.id))">\#(escapeModernHTML(section.label))</button>"#
    }.joined()
    let sectionsHtml = sections.map { section in
        buildModernSectionHTML(section: section, tournament: tournament, selectableMatchIds: selectableMatchIds)
    }.joined(separator: "\n")
    let emptyState = sections.isEmpty
        ? #"<div class="empty-state">There is not enough structure to render the modern bracket.</div>"#
        : ""

    return """
    <!doctype html>
    <html lang="en">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=3, user-scalable=yes">
      <style>
        :root {
          color-scheme: dark;
          --bg: #0f1724;
          --panel: #182235;
          --panel-2: #1f2940;
          --text: #edf2ff;
          --muted: #9fb1d1;
          --line: rgba(180, 197, 232, 0.18);
          --accent: #6ea8ff;
          --winner-bg: rgba(52, 211, 153, 0.14);
          --winner-line: rgba(52, 211, 153, 0.5);
          --loser-bg: rgba(248, 113, 113, 0.14);
          --loser-line: rgba(248, 113, 113, 0.45);
          --neutral-bg: rgba(139, 92, 246, 0.12);
          --neutral-line: rgba(139, 92, 246, 0.22);
          --called-bg: rgba(250, 204, 21, 0.18);
          --playing-bg: rgba(34, 197, 94, 0.18);
          --dq-pill: #f8fafc;
          --dq-text: #111827;
        }
        * { box-sizing: border-box; }
        html, body {
          margin: 0;
          padding: 0;
          background: transparent;
          color: var(--text);
          font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif;
        }
        body {
          padding: 14px;
        }
        .root {
          background: linear-gradient(180deg, rgba(15, 23, 36, 0.96), rgba(17, 26, 43, 0.98));
          border: 1px solid var(--line);
          border-radius: 22px;
          padding: 14px;
          box-shadow: 0 16px 42px rgba(8, 13, 24, 0.34);
        }
        .tabs {
          display: flex;
          gap: 10px;
          overflow-x: auto;
          padding-bottom: 8px;
          margin-bottom: 14px;
        }
        .tabs::-webkit-scrollbar,
        .bracket-scroll::-webkit-scrollbar { display: none; }
        .section-tab {
          border: 1px solid rgba(110, 168, 255, 0.26);
          background: rgba(35, 50, 77, 0.96);
          color: var(--text);
          border-radius: 999px;
          padding: 8px 14px;
          font-size: 13px;
          font-weight: 700;
          white-space: nowrap;
        }
        .section-tab.active {
          background: linear-gradient(180deg, #7fb1ff, #5e87ff);
          color: #071223;
          border-color: transparent;
        }
        .bracket-section { display: none; }
        .bracket-section.active { display: block; }
        .section-card {
          display: flex;
          flex-direction: column;
          gap: 18px;
        }
        .cluster-card {
          background: rgba(24, 34, 53, 0.94);
          border: 1px solid var(--line);
          border-radius: 20px;
          padding: 16px;
          box-shadow: 0 12px 28px rgba(7, 12, 22, 0.26);
        }
        .section-title {
          font-size: 22px;
          font-weight: 800;
          margin: 0 0 2px;
        }
        .cluster-title {
          color: #d9e6ff;
          font-size: 14px;
          font-weight: 800;
          margin: 0 0 10px;
          letter-spacing: 0.03em;
        }
        .bracket-scroll {
          overflow: auto;
          -webkit-overflow-scrolling: touch;
          min-height: 520px;
          max-height: 560px;
          padding-bottom: 8px;
          touch-action: pan-x pan-y;
        }
        .bracket-scale-wrap {
          position: relative;
          min-width: 100%;
          min-height: 520px;
        }
        .bracket-canvas {
          position: relative;
          min-height: 520px;
          transform-origin: top left;
        }
        .round-title {
          position: absolute;
          top: 0;
          color: #cfe0ff;
          font-size: 15px;
          font-weight: 800;
          letter-spacing: 0.01em;
          white-space: nowrap;
        }
        .connector-layer {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          pointer-events: none;
          overflow: visible;
        }
        .round-column {
          position: absolute;
          width: 248px;
        }
        .match-card {
          position: absolute;
          width: 248px;
          background: linear-gradient(180deg, rgba(31, 41, 64, 0.98), rgba(24, 34, 53, 0.98));
          border-radius: 18px;
          border: 1px solid var(--line);
          overflow: hidden;
          box-shadow: 0 10px 22px rgba(7, 12, 22, 0.26);
        }
        .match-card.called {
          border-color: rgba(250, 204, 21, 0.55);
          box-shadow: 0 12px 26px rgba(250, 204, 21, 0.14);
        }
        .match-card.playing {
          border-color: rgba(34, 197, 94, 0.55);
          box-shadow: 0 12px 26px rgba(34, 197, 94, 0.16);
        }
        .match-card.actionable {
          cursor: pointer;
        }
        .match-card.actionable .match-header {
          background: rgba(92, 126, 189, 0.08);
        }
        .match-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          padding: 10px 12px 8px;
          font-size: 11px;
          text-transform: uppercase;
          color: var(--muted);
          letter-spacing: 0.06em;
        }
        .status-pill {
          padding: 4px 8px;
          border-radius: 999px;
          color: #d9e5ff;
          background: rgba(75, 108, 171, 0.18);
          border: 1px solid rgba(120, 154, 216, 0.16);
          font-size: 11px;
          font-weight: 800;
          white-space: nowrap;
        }
        .match-card.called .status-pill {
          color: #fff7d6;
          background: rgba(250, 204, 21, 0.18);
          border-color: rgba(250, 204, 21, 0.34);
        }
        .match-card.playing .status-pill {
          color: #dcfce7;
          background: rgba(34, 197, 94, 0.18);
          border-color: rgba(34, 197, 94, 0.34);
        }
        .match-timer {
          padding: 0 12px 10px;
          font-size: 12px;
          font-weight: 800;
          letter-spacing: 0.03em;
        }
        .match-timer.called { color: #fde68a; }
        .match-timer.playing { color: #86efac; }
        .entrant-row {
          align-items: center;
          gap: 10px;
          padding: 10px 12px;
          border-top: 1px solid rgba(255,255,255,0.03);
          background: var(--neutral-bg);
          box-shadow: inset 3px 0 0 var(--neutral-line);
          display: flex;
        }
        .entrant-row.winner {
          background: var(--winner-bg);
          box-shadow: inset 3px 0 0 var(--winner-line);
        }
        .entrant-row.loser {
          background: var(--loser-bg);
          box-shadow: inset 3px 0 0 var(--loser-line);
        }
        .entrant-main {
          display: flex;
          align-items: center;
          gap: 10px;
          min-width: 0;
          flex: 1;
        }
        .entrant-icon {
          width: 22px;
          height: 22px;
          border-radius: 7px;
          object-fit: contain;
          background: rgba(255,255,255,0.08);
          flex: 0 0 22px;
        }
        .entrant-name {
          flex: 1;
          font-size: 16px;
          font-weight: 700;
          color: var(--text);
          line-height: 1.2;
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .entrant-score {
          min-width: 48px;
          text-align: right;
          font-size: 20px;
          font-weight: 900;
          color: #f8fbff;
        }
        .entrant-score.dq {
          min-width: 56px;
          font-size: 13px;
          text-align: center;
          color: var(--dq-text);
          background: var(--dq-pill);
          border-radius: 999px;
          padding: 6px 10px;
        }
        .match-footer {
          padding: 8px 12px 12px;
          font-size: 12px;
          color: var(--muted);
        }
        .empty-state {
          padding: 16px;
          border-radius: 16px;
          border: 1px dashed rgba(173, 190, 223, 0.28);
          color: var(--muted);
          font-size: 14px;
        }
        .connector-path {
          fill: none;
          stroke: rgba(184, 199, 228, 0.58);
          stroke-width: 2;
          stroke-linecap: round;
          stroke-linejoin: round;
        }
        html, body { height: 100%; overflow: hidden; }
        .root { height: 100%; display: flex; flex-direction: column; }
        .tabs { flex-shrink: 0; }
        .bracket-section.active { display: flex; flex: 1; min-height: 0; }
        .unified-viewport { width: 100%; overflow: auto; max-height: none; min-height: 0; flex: 1; overscroll-behavior: contain; }
            .match-card { border-radius: 4px; box-shadow: none; }
            .entrant-row { border-radius: 0; min-height: 32px; }
            .entrant-name { font-size: 14px; font-weight: 500; }
            .entrant-score { font-size: 16px; border-left: 1px solid var(--line); padding-left: 8px; }
            .round-title { font-size: 13px; }

            /* MAIN readable bracket */
            body { --reading-scale: 1; }
            body.theme-light {
              color-scheme: light; --bg:#f3f5fa; --panel:#ffffff; --panel-2:#e8ecf4;
              --text:#172033; --muted:#475569; --line:#cbd5e1; --accent:#3345a4;
              --winner-bg:#dcf5e5; --winner-line:#17643b; --loser-bg:#ffe4e8; --loser-line:#b42335;
              --neutral-bg:#e8ecf4; --neutral-line:#64748b; --dq-pill:#b42335; --dq-text:#ffffff;
            }
            .root { background:var(--bg); }
            .cluster-card, .match-card { background:var(--panel); border-color:var(--line); }
            .round-title, .cluster-title, .section-title, .entrant-score { color:var(--text); }
            .round-column, .match-card { width:calc(280px * var(--reading-scale)); }
            .round-title { font-size:calc(14px * var(--reading-scale)); }
            .match-header { font-size:calc(12px * var(--reading-scale)); }
            .match-header, .entrant-main { min-width:0; }
            .entrant-name { font-size:calc(15px * var(--reading-scale)); line-height:1.3; white-space:normal; overflow:visible; text-overflow:clip; overflow-wrap:anywhere; }
            .entrant-score { font-size:calc(17px * var(--reading-scale)); flex-shrink:0; min-width:28px; }
            .match-footer, .match-meta, .match-timer { font-size:calc(13px * var(--reading-scale)); }
            .section-tab { min-height:44px; font-size:calc(14px * var(--reading-scale)); }
            .theme-light .section-tab { color:var(--text); background:var(--panel); border-color:#64748b; }
            .theme-light .section-tab.active { color:#ffffff; background:#3345a4; }
            .theme-light .status-pill { color:#3345a4; background:#e2e7ff; }
            .theme-light .match-card.called .status-pill, .theme-light .match-timer.called { color:#805400; background:#fff0cc; }
            .theme-light .match-card.playing .status-pill, .theme-light .match-timer.playing { color:#17643b; background:#dcf5e5; }
            .theme-light .connector-path { stroke:#64748b; }
            @media (prefers-reduced-motion: reduce) { * { animation:none !important; transition:none !important; } }
          </style>
    </head>
    <body class="\(appearanceClass)" style="--reading-scale:\(readingScale)">
      <div class="root">
        <div class="tabs">\(sectionButtons)</div>
        \(emptyState)
        \(sectionsHtml)
      </div>
      <script>
        (function() {
          \(modernBracketSearchScript)

          // One scrolling surface for the whole phase: winners above losers.
          document.querySelectorAll('.bracket-section').forEach(section => {
            section.querySelectorAll('.bracket-scroll').forEach(inner => {
              inner.classList.remove('bracket-scroll');
            });
            const viewport = document.createElement('div');
            viewport.className = 'bracket-scroll unified-viewport';
            while (section.firstChild) viewport.appendChild(section.firstChild);
            section.appendChild(viewport);
          });
          const tabs = Array.from(document.querySelectorAll('.section-tab'));
          const sections = Array.from(document.querySelectorAll('.bracket-section'));
          const defaultZoom = 0.72;
          const minZoom = 0.38;
          const maxZoom = 1.9;
          const zoomState = new Map();

          function activate(id) {
            tabs.forEach(tab => tab.classList.toggle('active', tab.dataset.target === id));
            sections.forEach(section => section.classList.toggle('active', section.id === id));
            requestAnimationFrame(layoutAllSections);
            updateTimingDisplays();
          }

          function layoutAllSections() {
            document.querySelectorAll('.bracket-section.active .bracket-canvas').forEach(layoutSection);
          }

          function layoutSection(canvas) {
            const columns = Array.from(canvas.querySelectorAll('.round-column'));
            if (columns.length === 0) return;
            const cardWidth = parseFloat(getComputedStyle(columns[0]).width);
            const columnGap = 98;
            const topPadding = 36;
            const titleHeight = Math.max(28, ...columns.map(column => column.querySelector('.round-title').offsetHeight + 8));
            const verticalGap = 24;
            const connectorSvg = canvas.querySelector('.connector-layer');
            const scaleWrap = canvas.parentElement;
            const sectionId = canvas.closest('.bracket-scroll').querySelector('.bracket-canvas').dataset.sectionId;
            const zoom = zoomState.get(sectionId) ?? defaultZoom;
            connectorSvg.innerHTML = '';
            let maxHeight = 520;
            const globalCardHeight = columns.reduce((max, column) => {
              const cards = Array.from(column.querySelectorAll('.match-card'));
              const columnMax = cards.reduce((cardMax, card) => Math.max(cardMax, card.offsetHeight || 0), 0);
              return Math.max(max, columnMax);
            }, 116);
            const rowUnit = globalCardHeight + verticalGap;
            const positionedCardByMatchId = new Map();

            columns.forEach((column, columnIndex) => {
              column.style.left = `${columnIndex * (cardWidth + columnGap)}px`;
              column.style.top = '0px';
              const cards = Array.from(column.querySelectorAll('.match-card'));
              const cardPositions = [];
              cards.forEach((card, cardIndex) => {
                const cardHeight = card.offsetHeight || globalCardHeight;
                let top;
                if (columnIndex === 0) {
                  top = topPadding + titleHeight + (cardIndex * rowUnit);
                } else {
                  const sourceIds = String(card.dataset.sourceMatchIds || '')
                    .split(',')
                    .map(value => value.trim())
                    .filter(Boolean);
                  const sources = sourceIds
                    .map(sourceId => positionedCardByMatchId.get(sourceId))
                    .filter(source => source && source.card?.dataset?.connectionGroup === card.dataset.connectionGroup);
                  if (sources.length >= 2) {
                    const sourceCenter = sources.reduce((sum, source) => sum + source.top + (source.height / 2), 0) / sources.length;
                    top = sourceCenter - (cardHeight / 2);
                  } else if (sources.length === 1) {
                    top = (sources[0].top + (sources[0].height / 2)) - (cardHeight / 2);
                  } else {
                    top = topPadding + titleHeight + (cardIndex * rowUnit);
                  }
                  const previousCard = cardPositions[cardPositions.length - 1];
                  if (previousCard) {
                    top = Math.max(top, previousCard.top + previousCard.height + verticalGap);
                  }
                }
                card.style.left = '0px';
                card.style.top = `${top}px`;
                const positionedCard = { card, top, height: cardHeight };
                cardPositions.push(positionedCard);
                if (card.dataset.matchId) {
                  positionedCardByMatchId.set(card.dataset.matchId, positionedCard);
                }
                maxHeight = Math.max(maxHeight, top + cardHeight + 30);
              });
            });

            const width = columns.length * cardWidth + Math.max(0, columns.length - 1) * columnGap + 32;
            canvas.style.width = `${width}px`;
            canvas.style.height = `${maxHeight}px`;
            connectorSvg.setAttribute('viewBox', `0 0 ${width} ${maxHeight}`);
            connectorSvg.setAttribute('width', `${width}`);
            connectorSvg.setAttribute('height', `${maxHeight}`);
            canvas.style.transform = `scale(${zoom})`;
            scaleWrap.style.width = `${Math.max(width * zoom, 320)}px`;
            scaleWrap.style.height = `${Math.max(520, maxHeight * zoom)}px`;

            const allCards = Array.from(canvas.querySelectorAll('.match-card'));
            const cardByMatchId = new Map(
              allCards
                .filter(card => card.dataset.matchId)
                .map(card => [card.dataset.matchId, card])
            );
            const drawnConnectors = new Set();
            allCards.forEach((targetCard) => {
              const sourceIds = String(targetCard.dataset.sourceMatchIds || '')
                .split(',')
                .map(value => value.trim())
                .filter(Boolean);
              sourceIds.forEach((sourceId) => {
                const sourceCard = cardByMatchId.get(sourceId);
                const connectorKey = `${sourceId}->${targetCard.dataset.matchId}`;
                if (!sourceCard || sourceCard.dataset.connectionGroup !== targetCard.dataset.connectionGroup || drawnConnectors.has(connectorKey)) return;
                drawConnector(canvas, connectorSvg, sourceCard, targetCard);
                drawnConnectors.add(connectorKey);
              });
            });
          }

          function drawConnector(canvas, svg, sourceCard, targetCard) {
            const sourceBox = getBoxRelativeToCanvas(sourceCard, canvas);
            const targetBox = getBoxRelativeToCanvas(targetCard, canvas);
            const x1 = sourceBox.x + sourceBox.width;
            const y1 = sourceBox.y + sourceBox.height / 2;
            const x2 = targetBox.x;
            const y2 = targetBox.y + targetBox.height / 2;
            const midX = x1 + (x2 - x1) * 0.5;
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('class', 'connector-path');
            path.setAttribute('d', `M ${x1} ${y1} H ${midX} V ${y2} H ${x2}`);
            svg.appendChild(path);
          }

          function getBoxRelativeToCanvas(element, canvas) {
            let x = 0;
            let y = 0;
            let node = element;
            while (node && node !== canvas) {
              x += node.offsetLeft || 0;
              y += node.offsetTop || 0;
              node = node.offsetParent;
            }
            return {
              x,
              y,
              width: element.offsetWidth || 0,
              height: element.offsetHeight || 0,
            };
          }

          function captureViewportState() {
            const activeSection = document.querySelector('.bracket-section.active');
            const tabsNode = document.querySelector('.tabs');
            const clusters = Array.from(document.querySelectorAll('.bracket-scroll')).map(scrollEl => {
              const canvas = scrollEl.querySelector('.bracket-canvas');
              const sectionId = canvas ? canvas.dataset.sectionId : '';
              if (!sectionId) return null;
              return {
                sectionId,
                zoom: zoomState.get(sectionId) ?? defaultZoom,
                scrollLeft: scrollEl.scrollLeft || 0,
                scrollTop: scrollEl.scrollTop || 0,
              };
            }).filter(Boolean);

            return JSON.stringify({
              search: window.__gttBracketSearch?.capture(),
              activeSectionId: activeSection ? activeSection.id : null,
              tabsScrollLeft: tabsNode ? (tabsNode.scrollLeft || 0) : 0,
              clusters,
            });
          }

          function restoreViewportState(serializedState) {
            let state = null;
            try {
              state = typeof serializedState === 'string' ? JSON.parse(serializedState) : serializedState;
            } catch (_) {
              state = null;
            }
            if (!state) return;
            window.__gttBracketSearch?.restore(state.search);

            if (state.activeSectionId && document.getElementById(state.activeSectionId)) {
              activate(state.activeSectionId);
            }

            if (Array.isArray(state.clusters)) {
              state.clusters.forEach(cluster => {
                if (!cluster || !cluster.sectionId || !Number.isFinite(Number(cluster.zoom))) return;
                zoomState.set(cluster.sectionId, Math.min(maxZoom, Math.max(minZoom, Number(cluster.zoom))));
              });
            }

            requestAnimationFrame(() => {
              layoutAllSections();
              requestAnimationFrame(() => {
                const tabsNode = document.querySelector('.tabs');
                if (tabsNode && Number.isFinite(Number(state.tabsScrollLeft))) {
                  tabsNode.scrollLeft = Number(state.tabsScrollLeft);
                }
                if (Array.isArray(state.clusters)) {
                  state.clusters.forEach(cluster => {
                    if (!cluster || !cluster.sectionId) return;
                    const canvas = Array.from(document.querySelectorAll('.bracket-canvas'))
                      .find(candidate => candidate.dataset.sectionId === cluster.sectionId);
                    const scrollEl = canvas ? canvas.closest('.bracket-scroll') : null;
                    if (!scrollEl) return;
                    scrollEl.scrollLeft = Number(cluster.scrollLeft) || 0;
                    scrollEl.scrollTop = Number(cluster.scrollTop) || 0;
                  });
                }
              });
            });
          }

          window.__gttModernBracketCaptureState = captureViewportState;
          window.__gttModernBracketRestoreState = restoreViewportState;

          let viewportPostTimer = null;
          function postViewportStateNow() {
            if (!window.webkit || !window.webkit.messageHandlers || !window.webkit.messageHandlers.viewportState) return;
            try {
              window.webkit.messageHandlers.viewportState.postMessage(captureViewportState());
            } catch (_) {}
          }
          function scheduleViewportStatePost() {
            if (viewportPostTimer) window.clearTimeout(viewportPostTimer);
            viewportPostTimer = window.setTimeout(postViewportStateNow, 80);
          }

          tabs.forEach(tab => tab.addEventListener('click', () => {
            activate(tab.dataset.target);
            scheduleViewportStatePost();
          }));
          document.querySelectorAll('.match-card[data-actionable="true"]').forEach(card => {
            card.addEventListener('click', () => {
              const matchId = card.dataset.matchId;
              if (matchId) {
                postViewportStateNow();
                window.location.href = `gtt-match://${encodeURIComponent(matchId)}`;
              }
            });
          });
          document.querySelectorAll('.bracket-scroll').forEach(scrollEl => {
            let pinchStartDistance = null;
            let pinchStartZoom = defaultZoom;
            let pinchCanvas = null;
            scrollEl.addEventListener('touchstart', event => {
              if (event.touches.length === 2) {
                pinchCanvas = scrollEl.querySelector('.bracket-canvas');
                if (!pinchCanvas) return;
                pinchStartDistance = touchDistance(event.touches[0], event.touches[1]);
                pinchStartZoom = zoomState.get(pinchCanvas.dataset.sectionId) ?? defaultZoom;
                event.preventDefault();
              }
            }, { passive: false });
              scrollEl.addEventListener('touchmove', event => {
                if (event.touches.length === 2 && pinchStartDistance && pinchCanvas) {
                  const currentDistance = touchDistance(event.touches[0], event.touches[1]);
                  const rawZoom = pinchStartZoom * (currentDistance / pinchStartDistance);
                  const nextZoom = Math.min(maxZoom, Math.max(minZoom, rawZoom));
                  zoomState.set(pinchCanvas.dataset.sectionId, nextZoom);
                  scrollEl.querySelectorAll('.bracket-canvas').forEach(layoutSection);
                  scheduleViewportStatePost();
                  event.preventDefault();
                }
              }, { passive: false });
              scrollEl.addEventListener('scroll', scheduleViewportStatePost, { passive: true });
              scrollEl.addEventListener('touchend', event => {
                if (event.touches.length < 2) {
                  pinchStartDistance = null;
                  pinchCanvas = null;
                  scheduleViewportStatePost();
                }
              });
              scrollEl.addEventListener('touchcancel', () => {
                pinchStartDistance = null;
                pinchCanvas = null;
                scheduleViewportStatePost();
              });
            });
            if (tabs.length > 0) {
              activate(tabs[0].dataset.target);
              scheduleViewportStatePost();
            }
          updateTimingDisplays();
          installModernBracketSearch(activate, layoutAllSections);
          setInterval(updateTimingDisplays, 1000);
          window.addEventListener('resize', () => requestAnimationFrame(layoutAllSections));
          if (window.visualViewport) {
            window.visualViewport.addEventListener('resize', () => requestAnimationFrame(layoutAllSections));
            window.visualViewport.addEventListener('scroll', () => requestAnimationFrame(layoutAllSections));
          }

          function touchDistance(a, b) {
            const dx = a.clientX - b.clientX;
            const dy = a.clientY - b.clientY;
            return Math.sqrt(dx * dx + dy * dy);
          }

          function updateTimingDisplays() {
            document.querySelectorAll('.match-timer[data-timing-role]').forEach(node => {
              const card = node.closest('.match-card');
              if (!card) return;
              const role = node.dataset.timingRole;
              const renderedAtMs = Number(card.dataset.renderedAtMs || '0');
              const initialTimerSeconds = Number(card.dataset.initialTimerSeconds || '0');
              const elapsedSinceRender = renderedAtMs > 0
                ? Math.max(0, Math.floor((Date.now() - renderedAtMs) / 1000))
                : 0;
              if (role === 'called') {
                if (!Number.isFinite(initialTimerSeconds)) {
                  node.textContent = 'Called';
                  return;
                }
                const remainingSeconds = Math.max(0, initialTimerSeconds - elapsedSinceRender);
                node.textContent = remainingSeconds > 0
                  ? `Tiempo restante: ${formatDuration(remainingSeconds)}`
                  : 'Time expired';
              } else if (role === 'playing') {
                if (!Number.isFinite(initialTimerSeconds)) {
                  node.textContent = 'Playing';
                  return;
                }
                const elapsedSeconds = Math.max(0, initialTimerSeconds + elapsedSinceRender);
                node.textContent = `Playing: ${formatDuration(elapsedSeconds)}`;
              } else {
                node.textContent = '';
              }
            });
          }

          function formatDuration(totalSeconds) {
            const minutes = Math.floor(totalSeconds / 60);
            const seconds = totalSeconds % 60;
            return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
          }
        })();
      </script>
    </body>
    </html>
    """
}

private func buildModernSectionHTML(
    section: IOSModernSection,
    tournament: PlayerTournament,
    selectableMatchIds: Set<String>
) -> String {
    let clustersHtml = section.clusters.map { cluster in
        buildModernClusterHTML(cluster: cluster, tournament: tournament, selectableMatchIds: selectableMatchIds)
    }.joined(separator: "\n")

    return """
    <section class="bracket-section" id="\(escapeModernHTML(section.id))">
      <div class="section-card" data-section-id="\(escapeModernHTML(section.id))">
        <div class="section-title">\(escapeModernHTML(section.label))</div>
      \(clustersHtml)
      </div>
    </section>
    """
}

private func buildModernClusterHTML(
    cluster: IOSModernCluster,
    tournament: PlayerTournament,
    selectableMatchIds: Set<String>
) -> String {
    let clusterMatches = cluster.rounds.flatMap(\.matches)
    let roundsHtml = cluster.rounds.enumerated().map { index, round in
        let cardsHtml = round.matches.enumerated().map { cardIndex, match in
            buildModernMatchCardHTML(
                tournament: tournament,
                match: match,
                roundIndex: index,
                matchIndex: cardIndex,
                clusterMatches: clusterMatches,
                connectionGroup: cluster.id,
                selectableMatchIds: selectableMatchIds
            )
        }.joined(separator: "\n")
        return """
        <div class="round-column" data-round-index="\(index)">
          <div class="round-title">\(escapeModernHTML(round.title))</div>
          \(cardsHtml)
        </div>
        """
    }.joined(separator: "\n")

    return """
    <div class="cluster-card">
      \(cluster.rounds.isEmpty ? "" : "<div class=\"cluster-title\">\(escapeModernHTML(cluster.label))</div>")
      <div class="bracket-scroll">
        <div class="bracket-scale-wrap">
          <div class="bracket-canvas" data-section-id="\(escapeModernHTML(cluster.id))" data-round-count="\(cluster.rounds.count)">
          <svg class="connector-layer"></svg>
          \(roundsHtml)
          </div>
        </div>
      </div>
    </div>
    """
}

private func buildModernMatchCardHTML(
    tournament: PlayerTournament,
    match: PlayerBracketMatch,
    roundIndex: Int,
    matchIndex: Int,
    clusterMatches: [PlayerBracketMatch],
    connectionGroup: String,
    selectableMatchIds: Set<String>
) -> String {
    let normalizedStatus = match.status.uppercased()
    let statusClass: String
    switch normalizedStatus {
    case "CALLED": statusClass = "called"
    case "PLAYING": statusClass = "playing"
    default: statusClass = ""
    }

    let participantRows = match.participants
        .sorted { $0.slot < $1.slot }
        .enumerated()
        .map { index, participant in
            let participantId = participant.participantId
            let isAdvanced = match.advancingParticipantIds.contains(participantId)
            let isWinner = participantId == match.winnerParticipantId || isAdvanced
            let isLoser = match.winnerParticipantId != nil && !participantId.isEmpty && !isWinner
            let rowClass = isWinner ? "winner" : (isLoser ? "loser" : "")
            let scoreLabel = modernParticipantScoreLabel(match: match, participant: participant)
            let scoreClass = scoreLabel == "DQ" ? "entrant-score dq" : "entrant-score"
            let latest = match.gameCharacterSelections?.max(by: { $0.gameNum < $1.gameNum })?.selections ?? match.characterSelections ?? []
            let icons = latest.filter { $0.participantId == participantId }.flatMap { $0.characterName.components(separatedBy: " / ") }
            let iconHtml = scoreLabel == "DQ" ? "" : icons.compactMap { name -> String? in
                guard let url = modernCharacterAssetURL(characterName: name, gameTitle: tournament.gameTitle) else { return nil }
                return #"<img class="entrant-icon" src="\#(escapeModernHTML(url))" alt="\#(escapeModernHTML(name))" />"#
            }.joined()
            return """
            <div class="entrant-row \(rowClass)">
              <div class="entrant-main">
                \(iconHtml)
                <div class="entrant-name">\(escapeModernHTML(participant.displayName))</div>
              </div>
              <div class="\(scoreClass)">\(escapeModernHTML(scoreLabel))</div>
            </div>
            """
        }
        .joined(separator: "\n")

    var footerBits: [String] = []
    if let station = match.stationLabel, !station.isEmpty { footerBits.append(station) }
    if match.advancersRequired > 1 { footerBits.append("Pasan \(match.advancersRequired)") }

    let sourceIds = modernSourceMatchIds(match: match, candidateMatches: clusterMatches).joined(separator: ",")
    let timingRole = normalizedStatus == "CALLED" ? "called" : (normalizedStatus == "PLAYING" ? "playing" : "")
    let isSelectable = selectableMatchIds.contains(match.id)
    let renderedAtMillis = Int64(Date().timeIntervalSince1970 * 1000)
    let initialTimerSeconds: Int
    switch normalizedStatus {
    case "CALLED":
        initialTimerSeconds = match.callTimeoutSeconds ?? 0
    case "PLAYING":
        initialTimerSeconds = parsePlayerIsoDate(match.startedAt).map { max(0, Int(Date().timeIntervalSince($0))) } ?? 0
    default:
        initialTimerSeconds = 0
    }

    return """
    <article class="match-card \(statusClass) \(isSelectable ? "actionable" : "")"
      data-match-id="\(escapeModernHTML(match.id))"
      data-search-names="\(escapeModernHTML(match.participants.filter { !$0.participantId.isEmpty && modernSourceMatchIdFromPlaceholder($0.participantId) == nil }.map(\.displayName).joined(separator: " · ")))"
      data-actionable="\(isSelectable ? "true" : "false")"
      data-source-match-ids="\(escapeModernHTML(sourceIds))"
      data-connection-group="\(escapeModernHTML(connectionGroup))"
      data-called-at="\(escapeModernHTML(match.calledAt ?? ""))"
      data-started-at="\(escapeModernHTML(match.startedAt ?? ""))"
      data-rendered-at-ms="\(renderedAtMillis)"
      data-initial-timer-seconds="\(initialTimerSeconds)"
      data-call-timeout-seconds="\(tournament.callTimeoutMinutes * 60)"
      data-round-index="\(roundIndex)"
      data-match-index="\(matchIndex)">
      <div class="match-header">
        <span>\(escapeModernHTML((match.displayIdentifier ?? "M\(match.matchNumber)") + (match.startggStreamLabel == nil ? "" : " · Stream gg")))</span>
        <span class="status-pill">\(escapeModernHTML(match.status))</span>
      </div>
      \(timingRole.isEmpty ? "" : "<div class=\"match-timer \(timingRole)\" data-timing-role=\"\(timingRole)\"></div>")
      \(participantRows)
      \(footerBits.isEmpty ? "" : "<div class=\"match-footer\">\(escapeModernHTML(footerBits.joined(separator: " · ")))</div>")
    </article>
    """
}

private func modernParticipantScoreLabel(match: PlayerBracketMatch, participant: PlayerBracketMatchParticipant) -> String {
    let participantId = participant.participantId
    let walkoverLoser = match.status == "WALKOVER" && match.winnerParticipantId != nil && participantId != match.winnerParticipantId
    return walkoverLoser ? "DQ" : "\(participant.score)"
}

private func modernCharacterAssetURL(characterName: String, gameTitle: String) -> String? {
    guard let resource = playerCharacterResourceName(characterName, gameTitle: gameTitle) else { return nil }
    let directory = playerIsRoa2GameTitle(gameTitle) ? "roa2-stock-icons" : "smash-stock-icons"
    guard let url = Bundle.main.url(forResource: resource, withExtension: "png", subdirectory: directory) else {
        return nil
    }
    return url.absoluteString
}

private func buildIOSModernSections(matches: [PlayerBracketMatch]) -> [IOSModernSection] {
    let sortedMatches = matches.sorted {
        if playerBracketStageSortOrder($0.bracketStage) != playerBracketStageSortOrder($1.bracketStage) {
            return playerBracketStageSortOrder($0.bracketStage) < playerBracketStageSortOrder($1.bracketStage)
        }
        let leftPhaseOrder = $0.phaseOrder ?? Int.max
        let rightPhaseOrder = $1.phaseOrder ?? Int.max
        if leftPhaseOrder != rightPhaseOrder { return leftPhaseOrder < rightPhaseOrder }
        if ($0.phaseName ?? "") != ($1.phaseName ?? "") {
            return playerNaturalLabelLessThan($0.phaseName ?? "", $1.phaseName ?? "")
        }
        if ($0.poolLabel ?? "") != ($1.poolLabel ?? "") {
            return playerNaturalLabelLessThan($0.poolLabel ?? "", $1.poolLabel ?? "")
        }
        if $0.roundNumber != $1.roundNumber { return $0.roundNumber < $1.roundNumber }
        return $0.matchNumber < $1.matchNumber
    }

    var sections: [IOSModernSection] = []
    sections.append(contentsOf: buildIOSModernPoolSections(poolMatches: sortedMatches.filter(\.isPoolPhase)))

    let bracketGrouped = Dictionary(grouping: sortedMatches.filter { !$0.isPoolPhase }) { match -> String in
        if modernHasExplicitPhaseStructure(match) {
            return match.phaseId ?? match.phaseName ?? "__main_bracket__"
        }
        return "__main_bracket__"
    }

    for key in bracketGrouped.keys.sorted(by: playerNaturalLabelLessThan) {
        guard let sectionMatches = bracketGrouped[key], let first = sectionMatches.first else { continue }
        sections.append(
            modernTournamentSectionFromMatches(
                id: "bracket:\(key)",
                label: modernTournamentBracketLabel(match: first),
                matches: sectionMatches
            )
        )
    }

    return sections.sorted {
        modernSectionSortOrder($0.label) == modernSectionSortOrder($1.label)
            ? playerNaturalLabelLessThan($0.label, $1.label)
            : modernSectionSortOrder($0.label) < modernSectionSortOrder($1.label)
    }
}

private func modernSectionSortOrder(_ label: String) -> Int {
    if label.starts(with: "Pool") || label.starts(with: "Group") { return 0 }
    if label.caseInsensitiveCompare("Pools") == .orderedSame { return 1 }
    if label.caseInsensitiveCompare("Winners bracket") == .orderedSame { return 2 }
    if label.caseInsensitiveCompare("Losers bracket") == .orderedSame { return 3 }
    if label.caseInsensitiveCompare("Final bracket") == .orderedSame { return 4 }
    return 5
}

private func modernHasExplicitPhaseStructure(_ match: PlayerBracketMatch) -> Bool {
    guard let phaseName = match.phaseName?.trimmingCharacters(in: .whitespacesAndNewlines), !phaseName.isEmpty else {
        return false
    }
    if match.isPoolPhase { return false }
    if phaseName.caseInsensitiveCompare(match.bracketStage) == .orderedSame { return false }
    if phaseName.caseInsensitiveCompare("bracket") == .orderedSame { return false }
    return true
}

private func buildIOSModernPoolSections(poolMatches: [PlayerBracketMatch]) -> [IOSModernSection] {
    guard !poolMatches.isEmpty else { return [] }
    let explicitGroups = Dictionary(grouping: poolMatches.filter { !($0.phaseGroupName?.isEmpty ?? true) }) { $0.phaseGroupName ?? "Pool" }
        .map { key, matches in
            modernPoolSectionFromMatches(id: "pool:\(key)", label: key, matches: matches)
        }

    let fallbackMatches = poolMatches.filter { $0.phaseGroupName?.isEmpty ?? true }
    let fallbackGroups = modernConnectedPoolGroups(matches: fallbackMatches).enumerated().map { index, group in
        modernPoolSectionFromMatches(id: "pool:local:\(index)", label: "Pool \(index + 1)", matches: group)
    }

    return (explicitGroups + fallbackGroups).sorted { playerNaturalLabelLessThan($0.label, $1.label) }
}

private func modernConnectedPoolGroups(matches: [PlayerBracketMatch]) -> [[PlayerBracketMatch]] {
    guard !matches.isEmpty else { return [] }
    let byId = Dictionary(uniqueKeysWithValues: matches.map { ($0.id, $0) })
    var adjacency = Dictionary(uniqueKeysWithValues: matches.map { ($0.id, Set<String>()) })
    for match in matches {
        for sourceId in modernSourceMatchIds(match: match) where byId[sourceId] != nil {
            adjacency[match.id, default: []].insert(sourceId)
            adjacency[sourceId, default: []].insert(match.id)
        }
    }
    var visited = Set<String>()
    var groups: [[PlayerBracketMatch]] = []
    for match in matches {
        guard visited.insert(match.id).inserted else { continue }
        var stack = [match.id]
        var groupIds: [String] = []
        while let current = stack.popLast() {
            groupIds.append(current)
            for neighbor in adjacency[current] ?? [] where visited.insert(neighbor).inserted {
                stack.append(neighbor)
            }
        }
        groups.append(groupIds.compactMap { byId[$0] })
    }
    return groups
}

private func modernPoolSectionFromMatches(id: String, label: String, matches: [PlayerBracketMatch]) -> IOSModernSection {
    let winnersLike = matches.filter { $0.bracketStage == "POOLS" || $0.bracketStage == "WINNERS" || $0.bracketStage == "FINALS" }
    let losers = matches.filter { $0.bracketStage == "LOSERS" }
    var clusters: [IOSModernCluster] = []
    if !winnersLike.isEmpty {
        clusters.append(
            modernClusterFromStageGroups(
                id: "\(id):winners",
                label: "Winners bracket",
                stageGroups: [
                    ("WINNERS", winnersLike.filter { $0.bracketStage == "POOLS" || $0.bracketStage == "WINNERS" }),
                    ("FINALS", winnersLike.filter { $0.bracketStage == "FINALS" })
                ]
            )
        )
    }
    if !losers.isEmpty {
        clusters.append(modernClusterFromMatches(id: "\(id):losers", label: "Losers bracket", matches: losers))
    }
    return IOSModernSection(id: id, label: label, clusters: clusters)
}

private func modernTournamentSectionFromMatches(id: String, label: String, matches: [PlayerBracketMatch]) -> IOSModernSection {
    let winners = matches.filter { $0.bracketStage == "POOLS" || $0.bracketStage == "WINNERS" }
    let losers = matches.filter { $0.bracketStage == "LOSERS" }
    let finals = matches.filter { $0.bracketStage == "FINALS" }
    var clusters: [IOSModernCluster] = []
    if !winners.isEmpty || !finals.isEmpty {
        clusters.append(
            modernClusterFromStageGroups(
                id: "\(id):winners",
                label: "Winners bracket",
                stageGroups: [("WINNERS", winners), ("FINALS", finals)]
            )
        )
    }
    if !losers.isEmpty {
        clusters.append(modernClusterFromMatches(id: "\(id):losers", label: "Losers bracket", matches: losers))
    }
    return IOSModernSection(id: id, label: label, clusters: clusters)
}

private func modernClusterFromStageGroups(id: String, label: String, stageGroups: [(String, [PlayerBracketMatch])]) -> IOSModernCluster {
    let rounds = stageGroups.flatMap { stage, stageMatches -> [IOSModernRound] in
        let grouped = Dictionary(grouping: stageMatches, by: \.roundNumber)
        return grouped.keys.sorted().map { roundNumber in
            IOSModernRound(
                id: "\(id):\(stage):\(roundNumber)",
                title: grouped[roundNumber]?.first?.fullRoundText ?? modernRoundTitle(stage: stage, round: roundNumber, totalRounds: grouped.count),
                matches: (grouped[roundNumber] ?? []).sorted { $0.matchNumber < $1.matchNumber }
            )
        }
    }
    return IOSModernCluster(id: id, label: label, rounds: rounds)
}

private func modernClusterFromMatches(id: String, label: String, matches: [PlayerBracketMatch]) -> IOSModernCluster {
    let grouped = Dictionary(grouping: matches, by: \.roundNumber)
    let rounds = grouped.keys.sorted().map { roundNumber in
        IOSModernRound(
            id: "\(id):\(roundNumber)",
            title: grouped[roundNumber]?.first?.fullRoundText ?? modernRoundTitle(stage: matches.first?.bracketStage ?? "WINNERS", round: roundNumber, totalRounds: grouped.count),
            matches: (grouped[roundNumber] ?? []).sorted { $0.matchNumber < $1.matchNumber }
        )
    }
    return IOSModernCluster(id: id, label: label, rounds: rounds)
}

private func modernTournamentBracketLabel(match: PlayerBracketMatch) -> String {
    let phaseName = match.phaseName?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    if !phaseName.isEmpty, phaseName.caseInsensitiveCompare(match.bracketStage) != .orderedSame, phaseName.caseInsensitiveCompare("bracket") != .orderedSame {
        return phaseName
    }
    return "Final bracket"
}

private func modernRoundTitle(stage: String, round: Int, totalRounds: Int) -> String {
    let prefix: String
    switch stage {
    case "POOLS": prefix = "Pools"
    case "WINNERS": prefix = "Winners"
    case "LOSERS": prefix = "Losers"
    case "FINALS": prefix = "Grand Final"
    default: prefix = "Round"
    }
    if stage == "FINALS" {
        return round > 1 ? "Grand Final Reset" : prefix
    }
    if round == totalRounds && totalRounds > 1 && stage == "WINNERS" { return "\(prefix) Final" }
    if round == totalRounds - 1 && totalRounds > 2 && stage == "WINNERS" { return "\(prefix) Semifinal" }
    return "\(prefix) Round \(round)"
}

private func modernSourceMatchIds(match: PlayerBracketMatch, candidateMatches: [PlayerBracketMatch] = []) -> [String] {
    if match.isRoundRobinPhaseMatch { return [] }
    var sourceIds = LinkedHashSet<String>()
    for participantId in match.participantIds {
        if let direct = modernSourceMatchIdFromPlaceholder(participantId) {
            sourceIds.append(direct)
        }
    }
    let targetIndex = candidateMatches.firstIndex(where: { $0.id == match.id }) ?? candidateMatches.count
    let earlierMatches = Array(candidateMatches.prefix(targetIndex))
    for participantId in match.participantIds {
        if participantId.isEmpty || modernSourceMatchIdFromPlaceholder(participantId) != nil { continue }
        if let sourceMatch = earlierMatches.reversed().first(where: { modernFeedsParticipant(match: $0, participantId: participantId) }) {
            sourceIds.append(sourceMatch.id)
        }
    }
    return sourceIds.values
}

private func modernFeedsParticipant(match: PlayerBracketMatch, participantId: String) -> Bool {
    if participantId.isEmpty { return false }
    if match.advancingParticipantIds.contains(participantId) { return true }
    if match.winnerParticipantId == participantId { return true }
    return match.participantIds.contains(participantId)
}

private func modernSourceMatchIdFromPlaceholder(_ participantId: String) -> String? {
    if participantId.hasPrefix("winner_of_") { return String(participantId.dropFirst("winner_of_".count)) }
    if participantId.hasPrefix("loser_of_") { return String(participantId.dropFirst("loser_of_".count)) }
    if participantId.hasPrefix("advance_") {
        let value = participantId.replacingOccurrences(of: #"^advance_\d+_of_"#, with: "", options: .regularExpression)
        return value.isEmpty ? nil : value
    }
    if participantId.hasPrefix("drop_") {
        let value = participantId.replacingOccurrences(of: #"^drop_\d+_of_"#, with: "", options: .regularExpression)
        return value.isEmpty ? nil : value
    }
    return nil
}

private func escapeModernHTML(_ value: String) -> String {
    value
        .replacingOccurrences(of: "&", with: "&amp;")
        .replacingOccurrences(of: "\"", with: "&quot;")
        .replacingOccurrences(of: "'", with: "&#39;")
        .replacingOccurrences(of: "<", with: "&lt;")
        .replacingOccurrences(of: ">", with: "&gt;")
}

private struct LinkedHashSet<Element: Hashable> {
    private var storage: [Element] = []
    private var lookup: Set<Element> = []

    mutating func append(_ element: Element) {
        guard lookup.insert(element).inserted else { return }
        storage.append(element)
    }

    var values: [Element] { storage }
}


private func playerModernCharacterAssetURL(characterName: String, gameTitle: String) -> String? {
    guard let resource = playerCharacterResourceName(characterName, gameTitle: gameTitle) else { return nil }
    let directory = playerIsRoa2GameTitle(gameTitle) ? "roa2-stock-icons" : "smash-stock-icons"
    if let path = Bundle.main.path(forResource: resource, ofType: "png", inDirectory: directory) {
        return URL(fileURLWithPath: path).absoluteString
    }
    if let path = Bundle.main.path(forResource: resource, ofType: "png") {
        return URL(fileURLWithPath: path).absoluteString
    }
    return nil
}

private func playerCharacterResourceName(_ characterName: String, gameTitle: String) -> String? {
    let trimmed = characterName.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else { return nil }

    let explicit: [String: String] = [
        "Bowser Jr.": "bowser_jr",
        "Captain Falcon": "captain_falcon",
        "Dark Pit": "dark_pit",
        "Dark Samus": "dark_samus",
        "Diddy Kong": "diddy_kong",
        "Donkey Kong": "donkey_kong",
        "Dr. Mario": "dr_mario",
        "Duck Hunt": "duck_hunt",
        "Ice Climbers": "ice_climbers",
        "King Dedede": "king_dedede",
        "King K. Rool": "king_k_rool",
        "Little Mac": "little_mac",
        "Mega Man": "mega_man",
        "Meta Knight": "meta_knight",
        "Mr. Game & Watch": "mr_game_and_watch",
        "Pac-Man": "pac_man",
        "Pokemon Trainer": "pokemon_trainer",
        "Pyra & Mythra": "pyra",
        "R.O.B.": "rob",
        "Rosalina": "rosalina_and_luma",
        "Simon Belmont": "simon",
        "Toon Link": "toon_link",
        "Wii Fit Trainer": "wii_fit_trainer",
        "Young Link": "young_link",
        "Zero Suit Samus": "zero_suit_samus",
        "Banjo-Kazooie": "banjo_kazooie",
        "Mii Brawler": "mii_fighter",
        "Mii Swordfighter": "mii_fighter",
        "Mii Gunner": "mii_gunner",
        "Piranha Plant": "piranha_plant",
        "La Reina": "la_reina",
        "Random": "",
        "Random Character": ""
    ]

    if let mapped = explicit[trimmed] {
        return mapped.isEmpty ? nil : mapped
    }

    return trimmed
        .lowercased()
        .replacingOccurrences(of: "&", with: "and")
        .replacingOccurrences(of: ".", with: "")
        .replacingOccurrences(of: "'", with: "")
        .replacingOccurrences(of: "-", with: "_")
        .replacingOccurrences(of: " ", with: "_")
}

private func playerIsRoa2GameTitle(_ gameTitle: String) -> Bool {
    let normalized = gameTitle.lowercased()
    return normalized.contains("rivals of aether") || normalized.contains("rivals 2") || normalized.contains("roa")
}

private func playerIsDormantGrandFinalReset(allMatches: [PlayerBracketMatch], match: PlayerBracketMatch) -> Bool {
    guard match.isGrandFinalReset else { return false }
    let trimmedParticipantIds = match.participantIds.map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
    let hasResolvedParticipant = trimmedParticipantIds.contains { id in
        !id.isEmpty && modernSourceMatchIdFromPlaceholder(id) == nil
    }
    if hasResolvedParticipant { return false }
    guard let grandFinal = allMatches.first(where: { candidate in
        candidate.bracketStage.uppercased() == "FINALS" && candidate.roundNumber == 1
    }) else {
        return true
    }
    return grandFinal.status.trimmingCharacters(in: .whitespacesAndNewlines).uppercased() != "COMPLETED"
        && grandFinal.status.trimmingCharacters(in: .whitespacesAndNewlines).uppercased() != "WALKOVER"
}

private func sanitizePlayerModernId(_ value: String) -> String {
    value.lowercased()
        .replacingOccurrences(of: #"[^a-z0-9]+"#, with: "-", options: .regularExpression)
        .trimmingCharacters(in: CharacterSet(charactersIn: "-"))
}

private func escapePlayerModernHTML(_ value: String) -> String {
    value
        .replacingOccurrences(of: "&", with: "&amp;")
        .replacingOccurrences(of: "\"", with: "&quot;")
        .replacingOccurrences(of: "'", with: "&#39;")
        .replacingOccurrences(of: "<", with: "&lt;")
        .replacingOccurrences(of: ">", with: "&gt;")
}

private func formatPlayerModernTimer(_ seconds: Int) -> String {
    let safeSeconds = max(0, seconds)
    let minutes = safeSeconds / 60
    let remainingSeconds = safeSeconds % 60
    return String(format: "%02d:%02d", minutes, remainingSeconds)
}

private struct PlayerLinkedHashSet<Element: Hashable> {
    private var storage: [Element] = []
    private var lookup: Set<Element> = []

    mutating func append(_ element: Element) {
        guard lookup.insert(element).inserted else { return }
        storage.append(element)
    }

    var values: [Element] { storage }
}

struct ProfileView: View {
    @AppStorage("player_text_size") private var textSize: PlayerTextSize = .normal
    @EnvironmentObject private var viewModel: PlayerAppViewModel
    @State private var showDeleteAccountConfirmation = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    SectionCard(title: "Profile") {
                        Text(cleanedSessionTitleForDisplay(session: viewModel.session, profile: viewModel.profile))
                        Label(viewModel.session == nil ? "No start.gg session" : "Connected to start.gg", systemImage: "person.crop.circle.badge.checkmark")
                            .font(.subheadline).foregroundStyle(PlayerPalette.accent)
                        if viewModel.session != nil {
                            Text("Your player session is kept when you close the app.")
                                .font(.footnote).foregroundStyle(.secondary)
                        }
                    }
                    SectionCard(title: "Appearance") {
                        Picker("Theme", selection: Binding(get: { viewModel.themeMode }, set: { viewModel.setTheme($0) })) {
                            ForEach(PlayerThemeMode.allCases, id: \.rawValue) { mode in Text(mode.title).tag(mode) }
                        }
                        Picker("Text size", selection: $textSize) {
                            ForEach(PlayerTextSize.allCases) { size in Text(size.title).tag(size) }
                        }
                    }
                    SectionCard(title: "Server") {
                        Text(BackendConfig.baseURL.absoluteString)
                            .foregroundStyle(.secondary)
                    }
                    if viewModel.session != nil {
                        SectionCard(title: "Player session") {
                            Button("Sign out") { viewModel.logout() }.buttonStyle(.bordered)
                            Button("Delete account", role: .destructive) { showDeleteAccountConfirmation = true }
                        }
                    }
                }
                .frame(maxWidth: 760)
                .padding()
                .frame(maxWidth: .infinity)
            }
            .background(PlayerPalette.screenBackground.ignoresSafeArea())
            .navigationTitle("Profile")
        }
        .confirmationDialog("Delete account", isPresented: $showDeleteAccountConfirmation, titleVisibility: .visible) {
            Button("Delete account", role: .destructive) {
                Task { await viewModel.deleteAccount() }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("You will be signed out and saved data on this device will be deleted. Your start.gg account will not be deleted.")
        }
    }
}

struct SectionCard<Content: View>: View {
    let title: String
    @ViewBuilder let content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(title).font(.title3.weight(.bold))
            content
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding()
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 20))
    }
}

struct MatchSummaryView: View {
    let match: PlayerMatch

    private static let isoFormatter: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()

    private static let fallbackIsoFormatter: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return formatter
    }()

    private var countdownTargetDate: Date? {
        if match.status == "READY_CHECK",
           let readyDeadlineAt = match.readyDeadlineAt,
           let deadline = Self.parseDate(readyDeadlineAt) {
            return deadline
        }
        if match.status == "CALLED",
           let calledAt = match.calledAt,
           let calledDate = Self.parseDate(calledAt) {
            return calledDate.addingTimeInterval(10 * 60)
        }
        if let seconds = match.callTimeoutSeconds,
           match.status == "CALLED" || match.status == "READY_CHECK" {
            return Date().addingTimeInterval(TimeInterval(max(0, seconds)))
        }
        return nil
    }

    private func countdownSeconds(referenceDate: Date) -> Int? {
        guard let targetDate = countdownTargetDate else {
            return nil
        }
        return max(0, Int(targetDate.timeIntervalSince(referenceDate)))
    }

    private func countdownLabel(referenceDate: Date) -> String? {
        guard let seconds = countdownSeconds(referenceDate: referenceDate) else {
            return nil
        }
        let minutes = seconds / 60
        let remainingSeconds = seconds % 60
        return String(format: "%d:%02d", minutes, remainingSeconds)
    }

    var body: some View {
        TimelineView(.periodic(from: .now, by: 1)) { context in
            VStack(alignment: .leading, spacing: 4) {
                if let stageLabel = playerMatchStageLabel(match) {
                    Text(stageLabel).foregroundStyle(.secondary)
                }
                Text(match.roundLabel).font(.headline)
                PlayerMatchParticipantRow(
                    displayName: match.myDisplayName,
                    scoreLabel: playerMatchScoreLabel(match, participantId: match.myParticipantId, score: match.myScore),
                    characterName: latestCharacterForParticipant(match, participantId: match.myParticipantId),
                    isWinner: match.winnerParticipantId == match.myParticipantId
                )
                PlayerMatchParticipantRow(
                    displayName: match.opponentDisplayName ?? "Opponent",
                    scoreLabel: playerMatchScoreLabel(match, participantId: match.opponentParticipantId, score: match.opponentScore),
                    characterName: latestCharacterForParticipant(match, participantId: match.opponentParticipantId),
                    isWinner: match.winnerParticipantId != nil && match.winnerParticipantId == match.opponentParticipantId
                )
                if let station = match.stationLabel, !station.isEmpty {
                    Text("Station \(station)").foregroundStyle(.secondary)
                }
                if let label = countdownLabel(referenceDate: context.date),
                   match.status == "CALLED" || match.status == "READY_CHECK" {
                    Text("Tiempo restante: \(label)").foregroundStyle(.secondary)
                }
                Text(playerMatchStatusLabel(match.status)).font(.subheadline.weight(.semibold)).foregroundStyle(PlayerPalette.accent)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(12)
            .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 16))
        }
    }

    private static func parseDate(_ value: String) -> Date? {
        isoFormatter.date(from: value) ?? fallbackIsoFormatter.date(from: value)
    }
}

private struct PlayerMatchParticipantRow: View {
    let displayName: String
    let scoreLabel: String
    let characterName: String
    let isWinner: Bool

    var body: some View {
        HStack(spacing: 8) {
            HStack(spacing: 8) {
                if !characterName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    ForEach(Array(characterName.components(separatedBy: " / ").enumerated()), id: \.offset) { _, name in SmashCharacterIcon(name: name, size: 24) }
                }
                Text(displayName)
                    .fontWeight(isWinner ? .semibold : .regular)
                    .foregroundStyle(isWinner ? PlayerPalette.success : Color.primary)
                    .lineLimit(1)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            Text(scoreLabel)
                .fontWeight(.bold)
                .foregroundStyle(scoreLabel == "DQ" ? Color.red : Color.primary)
        }
    }
}

private struct PlayerPrimaryButtonStyle: ViewModifier {
    @Environment(\.isEnabled) private var isEnabled
    func body(content: Content) -> some View {
        content.buttonStyle(.borderedProminent).tint(PlayerPalette.primaryAction)
            .foregroundStyle(isEnabled ? Color.white : PlayerPalette.secondaryText)
    }
}
extension View {
    func playerPrimaryButton() -> some View { modifier(PlayerPrimaryButtonStyle()) }
}
func playerMatchStatusLabel(_ status: String) -> String {
    switch status {
    case "PENDING", "CREATED": return "Pending"
    case "CALLED": return "Called to play"
    case "PLAYING", "IN_PROGRESS": return "Playing"
    case "READY_CHECK": return "Confirm you are ready"
    case "PENDING_REVIEW", "AWAITING_CONFIRMATION": return "Result awaiting confirmation"
    case "DISPUTED": return "Under review"
    case "COMPLETED": return "Finished"
    case "WALKOVER": return "Win by absence"
    case "CANCELLED": return "Cancelled"
    default: return status
    }
}

// Generated bracket search: scripts/sync-native-bracket-search.mjs
private let modernBracketSearchScript = #"""
// Shared by the Android and iOS native bracket renderers. No network access.
function installModernBracketSearch(activateSection, layoutSections) {
  const root = document.querySelector('.root');
  const cards = Array.from(root.querySelectorAll('.match-card[data-match-id]'));
  const style = document.createElement('style');
  style.textContent = '.bracket-search{flex:none;display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:8px;color:var(--text);background:var(--bg)}' +
    '.bracket-search input{flex:1 1 190px;min-width:0;min-height:44px;box-sizing:border-box;font:inherit;font-size:16px;padding:8px;border:1px solid var(--muted);border-radius:8px;background:var(--panel);color:var(--text)}' +
    '.bracket-search button{min-height:44px;min-width:44px;padding:8px;font:inherit;border:1px solid var(--muted);border-radius:8px;background:var(--panel);color:var(--text)}' +
    '.bracket-search button:disabled{opacity:.45}.bracket-search output{flex-basis:100%;font-size:13px;overflow-wrap:anywhere}' +
    '.match-card.search-hit{outline:2px dashed var(--text);outline-offset:3px}.match-card.search-current{outline:4px solid var(--text);outline-offset:4px}' +
    '.bracket-search input:focus-visible,.bracket-search button:focus-visible{outline:3px solid var(--text);outline-offset:2px}';
  document.head.appendChild(style);
  const bar = document.createElement('div');
  bar.className = 'bracket-search';
  bar.setAttribute('role', 'search');
  const input = document.createElement('input');
  input.type = 'search'; input.placeholder = 'Find player or team';
  input.setAttribute('aria-label', 'Find player or team in all phases');
  input.autocomplete = 'off'; input.maxLength = 120;
  const button = (label, action) => {
    const node = document.createElement('button'); node.type = 'button'; node.textContent = label;
    node.addEventListener('click', action); return node;
  };
  let hits = [], currentId = null, focusRevision = 0;
  const previous = button('Previous', () => step(-1));
  const next = button('Next', () => step(1));
  const clear = button('Clear', () => { input.value = ''; update(false); input.focus(); });
  const output = document.createElement('output');
  output.setAttribute('aria-live', 'polite'); output.setAttribute('aria-atomic', 'true');
  bar.append(input, previous, next, clear, output); root.prepend(bar);
  const normalized = text => String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase();
  function update(center) {
    ++focusRevision; // Cancel a queued center after clearing/changing the search.
    const query = normalized(input.value);
    hits = query ? cards.filter(card => normalized(card.dataset.searchNames).includes(query)) : [];
    if (!hits.some(card => card.dataset.matchId === currentId)) currentId = hits[0]?.dataset.matchId || null;
    const hitSet = new Set(hits);
    cards.forEach(card => {
      card.classList.toggle('search-hit', hitSet.has(card));
      card.classList.toggle('search-current', !!query && card.dataset.matchId === currentId);
    });
    const index = hits.findIndex(card => card.dataset.matchId === currentId);
    const current = hits[index];
    const phase = current?.closest('.bracket-section')?.querySelector('.section-title')?.textContent || '';
    const matchLabel = current?.querySelector('.match-header span')?.textContent || '';
    output.textContent = !query ? 'Search all phases. Enter: next; Shift + Enter: previous.' :
      current ? (index + 1) + ' of ' + hits.length + ' · ' + phase + ' · ' + matchLabel : 'No matches found';
    previous.disabled = next.disabled = hits.length < 2; clear.disabled = !input.value;
    if (center && current) centerCard(current);
  }
  function centerCard(card) {
    const revision = ++focusRevision;
    const section = card.closest('.bracket-section');
    activateSection(section.id);
    requestAnimationFrame(() => {
      if (revision !== focusRevision) return;
      layoutSections();
      requestAnimationFrame(() => {
        if (revision !== focusRevision) return;
        const viewport = section.querySelector('.unified-viewport');
        const target = card.getBoundingClientRect(), bounds = viewport.getBoundingClientRect();
        viewport.scrollLeft += target.left + target.width / 2 - bounds.left - viewport.clientWidth / 2;
        viewport.scrollTop += target.top + target.height / 2 - bounds.top - viewport.clientHeight / 2;
      });
    });
  }
  function step(direction) {
    if (!hits.length) return;
    const index = hits.findIndex(card => card.dataset.matchId === currentId);
    currentId = hits[(index + direction + hits.length) % hits.length].dataset.matchId;
    update(true);
  }
  input.addEventListener('input', () => { currentId = null; update(true); });
  input.addEventListener('keydown', event => {
    if (event.key === 'Enter') { event.preventDefault(); step(event.shiftKey ? -1 : 1); }
    if (event.key === 'Escape') { input.value = ''; update(false); }
  });
  window.__gttBracketSearch = {
    capture: () => ({ query: input.value, currentId, focused: document.activeElement === input }),
    restore: state => {
      if (!state) return;
      input.value = String(state.query || '').slice(0, 120); currentId = state.currentId;
      update(false); // Preserve the user's zoom/pan after polling, not only the search.
      if (state.focused) input.focus({ preventScroll: true });
    }
  };
  update(false);
}

"""#
