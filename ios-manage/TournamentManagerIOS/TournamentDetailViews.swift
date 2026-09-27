import SwiftUI
import UIKit
import Combine
import WebKit

private func isValidParticipantSeed(_ text: String) -> Bool {
    let value = text.trimmingCharacters(in: .whitespacesAndNewlines)
    return value.isEmpty || Int(value).map { (1...2048).contains($0) } == true
}

private func canChangeLocalEntrants(_ detail: TournamentDetailResponse) -> Bool {
    !detail.tournament.isStartggMirrored
        && ["DRAFT", "PUBLISHED", "CHECK_IN", "READY"].contains(detail.tournament.status)
        && !(detail.tournament.settings.bracketMode == "FORTNITE" && detail.tournament.status == "READY")
}

private struct TeamRosterPanel: View {
    let tournamentId: String
    @EnvironmentObject private var viewModel: TournamentManagerViewModel
    @State private var roster: TeamRoster?
    @State private var generation = 0
    @State private var busy = false
    @State private var error: String?
    @State private var selected: Set<String> = []
    @State private var name = ""
    @State private var nickname = ""
    @State private var addTeam = ""
    @State private var addRole = "PLAYER"
    @State private var moving: TeamMember?
    @State private var removing: TeamMember?
    @State private var target = ""
    @State private var role = "PLAYER"

    @MainActor private func refresh() async {
        let currentGeneration = generation
        do {
            let refreshed = try await TournamentManagementRepository().teamRoster(tournamentId)
            if currentGeneration == generation { roster = refreshed }
        }
        catch is CancellationError { }
        catch { self.error = error.localizedDescription }
    }
    private func submit(_ action: TeamRosterAction) {
        guard !busy else { return }
        generation += 1; busy = true; error = nil
        Task { @MainActor in
            defer { busy = false }
            do {
                roster = try await TournamentManagementRepository().teamAction(tournamentId, action)
                selected.removeAll()
                if action.action == "CREATE_TEAM" { name = "" }
                if action.action == "ADD_MEMBER" { nickname = "" }
                try await viewModel.refreshTournament(tournamentId)
            } catch { self.error = error.localizedDescription; await refresh() }
        }
    }
    private func beginMove(_ member: TeamMember) {
        target = member.teamId ?? ""; role = member.role; moving = member
    }
    private func destination(_ selection: Binding<String>) -> some View {
        Picker("Destination", selection: selection) {
            Text("No team").tag("")
            ForEach(roster?.teams ?? []) { Text($0.name).tag($0.id) }
        }
    }
    private func place(_ selection: Binding<String>) -> some View {
        Picker("Place", selection: selection) {
            Text("Starter").tag("PLAYER")
            if (roster?.reserveCount ?? 0) > 0 { Text("Reserve").tag("RESERVE") }
        }.pickerStyle(.segmented)
    }
    private func memberRow(_ member: TeamMember, editable: Bool) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(member.nickname + (member.teamId == nil ? "" : (member.role == "RESERVE" ? " · Reserve" : " · Starter")))
            Text([member.meta?.captain == true ? "Captain" : nil, member.meta?.gameId, member.meta?.preferredRole].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · ")).font(.caption).foregroundStyle(.secondary)
            if editable {
                HStack {
                    Button(member.teamId == nil ? "Assign" : "Move / change role") { beginMove(member) }
                    Button("Remove", role: .destructive) { removing = member }
                }.buttonStyle(.bordered).disabled(busy)
            }
        }
    }
    var body: some View {
        SectionCard(title: "Teams and rosters") {
            VStack(alignment: .leading, spacing: 12) {
                if let error { Text(error).foregroundStyle(ManagementPalette.danger) }
                if busy { ProgressView() }
                if let roster {
                    Text("\(roster.teamSize) starters · up to \(roster.reserveCount) reserves per team")
                    if !roster.canEdit { Text("New entries are closed. Use Registration, waitlist and substitutions to swap starters with reserves.").font(.footnote) }
                    Button(roster.allowSoloRegistration ? "Disable solo registration" : "Enable solo registration") {
                        submit(TeamRosterAction(action: "SOLO_OPTION", enabled: !roster.allowSoloRegistration))
                    }.disabled(busy || !roster.canEdit).buttonStyle(.bordered)
                    ForEach(roster.teams) { team in
                        DisclosureGroup {
                            VStack(alignment: .leading, spacing: 10) {
                                Text((team.complete == true ? "Complete team" : "Incomplete team") + " · " + (team.checkedIn == true ? "Attendance confirmed" : "Not checked in")).font(.caption)
                                Text("Code: \(team.code)").font(.caption).textSelection(.enabled)
                                Button("Copy team code") { UIPasteboard.general.string = team.code }.buttonStyle(.bordered)
                                ForEach(team.members) { memberRow($0, editable: roster.canEdit) }
                            }.padding(.vertical, 8)
                        } label: {
                            VStack(alignment: .leading) {
                                Text(team.name).font(.headline)
                                Text("\(team.members.filter { $0.role == "PLAYER" }.count)/\(roster.teamSize) starters · \(team.members.filter { $0.role == "RESERVE" }.count)/\(roster.reserveCount) reserves").font(.caption)
                            }
                        }
                    }
                    Divider()
                    Text("No team (\(roster.unassigned.count))").font(.headline)
                    Text("This list does not take up bracket places. Select players to form a team or assign them to an existing one.").font(.footnote)
                    ForEach(roster.unassigned) { member in
                        VStack(alignment: .leading) {
                            if roster.canEdit {
                                Toggle("Select \(member.nickname)", isOn: Binding(get: { selected.contains(member.id) }, set: { value in
                                    if value { selected.insert(member.id) } else { selected.remove(member.id) }
                                })).disabled(busy)
                            }
                            memberRow(member, editable: roster.canEdit)
                        }
                    }
                    if roster.canEdit {
                        TextField("New team name", text: $name).textFieldStyle(.roundedBorder)
                        Button("Create team · \(selected.count) starters selected") {
                            submit(TeamRosterAction(action: "CREATE_TEAM", name: name, members: selected.map { ["id": $0, "role": "PLAYER"] }))
                        }.managementPrimaryButton().disabled(busy || name.trimmingCharacters(in: .whitespacesAndNewlines).count < 2 || selected.count > roster.teamSize)
                        Text("You can create an empty team and complete its roster. Assign reserves later.").font(.footnote)
                        TextField("Add player manually: nickname", text: $nickname).textFieldStyle(.roundedBorder)
                        destination($addTeam)
                        if !addTeam.isEmpty { place($addRole) }
                        Button("Add player to roster / list") {
                            submit(TeamRosterAction(action: "ADD_MEMBER", nickname: nickname, teamId: addTeam.isEmpty ? nil : addTeam, role: addRole))
                        }.buttonStyle(.bordered).disabled(busy || nickname.trimmingCharacters(in: .whitespacesAndNewlines).count < 2)
                    }
                } else { Button("Load templates") { Task { await refresh() } } }
            }
        }
        .task(id: tournamentId) {
            while !Task.isCancelled {
                if !busy { await refresh() }
                do { try await Task.sleep(nanoseconds: 15_000_000_000) } catch { break }
            }
        }
        .sheet(item: $moving) { member in
            NavigationStack {
                Form {
                    destination($target)
                    if !target.isEmpty { place($role) }
                    Button("Save assignment") {
                        submit(TeamRosterAction(action: "MOVE_MEMBER", id: member.id, revision: member.revision, teamId: target.isEmpty ? nil : target, role: role))
                        moving = nil
                    }.disabled(busy || !(roster?.canEdit ?? false))
                }.navigationTitle(member.nickname)
                    .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { moving = nil } } }
            }
        }
        .alert("Remove player", isPresented: Binding(get: { removing != nil }, set: { if !$0 { removing = nil } })) {
            Button("Cancel", role: .cancel) { removing = nil }
            Button("Remove", role: .destructive) {
                if let member = removing { submit(TeamRosterAction(action: "REMOVE_MEMBER", id: member.id, revision: member.revision)) }
                removing = nil
            }
        } message: { Text("Registration will be removed for \(removing?.nickname ?? "este jugador").") }
    }
}

private struct TournamentActivityButton: View {
    let tournamentId: String
    @State private var open = false
    var body: some View {
        Button("History and diagnostics") { open = true }.buttonStyle(.bordered)
            .sheet(isPresented: $open) { TournamentActivitySheet(tournamentId: tournamentId) }
    }
}

private struct TournamentActivitySheet: View {
    let tournamentId: String
    @Environment(\.dismiss) private var dismiss
    @State private var activity: TournamentActivity?
    @State private var error: String?
    @State private var loading = false
    @State private var refresh = 0
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    if loading { ProgressView() }
                    if let error { Text(error).foregroundStyle(ManagementPalette.danger) }
                    ShareLink(item: (activity?.diagnosticText ?? "Tournament diagnostics\nTournament: \(tournamentId)\nServer unavailable") + "\n" + ManagementOperationNetwork.shared.diagnostics()) {
                            Label("Share diagnostics", systemImage: "square.and.arrow.up")
                        }
                    if let activity {
                        if activity.entries.isEmpty { Text("No operations recorded yet.") }
                        ForEach(activity.entries) { entry in
                            Text(entry.summary).font(.headline)
                            Text(entry.createdAt + (entry.matchLabel.map { " · " + $0 } ?? "")).font(.caption)
                            Text(entry.detail).font(.caption).textSelection(.enabled)
                            Divider()
                        }
                    }
                }.padding()
            }
            .navigationTitle("History and diagnostics")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Close") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) { Button("Refresh") { refresh += 1 }.disabled(loading) }
            }
            .task(id: refresh) {
                loading = true
                error = nil
                do { activity = try await TournamentManagementRepository().getActivity(tournamentId) }
                catch { self.error = error.localizedDescription }
                loading = false
            }
        }
    }
}

private struct PublicTournamentOptionsCard: View {
    @EnvironmentObject private var viewModel: TournamentManagerViewModel
    let detail: TournamentDetailResponse
    private var canOpen: Bool {
        detail.matches.isEmpty && ["DRAFT", "PUBLISHED", "CHECK_IN"].contains(detail.tournament.status)
    }
    var body: some View {
        let settings = detail.tournament.settings
        let visible = settings.displayEnabled ?? true
        let registration = settings.registrationEnabled ?? false
        SectionCard(title: detail.tournament.isStartggMirrored ? "Display web" : "Display and online registration") {
            VStack(alignment: .leading, spacing: 12) {
                Toggle(isOn: Binding(get: { visible }, set: { value in Task { await viewModel.updatePublicOptions(["displayEnabled": value]) } })) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Show on display").font(.headline)
                        Text(visible ? "Visible on tournament displays" : "Hidden from tournament displays").font(.footnote).foregroundStyle(ManagementPalette.secondaryText)
                    }
                }.disabled(viewModel.isMutating || viewModel.adminDeleteKey.isEmpty)
                if !detail.tournament.isStartggMirrored {
                Divider()
                MainStatusBadge(label: registration && canOpen ? "Registration open" : "Registration closed", state: registration && canOpen ? "OPEN" : "CLOSED")
                if !canOpen { Text("Registration remains closed once the bracket is generated.").font(.footnote).foregroundStyle(ManagementPalette.secondaryText) }
                Button(registration ? "Close registration" : "Open online registration") {
                    Task { await viewModel.updatePublicOptions(["registrationEnabled": !registration]) }
                }.managementPrimaryButton()
                    .disabled(viewModel.isMutating || viewModel.adminDeleteKey.isEmpty || (!registration && !canOpen))
                RegistrationAdminButton(tournamentId: detail.tournament.id, adminKey: viewModel.adminDeleteKey)
                Text("Players enter their nickname and email and are added after verification. Registration closes when the bracket is generated.")
                    .font(.footnote).foregroundStyle(.secondary)
                if viewModel.adminDeleteKey.isEmpty {
                    Text("Sign in with your management account to change these settings.").font(.footnote)
                }
                if let link = settings.registrationUrl, let url = URL(string: link) {
                    Text(link).font(.footnote).textSelection(.enabled)
                    FlowActions {
                        Button("Copy link") { UIPasteboard.general.string = link }.buttonStyle(.bordered)
                        Link("Open", destination: url).buttonStyle(.bordered)
                        ShareLink(item: url).buttonStyle(.bordered)
                    }
                }
                }
            }
        }
    }
}

private struct Top8EditorButton: View {
    let tournamentId: String
    @Environment(\.openURL) private var openURL
    @State private var busy = false
    @State private var error: String?
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            MainStatusBadge(label: "Tournament finished", state: "COMPLETED")
            Text("Share results").font(.title2.bold())
            Button(busy ? "Preparing image…" : "Top 8 image · create / edit") {
                busy = true
                error = nil
                Task {
                    defer { busy = false }
                    do { openURL(try await TournamentManagementRepository().createTop8Session(tournamentId: tournamentId)) }
                    catch { self.error = error.localizedDescription }
                }
            }.managementPrimaryButton().disabled(busy)
            Text("Results prefilled. Edit players, characters and design, save the project and download a 4K or 8K PNG.").font(.footnote).foregroundStyle(.secondary)
            if let error { Text(error).foregroundStyle(ManagementPalette.danger) }
        }.frame(maxWidth: .infinity, alignment: .leading).padding(20)
            .background(ManagementPalette.heroFill, in: RoundedRectangle(cornerRadius: 20))
    }
}

private struct FortnitePanelButton: View {
    let tournamentId: String
    @Environment(\.openURL) private var openURL
    @State private var busy = false
    @State private var error: String?
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Button(busy ? "Opening Fortnite…" : "Manage Fortnite: groups and scores") {
                busy = true
                error = nil
                Task {
                    defer { busy = false }
                    do { openURL(try await TournamentManagementRepository().createFortniteSession(tournamentId: tournamentId)) }
                    catch { self.error = error.localizedDescription }
                }
            }.managementPrimaryButton().disabled(busy)
            Text("Open groups, seats, score sheets and standings. Works on mobile and desktop.").font(.footnote).foregroundStyle(.secondary)
            if let error { Text(error).foregroundStyle(ManagementPalette.danger) }
        }
    }
}
private struct RegistrationAdminButton: View {
    let tournamentId: String
    let adminKey: String
    @Environment(\.openURL) private var openURL
    @State private var busy = false
    @State private var error: String?
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Button(busy ? "Opening panel…" : "Registration, waitlist and substitutions") {
                busy = true
                error = nil
                Task {
                    defer { busy = false }
                    do { openURL(try await TournamentManagementRepository().createRegistrationAdminSession(tournamentId: tournamentId, adminKey: adminKey)) }
                    catch { self.error = error.localizedDescription }
                }
            }.managementPrimaryButton().disabled(busy || adminKey.isEmpty)
            Text("Automatic closing, captains and reserve substitutions.").font(.footnote).foregroundStyle(.secondary)
            if let error { Text(error).foregroundStyle(ManagementPalette.danger) }
        }
    }
}

