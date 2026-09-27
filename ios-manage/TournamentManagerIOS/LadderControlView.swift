import SwiftUI

struct LadderControlSettings: Codable {
    var mode = "CASUAL"
    var bestOf = 5
    var readySeconds = 300
    var rematchWaitSeconds = 180
    var minimumSets = 3
    var requireConfirmation = false
    var setupNumbers: [Int] = []
    var opensAt: String?
    var closesAt: String?
}
struct LadderControlOptions: Codable { var settings: LadderControlSettings; var paused: Bool?; var closing: Bool?; var revision: String? }
struct LadderControlDetails: Codable { var revision: String?; var suspensionReason: String?; var disputeReason: String? }
struct LadderControlEvent: Codable, Identifiable { let id: String; let createdAt: String; let actor: String; let action: String; let reason: String? }
struct LadderControlScore: Encodable { let participantId: String; let score: Int }
struct LadderControlRequest: Encodable {
    var action: String
    var actor = "organización"
    var expectedRevision: String?
    var participantId: String?
    var matchId: String?
    var reason: String?
    var settings: LadderControlSettings?
    var winnerParticipantId: String?
    var scores: [LadderControlScore]?
}
func ladderControlStatus(_ status: String) -> String {
    switch status {
    case "READY_CHECK": return "Confirmando asistencia"
    case "PLAYING": return "En juego"
    case "SUSPENDED": return "Esperando bracket / setup"
    case "AWAITING_CONFIRMATION": return "Resultado pendiente del rival"
    case "DISPUTED": return "Disputa · revisar resultado"
    case "COMPLETED": return "Completado"
    case "CANCELLED": return "Cancelado"
    case "EXPIRED": return "Ausencia en confirmación"
    default: return status
    }
}

