import SwiftUI

struct TournamentDetailView: View {
    @EnvironmentObject private var viewModel: PlayerAppViewModel
    let tournament: PlayerTournament
    @State private var quickReportMatch: PlayerMatch?
    @State private var ladderQuickReportMatch: PlayerMatch?
    @State private var pendingQuickReportMatch: PlayerMatch?
    @State private var pendingLadderQuickReportMatch: PlayerMatch?
    @State private var quickReportBestOfOverride: Int?
    @State private var ladderQuickReportBestOfOverride: Int?
    @State private var showQuickReportModeDialog = false
    @State private var showLadderQuickReportModeDialog = false
    @State private var ladderHistoryExpanded = false
    @State private var completedMatchesExpanded = false

    private var currentTournament: PlayerTournament {
        viewModel.tournaments.first(where: { $0.tournamentId == tournament.tournamentId }) ?? tournament
    }

    private var normalizedLadderStatus: String? {
        currentTournament.ladder?.status.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
    }

    private var sortedPendingMatches: [PlayerMatch] {
        currentTournament.pendingMatches.sorted {
            if $0.roundLabel != $1.roundLabel {
                return $0.roundLabel.localizedStandardCompare($1.roundLabel) == .orderedAscending
            }
            return $0.id < $1.id
        }
    }

    private var sortedActiveMatches: [PlayerMatch] {
        currentTournament.activeMatches.sorted {
            let lhsPriority = activePlayerMatchPriority($0)
            let rhsPriority = activePlayerMatchPriority($1)
            if lhsPriority != rhsPriority {
                return lhsPriority < rhsPriority
            }
            let lhsAnchor = activePlayerMatchTimelineAnchor($0)
            let rhsAnchor = activePlayerMatchTimelineAnchor($1)
            if lhsAnchor != rhsAnchor {
                return lhsAnchor < rhsAnchor
            }
            if $0.roundLabel != $1.roundLabel {
                return $0.roundLabel.localizedStandardCompare($1.roundLabel) == .orderedAscending
            }
            return $0.id < $1.id
        }
    }

    private var sortedLadderHistory: [PlayerMatch] {
        currentTournament.ladder?.history.sorted {
            if $0.roundLabel != $1.roundLabel {
                return $0.roundLabel.localizedStandardCompare($1.roundLabel) == .orderedAscending
            }
            return $0.id < $1.id
        } ?? []
    }