private struct TournamentReviewButton: View {
    let tournamentId: String
    let onNavigate: (String) -> Void
    @State private var open = false
    @State private var review: TournamentReviewData?
    @State private var error: String?
    @State private var loading = false
    @State private var refresh = 0
    @State private var showAttendance = false
    private func levelLabel(_ level: String) -> String {
        switch level { case "OK": "✓ Ready"; case "BLOCKED": "! Pending"; case "WARNING": "△ Review"; default: "ⓘ Information" }
    }
    private func reviewRow(_ item: TournamentReviewItem) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(levelLabel(item.level) + " · " + item.title).font(.headline)
                .foregroundStyle(item.level == "BLOCKED" ? ManagementPalette.danger : Color.primary)
            Text(item.detail)
            if item.id == "attendance", showAttendance, let review {
                Text("Changing mandatory attendance may invalidate a prepared draw. You will then need to generate it again.").font(.footnote)
                ForEach(review.participants) { participant in
                    Text(participant.name + (participant.checkedIn ? " · ✓ Attendance confirmed" : " · Unconfirmed"))
                    Button(participant.checkedIn ? "Clear attendance" : "Confirm attendance") {
                        loading = true
                        Task { @MainActor in
                            defer { loading = false }
                            do {
                                try await TournamentManagementRepository().updateAttendance(tournamentId, participant: participant, checkedIn: !participant.checkedIn)
                                self.review = try await TournamentManagementRepository().getReview(tournamentId)
                            } catch { self.error = "Could not check attendance. Refresh before trying again." }
                        }
                    }.buttonStyle(.bordered).disabled(!review.editable || participant.status != "ACTIVE" || loading || error != nil)
                }
            }
            if !item.target.isEmpty {
                Button(item.actionLabel) {
                    if item.id == "attendance" { showAttendance.toggle() }
                    else { open = false; onNavigate(item.target) }
                }
                    .buttonStyle(.bordered).frame(minHeight: 44)
                    .disabled(loading || error != nil || (item.target == "ARCHIVE" && item.level == "BLOCKED"))
            }
            Divider()
        }
    }
    var body: some View {
        Button("Review preparation and completion") { open = true }.buttonStyle(.bordered).frame(minHeight: 44)
            .sheet(isPresented: $open) {
                NavigationStack {
                    ScrollView {
                        VStack(alignment: .leading, spacing: 16) {
                            if loading { ProgressView() }
                            if let error { Text(error).foregroundStyle(ManagementPalette.danger) }
                            if let review {
                                Text("Advisory review. Actions validate the data again when saving.").font(.footnote)
                                ForEach(review.items) { reviewRow($0) }
                                if !review.standings.isEmpty {
                                    Text("Standings · Top 8").font(.headline)
                                    ForEach(Array(review.standings.enumerated()), id: \.offset) { _, row in
                                        Text((row.placement.map(String.init) ?? "Needs review") + " · " + row.name)
                                    }
                                }
                                if !review.standingsNote.isEmpty { Text(review.standingsNote).font(.footnote) }
                                Text("Checked: " + review.checkedAt).font(.caption)
                            }
                        }.padding(20).frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .navigationTitle(review?.title ?? "Tournament review")
                    .toolbar {
                        ToolbarItem(placement: .cancellationAction) { Button("Close") { open = false } }
                        ToolbarItem(placement: .confirmationAction) { Button("Refresh") { refresh += 1 }.disabled(loading) }
                    }
                    .task(id: refresh) {
                        loading = true; error = nil
                        defer { loading = false }
                        do { review = try await TournamentManagementRepository().getReview(tournamentId) }
                        catch is CancellationError { }
                        catch { self.error = "Could not check the tournament. Refresh to retry; no data has changed." }
                    }
                }
            }
    }
}

struct TournamentDetailView: View {
    @State private var reviewOperations = false
    @State private var reviewManagement = false
    @EnvironmentObject private var viewModel: TournamentManagerViewModel
    let focusOperations: Bool

    init(focusOperations: Bool = false) {
        self.focusOperations = focusOperations
    }

    @State private var showParticipants = false
    @State private var showSettings = false
    @State private var showBracket = false
    @State private var showSetups = false
    @State private var showLadder = false
    @State private var showRegenerateConfirmation = false
    @State private var showCompletedMatches = false
    @State private var participantDraft = ""
    @State private var participantSeed = ""
    @State private var operationsSearchQuery = ""
    @State private var detailBracketRenderMode: ManagementBracketRenderMode = .classic
    @State private var operationsRenderMode: ManagementBracketRenderMode = .classic
    @State private var selectedModernOperationMatchId: String?

    var body: some View {
        Group {
            if let detail = viewModel.selectedTournamentDetail {
                let visibleMatches = detail.matches.filter { !isDormantGrandFinalReset(allMatches: detail.matches, match: $0) }
                let sortedMatches = visibleMatches.sorted(by: matchDisplayOrder)
                let manageableMatches = sortedMatches.filter { hasResolvedContenders($0) }

                if detail.tournament.status == "ARCHIVED" {
                    ScrollView {
                        VStack(alignment: .leading, spacing: 16) {
                            Text(detail.tournament.title).font(.title)
                            Text("Archived · read-only. Hidden from the display. Unarchive to make changes.")
                            TournamentArchiveAction(archived: true)
                            TournamentActivityButton(tournamentId: detail.tournament.id)
                            Color.clear.frame(height: 1).id("FORTNITE")
                        if detail.tournament.settings.bracketMode == "FORTNITE" { FortnitePanelButton(tournamentId: detail.tournament.id) }
                            else { TournamentBracketPanel(detail: detail, matches: sortedMatches, renderMode: .modern) }
                            if (detail.tournament.settings.teamSize ?? 1) > 1 && !detail.tournament.isStartggMirrored { TeamRosterPanel(tournamentId: detail.tournament.id) }
                            Text("Participants").font(.headline)
                            ForEach(detail.participants) { Text($0.displayName) }
                        }.padding(20)
                    }.navigationTitle("Archived")
                } else {
                ScrollViewReader { reviewProxy in
                ScrollView {
                    VStack(alignment: .leading, spacing: 16) {
                        TournamentReviewButton(tournamentId: detail.tournament.id) { target in
                            if target == "SYNC" { reviewOperations = true; reviewManagement = false }
                            else {
                                reviewOperations = false; reviewManagement = true
                                switch target {
                                case "PARTICIPANTS": showParticipants = true
                                case "BRACKET": showBracket = true
                                case "SETTINGS": showSettings = true
                                case "LADDER": showLadder = true
                                default: break
                                }
                                Task { @MainActor in
                                    try? await Task.sleep(for: .milliseconds(200))
                                    withAnimation { reviewProxy.scrollTo(target, anchor: .top) }
                                }
                            }
                        }
                        if reviewOperations || reviewManagement { Button("Return to previous view") { reviewOperations = false; reviewManagement = false } }
                        TournamentOverviewCard(detail: detail)
                        TournamentActivityButton(tournamentId: detail.tournament.id)
                        Color.clear.frame(height: 1).id("FORTNITE")
                        if detail.tournament.settings.bracketMode == "FORTNITE" { FortnitePanelButton(tournamentId: detail.tournament.id) }
                        if detail.tournament.status == "COMPLETED" {
                        Color.clear.frame(height: 1).id("ARCHIVE")
                            TournamentArchiveAction(archived: false)
                        Color.clear.frame(height: 1).id("TOP8")
                            Top8EditorButton(tournamentId: detail.tournament.id)
                        }
                        if let job = detail.tournament.settings.importJob, job.state != "COMPLETED" {
                            if let progress = job.progress { Text(progress.label).foregroundStyle(.secondary) }
                            Text(job.state == "RUNNING" ? "Importing on the server. You can lock your phone." : (job.error ?? "Could not import. Select Reimport bracket to retry."))
                                .foregroundStyle(job.state == "FAILED" ? ManagementPalette.danger : Color.secondary)
                        }

                        if (focusOperations && !reviewManagement) || reviewOperations {
                            TournamentOperationsPanel(
                                detail: detail,
                                allMatches: sortedMatches,
                                operationalMatches: manageableMatches,
                                operationsSearchQuery: $operationsSearchQuery,
                                showCompletedMatches: $showCompletedMatches,
                                renderMode: $operationsRenderMode,
                                selectedModernMatchId: $selectedModernOperationMatchId
                            )
                        } else {
                        Color.clear.frame(height: 1).id("REGISTRATION")
                            PublicTournamentOptionsCard(detail: detail)
                            if !detail.tournament.isStartggMirrored {
                                if (detail.tournament.settings.teamSize ?? 1) > 1 {
                        Color.clear.frame(height: 1).id("TEAMS")
                                    TeamRosterPanel(tournamentId: detail.tournament.id).id(detail.tournament.id)
                                }
                            }
                        Color.clear.frame(height: 1).id("COMPETITION")
                            SectionCard(title: "Competition") {
                                FlowActions {
                                    if !detail.tournament.isStartggMirrored {
                                        Button(detail.matches.isEmpty ? "Generate bracket" : "Regenerate bracket") {
                                            if detail.matches.isEmpty { Task { await viewModel.generateBracket() } }
                                            else { showRegenerateConfirmation = true }
                                        }
                                            .buttonStyle(.bordered).disabled(detail.tournament.settings.bracketMode == "FORTNITE")
                                    } else {
                                        Button("Reimport bracket") { Task { await viewModel.reimportStartggBracket() } }
                                            .buttonStyle(.bordered)
                                    }
                                    if !detail.tournament.isStartggMirrored && detail.tournament.status == "READY" {
                                        Button("Start tournament") { Task { await viewModel.startTournament() } }.managementPrimaryButton()
                                    }
                                }
                                .disabled(viewModel.isMutating || detail.tournament.settings.importJob?.state == "RUNNING")
                                if !detail.tournament.isStartggMirrored {
                                    DisclosureGroup("Other actions") {
                                        VStack(alignment: .leading, spacing: 10) {
                                            Text("Resetting deletes the bracket and results. Registered participants are kept.").font(.footnote)
                                            Button("Reset tournament", role: .destructive) {
                                                if detail.tournament.settings.bracketMode == "FORTNITE" { showRegenerateConfirmation = true }
                                                else { Task { await viewModel.resetTournament() } }
                                            }.buttonStyle(.bordered).disabled(viewModel.isMutating)
                                        }.padding(.top, 8)
                                    }
                                }
                            }

                        Color.clear.frame(height: 1).id("SETTINGS")
                            AccordionCard(title: "Tournament settings", isExpanded: $showSettings) {
                                TournamentSettingsEditor(detail: detail)
                            }

                            if !detail.tournament.isStartggMirrored {
                        Color.clear.frame(height: 1).id("PARTICIPANTS")
                                AccordionCard(title: (detail.tournament.settings.teamSize ?? 1) > 1 ? "Teams and seeds" : "Participants", isExpanded: $showParticipants) {
                                    VStack(alignment: .leading, spacing: 12) {
                                        HStack(alignment: .top, spacing: 10) {
                                            EditOutlinedField(title: (detail.tournament.settings.teamSize ?? 1) > 1 ? "Team name" : "Name") {
                                                TextField("", text: $participantDraft)
                                            }

                                            EditOutlinedField(title: "Seed") {
                                                TextField("", text: $participantSeed)
                                                    .keyboardType(.numberPad)
                                            }
                                            .frame(width: 110)

                                            Button("Add") {
                                                Task {
                                                    await viewModel.addParticipant(
                                                        displayName: participantDraft.trimmingCharacters(in: .whitespacesAndNewlines),
                                                        seed: Int(participantSeed.trimmingCharacters(in: .whitespacesAndNewlines))
                                                    )
                                                    participantDraft = ""
                                                    participantSeed = ""
                                                }
                                            }
                                            .buttonStyle(.plain)
                                            .font(.headline.weight(.semibold))
                                            .foregroundStyle(.white)
                                            .padding(.horizontal, 20)
                                            .padding(.vertical, 14)
                                            .background(Capsule().fill(ManagementPalette.primaryAction))
                                            .disabled(!isValidParticipantSeed(participantSeed) || viewModel.isMutating || !canChangeLocalEntrants(detail) || participantDraft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || ((detail.tournament.settings.teamSize ?? 1) > 1 && !detail.matches.isEmpty))
                                        }

                                        Text(canChangeLocalEntrants(detail) ? "Changing entrants or seeds requires regenerating the prepared bracket." : "Entrants and seeds are locked. Reset the tournament to change them.")
                                            .font(.footnote).foregroundStyle(.secondary)
                                        ForEach(detail.participants) { participant in
                                            ParticipantRow(participant: participant)
                                                .disabled(viewModel.isMutating || (detail.tournament.settings.bracketMode == "FORTNITE" && !canChangeLocalEntrants(detail)))
                                        }
                                    }
                                }
                            }

                        Color.clear.frame(height: 1).id("BRACKET")
                            AccordionCard(title: detail.tournament.settings.bracketMode == "FORTNITE" ? "Fortnite: groups in its management panel" : "Tournament bracket", isExpanded: $showBracket) {
                                BracketRenderModeSelector(mode: $detailBracketRenderMode)
                                TournamentBracketPanel(
                                    detail: detail,
                                    matches: sortedMatches,
                                    renderMode: detailBracketRenderMode
                                )
                            }

                            AccordionCard(title: "Tournament setups", isExpanded: $showSetups) {
                                let setups = buildTournamentSetups(detail: detail)
                                let occupied = setups.filter { $0.occupyingMatchLabel != nil }
                                let free = setups.filter { $0.occupyingMatchLabel == nil }

                                VStack(alignment: .leading, spacing: 12) {
                                    Text("Occupied setups")
                                        .font(.headline)
                                    if occupied.isEmpty {
                                        Text("No setups are currently occupied.")
                                            .foregroundStyle(.secondary)
                                    } else {
                                        ForEach(occupied) { setup in
                                            VStack(alignment: .leading, spacing: 4) {
                                                Text(setup.label).font(.subheadline.bold())
                                                Text(setup.occupyingMatchLabel ?? "").foregroundStyle(.secondary)
                                                Text(setup.occupyingParticipants ?? "").font(.footnote).foregroundStyle(.secondary)
                                            }
                                            .frame(maxWidth: .infinity, alignment: .leading)
                                            .padding(12)
                                            .background(RoundedRectangle(cornerRadius: 14).fill(ManagementPalette.warning.opacity(0.12)))
                                        }
                                    }

                                    Text("Available setups")
                                        .font(.headline)
                                        .padding(.top, 4)
                                    if free.isEmpty {
                                        Text("All setups are occupied.")
                                            .foregroundStyle(.secondary)
                                    } else {
                                        ForEach(free) { setup in
                                            Text(setup.label)
                                                .frame(maxWidth: .infinity, alignment: .leading)
                                                .padding(12)
                                                .background(RoundedRectangle(cornerRadius: 14).fill(ManagementPalette.success.opacity(0.12)))
                                        }
                                    }
                                }
                            }

                            if BackendConfig.supportsLadder {
                        Color.clear.frame(height: 1).id("LADDER")
                                AccordionCard(title: "Internal ladder", isExpanded: $showLadder) {
                                    LadderSection(detail: detail)
                                }
                            }

                            Button(role: .destructive) {
                                Task { await viewModel.deleteSelectedTournament() }
                            } label: {
                                Text("Delete tournament")
                                    .frame(maxWidth: .infinity)
                            }
                            .buttonStyle(.bordered)
                        }
                    }
                    .padding(20)
                }
                } // ScrollViewReader
                .background(ManagementPalette.screenBackground.ignoresSafeArea())
                .navigationTitle(focusOperations ? "Match operations" : detail.tournament.title)
                .alert(detail.tournament.settings.bracketMode == "FORTNITE" ? "Reset Fortnite" : "Regenerate bracket", isPresented: $showRegenerateConfirmation) {
                    Button("Cancel", role: .cancel) {}
                    Button("Confirm", role: .destructive) { Task {
                        if detail.tournament.settings.bracketMode == "FORTNITE" { await viewModel.resetTournament() }
                        else { await viewModel.resetAndGenerateBracket() }
                    } }
                } message: {
                    Text(detail.tournament.settings.bracketMode == "FORTNITE" ? "Groups, score sheets and points will be deleted. Entrants are kept for a new group draw." : "The tournament will reset and the bracket will be regenerated. This deletes current progress.")
                }
                }
            } else {
                ContentUnavailableView("No tournament", systemImage: "square.stack.3d.up.slash")
            }
        }
    }
}

private struct TournamentArchiveAction: View {
    let archived: Bool
    @EnvironmentObject private var viewModel: TournamentManagerViewModel
    @State private var confirming = false
    var body: some View {
        Button(archived ? "Unarchive tournament" : "Archive tournament") { confirming = true }
            .buttonStyle(.bordered).disabled(viewModel.isMutating)
            .alert(archived ? "Unarchive tournament" : "Archive tournament", isPresented: $confirming) {
                Button("Cancel", role: .cancel) {}
                Button(archived ? "Unarchive" : "Archive") { Task { await viewModel.setArchived(!archived) } }
            } message: {
                Text(archived ? "It will return to Completed and become editable. The display remains disabled until you enable it." : "It will move to Archived, disappear from the display and become read-only. You can unarchive it later.")
            }
    }
}

