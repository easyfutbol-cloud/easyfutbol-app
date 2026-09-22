import Foundation

/// Mismo backend que usa la app de móvil — mismas rutas, mismo formato de
/// respuesta ({ok, data, msg, ...}). El reloj llama directamente: cuando el
/// reloj tiene Bluetooth con el iPhone cerca, iOS le da conexión a través del
/// teléfono automáticamente sin que la app tenga que hacer nada especial;
/// cuando no hay conexión, las llamadas simplemente fallan y se reintentan.
enum APIError: Error {
    case network(String)
    case server(String)
    case decoding
}

final class NetworkClient {
    static let shared = NetworkClient()
    private init() {}

    // Mismo dominio que usa el resto de la app (ver src/api/client.js).
    private let baseURL = URL(string: "https://api.easyfutbol.es/api")!

    private func request(_ path: String, method: String = "GET", body: [String: Any]? = nil, token: String? = nil) async throws -> Data {
        var url = baseURL
        url.append(path: path)

        var req = URLRequest(url: url)
        req.httpMethod = method
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let token {
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        if let body {
            req.httpBody = try JSONSerialization.data(withJSONObject: body)
        }

        // Timeout corto: en el campo, si no hay conexión queremos fallar
        // rápido y seguir apuntando eventos sin bloquear la interfaz.
        req.timeoutInterval = 8

        do {
            let (data, response) = try await URLSession.shared.data(for: req)
            guard let http = response as? HTTPURLResponse else { throw APIError.network("Sin respuesta") }
            if http.statusCode >= 400 {
                let parsed = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
                let msg = (parsed ?? nil)?["msg"] as? String
                throw APIError.server(msg ?? "Error \(http.statusCode)")
            }
            return data
        } catch let error as APIError {
            throw error
        } catch {
            throw APIError.network(error.localizedDescription)
        }
    }

    func login(email: String, password: String) async throws -> LoginResponse {
        let data = try await request("/auth/login", method: "POST", body: ["email": email, "password": password])
        guard let decoded = try? JSONDecoder().decode(LoginResponse.self, from: data) else { throw APIError.decoding }
        return decoded
    }

    func fetchUpcomingMatches(token: String) async throws -> [AdminMatch] {
        let data = try await request("/admin/matches", token: token)
        guard let decoded = try? JSONDecoder().decode([AdminMatch].self, from: data) else { throw APIError.decoding }
        return decoded
    }

    func fetchRoster(matchId: Int, token: String) async throws -> RosterResponse {
        let data = try await request("/admin/matches/\(matchId)/roster", token: token)
        guard let decoded = try? JSONDecoder().decode(RosterResponse.self, from: data) else { throw APIError.decoding }
        return decoded
    }

    /// Envía un evento ya creado localmente. Lanza si falla (sin conexión, etc.) — el llamador decide si lo reintenta luego.
    func sendEvent(_ event: PendingEvent, token: String) async throws {
        var body: [String: Any] = [
            "type": event.type.rawValue,
            "user_id": event.userId,
        ]
        if let minute = event.minute { body["minute"] = minute }
        if let assistUserId = event.assistUserId { body["assist_user_id"] = assistUserId }
        if let teamColor = event.teamColor { body["team_color"] = teamColor }

        _ = try await request("/admin/matches/\(event.matchId)/events", method: "POST", body: body, token: token)
    }
}
