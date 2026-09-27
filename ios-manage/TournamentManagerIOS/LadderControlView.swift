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
    var actor = "staff"
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
    case "READY_CHECK": return "Confirming attendance"
    case "PLAYING": return "Playing"
    case "SUSPENDED": return "Waiting for bracket / setup"
    case "AWAITING_CONFIRMATION": return "Result awaiting opponent"
    case "DISPUTED": return "Disputed · review result"
    case "COMPLETED": return "Completed"
    case "CANCELLED": return "Cancelled"
    case "EXPIRED": return "Awaiting absence confirmation"
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
                if busy { ProgressView("Saving…") }
                if let error { Text(error).foregroundStyle(.red) }
                Section("Status") {
                    Text(!active ? "Finished or not started" : options?.closing == true ? "Closing · open sets may finish" : options?.paused == true ? "Paused · no new pairings" : "Active")
                    Text("\(options?.settings.mode ?? "CASUAL") · Bo\(options?.settings.bestOf ?? 5) · \(board?.queue.count ?? 0) queued")
                    if active {
                        Button(options?.paused == true ? "Resume" : "Pause") { send(LadderControlRequest(action: options?.paused == true ? "RESUME" : "PAUSE", expectedRevision: options?.revision)) }
                        Button("Settings") { editRevision = options?.revision; editSnapshot = options?.settings ?? LadderControlSettings(); editSettings = true }
                        if options?.closing != true { Button("Close registration") { send(LadderControlRequest(action: "CLOSE", expectedRevision: options?.revision)) } }
                    }
                }
                if active {
                    DisclosureGroup("Add / remove players") {
                        ForEach(participants) { player in
                            VStack(alignment: .leading) {
                                Text(player.displayName)
                                HStack {
                                    Button("Join queue") { send(LadderControlRequest(action: "ADD_PLAYER", expectedRevision: options?.revision, participantId: player.id)) }.disabled(options?.closing == true)
                                    Button("Remove") { send(LadderControlRequest(action: "REMOVE_PLAYER", expectedRevision: options?.revision, participantId: player.id)) }
                                }.buttonStyle(.bordered)
                            }
                        }
                    }
                }
                Section("Queue · priority preserved") {
                    ForEach(Array((board?.queue ?? []).enumerated()), id: \.element.id) { index, entry in
                        VStack(alignment: .leading) { Text("\(index+1). \(entry.displayName)"); Text(entry.waitingReason ?? "Waiting for opponent").font(.caption).foregroundStyle(.secondary) }
                    }
                }
                Section("Open sets") {
                    ForEach(board?.activeMatches ?? []) { match in
                        VStack(alignment: .leading, spacing: 6) {
                            Text(match.participantsLabel).font(.headline)
                            Text("\(ladderControlStatus(match.status)) · Bo\(match.bestOf) · \(match.stationLabel ?? "No assigned setup")")
                            if let message = match.details?.disputeReason ?? match.details?.suspensionReason { Text(message).font(.caption) }
                            Button("Manage set") { selected = match }
                        }
                    }
                }
                Section("Standings") {
                    Text(options?.settings.mode == "COMPETITIVE" ? "Event rating · minimum \(options?.settings.minimumSets ?? 3) sets. Provisional players appear last." : "Sorted by wins and game difference.").font(.caption)
                    ForEach(Array((board?.standings ?? []).enumerated()), id: \.element.id) { index, standing in
                        VStack(alignment: .leading) {
                            Text("\(index+1). \(standing.displayName) · \(standing.wins)–\(standing.losses) · \(standing.winRate ?? 0)%")
                            if options?.settings.mode == "COMPETITIVE" { Text("Rating \(standing.rating ?? 1000)\(standing.eligible == true ? "" : " · provisional")").font(.caption) }
                        }
                    }
                }
                DisclosureGroup("History and activity") {
                    ForEach(Array((board?.completedMatches ?? []).prefix(50))) { match in
                        VStack(alignment: .leading) { Text(match.participantsLabel); Text(ladderControlStatus(match.status)); if active && match.status == "COMPLETED" { Button("Correct") { selected = match } } }
                    }
                    ForEach(Array((board?.activity ?? []).prefix(30))) { entry in Text("\(entry.createdAt.prefix(19)) · \(entry.action) · \(entry.actor)\(entry.reason.map { " · " + $0 } ?? "")").font(.caption) }
                }
            }
            .disabled(busy)
            .navigationTitle("Ladder control")
            .toolbar { Button("Close") { dismiss() }.disabled(busy) }
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
                Picker("Standings", selection: $settings.mode) { Text("Casual").tag("CASUAL"); Text("Competitive").tag("COMPETITIVE") }
                Picker("New set format", selection: $settings.bestOf) { ForEach([1,3,5],id: \.self) { Text("Bo\($0)").tag($0) } }
                Toggle("The opponent confirms the result", isOn: $settings.requireConfirmation)
                Stepper("Confirm attendance: \(settings.readySeconds) s", value: $settings.readySeconds, in: 30...900, step: 30)
                Stepper("Wait before rematching: \(settings.rematchWaitSeconds) s", value: $settings.rematchWaitSeconds, in: 0...1800, step: 30)
                Stepper("Minimum sets: \(settings.minimumSets)", value: $settings.minimumSets, in: 1...50)
                TextField("Setups · ej. 3,4", text: $setups)
                Text("Empty: manual assignment. The main bracket takes priority.").font(.caption)
                TextField("Opening UTC · 2026-09-20T16:00:00Z", text: $opens).textInputAutocapitalization(.never)
                TextField("Closing UTC · optional", text: $closes).textInputAutocapitalization(.never)
                Text("Format settings apply to new sets.").font(.caption)
            }
            .navigationTitle("Ladder settings")
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Back") { dismiss() } }; ToolbarItem(placement: .confirmationAction) { Button("Save") { settings.setupNumbers = setupValues.compactMap { $0 }; settings.opensAt = opens.isEmpty ? nil : opens; settings.closesAt = closes.isEmpty ? nil : closes; save(settings); dismiss() }.disabled(setupValues.contains { $0 == nil || !(1...256).contains($0 ?? 0) }) } }
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
                TextField("Reason required", text: $reason)
                if match.status != "READY_CHECK" && match.participants.count == 2 {
                    Stepper("\(match.participants[0].displayName): \(first)", value: $first, in: 0...needed)
                    Stepper("\(match.participants[1].displayName): \(second)", value: $second, in: 0...needed)
                    Button("Save result") { save("RESOLVE_RESULT",reason,[LadderControlScore(participantId: match.participants[0].participantId,score:first),LadderControlScore(participantId: match.participants[1].participantId,score:second)]); dismiss() }.disabled(!valid)
                }
                if ["COMPLETED","DISPUTED","AWAITING_CONFIRMATION"].contains(match.status) { Button("Reopen for play") { save("REOPEN_MATCH",reason,nil); dismiss() }.disabled(reason.isEmpty) }
                if match.status != "COMPLETED" { Button("Cancel and return to queue") { save("CANCEL_MATCH",reason,nil); dismiss() }.disabled(reason.isEmpty) }
            }.navigationTitle("Manage set · Bo\(match.bestOf)")
            .toolbar { Button("Back") { dismiss() } }
            .onAppear { first = match.participants.first?.score ?? 0; second = match.participants.last?.score ?? 0 }
        }
    }
}