private struct TournamentOverviewCard: View {
    let detail: TournamentDetailResponse

    var body: some View {
        SectionCard(title: detail.tournament.title) {
            VStack(alignment: .leading, spacing: 8) {
                Text(detail.tournament.gameTitle)
                    .font(.headline)
                Text(detail.tournament.settings.bracketMode == "FORTNITE" ? "Fortnite · \(detail.tournament.settings.fortniteLobbySize ?? 20) seats · \(detail.tournament.settings.fortniteGamesPerRound ?? 3) games per round" : "\(detail.tournament.settings.format.replacingOccurrences(of: "_", with: " ").capitalized) - Bo\(detail.tournament.settings.winnersBestOf ?? detail.tournament.settings.bestOf)")
                    .foregroundStyle(.secondary)
                Text(detail.tournament.platform)
                    .foregroundStyle(.secondary)
                MainStatusBadge(label: detail.tournament.statusLabel, state: detail.tournament.status)
                if let hint = detail.tournament.nextStepHint { Divider(); Text(hint).font(.callout) }
                Text("\((detail.tournament.settings.teamSize ?? 1) > 1 ? "Registered teams" : "Registered players"): \(detail.participants.count)")
                    .foregroundStyle(.secondary)
                Text("Aforo: \(detail.tournament.maxParticipants)")
                    .foregroundStyle(.secondary)
            }
        }
    }
}


private struct TournamentOperationsPanel: View {
    @AppStorage("management_adaptive_layout") private var adaptiveLayout = true
    let detail: TournamentDetailResponse
    let allMatches: [Match]
    let operationalMatches: [Match]
    @Binding var operationsSearchQuery: String
    @Binding var showCompletedMatches: Bool
    @Binding var renderMode: ManagementBracketRenderMode
    @Binding var selectedModernMatchId: String?
    @State private var expandedPools: Set<String> = []
    @State private var expandedCompletedPools: Set<String> = []
    @State private var completedSearchQuery = ""

    private var filteredOperationalMatches: [Match] {
        let trimmedSearch = operationsSearchQuery.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedSearch.isEmpty else { return operationalMatches }
        return operationalMatches.filter { match in
            match.poolAwareLabel.localizedCaseInsensitiveContains(trimmedSearch)
                || match.participants.contains { $0.displayName.localizedCaseInsensitiveContains(trimmedSearch) }
        }
    }

    private var filteredActiveMatches: [Match] {
        filteredOperationalMatches.filter { !$0.isCompletedLike }
    }

    private var completedMatches: [Match] {
        operationalMatches.filter(\.isCompletedLike)
    }

    private var selectableMatchIds: Set<String> {
        Set(
            filteredOperationalMatches
                .filter { operationsModernCanInteractWithMatch($0, isStartggMirrored: detail.tournament.isStartggMirrored) }
                .map(\.id)
        )
    }

    private var selectedModernMatch: Match? {
        guard let selectedModernMatchId else { return nil }
        return allMatches.first(where: { $0.id == selectedModernMatchId })
    }

    var body: some View {
        if adaptiveLayout && !ManagementPresentation.forceClassic {
            AdaptiveTournamentOperationsPanel(detail: detail, allMatches: allMatches, operationalMatches: operationalMatches,
                query: $operationsSearchQuery, completed: $showCompletedMatches, renderMode: $renderMode, selectedId: $selectedModernMatchId)
        } else { legacyBody }
    }

