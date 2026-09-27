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

                SectionCard(title: "Pendientes") {
                    if sortedPendingMatches.isEmpty {
                        Text("No hay sets pendientes.")
                    } else {
                        ForEach(sortedPendingMatches) { MatchSummaryView(match: $0) }
                    }
                }

                SectionCard(title: "En juego o llamados") {
                    if sortedActiveMatches.isEmpty {
                        Text("No hay sets activos.")
                    } else {
                        ForEach(sortedActiveMatches) { match in
                            MatchSummaryView(match: match)
                            if match.canPlayerReportMatch && match.opponentParticipantId != nil {
                                Button("Anotacion rapida") {
                                    pendingQuickReportMatch = match
                                    quickReportBestOfOverride = match.reportedBestOf
                                    showQuickReportModeDialog = true
                                }
                                .playerPrimaryButton()
                            } else if match.opponentParticipantId != nil {
                                Text("El organizador ha deshabilitado el reporte de jugadores para este torneo.")
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                }

                if !sortedCompletedMatches.isEmpty {
                    SectionCard(title: "Partidas jugadas (\(sortedCompletedMatches.count))") {
                        Button {
                            completedMatchesExpanded.toggle()
                        } label: {
                            HStack {
                                Text(completedMatchesExpanded ? "Ocultar" : "Mostrar")
                                    .font(.headline)
                                Spacer()
                                Text(completedMatchesExpanded ? "Contraer" : "Desplegar")
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
                    SectionCard(title: "Ladder interna") {
                        Text(ladder.options?.closing == true ? "Inscripciones cerradas · terminando sets" : ladder.options?.paused == true ? "Pausada · se conserva tu sitio en cola" : "Estado: \(ladder.status)")
                        if let position = ladder.queuePosition { Text("Posición \(position) · \(ladder.waitingReason ?? "Buscando rival")") }
                        if normalizedLadderStatus == "ACTIVE"
                            && ladder.activeMatch == nil
                            && ladder.readyCheckMatch == nil
                            && ladder.queuedAt == nil && ladder.canJoin != false {
                            Button("Buscar partida") {
                                Task { await viewModel.queueForLadder(currentTournament) }
                            }
                            .playerPrimaryButton()
                        }
                        if normalizedLadderStatus == "ACTIVE" && ladder.queuedAt != nil {
                            Button("Salir de la cola") {
                                Task { await viewModel.leaveLadder(currentTournament) }
                            }
                        }
                        if let readyCheck = ladder.readyCheckMatch {
                            Divider()
                            Text("Partida encontrada").font(.headline)
                            MatchSummaryView(match: readyCheck)
                            HStack {
                                Button("Estoy listo") {
                                    Task { await viewModel.readyLadder(currentTournament, match: readyCheck) }
                                }
                                .playerPrimaryButton()
                                Button("Cancelar") {
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
                            Button("Anotacion rapida") {
                                pendingLadderQuickReportMatch = activeMatch
                                ladderQuickReportBestOfOverride = activeMatch.reportedBestOf
                                showLadderQuickReportModeDialog = true
                            }.disabled(activeMatch.status != "PLAYING" || !activeMatch.canPlayerReportMatch)
                            .playerPrimaryButton()
                        }
                        if !ladder.standings.isEmpty {
                            Divider()
                            Text("Clasificacion").font(.headline)
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
                                    Text("Historico")
                                        .font(.headline)
                                    Spacer()
                                    Text(ladderHistoryExpanded ? "Ocultar" : "Mostrar")
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
        .navigationTitle("Torneo")
        .confirmationDialog("Modalidad del set", isPresented: $showQuickReportModeDialog, titleVisibility: .visible) {
            if let match = pendingQuickReportMatch {
                Button("Formato del torneo (Bo\(match.effectiveBestOf))") {
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
            Button("Cancelar", role: .cancel) {
                pendingQuickReportMatch = nil
            }
        } message: {
            Text("Indica si este set se jugo con el formato por defecto del torneo o con otra modalidad.")
        }
        .confirmationDialog("Modalidad del set", isPresented: $showLadderQuickReportModeDialog, titleVisibility: .visible) {
            if let match = pendingLadderQuickReportMatch {
                Button("Formato del torneo (Bo\(match.effectiveBestOf))") {
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
            Button("Cancelar", role: .cancel) {
                pendingLadderQuickReportMatch = nil
            }
        } message: {
            Text("Indica si este set se jugo con el formato por defecto del torneo o con otra modalidad.")
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
                    Text("Modalidad del set: Bo\(effectiveBestOf)")
                }

                Section("Resultado final") {
                    ForEach(scoreOptions(), id: \.label) { option in
                        Button(option.label) {
                            games = buildGames(myWins: option.myWins, opponentWins: option.opponentWins)
                        }
                    }
                }

                if !games.isEmpty {
                    if match.canReportCharacters {
                        Section("Personajes base") {
                            CharacterField(teamSize: match.entrantSize, gameTitle: match.gameTitle, title: "Mi personaje", value: $baseCharacterMine) { propagateCharacters() }
                            CharacterField(teamSize: match.entrantSize, gameTitle: match.gameTitle, title: "Rival", value: $baseCharacterOpponent) { propagateCharacters() }
                        }
                    }

                    Section("Resumen de juegos") {
                        ForEach(games.indices, id: \.self) { index in
                            VStack(alignment: .leading, spacing: 8) {
                                Text("Juego \(index + 1)").font(.headline)
                                Picker("Ganador", selection: Binding(
                                    get: { games[index].winnerParticipantId },
                                    set: { games[index].winnerParticipantId = $0 }
                                )) {
                                    Text(match.myDisplayName).tag(match.myParticipantId)
                                    Text(match.opponentDisplayName ?? "Rival").tag(match.opponentParticipantId ?? "")
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
                                        title: match.opponentDisplayName ?? "Rival",
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
            .navigationTitle("Anotacion rapida")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancelar") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(viewModel.isMutating ? "Enviando…" : "Anotar") { onSubmit(games) }
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
        let rival = match.opponentDisplayName ?? "Rival"
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
                        Text("Elegir personaje")
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
            .searchable(text: $filter, prompt: "Filtrar personaje")
            .navigationTitle("Elegir personaje")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cerrar") { dismiss() }
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
                title: teamSize > 1 ? "\(title) · Jugador \(index + 1)" : title,
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
    case "PLAYING": return "En juego"
    case "SUSPENDED": return "Esperando bracket / setup"
    case "AWAITING_CONFIRMATION": return "Resultado pendiente del rival"
    case "DISPUTED": return "Disputa · organización revisará el resultado"
    case "READY_CHECK": return "Confirmando asistencia"
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
            Text("Resultado propuesto: \(match.myScore)–\(match.opponentScore ?? 0)")
            Button("Confirmar resultado") { Task { await viewModel.reviewLadder(tournament, match: match, action: "CONFIRM", reason: nil) } }.playerPrimaryButton()
            Button("No estoy de acuerdo") { showDispute.toggle() }.buttonStyle(.bordered)
            if showDispute {
                TextField("Motivo de la disputa", text: $reason).textFieldStyle(.roundedBorder)
                Button("Enviar a organización") { Task { await viewModel.reviewLadder(tournament, match: match, action: "DISPUTE", reason: reason.trimmingCharacters(in: .whitespacesAndNewlines)) } }.disabled(!(3...500).contains(reason.trimmingCharacters(in: .whitespacesAndNewlines).count))
            }
        }.disabled(viewModel.isMutating)
    }
}
