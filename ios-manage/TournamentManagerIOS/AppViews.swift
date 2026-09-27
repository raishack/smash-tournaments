import SwiftUI
import UIKit

enum ManagementPalette {
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

enum ManagementTextSize: String, CaseIterable, Identifiable {
    case normal, large, extraLarge
    var id: String { rawValue }
    var title: String { switch self { case .normal: return "Normal"; case .large: return "Large"; case .extraLarge: return "Extra large" } }
    var minimumSize: DynamicTypeSize { switch self { case .normal: return .xSmall; case .large: return .xLarge; case .extraLarge: return .xxxLarge } }
}

@main
struct TournamentManagerApp: App {
    @AppStorage("main_text_size") private var textSize: ManagementTextSize = .normal
    @StateObject private var viewModel = TournamentManagerViewModel()
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            ManagementRootView()
                .environmentObject(viewModel)
                .preferredColorScheme(viewModel.themeMode == .system ? nil : viewModel.themeMode == .dark ? .dark : .light)
                .dynamicTypeSize(textSize.minimumSize...)
                .tint(ManagementPalette.accent)
                .onChange(of: scenePhase) { _, newValue in
                    viewModel.handleScenePhase(newValue)
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
}

struct ManagementRootView: View {
    @EnvironmentObject private var viewModel: TournamentManagerViewModel

    @ObservedObject private var account = ManagementAccount.shared
    var body: some View {
        Group {
            if account.session == nil { ManagementLoginView() }
            else { managementContent }
        }.task(id: account.token) {
            viewModel.stopPolling()
            viewModel.tournaments = []; viewModel.selectedTournamentDetail = nil
            viewModel.currentTab = .dashboard
            if account.session != nil { await viewModel.loadInitial(); viewModel.startPollingIfNeeded() }
        }
    }
    private var managementContent: some View {

        TabView(selection: $viewModel.currentTab) {
            DashboardView()
                .tabItem { Label("Home", systemImage: "house.fill") }
                .tag(TournamentManagerViewModel.Tab.dashboard)

            TournamentsView()
                .tabItem { Label("Tournaments", systemImage: "list.bullet.rectangle") }
                .tag(TournamentManagerViewModel.Tab.tournaments)

            OperationsView()
                .tabItem { Label("Match operations", systemImage: "bolt.fill") }
                .tag(TournamentManagerViewModel.Tab.operations)

            SettingsView()
                .tabItem { Label("Profile", systemImage: "gearshape.fill") }
                .tag(TournamentManagerViewModel.Tab.settings)
        }
        .overlay(alignment: .top) {
            if let message = viewModel.transientMessage {
                Text(message)
                    .font(.subheadline.weight(.semibold))
                    .padding(.horizontal, 16)
                    .padding(.vertical, 10)
                    .background(.thinMaterial, in: Capsule())
                    .padding(.top, 10)
                    .transition(.move(edge: .top).combined(with: .opacity))
                    .task(id: message) {
                        try? await Task.sleep(for: .seconds(2))
                        if viewModel.transientMessage == message {
                            viewModel.transientMessage = nil
                        }
                    }
            }
        }
    }
}

struct DashboardView: View {
    @EnvironmentObject private var viewModel: TournamentManagerViewModel
    @State private var showingManualCreation = false
    @State private var showingStartggCreation = false

    var body: some View {
        NavigationStack {
            ScrollView {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 18) {
                        VStack(alignment: .leading, spacing: 14) {
                            Text("Tournament hub")
                                .font(.system(.largeTitle, weight: .bold))
                                .foregroundStyle(Color.primary)

                            Text("Manage tournaments, participants and matches in real time.")
                                .font(.system(.title3, weight: .regular))
                                .foregroundStyle(ManagementPalette.secondaryText)
                                .fixedSize(horizontal: false, vertical: true)
                        }

                        HomeHeroCard(
                            onCreateTournament: { showingManualCreation = true },
                            onCreateStartggTournament: { showingStartggCreation = true }
                        )

                        Text("Recent tournaments")
                            .font(.system(.title2, weight: .bold))
                            .padding(.top, 4)

                        if viewModel.isLoading && viewModel.tournaments.isEmpty {
                            DashboardInfoCard(
                                title: "Loading tournaments",
                                message: "Loading available tournaments."
                            ) {
                                ProgressView()
                                    .progressViewStyle(.circular)
                            }
                        } else if let error = viewModel.error, viewModel.tournaments.isEmpty {
                            DashboardInfoCard(
                                title: "Offline",
                                message: error
                            )
                        } else if viewModel.tournaments.isEmpty {
                            DashboardInfoCard(
                                title: "No tournaments",
                                message: "No tournaments created yet."
                            )
                        } else {
                            ForEach(Array(viewModel.tournaments.filter { $0.status != "ARCHIVED" }.prefix(3))) { tournament in
                                DashboardTournamentCard(tournament: tournament)
                            }
                        }
                    }
                    .frame(maxWidth: 920, alignment: .leading)
                    Spacer(minLength: 0)
                }
                .padding(.horizontal, 20)
                .padding(.top, 28)
                .padding(.bottom, 32)
            }
            .background(ManagementPalette.screenBackground.ignoresSafeArea())
            .sheet(isPresented: $showingManualCreation) {
                CreateTournamentSheet(mode: .manual)
                    .environmentObject(viewModel)
            }
            .sheet(isPresented: $showingStartggCreation) {
                CreateTournamentSheet(mode: .startgg)
                    .environmentObject(viewModel)
            }
            .task {
                await viewModel.reloadTournaments()
            }
            .toolbar(.hidden, for: .navigationBar)
        }
    }
}