    private var legacyBody: some View {
        let sortedActiveMatches = filteredActiveMatches.sorted(by: activeMatchDisplayOrder)
        let activeMatchesByPool = Dictionary(grouping: sortedActiveMatches) { $0.poolLabel ?? "General" }
        let sortedPoolLabels = activeMatchesByPool.keys.sorted(by: naturalLabelLessThan)
        let hasConcurrentPools = sortedPoolLabels.count > 1

        let completedSearch = completedSearchQuery.trimmingCharacters(in: .whitespacesAndNewlines)
        let filteredCompletedMatches = completedSearch.isEmpty
            ? completedMatches
            : completedMatches.filter { match in
                match.poolAwareLabel.localizedCaseInsensitiveContains(completedSearch)
                    || match.participants.contains { $0.displayName.localizedCaseInsensitiveContains(completedSearch) }
            }
        let completedMatchesByPool = Dictionary(grouping: filteredCompletedMatches) { $0.poolLabel ?? "General" }
        let sortedCompletedPoolLabels = completedMatchesByPool.keys.sorted(by: naturalLabelLessThan)
        let hasCompletedPools = sortedCompletedPoolLabels.count > 1

        return VStack(alignment: .leading, spacing: 16) {
            SectionCard(title: "Tournament status") {
                VStack(alignment: .leading, spacing: 8) {
                    Text(detail.tournament.statusLabel)
                    Text(detail.tournament.settings.format)
                    Text("\(filteredActiveMatches.count) active · \(completedMatches.count) completed")
                        .foregroundStyle(.secondary)
                }
            }

            if detail.matches.isEmpty {
                SectionCard(title: "No matches") {
                    Text("Generate the bracket from the Tournaments tab first.")
                        .foregroundStyle(.secondary)
                }
            } else {
                SectionCard(title: "Find player in match operations") {
                    TextField("Find player", text: $operationsSearchQuery)
                        .textFieldStyle(.roundedBorder)
                }

                BracketRenderModeSelector(mode: $renderMode)

                if renderMode == .modern {
                    SectionCard(title: "Match operations bracket") {
                        if allMatches.isEmpty {
                            Text("No actionable matches match this search.")
                                .foregroundStyle(.secondary)
                        } else {
                            TournamentBracketPanel(
                                detail: detail,
                                matches: allMatches.sorted(by: matchDisplayOrder),
                                renderMode: .modern,
                                selectableMatchIds: selectableMatchIds
                            ) { match in
                                selectedModernMatchId = match.id
                            }
                        }
                    }
                    .sheet(item: Binding(
                        get: { selectedModernMatch },
                        set: { selectedModernMatchId = $0?.id }
                    )) { match in
                        NavigationStack {
                            ScrollView {
                                MatchOperationCard(detail: detail, match: match)
                                    .padding(20)
                            }
                            .navigationTitle(match.poolAwareLabel)
                            .navigationBarTitleDisplayMode(.inline)
                            .toolbar {
                                ToolbarItem(placement: .topBarTrailing) {
                                    Button("Close") { selectedModernMatchId = nil }
                                }
                            }
                        }
                    }
                } else {
                    if !completedMatches.isEmpty {
                        DisclosureGroup("Completed matches (\(completedMatches.count))", isExpanded: $showCompletedMatches) {
                            VStack(alignment: .leading, spacing: 12) {
                                TextField("Find completed match", text: $completedSearchQuery)
                                    .textFieldStyle(.roundedBorder)

                                if filteredCompletedMatches.isEmpty {
                                    Text("No completed matches match this search.")
                                        .foregroundStyle(.secondary)
                                } else if hasCompletedPools {
                                    ForEach(sortedCompletedPoolLabels, id: \.self) { poolLabel in
                                        let matchesForPool = completedMatchesByPool[poolLabel] ?? []
                                        DisclosureGroup(
                                            isExpanded: Binding(
                                                get: { expandedCompletedPools.contains(poolLabel) },
                                                set: { isExpanded in
                                                    if isExpanded {
                                                        expandedCompletedPools.insert(poolLabel)
                                                    } else {
                                                        expandedCompletedPools.remove(poolLabel)
                                                    }
                                                }
                                            )
                                        ) {
                                            VStack(alignment: .leading, spacing: 12) {
                                                ForEach(matchesForPool) { match in
                                                    MatchOperationCard(detail: detail, match: match)
                                                }
                                            }
                                            .padding(.top, 12)
                                        } label: {
                                            HStack {
                                                Text(poolLabel)
                                                    .font(.headline)
                                                Spacer()
                                                Text("(\(matchesForPool.count))")
                                                    .foregroundStyle(.secondary)
                                            }
                                        }
                                        .padding(18)
                                        .background(RoundedRectangle(cornerRadius: 20).fill(ManagementPalette.surfaceBackground))
                                    }
                                } else {
                                    ForEach(filteredCompletedMatches) { match in
                                        MatchOperationCard(detail: detail, match: match)
                                    }
                                }
                            }
                            .padding(.top, 12)
                        }
                        .padding(18)
                        .background(RoundedRectangle(cornerRadius: 20).fill(ManagementPalette.secondarySurfaceBackground))
                    }

                    SectionCard(title: "Active and pending matches") {
                        if filteredActiveMatches.isEmpty {
                            Text("No pending matches match this search.")
                                .foregroundStyle(.secondary)
                        } else if hasConcurrentPools {
                            VStack(alignment: .leading, spacing: 12) {
                                ForEach(sortedPoolLabels, id: \.self) { poolLabel in
                                    let matchesForPool = activeMatchesByPool[poolLabel] ?? []
                                    DisclosureGroup(
                                        isExpanded: Binding(
                                            get: { expandedPools.contains(poolLabel) },
                                            set: { isExpanded in
                                                if isExpanded {
                                                    expandedPools.insert(poolLabel)
                                                } else {
                                                    expandedPools.remove(poolLabel)
                                                }
                                            }
                                        )
                                    ) {
                                        VStack(alignment: .leading, spacing: 12) {
                                            ForEach(matchesForPool) { match in
                                                MatchOperationCard(detail: detail, match: match)
                                            }
                                        }
                                        .padding(.top, 12)
                                    } label: {
                                        HStack {
                                            Text(poolLabel)
                                                .font(.headline)
                                            Spacer()
                                            Text("(\(matchesForPool.count))")
                                                .foregroundStyle(.secondary)
                                        }
                                    }
                                    .padding(18)
                                    .background(RoundedRectangle(cornerRadius: 20).fill(ManagementPalette.secondarySurfaceBackground))
                                }
                            }
                        } else {
                            VStack(alignment: .leading, spacing: 12) {
                                ForEach(sortedActiveMatches) { match in
                                    MatchOperationCard(detail: detail, match: match)
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}


private struct AdaptiveTournamentOperationsPanel: View {
    let detail: TournamentDetailResponse
    let allMatches: [Match]
    let operationalMatches: [Match]
    @Binding var query: String
    @Binding var completed: Bool
    @Binding var renderMode: ManagementBracketRenderMode
    @Binding var selectedId: String?
    @State private var availableWidth: CGFloat = 0
    @ScaledMetric private var paneWidth = 380.0
    private var wide: Bool { availableWidth >= paneWidth + 500 }
    private var selected: Match? { allMatches.first { $0.id == selectedId } }
    private var rows: [Match] {
        operationalMatches.filter { $0.isCompletedLike == completed }
            .filter { match in
                let term = query.trimmingCharacters(in: .whitespacesAndNewlines)
                return term.isEmpty || match.poolAwareLabel.localizedStandardContains(term)
                    || match.participants.contains { $0.displayName.localizedStandardContains(term) }
            }.sorted(by: activeMatchDisplayOrder)
    }
    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            BracketRenderModeSelector(mode: $renderMode)
            HStack(alignment: .top, spacing: 16) {
                VStack(alignment: .leading, spacing: 12) {
                    if renderMode == .modern {
                        TournamentBracketPanel(detail: detail, matches: allMatches.sorted(by: matchDisplayOrder), renderMode: .modern,
                            selectableMatchIds: Set(operationalMatches.filter { operationsModernCanInteractWithMatch($0, isStartggMirrored: detail.tournament.isStartggMirrored) }.map(\.id))) {
                                selectedId = $0.id
                            }
                    } else {
                        TextField("Find player, team or match", text: $query).textFieldStyle(.roundedBorder)
                        Toggle("Show completed", isOn: $completed)
                        if rows.isEmpty { Text("No matches match this search.").foregroundStyle(.secondary) }
                        ForEach(rows) { match in
                            Button { selectedId = match.id } label: {
                                VStack(alignment: .leading, spacing: 8) {
                                    Text(match.poolAwareLabel).font(.caption.weight(.semibold))
                                    ForEach(match.participants.sorted { $0.slot < $1.slot }) { participant in
                                        HStack(alignment: .firstTextBaseline) {
                                            Text(participant.displayName).font(.headline).frame(maxWidth: .infinity, alignment: .leading)
                                            Text(String(participant.score)).font(.headline.monospacedDigit())
                                        }
                                    }
                                    MainStatusBadge(label: mainMatchStatusLabel(match.status), state: match.status)
                                    if let station = match.stationLabel { Text(station).font(.caption) }
                                    Label(selectedId == match.id ? "Open actions" : "View actions", systemImage: "chevron.right").font(.caption)
                                }.padding(14).frame(maxWidth: .infinity, alignment: .leading)
                                    .background(ManagementPalette.surfaceBackground, in: RoundedRectangle(cornerRadius: 16))
                                    .overlay(RoundedRectangle(cornerRadius: 16).stroke(selectedId == match.id ? Color.accentColor : Color.secondary.opacity(0.3), lineWidth: selectedId == match.id ? 2 : 1))
                            }.buttonStyle(.plain)
                        }
                    }
                }.frame(maxWidth: .infinity)
                if wide, let selected {
                    AdaptiveMatchActions(detail: detail, match: selected, dismiss: { selectedId = nil })
                        .id(selected.id).frame(width: paneWidth, height: 700)
                }
            }
        }
        .background(GeometryReader { proxy in Color.clear.onAppear { availableWidth = proxy.size.width }.onChange(of: proxy.size.width) { _, width in availableWidth = width } })
        .sheet(item: Binding(get: { wide ? nil : selected }, set: { selectedId = $0?.id })) { match in
            AdaptiveMatchActions(detail: detail, match: allMatches.first { $0.id == match.id } ?? match, dismiss: { selectedId = nil })
        }
    }
}

private struct AdaptiveMatchActions: View {
    @EnvironmentObject private var viewModel: TournamentManagerViewModel
    let detail: TournamentDetailResponse
    let match: Match
    let dismiss: () -> Void
    @State private var reportRequest = 0
    private var canReport: Bool {
        !viewModel.isMutating && detail.tournament.settings.importJob?.state != "RUNNING"
            && hasResolvedContenders(match) && match.status != "CANCELLED"
            && (detail.tournament.isStartggMirrored || ["IN_PROGRESS", "COMPLETED"].contains(detail.tournament.status))
    }
    var body: some View {
        VStack(spacing: 10) {
            HStack { Text(match.poolAwareLabel).font(.headline); Spacer(); Button("Close", action: dismiss).frame(minHeight: 44) }.padding(.horizontal)
            Divider()
            ScrollView { MatchOperationCard(detail: detail, match: match, reportRequest: reportRequest).padding(16) }
            if match.participants.count == 2 && match.advancersRequired <= 1 && detail.tournament.settings.bracketMode != "MKART" {
                Divider()
                Button(match.isCompletedLike ? "Correct result" : "Report result") { reportRequest += 1 }
                    .managementPrimaryButton().disabled(!canReport).padding(.horizontal).padding(.bottom, 8)
            }
        }.padding(.top, 12).background(ManagementPalette.surfaceBackground, in: RoundedRectangle(cornerRadius: 16))
    }
}

private struct TournamentBracketPanel: View {
    let detail: TournamentDetailResponse
    let matches: [Match]
    var renderMode: ManagementBracketRenderMode = .classic
    var selectableMatchIds: Set<String> = []
    var onSelect: ((Match) -> Void)? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if matches.isEmpty {
                Text(detail.tournament.isStartggMirrored ? "No bracket has been imported yet." : "Generate the bracket to view it here.")
                    .foregroundStyle(.secondary)
            } else if renderMode == .modern {
                ModernBracketPanel(
                    detail: detail,
                    matches: matches,
                    selectableMatchIds: selectableMatchIds,
                    onSelect: onSelect
                )
                .id(detail.tournament.id)
            } else {
                let visibleMatches = matches.filter { !isDormantGrandFinalReset(allMatches: matches, match: $0) }
                let groupedStages = Dictionary(grouping: visibleMatches) { $0.bracketStage }
                VStack(alignment: .leading, spacing: 18) {
                    ForEach(groupedStages.keys.sorted(by: stageLessThan), id: \.self) { stage in
                        if let stageMatches = groupedStages[stage] {
                            BracketStageSection(
                                stage: stage,
                                detail: detail,
                                matches: stageMatches.sorted {
                                    if $0.roundNumber != $1.roundNumber { return $0.roundNumber < $1.roundNumber }
                                    return $0.matchNumber < $1.matchNumber
                                },
                                renderMode: renderMode,
                                selectableMatchIds: selectableMatchIds,
                                onSelect: onSelect
                            )
                        }
                    }
                }
            }
        }
    }
}

private struct ModernBracketPanel: View {
    @Environment(\.colorScheme) private var colorScheme
    @ScaledMetric(relativeTo: .body) private var bracketTextSize = 14.0
    let detail: TournamentDetailResponse
    let matches: [Match]
    let selectableMatchIds: Set<String>
    let onSelect: ((Match) -> Void)?
    @State private var fullscreen = false
    @StateObject private var browser = ModernBracketBrowserHandle()

    var body: some View {
        let visibleMatches = matches.filter { !isDormantGrandFinalReset(allMatches: matches, match: $0) }
        let html = buildModernBracketHTML(
            detail: detail,
            matches: visibleMatches.sorted(by: matchDisplayOrder),
            selectableMatchIds: selectableMatchIds, darkTheme: colorScheme == .dark, readingScale: bracketTextSize / 14
        )

        VStack(spacing: 8) {
            HStack {
                Spacer()
                Button { browser.capture { fullscreen = true } } label: {
                    Label("Fullscreen", systemImage: "arrow.up.left.and.arrow.down.right")
                }
                .buttonStyle(.bordered)
            }
            if fullscreen {
                Color.clear.frame(height: 680)
            } else {
                ModernBracketWebView(
                    html: html,
                    stateKey: "modern-bracket:\(detail.tournament.id)",
                    browser: browser,
                    onMatchTap: { matchId in
                        guard let onSelect, let match = visibleMatches.first(where: { $0.id == matchId }) else { return }
                        onSelect(match)
                    }
                )
                .frame(height: 680)
                .clipShape(RoundedRectangle(cornerRadius: 20))
                .overlay(RoundedRectangle(cornerRadius: 20).stroke(ManagementPalette.cardBorder, lineWidth: 1))
            }
        }
        .fullScreenCover(isPresented: $fullscreen) {
            ModernBracketFullscreenView(
                initialDetail: detail, allowsOperations: onSelect != nil, browser: browser,
                onClose: { browser.capture { fullscreen = false } }
            )
        }
    }
}

private struct ModernBracketFullscreenView: View {
    @Environment(\.colorScheme) private var colorScheme
    @ScaledMetric(relativeTo: .body) private var bracketTextSize = 14.0
    @EnvironmentObject private var viewModel: TournamentManagerViewModel
    let initialDetail: TournamentDetailResponse
    let allowsOperations: Bool
    let browser: ModernBracketBrowserHandle
    let onClose: () -> Void
    @State private var selectedMatchId: String?

    var body: some View {
        let detail = viewModel.selectedTournamentDetail.flatMap {
            $0.tournament.id == initialDetail.tournament.id ? $0 : nil
        } ?? initialDetail
        let matches = detail.matches.filter { !isDormantGrandFinalReset(allMatches: detail.matches, match: $0) }.sorted(by: matchDisplayOrder)
        let selectable = allowsOperations ? Set(matches.filter {
            operationsModernCanInteractWithMatch($0, isStartggMirrored: detail.tournament.isStartggMirrored)
        }.map(\.id)) : Set<String>()

        VStack(spacing: 0) {
            HStack {
                Text("Modern bracket").font(.headline)
                Spacer()
                Button("Exit fullscreen", action: onClose)
                    .keyboardShortcut(.cancelAction)
            }
            .padding(12)
            ModernBracketWebView(
                html: buildModernBracketHTML(detail: detail, matches: matches, selectableMatchIds: selectable, darkTheme: colorScheme == .dark, readingScale: bracketTextSize / 14),
                stateKey: "modern-bracket:\(detail.tournament.id)", browser: browser,
                onMatchTap: { if selectable.contains($0) { selectedMatchId = $0 } }
            )
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .background(ManagementPalette.surfaceBackground.ignoresSafeArea())
        .statusBarHidden(true)
        .interactiveDismissDisabled()
        .sheet(item: Binding(
            get: { matches.first { $0.id == selectedMatchId } },
            set: { selectedMatchId = $0?.id }
        )) { match in
            NavigationStack {
                ScrollView {
                    VStack(spacing: 12) {
                        if let error = viewModel.error {
                            Text(error).foregroundStyle(ManagementPalette.danger)
                        }
                        MatchOperationCard(detail: detail, match: match)
                    }
                    .padding(20)
                }
                    .navigationTitle(match.poolAwareLabel)
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar {
                        ToolbarItem(placement: .topBarTrailing) {
                            Button("Close") { selectedMatchId = nil }
                        }
                    }
            }
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

private struct BracketStageSection: View {
    let stage: String
    let detail: TournamentDetailResponse
    let matches: [Match]
    let renderMode: ManagementBracketRenderMode
    let selectableMatchIds: Set<String>
    let onSelect: ((Match) -> Void)?

    private var rounds: [(Int, [Match])] {
        Dictionary(grouping: matches, by: \.roundNumber)
            .sorted { $0.key < $1.key }
            .map { ($0.key, $0.value.sorted { $0.matchNumber < $1.matchNumber }) }
    }

    private var poolGroups: [(String, [Match])] {
        Dictionary(grouping: matches) { $0.poolLabel ?? "Pool" }
            .sorted { naturalLabelLessThan($0.key, $1.key) }
            .map { ($0.key, $0.value.sorted { lhs, rhs in
                if lhs.roundNumber != rhs.roundNumber { return lhs.roundNumber < rhs.roundNumber }
                return lhs.matchNumber < rhs.matchNumber
            }) }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if let label = matchStageLabel(stage) {
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
                                                BracketMatchCard(
                                                    detail: detail,
                                                    match: match,
                                                    renderMode: renderMode,
                                                    isSelectable: selectableMatchIds.contains(match.id),
                                                    onSelect: onSelect
                                                )
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
                        .background(RoundedRectangle(cornerRadius: 18).fill(ManagementPalette.secondarySurfaceBackground))
                        .overlay(
                            RoundedRectangle(cornerRadius: 18)
                                .stroke(ManagementPalette.cardBorder, lineWidth: 1)
                        )
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
                                    BracketMatchCard(
                                        detail: detail,
                                        match: match,
                                        renderMode: renderMode,
                                        isSelectable: selectableMatchIds.contains(match.id),
                                        onSelect: onSelect
                                    )
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

private struct BracketMatchCard: View {
    let detail: TournamentDetailResponse
    let match: Match
    let renderMode: ManagementBracketRenderMode
    let isSelectable: Bool
    let onSelect: ((Match) -> Void)?

    var body: some View {
        Group {
            if isSelectable, let onSelect {
                Button {
                    onSelect(match)
                } label: {
                    bracketCardBody
                }
                .buttonStyle(.plain)
            } else {
                bracketCardBody
            }
        }
    }

    @ViewBuilder
    private var bracketCardBody: some View {
        if renderMode == .modern {
            ModernBracketMatchCard(
                detail: detail,
                match: match,
                isSelectable: isSelectable
            )
        } else {
            ClassicBracketMatchCard(match: match)
        }
    }
}

private struct ClassicBracketMatchCard: View {
    let match: Match

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(match.label)
                .font(.headline)
            if match.advancersRequired <= 1 {
                Text("Bo\(match.effectiveBestOf)")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
            }

            VStack(alignment: .leading, spacing: 8) {
                ForEach(match.participants.sorted { $0.slot < $1.slot }) { participant in
                    BracketParticipantRow(match: match, participant: participant, modern: false)
                }
            }
            .padding(10)
            .background(RoundedRectangle(cornerRadius: 12).fill(ManagementPalette.secondarySurfaceBackground))

            HStack {
                Text(match.status)
                    .font(.caption.weight(.semibold))
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(Capsule().fill(ManagementPalette.heroFill))
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
        .background(RoundedRectangle(cornerRadius: 14).fill(ManagementPalette.surfaceBackground))
        .overlay(
            RoundedRectangle(cornerRadius: 14)
                .stroke(ManagementPalette.mutedBorder, lineWidth: 1.1)
        )
    }
}

private struct ModernBracketMatchCard: View {
    let detail: TournamentDetailResponse
    let match: Match
    let isSelectable: Bool

    private var statusTint: Color {
        switch match.status {
        case "CALLED":
            return ManagementPalette.warningFill
        case "PLAYING":
            return ManagementPalette.successFill
        case "COMPLETED":
            return ManagementPalette.heroFill
        case "WALKOVER":
            return ManagementPalette.dangerFill
        default:
            return ManagementPalette.secondarySurfaceBackground
        }
    }

    private var borderTint: Color {
        switch match.status {
        case "CALLED":
            return ManagementPalette.warning
        case "PLAYING":
            return ManagementPalette.success.opacity(0.85)
        case "COMPLETED":
            return ManagementPalette.success.opacity(0.38)
        case "WALKOVER":
            return ManagementPalette.danger.opacity(0.45)
        default:
            return ManagementPalette.mutedBorder
        }
    }

    var body: some View {
        TimelineView(.periodic(from: .now, by: 1)) { context in
            VStack(alignment: .leading, spacing: 10) {
                HStack(alignment: .top, spacing: 10) {
                    Text(match.label)
                        .font(.headline)
                    Spacer(minLength: 8)
                    if match.advancersRequired <= 1 {
                        Text("Bo\(match.effectiveBestOf)")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(.secondary)
                    }
                    Text(match.status)
                        .font(.caption.weight(.semibold))
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(Capsule().fill(statusTint))
                }

                VStack(alignment: .leading, spacing: 10) {
                    ForEach(match.participants.sorted { $0.slot < $1.slot }) { participant in
                        BracketParticipantRow(match: match, participant: participant, modern: true)
                    }
                }

                if let station = match.stationLabel, !station.isEmpty {
                    Text(station)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                if let countdown = calledCountdownSeconds(match: match, callTimeoutMinutes: detail.tournament.callTimeoutMinutes, referenceDate: context.date) {
                    Text("Tiempo restante: \(formatMatchTimer(countdown))")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(ManagementPalette.warning)
                } else if let elapsed = playingElapsedSeconds(match: match, referenceDate: context.date) {
                    Text("Playing: \(formatMatchTimer(elapsed))")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(ManagementPalette.success)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(14)
            .background(RoundedRectangle(cornerRadius: 18).fill(ManagementPalette.surfaceBackground))
            .overlay(
                RoundedRectangle(cornerRadius: 18)
                    .stroke(borderTint, lineWidth: isSelectable ? 1.8 : 1.2)
            )
        }
    }
}

private struct BracketRenderModeSelector: View {
    @Binding var mode: ManagementBracketRenderMode

    var body: some View {
        HStack(spacing: 12) {
            ForEach(ManagementBracketRenderMode.allCases) { option in
                Button {
                    mode = option
                } label: {
                    Text(option.title)
                        .font(.headline.weight(.semibold))
                        .foregroundStyle(option == mode ? Color.white : ManagementPalette.accent)
                        .padding(.horizontal, 20)
                        .padding(.vertical, 14)
                        .frame(maxWidth: .infinity)
                        .background(Capsule().fill(option == mode ? ManagementPalette.primaryAction : ManagementPalette.secondarySurfaceBackground))
                        .accessibilityAddTraits(option == mode ? .isSelected : [])
                }
                .buttonStyle(.plain)
            }
        }
    }
}

private struct BracketParticipantRow: View {
    let match: Match
    let participant: MatchParticipant
    var modern: Bool = false

    var body: some View {
        let participantId = participant.participantId
        let isAdvanced = (match.advancingParticipantIds ?? []).contains(participantId)
        let isWinner = participantId == match.winnerParticipantId || isAdvanced
        let walkoverLoser = isWalkoverLoser(match, participantId: participantId, isAdvanced: isAdvanced)
        let lastCharacter = latestCharacterForParticipant(match, participantId: participantId)
        let modernFillColor: Color = {
            if isWinner { return ManagementPalette.success.opacity(0.12) }
            if walkoverLoser { return ManagementPalette.danger.opacity(0.10) }
            return ManagementPalette.secondarySurfaceBackground
        }()
        let modernBorderColor: Color = {
            if isWinner { return ManagementPalette.success.opacity(0.35) }
            if walkoverLoser { return ManagementPalette.danger.opacity(0.25) }
            return ManagementPalette.cardBorder
        }()

        HStack(spacing: 10) {
            CharacterIconView(characterName: lastCharacter ?? "", gameTitle: "smash ultimate", size: 24)
            Text(participant.displayName)
                .lineLimit(1)
                .fontWeight(isWinner ? .semibold : .regular)
            Spacer(minLength: 8)
            Text(walkoverLoser ? "DQ" : "\(participant.score)")
                .fontWeight(.semibold)
                .foregroundStyle(walkoverLoser ? ManagementPalette.danger : Color.primary)
        }
        .font(.subheadline)
        .padding(.horizontal, modern ? 12 : 0)
        .padding(.vertical, modern ? 10 : 0)
        .background {
            if modern {
                RoundedRectangle(cornerRadius: 12)
                    .fill(modernFillColor)
                    .overlay(
                        RoundedRectangle(cornerRadius: 12)
                            .stroke(modernBorderColor, lineWidth: 1)
                    )
            }
        }
        .foregroundStyle(isWinner ? ManagementPalette.success : Color.primary)
    }
}

private struct TournamentSettingsEditor: View {
    @EnvironmentObject private var viewModel: TournamentManagerViewModel
    let detail: TournamentDetailResponse

    @State private var title = ""
    @State private var gameTitle = ""
    @State private var description = ""
    @State private var platform = ""
    @State private var maxParticipants = ""
    @State private var format = ""
    @State private var bracketMode = ""
    @State private var fortniteLobbySize = 20
    @State private var fortniteGamesPerRound = 3
    @State private var mkartAdvanceCount = "1"
    @State private var mkartLosersAdvanceCount = "1"
    @State private var bestOf = ""
    @State private var winnersBestOf = ""
    @State private var losersBestOf = ""
    @State private var seedingMethod = ""
    @State private var callTimeout = ""
    @State private var setupCount = ""
    @State private var streamCount = 0
    @State private var playAreaName = ""
    @State private var playerReporting = true

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            if !detail.tournament.isStartggMirrored {
                EditOutlinedField(title: "Tournament name") {
                    TextField("", text: $title)
                        .textFieldStyle(.plain)
                }

                EditOutlinedField(title: "Game") {
                    TextField("", text: $gameTitle)
                        .textFieldStyle(.plain)
                }

                EditOutlinedField(title: "Description", minHeight: 180) {
                    ZStack(alignment: .topLeading) {
                        if description.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                            Text("Description")
                                .font(.system(.body))
                                .foregroundStyle(.secondary)
                                .padding(.top, 8)
                                .allowsHitTesting(false)
                        }
                        TextEditor(text: $description)
                            .scrollContentBackground(.hidden)
                            .frame(minHeight: 150)
                    }
                }

                EditOutlinedField(title: "Platform") {
                    TextField("", text: $platform)
                        .textFieldStyle(.plain)
                }

                EditOutlinedField(title: (detail.tournament.settings.teamSize ?? 1) > 1 ? "Maximum teams" : "Maximum participants") {
                    TextField("", text: $maxParticipants)
                        .textFieldStyle(.plain)
                        .keyboardType(.numberPad)
                }

                EditSegmentedChoiceRow(
                    title: "Bracket mode",
                    options: (detail.tournament.settings.teamSize ?? 1) > 1 ? [("STANDARD", "Standard teams")] : [
                        ("STANDARD", "Standard"),
                        ("MKART", "MKART"), ("FORTNITE", "Fortnite")
                    ],
                    selected: $bracketMode
                )

                if bracketMode == "FORTNITE" {
                    Stepper("Participants per group (+ VIP): \(fortniteLobbySize)", value: $fortniteLobbySize, in: 5...100, step: 5)
                    Stepper("Games per round: \(fortniteGamesPerRound)", value: $fortniteGamesPerRound, in: 1...20)
                    Text("Seats and games can be changed before drawing groups.").font(.footnote)
                }
                if bracketMode != "FORTNITE" {
                EditSegmentedChoiceRow(
                    title: "Format",
                    options: [
                        ("SINGLE_ELIMINATION", "Elim. simple"),
                        ("DOUBLE_ELIMINATION", "Doble elim.")
                    ],
                    selected: $format
                )

                if bracketMode == "MKART" {
                    EditSegmentedChoiceRow(title: "Main bracket", options: [("1", "MKART pasa 1"), ("2", "MKART pasa 2")], selected: $mkartAdvanceCount)
                    if format == "DOUBLE_ELIMINATION" {
                        EditSegmentedChoiceRow(title: "Losers bracket", options: [("1", "MKART pasa 1"), ("2", "MKART pasa 2")], selected: $mkartLosersAdvanceCount)
                    }
                } else if format == "DOUBLE_ELIMINATION" {
                    EditSegmentedChoiceRow(
                        title: "Winners series",
                        options: [("1", "Bo1"), ("3", "Bo3"), ("5", "Bo5")],
                        selected: $winnersBestOf
                    )

                    EditSegmentedChoiceRow(
                        title: "Losers series",
                        options: [("1", "Bo1"), ("3", "Bo3"), ("5", "Bo5")],
                        selected: $losersBestOf
                    )
                } else {
                    EditSegmentedChoiceRow(
                        title: "Series",
                        options: [("1", "Bo1"), ("3", "Bo3"), ("5", "Bo5")],
                        selected: $winnersBestOf
                    )
                }

                EditSegmentedChoiceRow(
                    title: "Seeding",
                    options: [
                        ("MANUAL", "Manual"),
                        ("RANDOM", "Random")
                    ],
                    selected: $seedingMethod
                )
                }
            }

            EditOutlinedField(title: "Call timeout in minutes") {
                TextField("", text: $callTimeout)
                    .textFieldStyle(.plain)
                    .keyboardType(.numberPad)
            }

            EditOutlinedField(title: "Setup count") {
                TextField("", text: $setupCount)
                    .textFieldStyle(.plain)
                    .keyboardType(.numberPad)
            }

            StreamCountPicker(selection: $streamCount)

            Button("Save setups and streams") {
                Task { await viewModel.updateSetups(Int(setupCount) ?? detail.tournament.setupCount, streamCount: streamCount) }
            }.disabled(viewModel.isMutating)

            if !detail.tournament.isStartggMirrored {
                EditOutlinedField(title: "Play area (optional)") {
                    TextField("e.g. Main hall", text: $playAreaName)
                        .textFieldStyle(.plain)
                        .onChange(of: playAreaName) { _, value in
                            if value.count > 80 { playAreaName = String(value.prefix(80)) }
                        }
                }
            }

            if detail.tournament.isStartggMirrored || BackendConfig.supportsLadder {
                Toggle("Players can report", isOn: $playerReporting)
                    .tint(ManagementPalette.primaryAction)
            }

            Button("Save options") {
                let winnersValue = Int(winnersBestOf) ?? detail.tournament.settings.winnersBestOf ?? detail.tournament.settings.bestOf
                let losersValue = Int(losersBestOf) ?? detail.tournament.settings.losersBestOf ?? detail.tournament.settings.bestOf
                let bestOfValue = format == "DOUBLE_ELIMINATION"
                    ? (Int(bestOf) ?? detail.tournament.settings.bestOf)
                    : winnersValue

                let tournament = TournamentListItem(
                    id: detail.tournament.id,
                    title: title,
                    gameTitle: gameTitle,
                    description: description,
                    platform: platform,
                    status: detail.tournament.status,
                    maxParticipants: Int(maxParticipants) ?? detail.tournament.maxParticipants,
                    settings: detail.tournament.settings,
                    importSource: detail.tournament.importSource
                )
                let settings = TournamentSettings(
                    fortniteLobbySize: fortniteLobbySize, fortniteGamesPerRound: fortniteGamesPerRound,
                    format: format,
                    bracketMode: bracketMode.isEmpty ? nil : bracketMode,
                    mkartAdvanceCount: Int(mkartAdvanceCount) ?? 1,
                    mkartLosersAdvanceCount: Int(mkartLosersAdvanceCount) ?? 1,
                    setupCount: Int(setupCount) ?? detail.tournament.setupCount,
                    streamCount: streamCount,
                    playAreaName: playAreaName.trimmingCharacters(in: .whitespacesAndNewlines),
                    bestOf: bracketMode == "MKART" ? 1 : bestOfValue,
                    winnersBestOf: bracketMode == "MKART" ? 1 : winnersValue,
                    losersBestOf: bracketMode == "MKART" ? 1 : losersValue,
                    hasThirdPlaceMatch: detail.tournament.settings.hasThirdPlaceMatch,
                    checkInRequired: detail.tournament.settings.checkInRequired,
                    allowRematchReview: detail.tournament.settings.allowRematchReview,
                    seedingMethod: seedingMethod,
                    autoCallMatches: detail.tournament.settings.autoCallMatches,
                    callTimeoutMinutes: Int(callTimeout) ?? detail.tournament.callTimeoutMinutes,
                    autoDisqualifyAfterMinutes: detail.tournament.settings.autoDisqualifyAfterMinutes,
                    manualSeedingLocked: detail.tournament.settings.manualSeedingLocked,
                    playerMatchReportingEnabled: playerReporting
                )
                Task { await viewModel.updateTournament(tournament, settings: settings) }
            }
            .buttonStyle(.plain)
            .font(.headline.weight(.semibold))
            .foregroundStyle(.white)
            .padding(.horizontal, 24)
            .padding(.vertical, 14)
            .background(Capsule().fill(ManagementPalette.primaryAction))
        }
        .onAppear {
            title = detail.tournament.title
            gameTitle = detail.tournament.gameTitle
            description = detail.tournament.description
            platform = detail.tournament.platform
            maxParticipants = "\(detail.tournament.maxParticipants)"
            format = detail.tournament.settings.format
            bracketMode = detail.tournament.settings.bracketMode ?? ""
            fortniteLobbySize = detail.tournament.settings.fortniteLobbySize ?? 20
            fortniteGamesPerRound = detail.tournament.settings.fortniteGamesPerRound ?? 3
            mkartAdvanceCount = "\(detail.tournament.settings.mkartAdvanceCount ?? 1)"
            mkartLosersAdvanceCount = "\(detail.tournament.settings.mkartLosersAdvanceCount ?? detail.tournament.settings.mkartAdvanceCount ?? 1)"
            bestOf = "\(detail.tournament.settings.bestOf)"
            winnersBestOf = "\(detail.tournament.settings.winnersBestOf ?? detail.tournament.settings.bestOf)"
            losersBestOf = "\(detail.tournament.settings.losersBestOf ?? detail.tournament.settings.bestOf)"
            seedingMethod = detail.tournament.settings.seedingMethod
            callTimeout = "\(detail.tournament.callTimeoutMinutes)"
            setupCount = "\(detail.tournament.setupCount)"
            streamCount = detail.tournament.streamCount
            playAreaName = detail.tournament.playAreaName ?? ""
            playerReporting = detail.tournament.playerMatchReportingEnabledResolved
        }
    }
}

private struct EditOutlinedField<Content: View>: View {
    let title: String
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
                Text(title)
                    .font(.system(.callout, weight: .regular))
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 12)
                    .background(ManagementPalette.screenBackground)
                    .offset(y: -12)
                    .allowsHitTesting(false)

                content
                    .font(.system(.body))
                    .padding(.top, 6)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(.horizontal, 18)
            .padding(.bottom, 18)
            .contentShape(Rectangle())
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .frame(minHeight: minHeight)
        .contentShape(Rectangle())
    }
}

private struct EditSegmentedChoiceRow: View {
    let title: String
    let options: [(String, String)]
    @Binding var selected: String

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text(title)
                .font(.system(.body, weight: .semibold))

            LazyVGrid(columns: [GridItem(.adaptive(minimum: 150), spacing: 12)], alignment: .leading, spacing: 12) {
                ForEach(options, id: \.0) { option in
                    Button {
                        selected = option.0
                    } label: {
                        Text(option.0 == selected ? "[\(option.1)]" : option.1)
                            .font(.headline.weight(.semibold))
                            .foregroundStyle(.white)
                            .padding(.horizontal, 20)
                            .padding(.vertical, 14)
                            .frame(maxWidth: .infinity)
                .background(Capsule().fill(ManagementPalette.primaryAction))
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }
}

private struct AccordionCard<Content: View>: View {
    let title: String
    @Binding var isExpanded: Bool
    @ViewBuilder let content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Button {
                withAnimation(.easeInOut(duration: 0.18)) {
                    isExpanded.toggle()
                }
            } label: {
                HStack {
                    Text(title)
                        .font(.headline)
                        .foregroundStyle(.primary)
                    Spacer()
                    Text(isExpanded ? "Hide" : "Show")
                        .foregroundStyle(.secondary)
                }
                .padding(18)
                .background(
                    RoundedRectangle(cornerRadius: 18)
                        .fill(ManagementPalette.heroFill)
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 18)
                        .stroke(ManagementPalette.heroStroke, lineWidth: 1.2)
                )
            }
            .buttonStyle(.plain)

            if isExpanded {
                content
            }
        }
    }
}

private struct ParticipantRow: View {
    @EnvironmentObject private var viewModel: TournamentManagerViewModel
    let participant: TournamentParticipant

    @State private var editName = ""
    @State private var editSeed = ""
    private var canChangeSeed: Bool { viewModel.selectedTournamentDetail.map(canChangeLocalEntrants) ?? false }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(participant.displayName).font(.headline)
                    Text("Seed \(participant.seed ?? 0) · \(participant.status)")
                        .foregroundStyle(.secondary)
                }
                Spacer()
                Toggle("", isOn: Binding(
                    get: { participant.checkedIn },
                    set: { newValue in
                        Task {
                            await viewModel.updateParticipant(
                                participant,
                                displayName: participant.displayName,
                                seed: participant.seed,
                                checkedIn: newValue,
                                status: participant.status
                            )
                        }
                    }
                ))
                .labelsHidden()
            }

            HStack(alignment: .top, spacing: 10) {
                EditOutlinedField(title: "Name") {
                    TextField("", text: $editName)
                }

                EditOutlinedField(title: "Seed") {
                    TextField("", text: $editSeed)
                        .keyboardType(.numberPad)
                        .disabled(!canChangeSeed)
                }
                .frame(width: 110)

                Button("Save") {
                    Task {
                        await viewModel.updateParticipant(
                            participant,
                            displayName: editName.trimmingCharacters(in: .whitespacesAndNewlines),
                            seed: canChangeSeed ? Int(editSeed.trimmingCharacters(in: .whitespacesAndNewlines)) : participant.seed,
                            checkedIn: participant.checkedIn,
                            status: participant.status
                        )
                    }
                }
                .buttonStyle(.bordered)
                .disabled(canChangeSeed && !isValidParticipantSeed(editSeed))

                Button(role: .destructive) {
                    Task { await viewModel.deleteParticipant(participant) }
                } label: {
                    Image(systemName: "trash")
                }
                .buttonStyle(.bordered)
                .disabled(!canChangeSeed)
            }
        }
        .padding(12)
        .background(RoundedRectangle(cornerRadius: 14).fill(ManagementPalette.surfaceBackground))
        .onAppear {
            editName = participant.displayName
            editSeed = participant.seed.map(String.init) ?? ""
        }
    }
}

private struct MatchOperationCard: View {
    @EnvironmentObject private var viewModel: TournamentManagerViewModel
    let detail: TournamentDetailResponse
    let match: Match
    var reportRequest: Int = 0

    @State private var showCallDialog = false
    @State private var showCharactersSheet = false
    @State private var showDetailedReportBestOfDialog = false
    @State private var showDetailedReportSheet = false
    @State private var detailedReportBestOfOverride: Int?
    @State private var characterOne = ""
    @State private var characterTwo = ""
    @State private var characterPicker: QuickReportPickerTarget?
    @State private var detailedReportError: String?
    @State private var charactersError: String?
    @State private var pendingGameWinner: String?

    private var isMarioKart: Bool {
        detail.tournament.settings.bracketMode == "MKART" || match.participants.count > 2 || match.advancersRequired > 1
    }

    private var hasStarted: Bool { match.startedAt != nil || match.status == "PLAYING" }

    private var canOperate: Bool {
        !viewModel.isMutating && detail.tournament.settings.importJob?.state != "RUNNING"
            && hasResolvedContenders(match) && match.status != "CANCELLED"
            && (detail.tournament.isStartggMirrored || ["IN_PROGRESS", "COMPLETED"].contains(detail.tournament.status))
    }

    private func chooseCharacters(gameWinner: String? = nil) {
        pendingGameWinner = gameWinner
        charactersError = nil
        let characters = joinedCharacterSelections(match.characterSelections ?? [])
        characterOne = characters[match.participantIds.first ?? ""] ?? ""
        characterTwo = characters[match.participantIds.dropFirst().first ?? ""] ?? ""
        showCharactersSheet = true
    }

    private var availableSetupLabels: [String] {
        availableSetups(for: detail, matchId: match.id)
    }

    private var supportsCharacterReporting: Bool {
        detail.tournament.isStartggMirrored && match.participants.count == 2 && !isMarioKart
            && (isSmashUltimateGameTitle(detail.tournament.gameTitle) || isRoa2GameTitle(detail.tournament.gameTitle))
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            if let stage = matchStageLabel(match.bracketStage) {
                Text(stage)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            if let poolLabel = match.poolLabel {
                Text(poolLabel)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.secondary)
            }
            Text(match.label).font(.headline)
            if let sync = match.syncStatus {
                Text(sync.message).font(.caption).foregroundStyle(sync.state == "FAILED" ? ManagementPalette.danger : Color.secondary)
                if let error = sync.error { Text(error).font(.caption) }
                if sync.canRetry == true {
                    Button("Retry synchronization") { Task { await viewModel.retrySync(match) } }
                        .buttonStyle(.bordered).disabled(viewModel.isMutating)
                }
            }
            VStack(alignment: .leading, spacing: 8) {
                ForEach(match.participants.sorted { $0.slot < $1.slot }) { participant in
                    MatchParticipantRow(detail: detail, match: match, participant: participant)
                }
            }
            if let station = match.stationLabel {
                Text("Station: \(station)").foregroundStyle(.secondary)
            }
            MainStatusBadge(label: mainMatchStatusLabel(match.status), state: match.status)
            if !isMarioKart {
                Text(match.reportedBestOf == nil
                    ? "Modalidad: Bo\(match.bestOf)"
                    : "Format: Bo\(match.effectiveBestOf) (tournament: Bo\(match.bestOf))")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            if match.status == "CALLED" && !hasStarted {
                TimelineView(.periodic(from: .now, by: 1)) { _ in
                    if let seconds = calledCountdownSeconds(match: match, callTimeoutMinutes: detail.tournament.callTimeoutMinutes) {
                        Text("Call time: \(formatMatchTimer(seconds))")
                            .foregroundStyle(seconds == 0 ? ManagementPalette.danger : Color.secondary)
                        if seconds == 0 && !detail.tournament.isStartggMirrored && match.participants.count == 2 {
                            Button("Neither player arrived") { Task { await viewModel.resolveAbsence(match, outcome: "NONE_PRESENT") } }
                                .buttonStyle(.bordered).disabled(!canOperate)
                        }
                    }
                }
            }

            FlowActions {
                if match.status == "PENDING" {
                    Button("Call") {
                        showCallDialog = true
                    }
                    .managementPrimaryButton()
                }
                if match.status == "CALLED" && !hasStarted {
                    Button("Start match") { Task { await viewModel.startMatch(match) } }
                        .managementPrimaryButton()
                    Button("Cancel") { Task { await viewModel.cancelCall(match) } }
                        .buttonStyle(.bordered)
                }
                if supportsCharacterReporting {
                    Button("Characters") {
                        chooseCharacters()
                    }
                    .buttonStyle(.bordered)
                }
                if match.participants.count == 2 && !isMarioKart {
                    Button(match.isCompletedLike ? "Correct result" : "Quick report") {
                        detailedReportError = nil
                        detailedReportBestOfOverride = match.reportedBestOf
                        showDetailedReportBestOfDialog = true
                    }
                        .buttonStyle(.bordered)
                }
                if hasStarted && !match.isCompletedLike && match.status != "PENDING" {
                    ForEach(match.participants.sorted { $0.slot < $1.slot }) { participant in
                        if isMarioKart {
                            let advanced = (match.advancingParticipantIds ?? []).contains(participant.participantId)
                            Button("\(advanced ? "Qualified" : "Qualify") \(participant.displayName)") {
                                Task { await viewModel.selectMarioKartAdvancer(match, participantId: participant.participantId) }
                            }
                            .buttonStyle(.bordered)
                            .disabled(advanced || (match.advancingParticipantIds?.count ?? 0) >= match.advancersRequired)
                        } else {
                            Button("+1 game \(participant.displayName)") {
                                if supportsCharacterReporting { chooseCharacters(gameWinner: participant.participantId) }
                                else { Task { await viewModel.recordGameWin(match, participantId: participant.participantId) } }
                            }
                            .buttonStyle(.bordered)
                        }
                    }
                }
                if match.isCompletedLike && !detail.tournament.isStartggMirrored && !isMarioKart && match.participants.count == 2 {
                    ForEach(match.participants.sorted { $0.slot < $1.slot }) { participant in
                        Button("Wins \(participant.displayName)") {
                            let scores = match.participants.map { MatchScoreRequest(participantId: $0.participantId, score: $0.participantId == participant.participantId ? (match.effectiveBestOf / 2) + 1 : 0) }
                            Task { await viewModel.reportResult(match, winnerParticipantId: participant.participantId, scores: scores) }
                        }.buttonStyle(.bordered)
                    }
                }
            }
            .disabled(!canOperate)
            Divider()
            Text("Issues and corrections").font(.subheadline.weight(.semibold)).foregroundStyle(ManagementPalette.secondaryText)
            FlowActions {
                if match.participants.count == 2 {
                    ForEach(match.participants.sorted { $0.slot < $1.slot }) { participant in
                        Button("DQ \(participant.displayName)", role: .destructive) {
                            let outcome = participant.slot == 1 ? "SLOT_1_ABSENT" : "SLOT_2_ABSENT"
                            Task { await viewModel.resolveAbsence(match, outcome: outcome) }
                        }
                        .buttonStyle(.bordered)
                    }
                }
                if !detail.tournament.isStartggMirrored || match.isCompletedLike || hasStarted || match.participants.contains(where: { $0.score > 0 }) {
                    Button("Reset", role: .destructive) { Task { await viewModel.resetMatch(match) } }
                        .buttonStyle(.bordered)
                }
            }
            .disabled(!canOperate)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(RoundedRectangle(cornerRadius: 18).fill(ManagementPalette.surfaceBackground))
        .confirmationDialog("Assign setup", isPresented: $showCallDialog) {
            if availableSetupLabels.isEmpty {
                Button("Close", role: .cancel) {}
            } else {
                ForEach(availableSetupLabels, id: \.self) { setup in
                    Button(setup) {
                        Task { await viewModel.callMatch(match, stationLabel: setup) }
                    }
                }
                Button("Cancel", role: .cancel) {}
            }
        } message: {
            Text(availableSetupLabels.isEmpty ? "No setups or streams are currently available." : "Select an available setup or stream for this match.")
        }
        .onChange(of: reportRequest) { _, _ in
            guard canOperate && !isMarioKart && match.participants.count == 2 else { return }
            detailedReportError = nil
            detailedReportBestOfOverride = match.reportedBestOf
            showDetailedReportBestOfDialog = true
        }
        .confirmationDialog("Set format", isPresented: $showDetailedReportBestOfDialog) {
            Button("Tournament default (Bo\(match.bestOf))") {
                detailedReportBestOfOverride = nil
                showDetailedReportSheet = true
            }
            Button("Bo1") {
                detailedReportBestOfOverride = 1
                showDetailedReportSheet = true
            }
            Button("Bo3") {
                detailedReportBestOfOverride = 3
                showDetailedReportSheet = true
            }
            Button("Bo5") {
                detailedReportBestOfOverride = 5
                showDetailedReportSheet = true
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Select whether this match used the default tournament format or a different one.")
        }
        .sheet(isPresented: $showCharactersSheet) {
            NavigationStack {
                Form {
                    if match.participantNames.count >= 2 {
                        Button("\(match.participantNames[0]): \(characterOne.isEmpty ? "Choose characters" : characterOne)") { characterPicker = .baseFirst }
                        Button("\(match.participantNames[1]): \(characterTwo.isEmpty ? "Choose characters" : characterTwo)") { characterPicker = .baseSecond }
                    }
                    if let charactersError { Text(charactersError).foregroundStyle(ManagementPalette.danger) }
                }
                .navigationTitle("Characters")
                .toolbar {
                    ToolbarItem(placement: .topBarLeading) {
                        Button("Close") { showCharactersSheet = false }.disabled(viewModel.isMutating)
                    }
                    ToolbarItem(placement: .topBarTrailing) {
                        Button("Save") {
                            let selections = [
                                UpdateMatchCharacterSelectionRequest(participantId: match.participantIds[safe: 0] ?? "", characterName: characterOne),
                                UpdateMatchCharacterSelectionRequest(participantId: match.participantIds[safe: 1] ?? "", characterName: characterTwo)
                            ].filter { !$0.participantId.isEmpty && !$0.characterName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
                            Task {
                                charactersError = nil
                                if await viewModel.saveCharacters(match, selections: selections, gameWinnerParticipantId: pendingGameWinner) {
                                    showCharactersSheet = false
                                } else {
                                    charactersError = viewModel.error ?? "Could not save characters."
                                }
                            }
                        }
                        .disabled(viewModel.isMutating || [characterOne, characterTwo].contains { value in
                            let names = value.components(separatedBy: "/")
                            return names.count != max(1, match.externalRef?.entrantSize ?? 1)
                                || names.contains { $0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
                        })
                    }
                }
            }
            .sheet(item: $characterPicker) { target in
                CharacterPickerSheet(gameTitle: detail.tournament.gameTitle,
                    selectedCharacter: target.id == QuickReportPickerTarget.baseFirst.id ? characterOne : characterTwo,
                    characterCount: max(1, match.externalRef?.entrantSize ?? 1)) { selected in
                    if case .baseFirst = target { characterOne = selected } else { characterTwo = selected }
                }
            }
            .interactiveDismissDisabled(viewModel.isMutating)
        }

        .sheet(isPresented: $showDetailedReportSheet) {
            DetailedReportSheet(
                match: match,
                gameTitle: detail.tournament.gameTitle,
                effectiveBestOf: detailedReportBestOfOverride ?? match.bestOf,
                requiresCharacters: supportsCharacterReporting,
                isSaving: viewModel.isMutating,
                errorMessage: detailedReportError
            ) { games in
                Task {
                    detailedReportError = nil
                    if await viewModel.reportDetailedResult(match, bestOfOverride: detailedReportBestOfOverride, games: games) {
                        showDetailedReportSheet = false
                    } else {
                        detailedReportError = viewModel.error ?? "Could not save the result."
                    }
                }
            }
        }
    }
}

private struct MatchParticipantRow: View {
    let detail: TournamentDetailResponse
    let match: Match
    let participant: MatchParticipant

    var body: some View {
        let participantId = participant.participantId
        let isAdvanced = (match.advancingParticipantIds ?? []).contains(participantId)
        let isWinner = participantId == match.winnerParticipantId || isAdvanced
        let walkoverLoser = isWalkoverLoser(match, participantId: participantId, isAdvanced: isAdvanced)
        let lastCharacter = latestCharacterForParticipant(match, participantId: participantId)
        let isMarioKart = detail.tournament.settings.bracketMode == "MKART" || match.participants.count > 2 || match.advancersRequired > 1
        let scoreLabel = walkoverLoser ? "DQ" : isMarioKart ? (isAdvanced ? "Qualified" : "Pending") : "\(participant.score)"

        HStack(spacing: 10) {
            CharacterIconView(characterName: lastCharacter ?? "", gameTitle: detail.tournament.gameTitle, size: 28)
            Text(participant.displayName)
                .font(.headline.weight(.semibold))
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)
            Text(scoreLabel)
                .font(isMarioKart ? .subheadline.weight(.semibold) : .title.bold())
                .foregroundStyle(walkoverLoser ? ManagementPalette.danger : .secondary)
                .multilineTextAlignment(.trailing)
                .frame(width: walkoverLoser ? 44 : 90, alignment: .trailing)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
        .background(
            RoundedRectangle(cornerRadius: 18)
                .fill(isWinner ? ManagementPalette.success.opacity(0.12) : ManagementPalette.secondarySurfaceBackground)
                .overlay(
                    RoundedRectangle(cornerRadius: 18)
                        .stroke(isWinner ? ManagementPalette.success.opacity(0.18) : Color.secondary.opacity(0.12), lineWidth: 1)
                )
        )
    }
}

private struct DetailedReportSheet: View {
    let match: Match
    let gameTitle: String
    let effectiveBestOf: Int
    let requiresCharacters: Bool
    let isSaving: Bool
    let errorMessage: String?
    let onSave: ([DetailedReportGameRequest]) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var baseFirstCharacter = ""
    @State private var baseSecondCharacter = ""
    @State private var selectedScoreKey: String?
    @State private var openedRevision: String?
    @State private var games: [QuickReportGameDraft] = []
    @State private var activePicker: QuickReportPickerTarget?

    private var scoreOptions: [QuickReportScoreOption] {
        buildQuickReportScoreOptions(match: match, effectiveBestOf: effectiveBestOf)
    }

    private var canSubmit: Bool {
        selectedScoreKey != nil
            && scoreOptions.contains { $0.key == selectedScoreKey }
            && !games.isEmpty
            && games.count <= effectiveBestOf
            && (!requiresCharacters || games.allSatisfy {
                [$0.firstCharacter, $0.secondCharacter].allSatisfy { value in
                    let names = value.components(separatedBy: "/")
                    return names.count == max(1, match.externalRef?.entrantSize ?? 1) && names.allSatisfy { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
                }
            })
    }

    var body: some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    Text("Quick report")
                        .font(.system(.title, weight: .regular))

                    Text("Select the final result and review games before submitting them together.")
                        .font(.system(.body))
                        .foregroundStyle(.secondary)

                    Text("Set format: Bo\(effectiveBestOf)")
                        .font(.system(.callout))
                        .foregroundStyle(.secondary)

                    if requiresCharacters && match.participantNames.count >= 2 {
                        QuickReportCharacterField(
                            label: "\(match.participantNames[0]) (base)",
                            gameTitle: gameTitle,
                            selectedCharacter: baseFirstCharacter,
                            onTap: { activePicker = .baseFirst }
                        )
                        QuickReportCharacterField(
                            label: "\(match.participantNames[1]) (base)",
                            gameTitle: gameTitle,
                            selectedCharacter: baseSecondCharacter,
                            onTap: { activePicker = .baseSecond }
                        )
                    }

                    Text("Final result")
                        .font(.system(.body, weight: .semibold))

                    LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
                        ForEach(scoreOptions) { option in
                            let isSelected = option.key == selectedScoreKey
                            Button {
                                selectedScoreKey = option.key
                                games = buildQuickReportGames(
                                    match: match,
                                    option: option,
                                    firstCharacter: baseFirstCharacter,
                                    secondCharacter: baseSecondCharacter
                                )
                            } label: {
                                Text("\(winnerNameForOption(match: match, option: option)) \(option.winnerScore)-\(option.loserScore)")
                                    .font(.headline.weight(.semibold))
                                    .foregroundStyle(isSelected ? .white : .primary)
                                    .frame(maxWidth: .infinity)
                                    .padding(.vertical, 16)
                                    .background(
                                        Capsule().fill(
                                            isSelected
                                                ? ManagementPalette.primaryAction
                                                : ManagementPalette.quickReportDeselectedPill
                                        )
                                    )
                            }
                            .buttonStyle(.plain)
                        }
                    }

                    if !games.isEmpty {
                        Text("Game summary")
                            .font(.system(.body, weight: .semibold))

                        VStack(spacing: 14) {
                            ForEach(Array(games.enumerated()), id: \.offset) { index, game in
                                QuickReportGameCard(
                                    gameIndex: index,
                                    gameTitle: gameTitle,
                                    firstParticipantName: match.participantNames[safe: 0] ?? "Player 1",
                                    secondParticipantName: match.participantNames[safe: 1] ?? "Player 2",
                                    firstParticipantId: match.participantIds[safe: 0] ?? "",
                                    secondParticipantId: match.participantIds[safe: 1] ?? "",
                                    requiresCharacters: requiresCharacters,
                                    game: game,
                                    onWinnerSelected: { winnerId in
                                        games = games.mapIndexed { gameIndex, current in
                                            gameIndex == index ? current.copying(winnerParticipantId: winnerId) : current
                                        }
                                    },
                                    onEditFirstCharacter: { activePicker = .gameFirst(index) },
                                    onEditSecondCharacter: { activePicker = .gameSecond(index) }
                                )
                            }
                        }
                    }
                }
                .padding(24)
            }

            if let errorMessage {
                Text(errorMessage).foregroundStyle(ManagementPalette.danger).padding(.horizontal, 24)
            }
            HStack {
                Button("Cancel") { dismiss() }.disabled(isSaving)
                    .buttonStyle(.plain)
                    .font(.system(.body, weight: .medium))
                    .foregroundStyle(ManagementPalette.accent)

                Spacer()

                Button(isSaving ? "Guardando..." : "Report") {
                    onSave(games.map { game in
                        let selections: [DetailedReportSelectionRequest]? = requiresCharacters ? [
                            DetailedReportSelectionRequest(
                                participantId: match.participantIds[safe: 0] ?? "",
                                characterName: game.firstCharacter
                            ),
                            DetailedReportSelectionRequest(
                                participantId: match.participantIds[safe: 1] ?? "",
                                characterName: game.secondCharacter
                            ),
                        ].filter {
                            !$0.participantId.isEmpty && !$0.characterName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                        } : nil

                        return DetailedReportGameRequest(
                            expectedRevision: openedRevision,
                            winnerParticipantId: game.winnerParticipantId,
                            selections: selections?.isEmpty == true ? nil : selections
                        )
                    })
                }
                .buttonStyle(.plain)
                .font(.system(.body, weight: .medium))
                .foregroundStyle(canSubmit ? ManagementPalette.accent : .secondary)
                .disabled(!canSubmit || isSaving)
            }
            .padding(.horizontal, 24)
            .padding(.top, 8)
            .padding(.bottom, 20)
        }
        .background(ManagementPalette.quickReportBackground)
        .presentationDetents([.large])
        .interactiveDismissDisabled(isSaving)
        .onAppear {
            baseFirstCharacter = joinedCharacterSelections(match.characterSelections ?? [])[match.participantIds[safe: 0] ?? ""] ?? ""
            baseSecondCharacter = joinedCharacterSelections(match.characterSelections ?? [])[match.participantIds[safe: 1] ?? ""] ?? ""
            openedRevision = match.operationRevision
            games = currentQuickReportGames(match: match)
            let currentScoreKey = currentQuickReportScoreKey(match: match, games: games, effectiveBestOf: effectiveBestOf)
            selectedScoreKey = scoreOptions.contains { $0.key == currentScoreKey } ? currentScoreKey : nil
            if games.isEmpty, let option = scoreOptions.first {
                selectedScoreKey = option.key
                games = buildQuickReportGames(
                    match: match,
                    option: option,
                    firstCharacter: baseFirstCharacter,
                    secondCharacter: baseSecondCharacter
                )
            }
        }
        .sheet(item: $activePicker) { target in
            CharacterPickerSheet(
                gameTitle: gameTitle,
                selectedCharacter: characterValue(for: target),
                characterCount: max(1, match.externalRef?.entrantSize ?? 1)
            ) { selected in
                applyCharacter(selected, for: target)
            }
        }
    }

    private func characterValue(for target: QuickReportPickerTarget) -> String {
        switch target {
        case .baseFirst:
            return baseFirstCharacter
        case .baseSecond:
            return baseSecondCharacter
        case let .gameFirst(index):
            return games[safe: index]?.firstCharacter ?? ""
        case let .gameSecond(index):
            return games[safe: index]?.secondCharacter ?? ""
        }
    }

    private func applyCharacter(_ value: String, for target: QuickReportPickerTarget) {
        switch target {
        case .baseFirst:
            baseFirstCharacter = value
            games = games.map { $0.copying(firstCharacter: value) }
        case .baseSecond:
            baseSecondCharacter = value
            games = games.map { $0.copying(secondCharacter: value) }
        case let .gameFirst(index):
            games = games.mapIndexed { gameIndex, current in
                gameIndex == index ? current.copying(firstCharacter: value) : current
            }
        case let .gameSecond(index):
            games = games.mapIndexed { gameIndex, current in
                gameIndex == index ? current.copying(secondCharacter: value) : current
            }
        }
    }
}

private struct QuickReportCharacterField: View {
    let label: String
    let gameTitle: String
    let selectedCharacter: String
    let onTap: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(label)
                .font(.system(.callout, weight: .semibold))

            Button(action: onTap) {
                HStack(spacing: 12) {
                    CharacterIconView(characterName: selectedCharacter, gameTitle: gameTitle, size: 28)
                    Text(selectedCharacter.isEmpty ? "Select character" : selectedCharacter)
                        .font(.headline.weight(.semibold))
                        .foregroundStyle(.white)
                    Spacer()
                }
                .padding(.horizontal, 18)
                .padding(.vertical, 16)
                .background(Capsule().fill(ManagementPalette.primaryAction))
            }
            .buttonStyle(.plain)
        }
    }
}

private struct QuickReportGameCard: View {
    let gameIndex: Int
    let gameTitle: String
    let firstParticipantName: String
    let secondParticipantName: String
    let firstParticipantId: String
    let secondParticipantId: String
    let requiresCharacters: Bool
    let game: QuickReportGameDraft
    let onWinnerSelected: (String) -> Void
    let onEditFirstCharacter: () -> Void
    let onEditSecondCharacter: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Game \(gameIndex + 1)")
                .font(.system(.body, weight: .semibold))

            HStack(spacing: 12) {
                WinnerPill(
                    title: firstParticipantName,
                    isSelected: game.winnerParticipantId == firstParticipantId,
                    selectedColor: Color(red: 0.11, green: 0.50, blue: 0.24),
                    deselectedColor: ManagementPalette.quickReportDeselectedPill,
                    deselectedTextColor: .primary,
                    action: { onWinnerSelected(firstParticipantId) }
                )
                WinnerPill(
                    title: secondParticipantName,
                    isSelected: game.winnerParticipantId == secondParticipantId,
                    selectedColor: Color(red: 0.11, green: 0.50, blue: 0.24),
                    deselectedColor: ManagementPalette.quickReportDeselectedPill,
                    deselectedTextColor: .primary,
                    action: { onWinnerSelected(secondParticipantId) }
                )
            }

            if requiresCharacters {
                QuickReportCharacterField(
                    label: firstParticipantName,
                    gameTitle: gameTitle,
                    selectedCharacter: game.firstCharacter,
                    onTap: onEditFirstCharacter
                )
                QuickReportCharacterField(
                    label: secondParticipantName,
                    gameTitle: gameTitle,
                    selectedCharacter: game.secondCharacter,
                    onTap: onEditSecondCharacter
                )
            }
        }
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: 20)
                .fill(ManagementPalette.quickReportCardBackground)
        )
    }
}