struct LadderControlView: View {
    @Environment(\.dismiss) private var dismiss
    let tournamentId: String
    let participants: [TournamentParticipant]
    @State private var board: LadderOverview?
    @State private var busy = false
    @State private var generation = 0
    @State private var error: String?
    @State private var editSettings = false
    @State private var editRevision: String?
    @State private var editSnapshot = LadderControlSettings()
    @State private var selected: LadderMatch?
    private let api = ManagementAPIClient()
    private var options: LadderControlOptions? { board?.session?.options }
    private var active: Bool { board?.session?.status == "ACTIVE" }
    var body: some View {
        NavigationStack {
            List {
                if busy { ProgressView("Guardando…") }
                if let error { Text(error).foregroundStyle(.red) }
                Section("Estado") {
                    Text(!active ? "Finalizada o sin iniciar" : options?.closing == true ? "Cerrando · los sets abiertos pueden terminar" : options?.paused == true ? "Pausada · sin nuevos emparejamientos" : "Activa")
                    Text("\(options?.settings.mode ?? "CASUAL") · Bo\(options?.settings.bestOf ?? 5) · \(board?.queue.count ?? 0) en cola")
                    if active {
                        Button(options?.paused == true ? "Reanudar" : "Pausar") { send(LadderControlRequest(action: options?.paused == true ? "RESUME" : "PAUSE", expectedRevision: options?.revision)) }
                        Button("Ajustes") { editRevision = options?.revision; editSnapshot = options?.settings ?? LadderControlSettings(); editSettings = true }
                        if options?.closing != true { Button("Cerrar inscripciones") { send(LadderControlRequest(action: "CLOSE", expectedRevision: options?.revision)) } }
                    }
                }
                if active {
                    DisclosureGroup("Añadir / retirar jugadores") {
                        ForEach(participants) { player in
                            VStack(alignment: .leading) {
                                Text(player.displayName)
                                HStack {
                                    Button("Añadir a cola") { send(LadderControlRequest(action: "ADD_PLAYER", expectedRevision: options?.revision, participantId: player.id)) }.disabled(options?.closing == true)
                                    Button("Retirar") { send(LadderControlRequest(action: "REMOVE_PLAYER", expectedRevision: options?.revision, participantId: player.id)) }
                                }.buttonStyle(.bordered)
                            }
                        }
                    }
                }
                Section("Cola · prioridad conservada") {
                    ForEach(Array((board?.queue ?? []).enumerated()), id: \.element.id) { index, entry in
                        VStack(alignment: .leading) { Text("\(index+1). \(entry.displayName)"); Text(entry.waitingReason ?? "Esperando rival").font(.caption).foregroundStyle(.secondary) }
                    }
                }
                Section("Sets abiertos") {
                    ForEach(board?.activeMatches ?? []) { match in
                        VStack(alignment: .leading, spacing: 6) {
                            Text(match.participantsLabel).font(.headline)
                            Text("\(ladderControlStatus(match.status)) · Bo\(match.bestOf) · \(match.stationLabel ?? "Sin setup asignado")")
                            if let message = match.details?.disputeReason ?? match.details?.suspensionReason { Text(message).font(.caption) }
                            Button("Gestionar set") { selected = match }
                        }
                    }
                }
                Section("Clasificación") {
                    Text(options?.settings.mode == "COMPETITIVE" ? "Rating del evento · mínimo \(options?.settings.minimumSets ?? 3) sets. Los provisionales van al final." : "Orden por victorias y diferencia de juegos.").font(.caption)
                    ForEach(Array((board?.standings ?? []).enumerated()), id: \.element.id) { index, standing in
                        VStack(alignment: .leading) {
                            Text("\(index+1). \(standing.displayName) · \(standing.wins)–\(standing.losses) · \(standing.winRate ?? 0)%")
                            if options?.settings.mode == "COMPETITIVE" { Text("Rating \(standing.rating ?? 1000)\(standing.eligible == true ? "" : " · provisional")").font(.caption) }
                        }
                    }
                }
                DisclosureGroup("Historial y actividad") {
                    ForEach(Array((board?.completedMatches ?? []).prefix(50))) { match in
                        VStack(alignment: .leading) { Text(match.participantsLabel); Text(ladderControlStatus(match.status)); if active && match.status == "COMPLETED" { Button("Corregir") { selected = match } } }
                    }
                    ForEach(Array((board?.activity ?? []).prefix(30))) { entry in Text("\(entry.createdAt.prefix(19)) · \(entry.action) · \(entry.actor)\(entry.reason.map { " · " + $0 } ?? "")").font(.caption) }
                }
            }
            .disabled(busy)
            .navigationTitle("Control de ladder")
            .toolbar { Button("Cerrar") { dismiss() }.disabled(busy) }
            .task { while !Task.isCancelled { await refresh(); do { try await Task.sleep(nanoseconds: 5_000_000_000) } catch { break } } }
            .sheet(isPresented: $editSettings) { LadderSettingsEditor(settings: editSnapshot) { value in send(LadderControlRequest(action: "SETTINGS", expectedRevision: editRevision, settings: value)) } }
            .sheet(item: $selected) { match in LadderSetEditor(match: match) { action, reason, scores in send(LadderControlRequest(action: action, expectedRevision: match.details?.revision, matchId: match.id, reason: reason, winnerParticipantId: scores?.max(by: { $0.score < $1.score })?.participantId, scores: scores)) } }
        }
    }
    @MainActor private func refresh() async {
        guard !busy else { return }; let current = generation
        do { let next: LadderOverview = try await api.get("api/tournaments/\(tournamentId)/ladder"); if !busy && current == generation { board = next } }
        catch { if !Task.isCancelled { self.error = error.localizedDescription } }
    }
    private func send(_ input: LadderControlRequest) {
        guard !busy else { return }; busy = true; generation += 1; error = nil
        Task { @MainActor in
            do { board = try await api.post("api/tournaments/\(tournamentId)/ladder/control", body: input); editSettings = false; selected = nil }
            catch { self.error = error.localizedDescription }
            busy = false
        }
    }
}