struct TournamentsView: View {
    @EnvironmentObject private var viewModel: TournamentManagerViewModel
    @State private var showingManualCreation = false
    @State private var showingStartggCreation = false
    @State private var showArchived = false

    var body: some View {
        NavigationStack {
            List {
                Picker("Tournament list", selection: $showArchived) {
                    Text("Current").tag(false)
                    Text("Archived").tag(true)
                }.pickerStyle(.segmented)
                if !viewModel.isLoading && viewModel.tournaments.filter({ ($0.status == "ARCHIVED") == showArchived }).isEmpty {
                    Text(showArchived ? "Tournaments you archive after completion will appear here." : "No tournaments in this list.").foregroundStyle(.secondary)
                }
                if viewModel.isLoading && viewModel.tournaments.isEmpty {
                    ProgressView("Loading tournaments...")
                }

                ForEach(viewModel.tournaments.filter { ($0.status == "ARCHIVED") == showArchived }) { tournament in
                    NavigationLink {
                        TournamentDetailView()
                            .task { await viewModel.selectTournament(tournament.id) }
                    } label: {
                        TournamentRow(tournament: tournament)
                    }
                    .simultaneousGesture(TapGesture().onEnded {
                        Task { await viewModel.selectTournament(tournament.id) }
                    })
                }
            }
            .navigationTitle("Tournaments")
            .toolbar {
                ToolbarItemGroup(placement: .topBarTrailing) {
                    Button {
                        showingStartggCreation = true
                    } label: {
                        Label("Import start.gg", systemImage: "square.and.arrow.down")
                    }

                    Button {
                        showingManualCreation = true
                    } label: {
                        Label("New tournament", systemImage: "plus")
                    }
                }
            }
            .refreshable {
                await viewModel.reloadTournaments()
            }
            .sheet(isPresented: $showingManualCreation) {
                CreateTournamentSheet(mode: .manual)
                    .environmentObject(viewModel)
            }
            .sheet(isPresented: $showingStartggCreation) {
                CreateTournamentSheet(mode: .startgg)
                    .environmentObject(viewModel)
            }
            .task {
                await viewModel.reloadTournaments()
            }
        }
    }
}

struct OperationsView: View {
    @EnvironmentObject private var viewModel: TournamentManagerViewModel

    var body: some View {
        NavigationStack {
            List {
                Section {
                    Text("Select a tournament to call matches and report results within that event.")
                        .foregroundStyle(.secondary)
                }

                if viewModel.isLoading && viewModel.tournaments.isEmpty {
                    ProgressView("Loading tournaments...")
                }

                ForEach(viewModel.tournaments.filter { $0.status != "ARCHIVED" }) { tournament in
                    NavigationLink {
                        TournamentDetailView(focusOperations: true)
                            .task { await viewModel.selectTournament(tournament.id) }
                    } label: {
                        TournamentRow(tournament: tournament)
                    }
                    .simultaneousGesture(TapGesture().onEnded {
                        Task { await viewModel.selectTournament(tournament.id) }
                    })
                }
            }
            .navigationTitle("Match operations")
            .refreshable {
                await viewModel.reloadTournaments()
            }
            .task {
                await viewModel.reloadTournaments()
            }
        }
    }
}

enum ManagementPresentation {
    // Independent presentation rollback; keep search and review.
    static let forceClassic = false
}

struct SettingsView: View {
    @AppStorage("management_adaptive_layout") private var adaptiveLayout = true
    @AppStorage("main_text_size") private var textSize: ManagementTextSize = .normal
    @EnvironmentObject private var viewModel: TournamentManagerViewModel

