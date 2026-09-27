import Foundation

enum BackendConfig {
    static let appTitle = "Smash Players"
    static let bundleIdentifier = "com.example.tournamentplayer.ios"
    static let baseURL = URL(string: "https://your-domain.example/")!
    static let appClientKey = "replace_with_your_app_client_key"
    static let redirectURI = "tournamentplayer://auth/callback"
}
