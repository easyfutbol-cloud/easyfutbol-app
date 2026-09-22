import Foundation
import Combine

/// Intenta subir la cola de eventos pendientes. Se llama al abrir la app,
/// al volver a primer plano, y con un botón manual — no hace falta nada más
/// listo porque el envío de cada evento ya falla rápido (8s) si no hay red.
@MainActor
final class SyncManager: ObservableObject {
    static let shared = SyncManager()
    private init() {}

    @Published var isSyncing = false
    @Published var lastError: String?

    func syncNow() async {
        guard !isSyncing else { return }
        guard let token = OfflineStore.shared.token else { return }

        isSyncing = true
        lastError = nil
        defer { isSyncing = false }

        let pending = OfflineStore.shared.state.events.filter { $0.status != .synced }
        for event in pending {
            do {
                try await NetworkClient.shared.sendEvent(event, token: token)
                OfflineStore.shared.updateEventStatus(event.id, status: .synced)
            } catch {
                // Nos quedamos con este en cola y seguimos con el resto —
                // un fallo (p.ej. sin conexión) no debe bloquear los demás,
                // ni perder el evento.
                lastError = "Sin conexión — se reintentará más tarde"
                continue
            }
        }
    }
}