    private var sortedCompletedMatches: [PlayerMatch] {
        currentTournament.completedMatches.sorted {
            if $0.roundLabel != $1.roundLabel {
                return $0.roundLabel.localizedStandardCompare($1.roundLabel) == .orderedAscending
            }
            return $0.id < $1.id
        }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                SectionCard(title: currentTournament.title) {
                    Text(currentTournament.gameTitle)
                    Text(currentTournament.status).foregroundStyle(.secondary)
                }

                SectionCard(title: "Pending") {
                    if sortedPendingMatches.isEmpty {
                        Text("No pending sets.")
                    } else {
                        ForEach(sortedPendingMatches) { MatchSummaryView(match: $0) }
                    }
                }

                SectionCard(title: "Playing or called") {
                    if sortedActiveMatches.isEmpty {
                        Text("No active sets.")
                    } else {
                        ForEach(sortedActiveMatches) { match in
                            MatchSummaryView(match: match)
                            if match.canPlayerReportMatch && match.opponentParticipantId != nil {
                                Button("Quick report") {
                                    pendingQuickReportMatch = match
                                    quickReportBestOfOverride = match.reportedBestOf
                                    showQuickReportModeDialog = true
                                }
                                .playerPrimaryButton()
                            } else if match.opponentParticipantId != nil {
                                Text("The organizer has disabled player reporting for this tournament.")
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                }

                if !sortedCompletedMatches.isEmpty {
                    SectionCard(title: "Played matches (\(sortedCompletedMatches.count))") {
                        Button {
                            completedMatchesExpanded.toggle()
                        } label: {
                            HStack {
                                Text(completedMatchesExpanded ? "Hide" : "Show")
                                    .font(.headline)
                                Spacer()
                                Text(completedMatchesExpanded ? "Collapse" : "Expand")
                                    .foregroundStyle(.secondary)
                            }
                        }
                        .buttonStyle(.plain)

                        if completedMatchesExpanded {
                            ForEach(sortedCompletedMatches) { match in
                                MatchSummaryView(match: match)
                            }
                        }
                    }
                }

                if let ladder = currentTournament.ladder {
                    SectionCard(title: "Internal ladder") {
                        Text(ladder.options?.closing == true ? "Registration closed · finishing sets" : ladder.options?.paused == true ? "Paused · your queue position is preserved" : "Status: \(ladder.status)")
                        if let position = ladder.queuePosition { Text("Position \(position) · \(ladder.waitingReason ?? "Finding opponent")") }
                        if normalizedLadderStatus == "ACTIVE"
                            && ladder.activeMatch == nil
                            && ladder.readyCheckMatch == nil
                            && ladder.queuedAt == nil && ladder.canJoin != false {
                            Button("Find match") {
                                Task { await viewModel.queueForLadder(currentTournament) }
                            }
                            .playerPrimaryButton()
                        }
                        if normalizedLadderStatus == "ACTIVE" && ladder.queuedAt != nil {
                            Button("Leave queue") {
                                Task { await viewModel.leaveLadder(currentTournament) }
                            }
                        }
                        if let readyCheck = ladder.readyCheckMatch {
                            Divider()
                            Text("Match found").font(.headline)
                            MatchSummaryView(match: readyCheck)
                            HStack {
                                Button("I am ready") {
                                    Task { await viewModel.readyLadder(currentTournament, match: readyCheck) }
                                }
                                .playerPrimaryButton()
                                Button("Cancel") {
                                    Task { await viewModel.cancelReadyCheck(currentTournament, match: readyCheck) }
                                }
                            }
                        }
                        if let activeMatch = ladder.activeMatch {
                            Divider()
                            Text(playerLadderStatus(activeMatch.status)).font(.headline)
                            if let message = activeMatch.ladderMessage { Text(message).font(.caption) }
                            if activeMatch.canReviewLadderResult == true { PlayerLadderReviewButtons(tournament: currentTournament, match: activeMatch) }
                            MatchSummaryView(match: activeMatch)
                            Button("Quick report") {
                                pendingLadderQuickReportMatch = activeMatch
                                ladderQuickReportBestOfOverride = activeMatch.reportedBestOf
                                showLadderQuickReportModeDialog = true
                            }.disabled(activeMatch.status != "PLAYING" || !activeMatch.canPlayerReportMatch)
                            .playerPrimaryButton()
                        }
                        if !ladder.standings.isEmpty {
                            Divider()
                            Text("Standings").font(.headline)
                            ForEach(Array(ladder.standings.enumerated()), id: \.element.id) { index, standing in
                                Text("\(index + 1). \(standing.displayName) · \(standing.wins)–\(standing.losses) · \(standing.winRate ?? 0)%")
                                if ladder.options?.settings.mode == "COMPETITIVE" { Text("Rating \(standing.rating ?? 1000)\(standing.eligible == true ? "" : " · provisional")").font(.caption) }
                            }
                        }
                        if !sortedLadderHistory.isEmpty {
                            Divider()
                            Button {
                                ladderHistoryExpanded.toggle()
                            } label: {
                                HStack {
                                    Text("History")
                                        .font(.headline)
                                    Spacer()
                                    Text(ladderHistoryExpanded ? "Hide" : "Show")
                                        .foregroundStyle(.secondary)
                                }
                            }
                            .buttonStyle(.plain)

                            if ladderHistoryExpanded {
                                ForEach(sortedLadderHistory) { MatchSummaryView(match: $0) }
                            }
                        }
                    }
                }
            }
            .padding()
        }
        .navigationTitle("Tournament")
        .confirmationDialog("Set format", isPresented: $showQuickReportModeDialog, titleVisibility: .visible) {
            if let match = pendingQuickReportMatch {
                Button("Tournament format (Bo\(match.effectiveBestOf))") {
                    quickReportBestOfOverride = nil
                    quickReportMatch = match
                    pendingQuickReportMatch = nil
                }
                Button("Bo1") {
                    quickReportBestOfOverride = 1
                    quickReportMatch = match
                    pendingQuickReportMatch = nil
                }
                Button("Bo3") {
                    quickReportBestOfOverride = 3
                    quickReportMatch = match
                    pendingQuickReportMatch = nil
                }
                Button("Bo5") {
                    quickReportBestOfOverride = 5
                    quickReportMatch = match
                    pendingQuickReportMatch = nil
                }
            }
            Button("Cancel", role: .cancel) {
                pendingQuickReportMatch = nil
            }
        } message: {
            Text("Select whether this set used the default tournament format or a different one.")
        }
        .confirmationDialog("Set format", isPresented: $showLadderQuickReportModeDialog, titleVisibility: .visible) {
            if let match = pendingLadderQuickReportMatch {
                Button("Tournament format (Bo\(match.effectiveBestOf))") {
                    ladderQuickReportBestOfOverride = nil
                    ladderQuickReportMatch = match
                    pendingLadderQuickReportMatch = nil
                }
                Button("Bo1") {
                    ladderQuickReportBestOfOverride = 1
                    ladderQuickReportMatch = match
                    pendingLadderQuickReportMatch = nil
                }
                Button("Bo3") {
                    ladderQuickReportBestOfOverride = 3
                    ladderQuickReportMatch = match
                    pendingLadderQuickReportMatch = nil
                }
                Button("Bo5") {
                    ladderQuickReportBestOfOverride = 5
                    ladderQuickReportMatch = match
                    pendingLadderQuickReportMatch = nil
                }
            }
            Button("Cancel", role: .cancel) {
                pendingLadderQuickReportMatch = nil
            }
        } message: {
            Text("Select whether this set used the default tournament format or a different one.")
        }
        .sheet(item: $quickReportMatch) { match in
            QuickReportView(match: match, effectiveBestOf: quickReportBestOfOverride ?? match.effectiveBestOf) { games in
                Task {
                    await viewModel.reportDetailedResult(
                        currentTournament,
                        match: match,
                        bestOfOverride: quickReportBestOfOverride,
                        games: games,
                        ladder: false
                    )
                    if viewModel.error == nil { quickReportMatch = nil }
                }
            }
        }
        .sheet(item: $ladderQuickReportMatch) { match in
            QuickReportView(match: match, effectiveBestOf: ladderQuickReportBestOfOverride ?? match.effectiveBestOf) { games in
                Task {
                    await viewModel.reportDetailedResult(
                        currentTournament,
                        match: match,
                        bestOfOverride: ladderQuickReportBestOfOverride,
                        games: games,
                        ladder: true
                    )
                    if viewModel.error == nil { ladderQuickReportMatch = nil }
                }
            }
        }
    }
}

struct QuickReportView: View {
    @EnvironmentObject private var viewModel: PlayerAppViewModel
    let match: PlayerMatch
    let effectiveBestOf: Int
    let onSubmit: ([QuickReportGame]) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var games: [QuickReportGame] = []
    @State private var baseCharacterMine: String
    @State private var baseCharacterOpponent: String