private struct WinnerPill: View {
    let title: String
    let isSelected: Bool
    let selectedColor: Color
    let deselectedColor: Color
    let deselectedTextColor: Color
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title)
                .font(.headline.weight(.semibold))
                .foregroundStyle(isSelected ? Color.white : deselectedTextColor)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 16)
                .background(Capsule().fill(isSelected ? selectedColor : deselectedColor))
        }
        .buttonStyle(.plain)
    }
}

private struct CharacterPickerSheet: View {
    let gameTitle: String
    let selectedCharacter: String
    var characterCount: Int = 1
    @State private var picks: [String] = []
    @State private var activeMember = 0
    let onSelect: (String) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var query = ""

    private var filteredCharacters: [String] {
        let characters = characterNamesForGame(gameTitle: gameTitle)
        guard !query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return characters }
        return characters.filter { $0.localizedCaseInsensitiveContains(query) }
    }

    var body: some View {
        NavigationStack {
            List {
                if characterCount > 1 {
                    Picker("Team player", selection: $activeMember) {
                        ForEach(0..<characterCount, id: \.self) { index in
                            Text("Player \(index + 1): \(picks[safe: index] ?? "")").tag(index)
                        }
                    }
                }
                ForEach(filteredCharacters, id: \.self) { character in
                    Button {
                        if characterCount == 1 {
                            onSelect(character)
                            dismiss()
                        } else {
                            while picks.count < characterCount { picks.append("") }
                            picks[activeMember] = character
                            activeMember = min(characterCount - 1, activeMember + 1)
                        }
                    } label: {
                        HStack(spacing: 12) {
                            CharacterIconView(characterName: character, gameTitle: gameTitle, size: 28)
                            Text(character)
                                .foregroundStyle(.primary)
                            Spacer()
                            if character == selectedCharacter {
                                Image(systemName: "checkmark")
                                    .foregroundStyle(ManagementPalette.accent)
                            }
                        }
                    }
                    .buttonStyle(.plain)
                }
            }
            .searchable(text: $query, prompt: "Find character")
            .navigationTitle("Choose character")
            .onAppear {
                picks = selectedCharacter.components(separatedBy: " / ")
                while picks.count < characterCount { picks.append("") }
            }
            .toolbar {
                if characterCount > 1 {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button("Save team") {
                            onSelect(picks.joined(separator: " / "))
                            dismiss()
                        }.disabled(picks.count != characterCount || picks.contains(where: { $0.isEmpty }))
                    }
                }
                ToolbarItem(placement: .topBarLeading) {
                    Button("Close") { dismiss() }
                }
            }
        }
    }
}

