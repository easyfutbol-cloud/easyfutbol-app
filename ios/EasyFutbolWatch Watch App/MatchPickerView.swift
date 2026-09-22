import SwiftUI

/// Se usa antes del partido, con conexión: elige el partido y descarga su
/// plantilla para poder apuntar eventos sin conexión durante el juego.
/// Los partidos se agrupan por día (Hoy / Mañana / día de la semana) para
/// no tener que buscar entre un listado plano de todos los partidos.
struct MatchPickerView: View {
    @ObservedObject var store = OfflineStore.shared

    @State private var matches: [AdminMatch] = []
    @State private var loading = true
    @State private var loadingMatchId: Int?
    @State private var errorMessage: String?

    private var upcomingGroups: [(key: String, label: String, matches: [AdminMatch])] {
        let today = Self.isoDateFormatter.string(from: Date())
        let upcoming = matches
            .filter { ($0.local_match_date ?? "") >= today }
            .sorted {
                let d0 = $0.local_match_date ?? "", d1 = $1.local_match_date ?? ""
                if d0 != d1 { return d0 < d1 }
                return ($0.local_start_time ?? "") < ($1.local_start_time ?? "")
            }

        var order: [String] = []
        var byDate: [String: [AdminMatch]] = [:]
        for match in upcoming {
            let key = match.local_match_date ?? "?"
            if byDate[key] == nil {
                order.append(key)
                byDate[key] = []
            }
            byDate[key]?.append(match)
        }
        return order.map { key in (key, Self.dayLabel(for: key), byDate[key] ?? []) }
    }

    var body: some View {
        Group {
            if loading {
                ProgressView("Cargando partidos…")
            } else if let errorMessage, matches.isEmpty {
                VStack(spacing: 8) {
                    Text(errorMessage).font(.caption2).multilineTextAlignment(.center)
                    Button("Reintentar") { Task { await load() } }
                }
            } else if upcomingGroups.isEmpty {
                VStack(spacing: 8) {
                    Text("No hay partidos próximos.").font(.caption2)
                    Button("Reintentar") { Task { await load() } }
                }
            } else {
                List {
                    ForEach(upcomingGroups, id: \.key) { group in
                        Section(header: Text(group.label)) {
                            ForEach(group.matches) { match in
                                Button(action: { Task { await selectMatch(match) } }) {
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(match.title ?? "Partido").font(.subheadline).bold()
                                        Text(
                                            [match.local_start_time.map(Self.shortTime), match.field_name]
                                                .compactMap { $0 }
                                                .joined(separator: " · ")
                                        )
                                        .font(.caption2)
                                        .foregroundStyle(.secondary)
                                    }
                                }
                                .disabled(loadingMatchId != nil)
                                .overlay(alignment: .trailing) {
                                    if loadingMatchId == match.id { ProgressView() }
                                }
                            }
                        }
                    }
                }
            }
        }
        .navigationTitle("Elige partido")
        .task { await load() }
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button("Salir", role: .destructive) { store.logout() }
            }
        }
    }

    private func load() async {
        loading = true
        errorMessage = nil
        guard let token = store.token else { return }
        do {
            matches = try await NetworkClient.shared.fetchUpcomingMatches(token: token)
        } catch {
            errorMessage = "Sin conexión. Acércate al móvil e inténtalo de nuevo."
        }
        loading = false
    }

    private func selectMatch(_ match: AdminMatch) async {
        loadingMatchId = match.id
        guard let token = store.token else { return }
        do {
            let roster = try await NetworkClient.shared.fetchRoster(matchId: match.id, token: token)
            let white = (roster.white ?? []).map { TeamPlayer(userId: $0.user_id, name: $0.name, color: "white") }
            let black = (roster.black ?? []).map { TeamPlayer(userId: $0.user_id, name: $0.name, color: "black") }
            store.setActiveMatch(id: match.id, title: match.title ?? "Partido", roster: white + black)
        } catch {
            errorMessage = "No se pudo descargar la plantilla. Comprueba la conexión e inténtalo otra vez antes de que empiece el partido."
        }
        loadingMatchId = nil
    }

    // MARK: - Agrupación por día

    private static let isoDateFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    private static func dayLabel(for isoDate: String) -> String {
        guard let date = isoDateFormatter.date(from: isoDate) else { return isoDate }
        let calendar = Calendar.current
        if calendar.isDateInToday(date) { return "Hoy" }
        if calendar.isDateInTomorrow(date) { return "Mañana" }
        let f = DateFormatter()
        f.locale = Locale(identifier: "es_ES")
        f.dateFormat = "EEEE d MMM"
        return f.string(from: date).capitalized
    }

    private static func shortTime(_ hms: String) -> String {
        String(hms.prefix(5)) // "HH:mm:ss" -> "HH:mm"
    }
}