    var body: some View {
        NavigationStack {
            Form {
                Section("Management account") { ManagementAccountControls(showLogout: false) }
                Section("Appearance") {
                    Picker("Theme", selection: Binding(
                        get: { viewModel.themeMode },
                        set: { viewModel.setTheme($0) }
                    )) {
                        ForEach(ManagementThemeMode.allCases) { mode in
                            Text(mode.title).tag(mode)
                        }
                    }
                    .pickerStyle(.menu)
                    Picker("Text size", selection: $textSize) {
                        ForEach(ManagementTextSize.allCases) { size in Text(size.title).tag(size) }
                    }
                    Text("Also follows the device accessibility text size.")
                        .font(.footnote).foregroundStyle(ManagementPalette.secondaryText)
                    Text("Player · Result 2–1").font(.body)
                    if !ManagementPresentation.forceClassic {
                        Toggle("Adaptive layout", isOn: $adaptiveLayout)
                        Text("Compact list with actions beside the bracket on wide screens. Disable it to restore the previous layout.")
                            .font(.footnote).foregroundStyle(.secondary)
                    }
                }

                Section("Connection") {
                    Text(BackendConfig.baseURL.absoluteString)
                    Text(BackendConfig.displayWebURL.absoluteString)
                        .foregroundStyle(.secondary)
                }


                Section("External notifications") {
                    Toggle("Telegram", isOn: $viewModel.notificationSettings.telegramEnabled)
                    Toggle("WhatsApp", isOn: $viewModel.notificationSettings.whatsappEnabled)
                    Button("Save settings") {
                        Task { await viewModel.saveNotificationSettings() }
                    }
                    .managementPrimaryButton()
                }
                Section { Button("Sign out", role: .destructive) { Task { await ManagementAccount.shared.logout() } } }
            }
            .navigationTitle("Profile")
        }
    }
}

struct TournamentRow: View {
    let tournament: TournamentListItem

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(tournament.title)
                .font(.headline)
            Text(tournament.gameTitle)
                .foregroundStyle(.secondary)
            HStack {
                MainStatusBadge(label: tournament.statusLabel, state: tournament.status)
                if tournament.isStartggMirrored {
                    Text("start.gg")
                        .font(.caption.weight(.semibold))
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(Capsule().fill(ManagementPalette.warning.opacity(0.18)))
                }
            }
            Text("\(tournament.maxParticipants) plazas · \(tournament.setupCount) setups")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .padding(.vertical, 4)
    }
}

private struct SummaryCard: View {
    let title: String
    let message: String

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.largeTitle.bold())
            Text(message)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(20)
        .background(RoundedRectangle(cornerRadius: 24).fill(ManagementPalette.surfaceBackground))
        .shadow(color: .black.opacity(0.06), radius: 10, y: 3)
    }
}

private struct HomeHeroCard: View {
    let onCreateTournament: () -> Void
    let onCreateStartggTournament: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            Text("Tournament management")
                .font(.system(.title, weight: .bold))
                .foregroundStyle(ManagementPalette.heroTitle)

            Text("Recent tournaments, flexible creation, player registration, brackets and match operations.")
                .font(.system(.title3, weight: .regular))
                .foregroundStyle(ManagementPalette.heroBody)
                .fixedSize(horizontal: false, vertical: true)

            ViewThatFits(in: .horizontal) {
                HStack(spacing: 12) {
                    Button("Create tournament", action: onCreateTournament)
                        .buttonStyle(HomePrimaryPillButtonStyle())
                    Button("Create start.gg", action: onCreateStartggTournament)
                        .buttonStyle(HomePrimaryPillButtonStyle())
                }

                VStack(spacing: 12) {
                    Button("Create tournament", action: onCreateTournament)
                        .buttonStyle(HomePrimaryPillButtonStyle())
                    Button("Create start.gg", action: onCreateStartggTournament)
                        .buttonStyle(HomePrimaryPillButtonStyle())
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(22)
        .background(
            RoundedRectangle(cornerRadius: 26)
                .fill(ManagementPalette.heroFill)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 26)
                .stroke(ManagementPalette.heroStroke, lineWidth: 1.5)
        )
    }
}

private struct DashboardInfoCard<Accessory: View>: View {
    let title: String
    let message: String
    @ViewBuilder let accessory: Accessory

    init(title: String, message: String, @ViewBuilder accessory: () -> Accessory = { EmptyView() }) {
        self.title = title
        self.message = message
        self.accessory = accessory()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text(title)
                .font(.system(.title3, weight: .bold))
            Text(message)
                .font(.system(.body))
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
            accessory
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(22)
        .background(RoundedRectangle(cornerRadius: 24).fill(ManagementPalette.surfaceBackground))
        .overlay(
            RoundedRectangle(cornerRadius: 24)
                .stroke(ManagementPalette.mutedBorder, lineWidth: 1.2)
        )
    }
}

private struct DashboardTournamentCard: View {
    @EnvironmentObject private var viewModel: TournamentManagerViewModel
    let tournament: TournamentListItem

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text(tournament.title)
                .font(.system(.title2, weight: .bold))