private struct CharacterIconView: View {
    let characterName: String
    let gameTitle: String
    let size: CGFloat

    var body: some View {
        if characterName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            Color.clear
                .frame(width: size, height: size)
        } else if let uiImage = loadCharacterImage(characterName: characterName, gameTitle: gameTitle) {
            Image(uiImage: uiImage)
                .resizable()
                .scaledToFit()
                .frame(width: size, height: size)
                .padding(4)
                .background(RoundedRectangle(cornerRadius: 8).fill(ManagementPalette.quickReportIconBadgeBackground))
        } else {
            ZStack {
                RoundedRectangle(cornerRadius: 8)
                    .fill(ManagementPalette.quickReportIconBadgeBackground)
                Text(characterName.isEmpty ? "?" : String(characterName.prefix(1)).uppercased())
                    .font(.caption.weight(.bold))
                    .foregroundStyle(.white)
            }
            .frame(width: size, height: size)
        }
    }
}

private enum QuickReportPickerTarget: Identifiable {
    case baseFirst
    case baseSecond
    case gameFirst(Int)
    case gameSecond(Int)

    var id: String {
        switch self {
        case .baseFirst: return "base_first"
        case .baseSecond: return "base_second"
        case let .gameFirst(index): return "game_first_\(index)"
        case let .gameSecond(index): return "game_second_\(index)"
        }
    }
}