    private var winsNeeded: Int { max(1, (effectiveBestOf / 2) + 1) }

    init(match: PlayerMatch, effectiveBestOf: Int, onSubmit: @escaping ([QuickReportGame]) -> Void) {
        self.match = match
        self.effectiveBestOf = effectiveBestOf
        self.onSubmit = onSubmit
        _baseCharacterMine = State(initialValue: latestCharacterForParticipant(match, participantId: match.myParticipantId))
        _baseCharacterOpponent = State(initialValue: latestCharacterForParticipant(match, participantId: match.opponentParticipantId))
    }

    var body: some View {
        NavigationStack {
            Form {
                if let error = viewModel.error { Section { Text(error).foregroundStyle(PlayerPalette.danger) } }
                Section {
                    Text("Set format: Bo\(effectiveBestOf)")
                }

                Section("Final result") {
                    ForEach(scoreOptions(), id: \.label) { option in
                        Button(option.label) {
                            games = buildGames(myWins: option.myWins, opponentWins: option.opponentWins)
                        }
                    }
                }

                if !games.isEmpty {
                    if match.canReportCharacters {
                        Section("Base characters") {
                            CharacterField(teamSize: match.entrantSize, gameTitle: match.gameTitle, title: "My character", value: $baseCharacterMine) { propagateCharacters() }
                            CharacterField(teamSize: match.entrantSize, gameTitle: match.gameTitle, title: "Opponent", value: $baseCharacterOpponent) { propagateCharacters() }
                        }
                    }

                    Section("Game summary") {
                        ForEach(games.indices, id: \.self) { index in
                            VStack(alignment: .leading, spacing: 8) {
                                Text("Game \(index + 1)").font(.headline)
                                Picker("Winner", selection: Binding(
                                    get: { games[index].winnerParticipantId },
                                    set: { games[index].winnerParticipantId = $0 }
                                )) {
                                    Text(match.myDisplayName).tag(match.myParticipantId)
                                    Text(match.opponentDisplayName ?? "Opponent").tag(match.opponentParticipantId ?? "")
                                }
                                .pickerStyle(.segmented)

                                if match.canReportCharacters {
                                    CharacterField(
                                        teamSize: match.entrantSize, gameTitle: match.gameTitle,
                                        title: match.myDisplayName,
                                        value: Binding(
                                            get: { games[index].selections[match.myParticipantId] ?? "" },
                                            set: { games[index].selections[match.myParticipantId] = $0 }
                                        )
                                    )
                                    CharacterField(
                                        teamSize: match.entrantSize, gameTitle: match.gameTitle,
                                        title: match.opponentDisplayName ?? "Opponent",
                                        value: Binding(
                                            get: { games[index].selections[match.opponentParticipantId ?? ""] ?? "" },
                                            set: { games[index].selections[match.opponentParticipantId ?? ""] = $0 }
                                        )
                                    )
                                }
                            }
                        }
                    }
                }
            }
            .navigationTitle("Quick report")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(viewModel.isMutating ? "Sending…" : "Report") { onSubmit(games) }
                        .disabled(!canSubmit || viewModel.isMutating)
                }
            }
        }
        .interactiveDismissDisabled(viewModel.isMutating)
    }

    private var canSubmit: Bool {
        !games.isEmpty && (!match.canReportCharacters || games.allSatisfy { game in
            [match.myParticipantId, match.opponentParticipantId ?? ""].allSatisfy { id in
                let names = (game.selections[id] ?? "").components(separatedBy: "/")
                return names.count == max(1, match.entrantSize) && names.allSatisfy { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
            }
        })
    }

    private func scoreOptions() -> [(label: String, myWins: Int, opponentWins: Int)] {
        let rival = match.opponentDisplayName ?? "Opponent"
        return (0..<winsNeeded).flatMap { opponentWins in
            [
                ("\(match.myDisplayName) \(winsNeeded)-\(opponentWins)", winsNeeded, opponentWins),
                ("\(rival) \(winsNeeded)-\(opponentWins)", opponentWins, winsNeeded),
            ]
        }
    }

    private func buildGames(myWins: Int, opponentWins: Int) -> [QuickReportGame] {
        let opponentId = match.opponentParticipantId ?? ""
        let winner = myWins > opponentWins ? match.myParticipantId : opponentId
        let loser = winner == match.myParticipantId ? opponentId : match.myParticipantId
        // The deciding win must end the set; never append games after it.
        let winners = Array(repeating: loser, count: min(myWins, opponentWins))
            + Array(repeating: winner, count: max(myWins, opponentWins))
        return winners.map { winner in
            QuickReportGame(
                winnerParticipantId: winner,
                selections: match.canReportCharacters ? [
                    match.myParticipantId: baseCharacterMine,
                    opponentId: baseCharacterOpponent,
                ] : [:]
            )
        }
    }

    private func propagateCharacters() {
        guard match.canReportCharacters else { return }
        let opponentId = match.opponentParticipantId ?? ""
        for index in games.indices {
            if !baseCharacterMine.isEmpty {
                games[index].selections[match.myParticipantId] = baseCharacterMine
            }
            if !baseCharacterOpponent.isEmpty {
                games[index].selections[opponentId] = baseCharacterOpponent
            }
        }
    }
}