            Text(dashboardTournamentSummary(tournament))
                .font(.system(.title3, weight: .regular))
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)

            NavigationLink {
                TournamentDetailView()
                    .task { await viewModel.selectTournament(tournament.id) }
            } label: {
                Text("Open tournament")
                    .font(.headline.weight(.semibold))
                    .padding(.horizontal, 28)
                    .padding(.vertical, 12)
                    .background(
                        Capsule().fill(ManagementPalette.primaryAction)
                    )
                    .foregroundStyle(.white)
            }
            .simultaneousGesture(TapGesture().onEnded {
                Task { await viewModel.selectTournament(tournament.id) }
            })
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(22)
        .background(RoundedRectangle(cornerRadius: 24).fill(ManagementPalette.surfaceBackground))
        .overlay(
            RoundedRectangle(cornerRadius: 24)
                .stroke(ManagementPalette.mutedBorder, lineWidth: 1.2)
        )
        .shadow(color: .black.opacity(0.04), radius: 4, y: 2)
    }
}

private struct HomePrimaryPillButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.headline.weight(.semibold))
            .foregroundStyle(.white)
            .padding(.horizontal, 28)
            .padding(.vertical, 14)
            .frame(maxWidth: .infinity)
            .background(
                Capsule()
                    .fill(ManagementPalette.primaryAction)
                    .opacity(configuration.isPressed ? 0.82 : 1)
            )
            .scaleEffect(configuration.isPressed ? 0.99 : 1)
    }
}

private func dashboardTournamentSummary(_ tournament: TournamentListItem) -> String {
    let formatLabel = tournament.settings.bracketMode == "FORTNITE" ? "Fortnite · accumulated points" : tournament.settings.format.replacingOccurrences(of: "_", with: " ").capitalized
    let bestOfLabel: String = {
        if tournament.settings.bracketMode == "FORTNITE" { return "\(tournament.settings.fortniteLobbySize ?? 20) seats · \(tournament.settings.fortniteGamesPerRound ?? 3) games per round" }
        let winners = tournament.settings.winnersBestOf ?? tournament.settings.bestOf
        let losers = tournament.settings.losersBestOf ?? tournament.settings.bestOf
        return "W Bo\(winners) / L Bo\(losers)"
    }()

    return [
        tournament.gameTitle,
        formatLabel,
        bestOfLabel,
        "\(tournament.maxParticipants) participants",
        tournament.status
    ].joined(separator: " - ")
}

private struct SummaryMetricsCard: View {
    let tournaments: Int
    let selectedTournamentTitle: String?
    let supportsLadder: Bool

    var body: some View {
        SectionCard(title: "Summary") {
            VStack(alignment: .leading, spacing: 8) {
                Text("Tournaments loaded: \(tournaments)")
                Text("Active tournament: \(selectedTournamentTitle ?? "None")")
                Text("Ladder: \(supportsLadder ? "Available" : "Not applicable")")
                    .foregroundStyle(.secondary)
            }
        }
    }
}

struct SectionCard<Content: View>: View {
    let title: String
    @ViewBuilder let content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(title)
                .font(.title3.bold())
            content
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(18)
        .background(RoundedRectangle(cornerRadius: 20).fill(ManagementPalette.secondarySurfaceBackground))
    }
}

private enum CreateTournamentMode {
    case manual
    case startgg
}