private struct QuickReportScoreOption: Identifiable {
    let key: String
    let winnerParticipantId: String
    let winnerScore: Int
    let loserScore: Int

    var id: String { key }
}

private struct QuickReportGameDraft {
    let winnerParticipantId: String
    let firstCharacter: String
    let secondCharacter: String

    func copying(
        winnerParticipantId: String? = nil,
        firstCharacter: String? = nil,
        secondCharacter: String? = nil
    ) -> QuickReportGameDraft {
        QuickReportGameDraft(
            winnerParticipantId: winnerParticipantId ?? self.winnerParticipantId,
            firstCharacter: firstCharacter ?? self.firstCharacter,
            secondCharacter: secondCharacter ?? self.secondCharacter
        )
    }
}

private func buildQuickReportScoreOptions(match: Match, effectiveBestOf: Int) -> [QuickReportScoreOption] {
    guard match.participantIds.count >= 2 else { return [] }
    let winsNeeded = (effectiveBestOf / 2) + 1
    let firstParticipantId = match.participantIds[0]
    let secondParticipantId = match.participantIds[1]
    var options: [QuickReportScoreOption] = []
    for loserScore in 0..<winsNeeded {
        options.append(
            QuickReportScoreOption(
                key: "\(firstParticipantId):\(winsNeeded)-\(loserScore)",
                winnerParticipantId: firstParticipantId,
                winnerScore: winsNeeded,
                loserScore: loserScore
            )
        )
    }
    for loserScore in 0..<winsNeeded {
        options.append(
            QuickReportScoreOption(
                key: "\(secondParticipantId):\(winsNeeded)-\(loserScore)",
                winnerParticipantId: secondParticipantId,
                winnerScore: winsNeeded,
                loserScore: loserScore
            )
        )
    }
    return options
}

private func buildQuickReportGames(
    match: Match,
    option: QuickReportScoreOption,
    firstCharacter: String,
    secondCharacter: String
) -> [QuickReportGameDraft] {
    guard match.participantIds.count >= 2 else { return [] }
    guard let actualLoserId = match.participantIds.first(where: { $0 != option.winnerParticipantId }) else { return [] }
    var games: [QuickReportGameDraft] = []
    for _ in 0..<option.loserScore {
        games.append(QuickReportGameDraft(winnerParticipantId: option.winnerParticipantId, firstCharacter: firstCharacter, secondCharacter: secondCharacter))
        games.append(QuickReportGameDraft(winnerParticipantId: actualLoserId, firstCharacter: firstCharacter, secondCharacter: secondCharacter))
    }
    for _ in 0..<(max(option.winnerScore - option.loserScore - 1, 0)) {
        games.append(QuickReportGameDraft(winnerParticipantId: option.winnerParticipantId, firstCharacter: firstCharacter, secondCharacter: secondCharacter))
    }
    games.append(QuickReportGameDraft(winnerParticipantId: option.winnerParticipantId, firstCharacter: firstCharacter, secondCharacter: secondCharacter))
    return games
}

private func winnerNameForOption(match: Match, option: QuickReportScoreOption) -> String {
    let winnerIndex = match.participantIds.firstIndex(of: option.winnerParticipantId) ?? 0
    return match.participantNames[safe: winnerIndex] ?? "Winner"
}

private func currentQuickReportGames(match: Match) -> [QuickReportGameDraft] {
    guard match.participantIds.count >= 2, let gameResults = match.gameResults, !gameResults.isEmpty else { return [] }
    let firstParticipantId = match.participantIds[0]
    let secondParticipantId = match.participantIds[1]
    let latestSelections = joinedCharacterSelections(match.characterSelections ?? [])
    let selectionsByGame = Dictionary(uniqueKeysWithValues: (match.gameCharacterSelections ?? []).map { ($0.gameNum, joinedCharacterSelections($0.selections)) })

    return gameResults.enumerated().map { index, winnerParticipantId in
        let perGameSelections = selectionsByGame[index + 1] ?? [:]
        return QuickReportGameDraft(
            winnerParticipantId: winnerParticipantId,
            firstCharacter: perGameSelections[firstParticipantId] ?? latestSelections[firstParticipantId] ?? "",
            secondCharacter: perGameSelections[secondParticipantId] ?? latestSelections[secondParticipantId] ?? ""
        )
    }
}

private func currentQuickReportScoreKey(match: Match, games: [QuickReportGameDraft], effectiveBestOf: Int) -> String? {
    guard match.participantIds.count >= 2, !games.isEmpty else { return nil }
    let firstParticipantId = match.participantIds[0]
    let secondParticipantId = match.participantIds[1]
    let firstWins = games.filter { $0.winnerParticipantId == firstParticipantId }.count
    let secondWins = games.filter { $0.winnerParticipantId == secondParticipantId }.count
    let winsNeeded = (effectiveBestOf / 2) + 1

    if firstWins >= winsNeeded {
        return "\(firstParticipantId):\(firstWins)-\(secondWins)"
    }
    if secondWins >= winsNeeded {
        return "\(secondParticipantId):\(secondWins)-\(firstWins)"
    }
    return nil
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
    let matches: [Match]
}

