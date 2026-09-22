import SwiftUI

private enum PickerMode: Identifiable {
    case goalScorer
    case goalAssist(scorer: TeamPlayer)
    case save
    case mvp

    var id: String {
        switch self {
        case .goalScorer: return "goalScorer"
        case .goalAssist: return "goalAssist"
        case .save: return "save"
        case .mvp: return "mvp"
        }
    }
}

struct LiveEventsView: View {
    @ObservedObject var store = OfflineStore.shared
    @ObservedObject var sync = SyncManager.shared

    @State private var running = false
    @State private var startedAt: Date?
    @State private var offsetMinutes = 0
    @State private var pickerMode: PickerMode?
    @State private var showChangeMatchConfirm = false

    private var players: [TeamPlayer] {
        store.state.roster.map { TeamPlayer(userId: $0.userId, name: $0.name, color: $0.color) }
    }

    private func currentMinute(now: Date) -> Int {
        guard running, let startedAt else { return offsetMinutes }
        let elapsed = Int(now.timeIntervalSince(startedAt) / 60)
        return max(0, offsetMinutes + elapsed)
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 10) {
                Text(store.state.activeMatchTitle ?? "Partido")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)

                TimelineView(.periodic(from: .now, by: 1)) { context in
                    VStack(spacing: 6) {
                        Text("\(currentMinute(now: context.date))'")
                            .font(.system(size: 34, weight: .bold, design: .rounded))
                        HStack(spacing: 8) {
                            Button("-1") { offsetMinutes = max(0, offsetMinutes - 1) }
                            Button(running ? "Pausar" : "Iniciar") { toggleTimer() }
                                .tint(.orange)
                            Button("+1") { offsetMinutes += 1 }
                        }
                        .font(.caption2)
                    }
                }

                Button(action: { pickerMode = .goalScorer }) {
                    Label("GOL", systemImage: "soccerball")
                        .frame(maxWidth: .infinity)
                        .font(.headline)
                }
                .tint(.orange)

                Button(action: { pickerMode = .save }) {
                    Label("PARADA", systemImage: "hand.raised.fill")
                        .frame(maxWidth: .infinity)
                        .font(.headline)
                }
                .tint(.blue)

                Button(action: { pickerMode = .mvp }) {
                    Label("MVP", systemImage: "star.fill")
                        .frame(maxWidth: .infinity)
                }
                .tint(.yellow)

                syncStatusView

                Button("Cambiar de partido", role: .destructive) { showChangeMatchConfirm = true }
                    .font(.caption2)
            }
            .padding(.horizontal, 4)
        }
        .sheet(item: $pickerMode) { mode in
            NavigationStack {
                switch mode {
                case .goalScorer:
                    PlayerPickerView(title: "¿Quién marca?", players: players, showSkip: false, onSkip: nil) { player in
                        pickerMode = .goalAssist(scorer: player)
                    }
                case .goalAssist(let scorer):
                    PlayerPickerView(title: "¿Asistencia?", players: players, showSkip: true, onSkip: {
                        logEvent(type: .goal, userId: scorer.userId, assistUserId: nil, teamColor: scorer.color)
                        pickerMode = nil
                    }) { assist in
                        logEvent(type: .goal, userId: scorer.userId, assistUserId: assist.userId, teamColor: scorer.color)
                        pickerMode = nil
                    }
                case .save:
                    PlayerPickerView(title: "¿Quién para?", players: players, showSkip: false, onSkip: nil) { player in
                        logEvent(type: .save, userId: player.userId, assistUserId: nil, teamColor: player.color)
                        pickerMode = nil
                    }
                case .mvp:
                    PlayerPickerView(title: "MVP", players: players, showSkip: false, onSkip: nil) { player in
                        logEvent(type: .mvp, userId: player.userId, assistUserId: nil, teamColor: player.color, minute: nil)
                        pickerMode = nil
                    }
                }
            }
        }
        .confirmationDialog("¿Cambiar de partido?", isPresented: $showChangeMatchConfirm, titleVisibility: .visible) {
            Button("Cambiar de partido", role: .destructive) { store.clearActiveMatch() }
            Button("Cancelar", role: .cancel) {}
        } message: {
            Text(sync.isSyncing || store.pendingCount > 0 ? "Hay \(store.pendingCount) evento(s) sin subir. Se guardan igualmente." : "")
        }
        .task { await sync.syncNow() }
    }

    @ViewBuilder
    private var syncStatusView: some View {
        let pending = store.pendingCount
        VStack(spacing: 4) {
            if pending > 0 {
                Text("\(pending) sin subir")
                    .font(.caption2)
                    .foregroundStyle(.orange)
            } else {
                Text("Todo sincronizado")
                    .font(.caption2)
                    .foregroundStyle(.green)
            }
            Button(sync.isSyncing ? "Sincronizando…" : "Sincronizar ahora") {
                Task { await sync.syncNow() }
            }
            .font(.caption2)
            .disabled(sync.isSyncing)
        }
    }

    private func toggleTimer() {
        if running {
            if let startedAt {
                offsetMinutes += Int(Date().timeIntervalSince(startedAt) / 60)
            }
            running = false
            startedAt = nil
        } else {
            startedAt = Date()
            running = true
        }
    }

    private func logEvent(type: PendingEventType, userId: Int, assistUserId: Int?, teamColor: String?, minute: Int? = nil) {
        guard let matchId = store.state.activeMatchId else { return }
        let resolvedMinute = minute ?? currentMinute(now: Date())
        let event = PendingEvent(
            matchId: matchId,
            type: type,
            minute: type == .mvp ? nil : resolvedMinute,
            userId: userId,
            assistUserId: assistUserId,
            teamColor: teamColor
        )
        store.enqueue(event)
        Task { await sync.syncNow() }
    }
}