private struct CreateTournamentSheet: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var viewModel: TournamentManagerViewModel

    let mode: CreateTournamentMode

    @State private var input = CreateTournamentInput()
    @State private var startggURL = ""

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    HStack(spacing: 14) {
                        Button("Close") { dismiss() }
                            .buttonStyle(HomePrimaryPillButtonStyle())
                            .frame(maxWidth: 220)

                        Button(mode == .startgg ? "Create tournament" : "Create tournament") {
                            Task {
                                if mode == .startgg {
                                    await viewModel.createStartggTournament(
                                        eventURL: startggURL,
                                        callTimeoutMinutes: input.callTimeoutMinutes,
                                        setupCount: input.setupCount,
                                        streamCount: input.streamCount,
                                        playerMatchReportingEnabled: input.playerMatchReportingEnabled
                                    )
                                } else {
                                    await viewModel.createTournament(input: input)
                                }
                                dismiss()
                            }
                        }
                        .buttonStyle(CreateTournamentSubmitButtonStyle(
                            enabled: mode == .startgg
                                ? !startggURL.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                                : !input.title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                        ))
                        .disabled(mode == .startgg
                            ? startggURL.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                            : input.title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                        )
                        .frame(maxWidth: 260)
                    }

                    Text(mode == .startgg ? "New start.gg tournament" : "New tournament")
                        .font(.system(.largeTitle, weight: .bold))

                    if mode == .startgg {
                        VStack(alignment: .leading, spacing: 18) {
                            CreateFormField(title: nil, placeholder: "") {
                                TextField("Event URL", text: $startggURL, axis: .vertical)
                                    .textInputAutocapitalization(.never)
                                    .autocorrectionDisabled()
                            }

                            CreateNumberField(
                                label: "Call timeout in minutes",
                                value: $input.callTimeoutMinutes,
                                range: 1...60
                            )

                            CreateNumberField(
                                label: "Setup count",
                                value: $input.setupCount,
                                range: 1...128
                            )
                            StreamCountPicker(selection: $input.streamCount)

                            if BackendConfig.supportsLadder {
                                Toggle("Players can report", isOn: $input.playerMatchReportingEnabled)
                                    .tint(ManagementPalette.primaryAction)
                            }

                            Text("The import continues on the server. You can lock your phone and return when it finishes.")
                                .foregroundStyle(.secondary)
                        }
                    } else {
                        VStack(alignment: .leading, spacing: 18) {
                            CreateFormField(title: nil, placeholder: "") {
                                TextField("Tournament name", text: $input.title)
                            }
                            MainTournamentTypes(selection: Binding(
                                get: { input.teamSize > 1 ? "TEAMS" : input.bracketMode },
                                set: { type in
                                    input.teamSize = type == "TEAMS" ? max(5, input.teamSize) : 1
                                    if type != "TEAMS" { input.reserveCount = 0; input.allowSoloRegistration = false }
                                    input.bracketMode = type == "TEAMS" ? "STANDARD" : type
                                    if type == "FORTNITE" && input.gameTitle.isEmpty { input.gameTitle = "Fortnite" }
                                }
                            ))


                            CreateFormField(title: nil, placeholder: "") {
                                TextField("Game", text: $input.gameTitle)
                            }

                            CreateFormField(title: nil, placeholder: "", minHeight: 180) {
                                ZStack(alignment: .topLeading) {
                                    if input.description.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                                        Text("Description")
                                            .font(.system(.body))
                                            .foregroundStyle(.secondary)
                                            .padding(.top, 8)
                                            .allowsHitTesting(false)
                                    }

                                    TextEditor(text: $input.description)
                                        .scrollContentBackground(.hidden)
                                        .frame(minHeight: 150)
                                }
                            }

                            CreateFormField(title: "Platform", placeholder: "") {
                                TextField("", text: $input.platform)
                            }

                            if input.teamSize > 1 {
                                Stepper("Starters: \(input.teamSize)", value: $input.teamSize, in: 2...20)
                                Stepper("Up to \(input.reserveCount) reserves", value: $input.reserveCount, in: 0...20)
                                Toggle("Allow solo players", isOn: $input.allowSoloRegistration)
                                Text("Capacity counts teams. Complete starter rosters before generating the bracket.").font(.footnote)
                            }
                            CreateFormField(title: input.teamSize > 1 ? "Maximum teams" : "Maximum participants", placeholder: "") {
                                TextField("", value: $input.maxParticipants, format: .number)
                                    .keyboardType(.numberPad)
                            }

                            if input.bracketMode == "FORTNITE" {
                                Stepper("Seats per group: \(input.fortniteLobbySize)", value: $input.fortniteLobbySize, in: 5...100, step: 5)
                                Stepper("Games per round: \(input.fortniteGamesPerRound)", value: $input.fortniteGamesPerRound, in: 1...20)
                                Text("Accumulated points. Podium 10/6/4 · Kill 1 · VIP 5 extra. Balanced groups and random seats.").font(.footnote)
                            }
                            CreateSectionTitle("Configuration")

                            if input.bracketMode != "FORTNITE" {
                            SegmentedOptionBlock(
                                title: "Format",
                                options: [
                                    ("SINGLE_ELIMINATION", "Elim. simple"),
                                    ("DOUBLE_ELIMINATION", "Doble elim.")
                                ],
                                selected: $input.format
                            )

                            if input.bracketMode == "MKART" {
                                SegmentedOptionBlock(
                                    title: "Main bracket",
                                    options: [
                                        ("1", "MKART pasa 1"),
                                        ("2", "MKART pasa 2")
                                    ],
                                    selected: Binding(
                                        get: { String(input.mkartAdvanceCount) },
                                        set: { input.mkartAdvanceCount = Int($0) ?? 1 }
                                    )
                                )

                                if input.format == "DOUBLE_ELIMINATION" {
                                    SegmentedOptionBlock(
                                        title: "Losers bracket",
                                        options: [
                                            ("1", "MKART pasa 1"),
                                            ("2", "MKART pasa 2")
                                        ],
                                        selected: Binding(
                                            get: { String(input.mkartLosersAdvanceCount) },
                                            set: { input.mkartLosersAdvanceCount = Int($0) ?? 1 }
                                        )
                                    )
                                }
                            } else if input.format == "DOUBLE_ELIMINATION" {
                                SegmentedOptionBlock(
                                    title: "Winners series",
                                    options: [
                                        ("1", "Bo1"),
                                        ("3", "Bo3"),
                                        ("5", "Bo5")
                                    ],
                                    selected: Binding(
                                        get: { String(input.winnersBestOf) },
                                        set: { input.winnersBestOf = Int($0) ?? 3 }
                                    )
                                )

                                SegmentedOptionBlock(
                                    title: "Losers series",
                                    options: [
                                        ("1", "Bo1"),
                                        ("3", "Bo3"),
                                        ("5", "Bo5")
                                    ],
                                    selected: Binding(
                                        get: { String(input.losersBestOf) },
                                        set: { input.losersBestOf = Int($0) ?? 3 }
                                    )
                                )
                            } else {
                                SegmentedOptionBlock(
                                    title: "Series",
                                    options: [
                                        ("1", "Bo1"),
                                        ("3", "Bo3"),
                                        ("5", "Bo5")
                                    ],
                                    selected: Binding(
                                        get: { String(input.winnersBestOf) },
                                        set: {
                                            let value = Int($0) ?? 3
                                            input.bestOf = value
                                            input.winnersBestOf = value
                                            input.losersBestOf = value
                                        }
                                    )
                                )
                            }

                            }
                            CreateFormField(title: "Call timeout in minutes", placeholder: "") {
                                TextField("", value: $input.callTimeoutMinutes, format: .number)
                                    .keyboardType(.numberPad)
                            }

                            CreateFormField(title: "Setup count", placeholder: "") {
                                TextField("", value: $input.setupCount, format: .number)
                                    .keyboardType(.numberPad)
                            }

                            StreamCountPicker(selection: $input.streamCount)

                            CreateFormField(title: "Play area (optional)", placeholder: "") {
                                TextField("e.g. Main hall", text: $input.playAreaName)
                                    .onChange(of: input.playAreaName) { _, value in
                                        if value.count > 80 { input.playAreaName = String(value.prefix(80)) }
                                    }
                            }

                            SegmentedOptionBlock(
                                title: "Seeding",
                                options: [
                                    ("MANUAL", "Manual"),
                                    ("RANDOM", "Random")
                                ],
                                selected: $input.seedingMethod
                            )
                        }
                    }
                }
            }
            .padding(.horizontal, 20)
            .padding(.top, 18)
            .padding(.bottom, 28)
            .background(ManagementPalette.screenBackground.ignoresSafeArea())
        }
    }
}

