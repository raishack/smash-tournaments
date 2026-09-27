// Compiled with the actual ManagementAPIClient source by scripts/prepare-ios-api-check.mjs.
// All HTTP responses are local fixtures; no backend or start.gg access is used.
enum BackendConfig {
    static let baseURL = URL(string: "https://main-api-test.invalid/")!
    static let appClientKey = "fixture-key"
}

final class MemorySessionStorage: ManagementSessionStorage {
    var data: Data?
    func read() throws -> Data? { data }
    func write(_ data: Data) throws { self.data = data }
    func clear() throws { data = nil }
}

final class FixtureProtocol: URLProtocol {
    static var reports = 0
    static var loginCount = 0
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func stopLoading() {}
    override func startLoading() {
        let url = request.url!
        precondition(url.host == "main-api-test.invalid")
        precondition(request.value(forHTTPHeaderField: "X-App-Key") == "fixture-key")
        precondition(request.value(forHTTPHeaderField: "X-Client-Platform") == "iOS")
        let code: Int
        let body: String
        var headers = ["Content-Type": "application/json"]
        precondition(request.value(forHTTPHeaderField: "X-Admin-Key") == nil)
        if !url.path.contains("management-auth/login") {
            precondition(request.value(forHTTPHeaderField: "Authorization") == "Bearer " + String(repeating: "a", count: 64))
        }
        switch url.path {
        case "/api/management-auth/login":
            Self.loginCount += 1
            code = 200; body = "{\"token\":\"" + String(repeating: "a", count: 64) + "\",\"expiresAt\":9999999999999,\"user\":{\"id\":\"staff\",\"username\":\"gestor\",\"role\":\"MANAGER\"}}"
        case "/forbidden":
            code = 403; body = "{\"message\":\"Solo superadmin\"}"
        case "/expired":
            code = 401; body = "{\"message\":\"Sesion caducada\"}"
        case "/api/management-auth/logout":
            code = 204; body = ""
        case "/api/tournaments/import/startgg":
            precondition(url.query == nil)
            code = 202; body = "{\"state\":\"RUNNING\"}"
        case "/api/tournaments/t1/import/startgg":
            precondition(url.query == "background=true")
            precondition(!url.absoluteString.contains("%3F"))
            code = 202; body = "{\"state\":\"RUNNING\"}"
        case "/invalid":
            code = 400; body = "{\"message\":\"Selecciona los personajes\"}"
        case "/empty":
            code = 204; body = ""
        case "/api/tournaments/t1/matches/m1/game-win":
            precondition(UUID(uuidString: request.value(forHTTPHeaderField: "X-Operation-Id") ?? "") != nil)
            precondition(request.value(forHTTPHeaderField: "X-Match-Revision") == String(repeating: Self.reports == 0 ? "a" : "b", count: 64))
            Self.reports += 1
            code = 200; body = "{\"state\":\"OK\"}"
            headers["X-Match-Revision"] = String(repeating: "b", count: 64)
        case "/diagnostic-error":
            code = 409; body = "{\"message\":\"token=hidden-value https://host/path?secret=url-hidden\"}"
        default:
            preconditionFailure("Unexpected request: \(url)")
        }
        client?.urlProtocol(self, didReceive: HTTPURLResponse(url: url, statusCode: code, httpVersion: nil, headerFields: headers)!, cacheStoragePolicy: .notAllowed)
        if !body.isEmpty { client?.urlProtocol(self, didLoad: Data(body.utf8)) }
        client?.urlProtocolDidFinishLoading(self)
    }
}

@main
struct APIClientChecks {
    struct Job: Decodable { let state: String }
    @MainActor static func main() async throws {
        URLProtocol.registerClass(FixtureProtocol.self)
        let account = ManagementAccount.shared
        let storage = MemorySessionStorage()
        let initial = ManagementAccount(storage: storage)
        try await initial.login(username: "gestor", password: "fixture-password")
        precondition(!String(data: storage.data!, encoding: .utf8)!.contains("fixture-password"))
        let reopened = ManagementAccount(storage: storage)
        precondition(reopened.token == initial.token)
        reopened.invalidate("outdated-response")
        precondition(storage.data != nil)
        await reopened.logout()
        precondition(storage.data == nil && ManagementAccount(storage: storage).token.isEmpty)
        for invalid in ["{}", "not-json", "{\"token\":\"" + String(repeating: "a", count: 64) + "\",\"expiresAt\":1,\"user\":{\"id\":\"staff\",\"username\":\"gestor\",\"role\":\"MANAGER\"}}"] {
            storage.data = Data(invalid.utf8)
            precondition(ManagementAccount(storage: storage).token.isEmpty && storage.data == nil)
        }
        try await account.login(username: "gestor", password: "fixture-password")
        precondition(account.session?.user.role == "MANAGER")
        let api = ManagementAPIClient()
        let created: Job = try await api.post("api/tournaments/import/startgg", body: ["eventUrl": "fixture"])
        precondition(created.state == "RUNNING")
        let imported: Job = try await api.post("api/tournaments/t1/import/startgg", queryItems: [URLQueryItem(name: "background", value: "true")], body: ["eventUrl": "fixture"])
        precondition(imported.state == "RUNNING")
        do {
            let _: Job = try await api.get("invalid")
            preconditionFailure("Expected HTTP error")
        } catch ManagementAPIError.http(let code, let message) {
            precondition(code == 400 && message == "Selecciona los personajes")
        }
        do {
            let _: Job = try await api.get("empty")
            preconditionFailure("Expected invalid response without crashing")
        } catch ManagementAPIError.invalidResponse {}
        try await api.postVoid("empty", body: [String: String]())
        let oldRead = ManagementOperationNetwork.shared.begin()
        ManagementOperationNetwork.shared.remember("m1", revision: String(repeating: "a", count: 64), request: oldRead)
        let _: Job = try await api.post("api/tournaments/t1/matches/m1/game-win", body: ["participantId": "p1"])
        ManagementOperationNetwork.shared.remember("m1", revision: String(repeating: "a", count: 64), request: oldRead)
        let _: Job = try await api.post("api/tournaments/t1/matches/m1/game-win", body: ["participantId": "p1"])
        do { let _: Job = try await api.get("diagnostic-error"); preconditionFailure("Expected conflict") }
        catch ManagementAPIError.http(let code, _) { precondition(code == 409) }
        let diagnostic = ManagementOperationNetwork.shared.diagnostics()
        precondition(diagnostic.contains("HTTP 409"))
        precondition(!diagnostic.contains("hidden-value") && !diagnostic.contains("url-hidden"))
        do { let _: Job = try await api.get("forbidden"); preconditionFailure("Expected 403") }
        catch ManagementAPIError.http(let code, _) { precondition(code == 403) }
        precondition(!account.token.isEmpty)
        account.invalidate("old-response-token")
        precondition(!account.token.isEmpty)
        do { let _: Job = try await api.get("expired"); preconditionFailure("Expected 401") }
        catch ManagementAPIError.http(let code, _) { precondition(code == 401) }
        precondition(account.token.isEmpty)
        try await account.login(username: "gestor", password: "fixture-password")
        await account.logout()
        precondition(account.token.isEmpty && FixtureProtocol.loginCount == 3)
        print("PASS: session restore/expiry/corruption/logout, management login/Bearer/403/401 and import URLs, 202, errors, empty responses, operation/revision headers, late refresh and diagnostic redaction")
    }
}