struct SingleCharacterField: View {
    let gameTitle: String
    let title: String
    @Binding var value: String
    var onChange: (() -> Void)? = nil
    @State private var showingPicker = false

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
            Button {
                showingPicker = true
            } label: {
                HStack {
                    if value.isEmpty {
                        Text("Choose character")
                    } else {
                        SmashCharacterInlineLabel(name: value)
                    }
                    Spacer()
                }
            }
            .buttonStyle(.bordered)
        }
        .sheet(isPresented: $showingPicker) {
            CharacterPickerView(gameTitle: gameTitle, selected: $value) {
                onChange?()
            }
        }
    }
}

struct CharacterPickerView: View {
    let gameTitle: String
    @Binding var selected: String
    let onPicked: () -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var filter = ""

    var filteredCharacters: [String] {
        let text = filter.trimmingCharacters(in: .whitespacesAndNewlines)
        let names = gameTitle.range(of: "rivals|roa", options: [.regularExpression, .caseInsensitive]) != nil
            ? ["Random", "Zetterburn", "Orcane", "Wrastor", "Kragg", "Forsburn", "Maypul", "Absa", "Etalus", "Ranno", "Clairen", "Olympia", "Fleet", "Loxodont", "Galvan", "La Reina", "Slade"] : smashUltimateCharacterNames
        return text.isEmpty ? names : names.filter { $0.localizedCaseInsensitiveContains(text) }
    }