private struct CreateSectionTitle: View {
    let title: String

    init(_ title: String) {
        self.title = title
    }

    var body: some View {
        Text(title)
            .font(.system(.title2, weight: .bold))
            .foregroundStyle(Color.primary)
    }
}

private struct CreateFormField<Content: View>: View {
    let title: String?
    let placeholder: String
    var minHeight: CGFloat = 88
    @ViewBuilder let content: Content

    var body: some View {
        ZStack(alignment: .topLeading) {
            RoundedRectangle(cornerRadius: 14)
                .fill(ManagementPalette.surfaceBackground)
                .overlay(
                    RoundedRectangle(cornerRadius: 14)
                        .stroke(ManagementPalette.border, lineWidth: 1.4)
                )

            VStack(alignment: .leading, spacing: 10) {
                if let title, !title.isEmpty {
                    Text(title)
                        .font(.system(.callout, weight: .regular))
                        .foregroundStyle(.secondary)
                        .padding(.horizontal, 12)
                        .background(ManagementPalette.screenBackground)
                        .offset(y: -12)
                        .allowsHitTesting(false)
                }

                content
                    .font(.system(.body))
                    .padding(.top, title == nil ? 22 : 0)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(.horizontal, 18)
            .padding(.bottom, 18)
            .contentShape(Rectangle())
        }
        .frame(minHeight: minHeight)
        .contentShape(Rectangle())
    }
}

private struct SegmentedOptionBlock: View {
    let title: String
    let options: [(String, String)]
    @Binding var selected: String

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text(title)
                .font(.system(.body, weight: .semibold))

            FlexibleButtonRow(items: options, selected: selected) { value in
                selected = value
            }
        }
    }
}

private struct FlexibleButtonRow: View {
    let items: [(String, String)]
    let selected: String
    let onSelect: (String) -> Void

    private let columns = [
        GridItem(.adaptive(minimum: 150), spacing: 12)
    ]

    var body: some View {
        LazyVGrid(columns: columns, alignment: .leading, spacing: 12) {
            ForEach(items, id: \.0) { item in
                Button(action: { onSelect(item.0) }) {
                    Text(item.0 == selected ? "[\(item.1)]" : item.1)
                        .font(.headline.weight(.semibold))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 20)
                        .padding(.vertical, 14)
                        .frame(maxWidth: .infinity)
                        .background(
                            Capsule().fill(ManagementPalette.primaryAction)
                        )
                }
                .buttonStyle(.plain)
            }
        }
    }
}

