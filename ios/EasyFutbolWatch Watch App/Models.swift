import Foundation

// MARK: - API models (mismas formas que ya usa la app de móvil)

struct LoginResponse: Codable {
    let ok: Bool
    let user: APIUser?
    let token: String?
    let msg: String?
}

struct APIUser: Codable {
    let id: Int
    let name: String
    let email: String?
    let role: String?
}

struct AdminMatch: Codable, Identifiable, Hashable {
    let id: Int
    let title: String?
    let city: String?
    let field_name: String?
    let local_match_date: String?
    let local_start_time: String?
    let status: String?
}

struct RosterResponse: Codable {
    let ok: Bool?
    let match: RosterMatch?
    let white: [RosterPlayer]?
    let black: [RosterPlayer]?
}

struct RosterMatch: Codable {
    let id: Int
    let title: String?
}

struct RosterPlayer: Codable, Identifiable, Hashable {
    let inscription_id: Int?
    let user_id: Int
    let name: String
    let avatar_url: String?

    var id: Int { user_id }
}

/// Jugador ya con su color, para el selector unificado (blancos + negros).
struct TeamPlayer: Identifiable, Hashable {
    let userId: Int
    let name: String
    let color: String // "white" | "black"
    var id: Int { userId }
}

// MARK: - Cola local (sin conexión durante el partido)

enum PendingEventType: String, Codable {
    case goal, save, mvp
}

struct PendingEvent: Codable, Identifiable {
    var id: UUID = UUID()
    let matchId: Int
    let type: PendingEventType
    let minute: Int?
    let userId: Int
    let assistUserId: Int?
    let teamColor: String?
    var status: PendingStatus = .queued
    var createdAt: Date = Date()
}

enum PendingStatus: String, Codable {
    case queued
    case synced
    case failed
}

/// Lo que se guarda en disco: el partido activo, su plantilla cacheada, y la cola de eventos.
struct WatchState: Codable {
    var activeMatchId: Int?
    var activeMatchTitle: String?
    var roster: [TeamPlayerCodable] = []
    var events: [PendingEvent] = []
}

/// TeamPlayer necesita ser Codable para guardarse en disco (Hashable no hace falta aquí).
struct TeamPlayerCodable: Codable, Identifiable, Hashable {
    let userId: Int
    let name: String
    let color: String
    var id: Int { userId }

    init(_ p: TeamPlayer) {
        userId = p.userId
        name = p.name
        color = p.color
    }
}