private struct LadderSettingsEditor: View {
    @Environment(\.dismiss) private var dismiss
    @State var settings: LadderControlSettings
    var save: (LadderControlSettings) -> Void
    @State private var setups = ""
    @State private var opens = ""
    @State private var closes = ""
    private var setupValues: [Int?] { setups.split(separator: ",").map { Int($0.trimmingCharacters(in: .whitespaces)) } }
    var body: some View {
        NavigationStack {
            Form {
                Picker("Clasificación", selection: $settings.mode) { Text("Casual").tag("CASUAL"); Text("Competitiva").tag("COMPETITIVE") }
                Picker("Formato de nuevos sets", selection: $settings.bestOf) { ForEach([1,3,5],id: \.self) { Text("Bo\($0)").tag($0) } }
                Toggle("El rival confirma el resultado", isOn: $settings.requireConfirmation)
                Stepper("Confirmar asistencia: \(settings.readySeconds) s", value: $settings.readySeconds, in: 30...900, step: 30)
                Stepper("Espera antes de repetir rival: \(settings.rematchWaitSeconds) s", value: $settings.rematchWaitSeconds, in: 0...1800, step: 30)
                Stepper("Mínimo de sets: \(settings.minimumSets)", value: $settings.minimumSets, in: 1...50)
                TextField("Setups · ej. 3,4", text: $setups)
                Text("Vacío: asignación manual. La bracket principal tiene prioridad.").font(.caption)
                TextField("Apertura UTC · 2026-09-20T16:00:00Z", text: $opens).textInputAutocapitalization(.never)
                TextField("Cierre UTC · opcional", text: $closes).textInputAutocapitalization(.never)
                Text("Los ajustes de formato se aplican a nuevos sets.").font(.caption)
            }
            .navigationTitle("Ajustes de ladder")
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Volver") { dismiss() } }; ToolbarItem(placement: .confirmationAction) { Button("Guardar") { settings.setupNumbers = setupValues.compactMap { $0 }; settings.opensAt = opens.isEmpty ? nil : opens; settings.closesAt = closes.isEmpty ? nil : closes; save(settings); dismiss() }.disabled(setupValues.contains { $0 == nil || !(1...256).contains($0 ?? 0) }) } }
            .onAppear { setups = settings.setupNumbers.map(String.init).joined(separator: ","); opens = settings.opensAt ?? ""; closes = settings.closesAt ?? "" }
        }
    }
}
private struct LadderSetEditor: View {
    @Environment(\.dismiss) private var dismiss
    let match: LadderMatch
    var save: (String,String,[LadderControlScore]?) -> Void
    @State private var reason = ""
    @State private var first = 0
    @State private var second = 0
    private var needed: Int { match.bestOf/2+1 }
    private var valid: Bool { !reason.trimmingCharacters(in: .whitespaces).isEmpty && ((first == needed && second < needed) || (second == needed && first < needed)) }
    var body: some View {
        NavigationStack {
            Form {
                Text(match.participantsLabel)
                TextField("Motivo obligatorio", text: $reason)
                if match.status != "READY_CHECK" && match.participants.count == 2 {
                    Stepper("\(match.participants[0].displayName): \(first)", value: $first, in: 0...needed)
                    Stepper("\(match.participants[1].displayName): \(second)", value: $second, in: 0...needed)
                    Button("Guardar resultado") { save("RESOLVE_RESULT",reason,[LadderControlScore(participantId: match.participants[0].participantId,score:first),LadderControlScore(participantId: match.participants[1].participantId,score:second)]); dismiss() }.disabled(!valid)
                }
                if ["COMPLETED","DISPUTED","AWAITING_CONFIRMATION"].contains(match.status) { Button("Reabrir para jugar") { save("REOPEN_MATCH",reason,nil); dismiss() }.disabled(reason.isEmpty) }
                if match.status != "COMPLETED" { Button("Cancelar y devolver a cola") { save("CANCEL_MATCH",reason,nil); dismiss() }.disabled(reason.isEmpty) }
            }.navigationTitle("Gestionar set · Bo\(match.bestOf)")
            .toolbar { Button("Volver") { dismiss() } }
            .onAppear { first = match.participants.first?.score ?? 0; second = match.participants.last?.score ?? 0 }
        }
    }
}