    var body: some View {
        NavigationStack {
            List(filteredCharacters, id: \.self) { character in
                Button {
                    selected = character
                    onPicked()
                    dismiss()
                } label: {
                    SmashCharacterInlineLabel(name: character)
                }
            }
            .searchable(text: $filter, prompt: "Filter characters")
            .navigationTitle("Choose character")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { dismiss() }
                }
            }
        }
    }
}

struct CharacterField: View {
    let teamSize: Int
    let gameTitle: String
    let title: String
    @Binding var value: String
    var onChange: (() -> Void)? = nil
    var body: some View {
        ForEach(0..<max(1, min(8, teamSize)), id: \.self) { index in
            SingleCharacterField(gameTitle: gameTitle,
                title: teamSize > 1 ? "\(title) · Player \(index + 1)" : title,
                value: Binding(get: {
                    let names = value.components(separatedBy: " / ")
                    return index < names.count ? names[index] : ""
                }, set: { selected in
                    var names = value.components(separatedBy: " / ")
                    while names.count < max(1, min(8, teamSize)) { names.append("") }
                    names[index] = selected
                    value = names.joined(separator: " / ")
                }), onChange: onChange)
        }
    }
}

func playerLadderStatus(_ status: String) -> String {
    switch status {
    case "PLAYING": return "Playing"
    case "SUSPENDED": return "Waiting for bracket / setup"
    case "AWAITING_CONFIRMATION": return "Result awaiting opponent"
    case "DISPUTED": return "Disputed · staff will review the result"
    case "READY_CHECK": return "Confirming attendance"
    default: return status
    }
}
struct PlayerLadderReviewButtons: View {
    @EnvironmentObject private var viewModel: PlayerAppViewModel
    let tournament: PlayerTournament
    let match: PlayerMatch
    @State private var reason = ""
    @State private var showDispute = false
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Proposed result: \(match.myScore)–\(match.opponentScore ?? 0)")
            Button("Confirm result") { Task { await viewModel.reviewLadder(tournament, match: match, action: "CONFIRM", reason: nil) } }.playerPrimaryButton()
            Button("I disagree") { showDispute.toggle() }.buttonStyle(.bordered)
            if showDispute {
                TextField("Dispute reason", text: $reason).textFieldStyle(.roundedBorder)
                Button("Send to staff") { Task { await viewModel.reviewLadder(tournament, match: match, action: "DISPUTE", reason: reason.trimmingCharacters(in: .whitespacesAndNewlines)) } }.disabled(!(3...500).contains(reason.trimmingCharacters(in: .whitespacesAndNewlines).count))
            }
        }.disabled(viewModel.isMutating)
    }
}