private func buildModernBracketHTML(
    detail: TournamentDetailResponse,
    matches: [Match],
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
        buildModernSectionHTML(section: section, detail: detail, selectableMatchIds: selectableMatchIds)
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
    detail: TournamentDetailResponse,
    selectableMatchIds: Set<String>
) -> String {
    let clustersHtml = section.clusters.map { cluster in
        buildModernClusterHTML(cluster: cluster, detail: detail, selectableMatchIds: selectableMatchIds)
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
    detail: TournamentDetailResponse,
    selectableMatchIds: Set<String>
) -> String {
    let clusterMatches = cluster.rounds.flatMap(\.matches)
    let roundsHtml = cluster.rounds.enumerated().map { index, round in
        let cardsHtml = round.matches.enumerated().map { cardIndex, match in
            buildModernMatchCardHTML(
                detail: detail,
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
    detail: TournamentDetailResponse,
    match: Match,
    roundIndex: Int,
    matchIndex: Int,
    clusterMatches: [Match],
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
            let isAdvanced = (match.advancingParticipantIds ?? []).contains(participantId)
            let isWinner = participantId == match.winnerParticipantId || isAdvanced
            let isLoser = match.winnerParticipantId != nil && !participantId.isEmpty && !isWinner
            let rowClass = isWinner ? "winner" : (isLoser ? "loser" : "")
            let scoreLabel = modernParticipantScoreLabel(match: match, participant: participant)
            let scoreClass = scoreLabel == "DQ" ? "entrant-score dq" : "entrant-score"
            let iconHtml: String
            if scoreLabel != "DQ",
               let characterName = latestCharacterForParticipant(match, participantId: participantId),
               let assetUrl = modernCharacterAssetURL(characterName: characterName, gameTitle: detail.tournament.gameTitle) {
                iconHtml = #"<img class="entrant-icon" src="\#(assetUrl)" alt="" />"#
            } else {
                iconHtml = ""
            }
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
        initialTimerSeconds = calledCountdownSeconds(
            match: match,
            callTimeoutMinutes: detail.tournament.callTimeoutMinutes,
            referenceDate: .now
        ) ?? 0
    case "PLAYING":
        initialTimerSeconds = playingElapsedSeconds(match: match, referenceDate: .now) ?? 0
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
      data-call-timeout-seconds="\(detail.tournament.callTimeoutMinutes * 60)"
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

private func modernParticipantScoreLabel(match: Match, participant: MatchParticipant) -> String {
    let participantId = participant.participantId
    let isAdvanced = (match.advancingParticipantIds ?? []).contains(participantId)
    let walkoverLoser = isWalkoverLoser(match, participantId: participantId, isAdvanced: isAdvanced)
    return walkoverLoser ? "DQ" : "\(participant.score)"
}

private func modernCharacterAssetURL(characterName: String, gameTitle: String) -> String? {
    guard let resource = characterResourceName(characterName, gameTitle: gameTitle) else { return nil }
    let directory = isRoa2GameTitle(gameTitle) ? "roa2-stock-icons" : "smash-stock-icons"
    guard let url = Bundle.main.url(forResource: resource, withExtension: "png", subdirectory: directory) else {
        return nil
    }
    return url.absoluteString
}

private func buildIOSModernSections(matches: [Match]) -> [IOSModernSection] {
    let sortedMatches = matches.sorted {
        if stageSortOrder($0.bracketStage) != stageSortOrder($1.bracketStage) {
            return stageSortOrder($0.bracketStage) < stageSortOrder($1.bracketStage)
        }
        let leftPhaseOrder = $0.externalRef?.phaseOrder ?? Int.max
        let rightPhaseOrder = $1.externalRef?.phaseOrder ?? Int.max
        if leftPhaseOrder != rightPhaseOrder { return leftPhaseOrder < rightPhaseOrder }
        if ($0.externalRef?.phaseName ?? "") != ($1.externalRef?.phaseName ?? "") {
            return naturalLabelLessThan($0.externalRef?.phaseName ?? "", $1.externalRef?.phaseName ?? "")
        }
        if ($0.poolLabel ?? "") != ($1.poolLabel ?? "") {
            return naturalLabelLessThan($0.poolLabel ?? "", $1.poolLabel ?? "")
        }
        if $0.roundNumber != $1.roundNumber { return $0.roundNumber < $1.roundNumber }
        return $0.matchNumber < $1.matchNumber
    }

    var sections: [IOSModernSection] = []
    sections.append(contentsOf: buildIOSModernPoolSections(poolMatches: sortedMatches.filter(\.isPoolPhaseMatch)))

    let bracketGrouped = Dictionary(grouping: sortedMatches.filter { !$0.isPoolPhaseMatch }) { match -> String in
        if modernHasExplicitPhaseStructure(match) {
            return match.externalRef?.phaseId ?? match.externalRef?.phaseName ?? "__main_bracket__"
        }
        return "__main_bracket__"
    }

    for key in bracketGrouped.keys.sorted(by: naturalLabelLessThan) {
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
            ? naturalLabelLessThan($0.label, $1.label)
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

private func modernHasExplicitPhaseStructure(_ match: Match) -> Bool {
    guard let phaseName = match.externalRef?.phaseName?.trimmingCharacters(in: .whitespacesAndNewlines), !phaseName.isEmpty else {
        return false
    }
    if match.isPoolPhaseMatch { return false }
    if phaseName.caseInsensitiveCompare(match.bracketStage) == .orderedSame { return false }
    if phaseName.caseInsensitiveCompare("bracket") == .orderedSame { return false }
    return true
}

private func buildIOSModernPoolSections(poolMatches: [Match]) -> [IOSModernSection] {
    guard !poolMatches.isEmpty else { return [] }
    let explicitGroups = Dictionary(grouping: poolMatches.filter { !($0.externalRef?.phaseGroupName?.isEmpty ?? true) }) { $0.externalRef?.phaseGroupName ?? "Pool" }
        .map { key, matches in
            modernPoolSectionFromMatches(id: "pool:\(key)", label: key, matches: matches)
        }

    let fallbackMatches = poolMatches.filter { $0.externalRef?.phaseGroupName?.isEmpty ?? true }
    let fallbackGroups = modernConnectedPoolGroups(matches: fallbackMatches).enumerated().map { index, group in
        modernPoolSectionFromMatches(id: "pool:local:\(index)", label: "Pool \(index + 1)", matches: group)
    }

    return (explicitGroups + fallbackGroups).sorted { naturalLabelLessThan($0.label, $1.label) }
}

private func modernConnectedPoolGroups(matches: [Match]) -> [[Match]] {
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
    var groups: [[Match]] = []
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

private func modernPoolSectionFromMatches(id: String, label: String, matches: [Match]) -> IOSModernSection {
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

private func modernTournamentSectionFromMatches(id: String, label: String, matches: [Match]) -> IOSModernSection {
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

private func modernClusterFromStageGroups(id: String, label: String, stageGroups: [(String, [Match])]) -> IOSModernCluster {
    let rounds = stageGroups.flatMap { stage, stageMatches -> [IOSModernRound] in
        let grouped = Dictionary(grouping: stageMatches, by: \.roundNumber)
        return grouped.keys.sorted().map { roundNumber in
            IOSModernRound(
                id: "\(id):\(stage):\(roundNumber)",
                title: grouped[roundNumber]?.first?.roundLabel ?? modernRoundTitle(stage: stage, round: roundNumber, totalRounds: grouped.count),
                matches: (grouped[roundNumber] ?? []).sorted { $0.matchNumber < $1.matchNumber }
            )
        }
    }
    return IOSModernCluster(id: id, label: label, rounds: rounds)
}

private func modernClusterFromMatches(id: String, label: String, matches: [Match]) -> IOSModernCluster {
    let grouped = Dictionary(grouping: matches, by: \.roundNumber)
    let rounds = grouped.keys.sorted().map { roundNumber in
        IOSModernRound(
            id: "\(id):\(roundNumber)",
            title: grouped[roundNumber]?.first?.roundLabel ?? modernRoundTitle(stage: matches.first?.bracketStage ?? "WINNERS", round: roundNumber, totalRounds: grouped.count),
            matches: (grouped[roundNumber] ?? []).sorted { $0.matchNumber < $1.matchNumber }
        )
    }
    return IOSModernCluster(id: id, label: label, rounds: rounds)
}

private func modernTournamentBracketLabel(match: Match) -> String {
    let phaseName = match.externalRef?.phaseName?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
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

private func modernSourceMatchIds(match: Match, candidateMatches: [Match] = []) -> [String] {
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

private func modernFeedsParticipant(match: Match, participantId: String) -> Bool {
    if participantId.isEmpty { return false }
    if (match.advancingParticipantIds ?? []).contains(participantId) { return true }
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

private enum NaturalLabelPart: Comparable {
    case number(Int)
    case text(String)

    static func < (lhs: NaturalLabelPart, rhs: NaturalLabelPart) -> Bool {
        switch (lhs, rhs) {
        case let (.number(left), .number(right)):
            return left < right
        case let (.text(left), .text(right)):
            return left.localizedCaseInsensitiveCompare(right) == .orderedAscending
        case (.number, .text):
            return true
        case (.text, .number):
            return false
        }
    }
}

private func naturalLabelParts(_ value: String) -> [NaturalLabelPart] {
    let pattern = #"\d+|\D+"#
    let regex = try? NSRegularExpression(pattern: pattern)
    let range = NSRange(location: 0, length: value.utf16.count)
    let matches = regex?.matches(in: value, range: range) ?? []
    return matches.compactMap { match in
        guard let range = Range(match.range, in: value) else { return nil }
        let chunk = String(value[range])
        if let number = Int(chunk.trimmingCharacters(in: .whitespacesAndNewlines)) {
            return .number(number)
        }
        return .text(chunk)
    }
}

private func naturalLabelLessThan(_ left: String, _ right: String) -> Bool {
    let leftParts = naturalLabelParts(left)
    let rightParts = naturalLabelParts(right)
    let count = min(leftParts.count, rightParts.count)
    for index in 0..<count {
        if leftParts[index] != rightParts[index] {
            return leftParts[index] < rightParts[index]
        }
    }
    return leftParts.count < rightParts.count
}

private func stageSortOrder(_ stage: String) -> Int {
    switch stage.uppercased() {
    case "POOLS": return 0
    case "WINNERS": return 1
    case "LOSERS": return 2
    case "FINALS": return 3
    case "LADDER": return 4
    default: return 5
    }
}

private func stageLessThan(_ left: String, _ right: String) -> Bool {
    let leftOrder = stageSortOrder(left)
    let rightOrder = stageSortOrder(right)
    if leftOrder != rightOrder {
        return leftOrder < rightOrder
    }
    return naturalLabelLessThan(left, right)
}

private func matchDisplayOrder(_ left: Match, _ right: Match) -> Bool {
    if stageSortOrder(left.bracketStage) != stageSortOrder(right.bracketStage) {
        return stageSortOrder(left.bracketStage) < stageSortOrder(right.bracketStage)
    }
    if (left.poolLabel ?? "") != (right.poolLabel ?? "") {
        return naturalLabelLessThan(left.poolLabel ?? "", right.poolLabel ?? "")
    }
    if left.roundNumber != right.roundNumber {
        return left.roundNumber < right.roundNumber
    }
    return left.matchNumber < right.matchNumber
}

private func activeMatchDisplayOrder(_ left: Match, _ right: Match) -> Bool {
    let leftPriority = activeMatchPriority(left)
    let rightPriority = activeMatchPriority(right)
    if leftPriority != rightPriority {
        return leftPriority < rightPriority
    }

    let leftTimeline = activeMatchTimelineAnchor(left)
    let rightTimeline = activeMatchTimelineAnchor(right)
    if leftTimeline != rightTimeline {
        switch (leftTimeline, rightTimeline) {
        case let (lhs?, rhs?):
            return lhs < rhs
        case (_?, nil):
            return true
        case (nil, _?):
            return false
        case (nil, nil):
            break
        }
    }

    return matchDisplayOrder(left, right)
}

private func operationsModernCanInteractWithMatch(_ match: Match, isStartggMirrored: Bool) -> Bool {
    guard hasResolvedContenders(match) else { return false }
    switch match.status {
    case "PENDING", "CALLED", "CHECKED_IN", "PLAYING", "COMPLETED", "WALKOVER", "RESULT_REPORTED", "UNDER_REVIEW":
        return true
    default:
        return isStartggMirrored && !match.status.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }
}

private let managementSmashUltimateCharacterNames = [
    "Bayonetta", "Bowser Jr.", "Bowser", "Captain Falcon", "Cloud", "Corrin", "Daisy", "Dark Pit",
    "Diddy Kong", "Donkey Kong", "Dr. Mario", "Duck Hunt", "Falco", "Fox", "Ganondorf", "Greninja",
    "Ice Climbers", "Ike", "Inkling", "Jigglypuff", "King Dedede", "Kirby", "Link", "Little Mac",
    "Lucario", "Lucas", "Lucina", "Luigi", "Mario", "Marth", "Mega Man", "Meta Knight", "Mewtwo",
    "Mii Brawler", "Ness", "Olimar", "Pac-Man", "Palutena", "Peach", "Pichu", "Pikachu", "Pit",
    "Pokemon Trainer", "Ridley", "R.O.B.", "Robin", "Rosalina", "Roy", "Ryu", "Samus", "Sheik",
    "Shulk", "Snake", "Sonic", "Toon Link", "Villager", "Wario", "Wii Fit Trainer", "Wolf", "Yoshi",
    "Young Link", "Zelda", "Zero Suit Samus", "Mr. Game & Watch", "Incineroar", "King K. Rool",
    "Dark Samus", "Chrom", "Ken", "Simon Belmont", "Richter", "Isabelle", "Mii Swordfighter",
    "Mii Gunner", "Piranha Plant", "Joker", "Hero", "Banjo-Kazooie", "Terry", "Byleth",
    "Random Character", "Min Min", "Steve", "Sephiroth", "Pyra & Mythra", "Kazuya", "Sora"
]

private func isSmashUltimateGameTitle(_ gameTitle: String) -> Bool {
    gameTitle.localizedCaseInsensitiveContains("smash") || gameTitle.localizedCaseInsensitiveContains("ultimate")
}

private func isRoa2GameTitle(_ gameTitle: String) -> Bool {
    let normalized = gameTitle.lowercased()
    return normalized.contains("rivals of aether") || normalized.contains("rivals 2") || normalized.contains("roa")
}

private func characterNamesForGame(gameTitle: String) -> [String] {
    isRoa2GameTitle(gameTitle) ? ["Random", "Zetterburn", "Orcane", "Wrastor", "Kragg", "Forsburn", "Maypul", "Absa", "Etalus", "Ranno", "Clairen", "Olympia", "Fleet", "Loxodont", "Galvan", "La Reina", "Slade"] : managementSmashUltimateCharacterNames
}

private func loadCharacterImage(characterName: String, gameTitle: String) -> UIImage? {
    guard let resource = characterResourceName(characterName, gameTitle: gameTitle) else { return nil }
    let directory = isRoa2GameTitle(gameTitle) ? "roa2-stock-icons" : "smash-stock-icons"

    if let path = Bundle.main.path(forResource: resource, ofType: "png", inDirectory: directory) {
        return UIImage(contentsOfFile: path)
    }
    if let path = Bundle.main.path(forResource: resource, ofType: "png") {
        return UIImage(contentsOfFile: path)
    }
    return nil
}

private func characterResourceName(_ characterName: String, gameTitle: String) -> String? {
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

private extension Array {
    func mapIndexed<T>(_ transform: (Int, Element) -> T) -> [T] {
        enumerated().map(transform)
    }
}

private struct LadderSection: View {
    @State private var showControl = false
    @EnvironmentObject private var viewModel: TournamentManagerViewModel
    let detail: TournamentDetailResponse

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Button("Start ladder") { Task { await viewModel.startLadder() } }.disabled(detail.ladder?.session?.status == "ACTIVE" || viewModel.isMutating)
                    .managementPrimaryButton()
                Button("Close registration") { Task { await viewModel.finalizeLadder() } }.disabled(detail.ladder?.session?.status != "ACTIVE" || viewModel.isMutating)
                    .buttonStyle(.bordered)
            }

            Button("Control, settings and results") { showControl = true }
                .managementPrimaryButton()
                .sheet(isPresented: $showControl) { LadderControlView(tournamentId: detail.tournament.id, participants: detail.participants) }
            if let ladder = detail.ladder {
                if let session = ladder.session {
                    Text(session.options?.closing == true ? "Registration closed · finishing sets" : session.options?.paused == true ? "Ladder paused" : "Status: \(session.status)")
                }
                if !ladder.queue.isEmpty {
                    Text("Queue").font(.headline)
                    ForEach(ladder.queue) { entry in
                        Text(entry.displayName)
                    }
                }
                if !ladder.activeMatches.isEmpty {
                    Text("Active matches").font(.headline)
                    ForEach(ladder.activeMatches) { match in
                        Text("\(match.label): \(match.participantsLabel) · \(ladderControlStatus(match.status)) · \(match.stationLabel ?? "No setup")")
                    }
                }
                if !ladder.standings.isEmpty {
                    Text("Standings").font(.headline)
                    ForEach(ladder.standings) { standing in
                        Text("\(standing.displayName) · \(standing.wins)-\(standing.losses)")
                    }
                }
            } else {
                Text("The ladder is not active in this tournament.")
                    .foregroundStyle(.secondary)
            }
        }
    }
}

private struct FlowActions<Content: View>: View {
    @ViewBuilder let content: Content

    var body: some View {
        ViewThatFits {
            HStack(spacing: 8) { content }
            VStack(alignment: .leading, spacing: 8) { content }
        }
    }
}

private extension Array {
    subscript(safe index: Int) -> Element? {
        guard indices.contains(index) else { return nil }
        return self[index]
    }
}

private func mainMatchStatusLabel(_ status: String) -> String {
    switch status {
    case "PENDING": return "Pending"
    case "CALLED": return "Called"
    case "PLAYING": return "Playing"
    case "COMPLETED": return "Finished"
    case "WALKOVER": return "Resolved due to absence"
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
