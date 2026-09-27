import Foundation

enum BackendConfig {
    static let appTitle = "Smash Tournaments"
    static let bundleIdentifier = "com.example.tournamentmanager.ios"
    static let callbackScheme = "tournamentmanager"
    static let baseURL = URL(string: "https://your-domain.example/")!
    static let displayWebURL = URL(string: "https://your-domain.example/")!
    static let appClientKey = "replace_with_your_app_client_key"
    static let supportsLadder = true
    static let defaultAdminDeleteKey = ""
}
