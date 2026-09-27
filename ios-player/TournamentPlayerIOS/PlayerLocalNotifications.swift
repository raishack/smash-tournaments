import Foundation
import UserNotifications

enum PlayerLocalNotifications {
    private static let notifiedKeysStore = "smash_galicia_player_local_notified_keys"

    static func requestAuthorizationIfNeeded() {
        let center = UNUserNotificationCenter.current()
        center.requestAuthorization(options: [.alert, .badge, .sound]) { _, _ in }
    }

    static func syncNotifications(for tournaments: [PlayerTournament]) {
        let currentKeys = Set(notificationCandidates(from: tournaments).map(\.key))
        let defaults = UserDefaults.standard
        let previousKeys = Set(defaults.stringArray(forKey: notifiedKeysStore) ?? [])
        let newCandidates = notificationCandidates(from: tournaments).filter { !previousKeys.contains($0.key) }

        for candidate in newCandidates {
            scheduleNow(identifier: candidate.key, title: candidate.title, body: candidate.body)
        }

        defaults.set(Array(currentKeys), forKey: notifiedKeysStore)
    }

    private static func notificationCandidates(from tournaments: [PlayerTournament]) -> [NotificationCandidate] {
        var candidates: [NotificationCandidate] = []

        for tournament in tournaments {
            for match in tournament.activeMatches where match.status == "CALLED" {
                candidates.append(
                    NotificationCandidate(
                        key: "match_called_\(match.id)",
                        title: "Te toca jugar",
                        body: calledMatchBody(match: match, tournamentTitle: tournament.title)
                    )
                )
            }

            if let readyCheck = tournament.ladder?.readyCheckMatch, readyCheck.status == "READY_CHECK" {
                candidates.append(
                    NotificationCandidate(
                        key: "ladder_ready_\(readyCheck.id)",
                        title: "Partida de ladder encontrada",
                        body: ladderReadyBody(match: readyCheck, tournamentTitle: tournament.title)
                    )
                )
            }
        }

        return candidates
    }

    private static func calledMatchBody(match: PlayerMatch, tournamentTitle: String) -> String {
        var parts: [String] = [
            tournamentTitle,
            match.roundLabel,
            "\(match.myDisplayName) vs \(match.opponentDisplayName ?? "Rival")",
        ]
        if let station = match.stationLabel, !station.isEmpty {
            parts.append("Estación \(station)")
        }
        return parts.joined(separator: " · ")
    }

    private static func ladderReadyBody(match: PlayerMatch, tournamentTitle: String) -> String {
        "\(tournamentTitle) · \(match.myDisplayName) vs \(match.opponentDisplayName ?? "Rival")"
    }

    private static func scheduleNow(identifier: String, title: String, body: String) {
        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        content.sound = .default

        let request = UNNotificationRequest(identifier: identifier, content: content, trigger: nil)
        UNUserNotificationCenter.current().add(request) { _ in }
    }
}

private struct NotificationCandidate {
    let key: String
    let title: String
    let body: String
}