private struct CreateNumberField: View {
    let label: String
    @Binding var value: Int
    let range: ClosedRange<Int>

    var body: some View {
        CreateFormField(title: label, placeholder: "") {
            TextField("", value: $value, format: .number)
                .keyboardType(.numberPad)
        }
    }
}

private struct CreateTournamentSubmitButtonStyle: ButtonStyle {
    let enabled: Bool

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.headline.weight(.semibold))
            .foregroundStyle(enabled ? Color.white : ManagementPalette.secondaryText)
            .padding(.horizontal, 28)
            .padding(.vertical, 14)
            .frame(maxWidth: .infinity)
            .background(
                Capsule()
                    .fill(enabled ? ManagementPalette.primaryAction : ManagementPalette.disabledAction)
                    .opacity(configuration.isPressed ? 0.82 : 1)
            )
            .scaleEffect(configuration.isPressed ? 0.99 : 1)
    }
}

struct StreamCountPicker: View {
    @Binding var selection: Int
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Stream").font(.headline)
            Picker("Stream", selection: $selection) {
                Text("No stream").tag(0)
                Text("1 stream").tag(1)
                Text("2 streams").tag(2)
            }.pickerStyle(.segmented)
        }
    }
}


struct ManagementLoginView: View {
    private enum Field { case username, password }
    @FocusState private var focusedField: Field?
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @State private var username = ""
    @State private var password = ""
    @State private var visiblePassword = false
    @State private var busy = false
    @State private var error: String?
    private var canSubmit: Bool { !busy && !username.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !password.isEmpty }
    private var passwordLayout: AnyLayout {
        dynamicTypeSize.isAccessibilitySize ? AnyLayout(VStackLayout(alignment: .leading, spacing: 8)) : AnyLayout(HStackLayout())
    }
    private func login() {
        guard !busy, !username.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, !password.isEmpty else { return }
        busy = true; error = nil
        focusedField = nil
        Task { @MainActor in
            defer { busy = false }
            do { try await ManagementAccount.shared.login(username: username, password: password); password = "" }
            catch { self.error = error.localizedDescription }
        }
    }
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Smash Tournaments").font(.largeTitle.bold()).foregroundStyle(ManagementPalette.heroTitle)
                    Text("Tournament management").font(.title3).foregroundStyle(ManagementPalette.heroBody)
                }.frame(maxWidth: .infinity, alignment: .leading).padding(24)
                    .background(ManagementPalette.heroFill, in: RoundedRectangle(cornerRadius: 22))
                Text("Sign in").font(.title2.bold())
                Text("Use the same account as display administration.").foregroundStyle(ManagementPalette.secondaryText)
                VStack(alignment: .leading, spacing: 8) {
                    Text("Username").font(.subheadline.weight(.semibold))
                    TextField("Your username", text: $username, prompt: Text("Your username").foregroundStyle(ManagementPalette.secondaryText))
                        .textContentType(.username).textInputAutocapitalization(.never).autocorrectionDisabled()
                        .focused($focusedField, equals: .username).submitLabel(.next)
                        .onSubmit { focusedField = .password }
                        .modifier(MainLoginFieldStyle())
                    Text("Password").font(.subheadline.weight(.semibold))
                    passwordLayout {
                        Group {
                            if visiblePassword {
                                TextField("Password", text: $password, prompt: Text("Password").foregroundStyle(ManagementPalette.secondaryText))
                            } else {
                                SecureField("Password", text: $password, prompt: Text("Password").foregroundStyle(ManagementPalette.secondaryText))
                            }
                        }.textContentType(.password).textInputAutocapitalization(.never).autocorrectionDisabled()
                            .modifier(MainLoginFieldStyle()).focused($focusedField, equals: .password).submitLabel(.go).onSubmit(login)
                        Button(visiblePassword ? "Hide" : "Show") { visiblePassword.toggle() }
                            .frame(minHeight: 44).fixedSize(horizontal: true, vertical: false)
                            .accessibilityLabel(visiblePassword ? "Hide password" : "Show password")
                    }
                }.disabled(busy)
                if let error { Label(error, systemImage: "exclamationmark.circle").foregroundStyle(ManagementPalette.danger) }
                Button(action: login) {
                    HStack { if busy { ProgressView().tint(ManagementPalette.secondaryText) }; Text(busy ? "Signing in…" : "Sign in").fontWeight(.semibold) }.frame(maxWidth: .infinity, minHeight: 36)
                }.managementPrimaryButton().tint(ManagementPalette.primaryAction)
                    .foregroundStyle(canSubmit ? Color.white : ManagementPalette.secondaryText).disabled(!canSubmit)
                Text(BackendConfig.baseURL.host ?? "").font(.footnote.weight(.medium))
                Text("Your session is kept when you close the app. You can sign out from Profile.").font(.footnote).foregroundStyle(ManagementPalette.secondaryText)
                Text("Contact the superadmin if you need an account or password recovery.").font(.footnote).foregroundStyle(ManagementPalette.secondaryText)
            }.frame(maxWidth: 480).padding(24).frame(maxWidth: .infinity)
        }.scrollDismissesKeyboard(.interactively).background(ManagementPalette.screenBackground.ignoresSafeArea())
    }
}

