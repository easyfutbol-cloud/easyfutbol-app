import Foundation
import Combine

/// Guarda el estado (sesión, partido activo, plantilla cacheada, cola de
/// eventos) en un fichero JSON en el reloj, para que sobreviva si se cierra
/// la app en mitad del partido sin conexión.
@MainActor
final class OfflineStore: ObservableObject {
    static let shared = OfflineStore()

    @Published var token: String?
    @Published var userName: String?
    @Published var state = WatchState()

    private let stateFileURL: URL
    private let tokenKey = "easyfutbol_watch_token"
    private let userNameKey = "easyfutbol_watch_user_name"

    private init() {
        let dir = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        stateFileURL = dir.appendingPathComponent("watch_state.json")
        token = UserDefaults.standard.string(forKey: tokenKey)
        userName = UserDefaults.standard.string(forKey: userNameKey)
        load()
    }

    var isLoggedIn: Bool { token != nil }

    func saveLogin(token: String, userName: String) {
        self.token = token
        self.userName = userName
        UserDefaults.standard.set(token, forKey: tokenKey)
        UserDefaults.standard.set(userName, forKey: userNameKey)
    }

    func logout() {
        token = nil
        userName = nil
        UserDefaults.standard.removeObject(forKey: tokenKey)
        UserDefaults.standard.removeObject(forKey: userNameKey)
        state = WatchState()
        persist()
    }

    func setActiveMatch(id: Int, title: String, roster: [TeamPlayer]) {
        state.activeMatchId = id
        state.activeMatchTitle = title
        state.roster = roster.map(TeamPlayerCodable.init)
        persist()
    }

    func clearActiveMatch() {
        state.activeMatchId = nil
        state.activeMatchTitle = nil
        state.roster = []
        persist()
    }

    func enqueue(_ event: PendingEvent) {
        state.events.append(event)
        persist()
    }

    func removeEvent(_ id: UUID) {
        state.events.removeAll { $0.id == id }
        persist()
    }

    func updateEventStatus(_ id: UUID, status: PendingStatus) {
        guard let idx = state.events.firstIndex(where: { $0.id == id }) else { return }
        state.events[idx].status = status
        persist()
    }

    var pendingCount: Int {
        state.events.filter { $0.status != .synced }.count
    }

    private func persist() {
        guard let data = try? JSONEncoder().encode(state) else { return }
        try? data.write(to: stateFileURL, options: .atomic)
    }

    private func load() {
        guard let data = try? Data(contentsOf: stateFileURL),
              let decoded = try? JSONDecoder().decode(WatchState.self, from: data) else { return }
        state = decoded
    }
}