private struct ManagementPrimaryButtonStyle: ViewModifier {
    @Environment(\.isEnabled) private var isEnabled
    func body(content: Content) -> some View {
        content.buttonStyle(.borderedProminent).tint(ManagementPalette.primaryAction)
            .foregroundStyle(isEnabled ? Color.white : ManagementPalette.secondaryText)
    }
}

extension View {
    func managementPrimaryButton() -> some View { modifier(ManagementPrimaryButtonStyle()) }
}

private struct MainLoginFieldStyle: ViewModifier {
    func body(content: Content) -> some View {
        content.textFieldStyle(.plain).foregroundStyle(Color.primary)
            .padding(.horizontal, 14).padding(.vertical, 12).frame(minHeight: 48)
            .background(ManagementPalette.surfaceBackground, in: RoundedRectangle(cornerRadius: 10))
            .overlay(RoundedRectangle(cornerRadius: 10).stroke(ManagementPalette.border, lineWidth: 1))
    }
}

struct ManagementAccountControls: View {
    var showLogout = true
    @ObservedObject private var account = ManagementAccount.shared
    var body: some View {
        if let session = account.session {
            Text(session.user.username).font(.headline)
            MainStatusBadge(label: session.user.role == "SUPER_ADMIN" ? "Superadmin" : "Manager", state: "")
            Link(session.user.role == "SUPER_ADMIN" ? "My account and users" : "My account and password", destination: BackendConfig.baseURL.appendingPathComponent("account/"))
            if showLogout { Button("Sign out", role: .destructive) { Task { await account.logout() } } }
        }
    }
}

struct MainStatusBadge: View {
    let label: String
    let state: String
    private var completed: Bool { ["COMPLETED", "WALKOVER", "VISIBLE", "OPEN"].contains(state) }
    private var active: Bool { ["CALLED", "PLAYING", "IN_PROGRESS", "READY"].contains(state) }
    var body: some View {
        Label(label, systemImage: completed ? "checkmark.circle.fill" : active ? "circle.fill" : "circle")
            .font(.caption.weight(.semibold)).padding(.horizontal, 10).padding(.vertical, 7)
            .foregroundStyle(completed ? ManagementPalette.success : active ? ManagementPalette.accent : ManagementPalette.secondaryText)
            .background(completed ? ManagementPalette.successFill : active ? ManagementPalette.heroFill : ManagementPalette.secondarySurfaceBackground, in: RoundedRectangle(cornerRadius: 8))
    }
}

struct MainTournamentTypes: View {
    @Binding var selection: String
    private let types = [
        ("STANDARD", "Individual", "Single or double elimination bracket.", "person.fill"),
        ("TEAMS", "Teams · LoL / Valorant", "Starters, reserves and players looking for a team.", "person.3.fill"),
        ("FORTNITE", "Fortnite", "Groups, games and accumulated points. External VIP.", "scope"),
        ("MKART", "Mario Kart", "Multiple players per race with qualifying places.", "flag.checkered")
    ]
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Tournament type").font(.headline)
            Text("Choose how participants will compete.").font(.subheadline).foregroundStyle(ManagementPalette.secondaryText)
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 250), spacing: 12)], spacing: 12) {
                ForEach(types, id: \.0) { type in
                    Button { selection = type.0 } label: {
                        HStack(alignment: .top, spacing: 12) {
                            Image(systemName: type.3).font(.title3).frame(width: 26).accessibilityHidden(true)
                            VStack(alignment: .leading, spacing: 6) {
                                Text(type.1).font(.subheadline.weight(.semibold))
                                Text(type.2).font(.footnote).foregroundStyle(ManagementPalette.secondaryText)
                            }.frame(maxWidth: .infinity, alignment: .leading)
                            Image(systemName: selection == type.0 ? "checkmark.circle.fill" : "circle").accessibilityHidden(true)
                        }.padding(16).frame(maxWidth: .infinity, minHeight: 104, alignment: .leading)
                            .background(selection == type.0 ? ManagementPalette.heroFill : ManagementPalette.surfaceBackground, in: RoundedRectangle(cornerRadius: 16))
                            .overlay(RoundedRectangle(cornerRadius: 16).stroke(selection == type.0 ? ManagementPalette.accent : ManagementPalette.cardBorder, lineWidth: selection == type.0 ? 2 : 1))
                    }.buttonStyle(.plain).accessibilityAddTraits(selection == type.0 ? .isSelected : [])
                }
            }
        }
    }
}
