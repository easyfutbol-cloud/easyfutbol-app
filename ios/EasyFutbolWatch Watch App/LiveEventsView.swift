import SwiftUI

private enum PickerMode: Identifiable {
    case goalScorer(at: Date)
    case goalAssist(scorer: TeamPlayer, at: Date)
    case goalConfirm(scorer: TeamPlayer, assist: TeamPlayer?, at: Date)
    case save(at: Date)
    case saveConfirm(player: TeamPlayer, at: Date)
    case mvp

    var id: String {
        switch self {
        case .goalScorer: return "goalScorer"
        case .goalAssist: return "goalAssist"
        case .goalConfirm: return "goalConfirm"
        case .save: return "save"
        case .saveConfirm: return "saveConfirm"
        case .mvp: return "mvp"
        }
    }
}

struct LiveEventsView: View {
    @ObservedObject var store = OfflineStore.shared
    @ObservedObject var sync = SyncManager.shared

    @State private var pickerMode: PickerMode?
    @State private var showChangeMatchConfirm = false

    private var players: [TeamPlayer] {
        store.state.roster.map { TeamPlayer(userId: $0.userId, name: $0.name, color: $0.color) }
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 10) {
                Text(store.state.activeMatchTitle ?? "Partido")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)

                Button(action: { pickerMode = .goalScorer(at: Date()) }) {
                    Label("GOL", systemImage: "soccerball")
                        .frame(maxWidth: .infinity)
                        .font(.headline)
                }
                .tint(.orange)

                Button(action: { pickerMode = .save(at: Date()) }) {
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
                case .goalScorer(let at):
                    PlayerPickerView(title: "¿Quién marca?", players: players, showSkip: false, onSkip: nil) { player in
                        pickerMode = .goalAssist(scorer: player, at: at)
                    }
                case .goalAssist(let scorer, let at):
                    PlayerPickerView(title: "¿Asistencia?", players: players, showSkip: true, onSkip: {
                        pickerMode = .goalConfirm(scorer: scorer, assist: nil, at: at)
                    }) { assist in
                        pickerMode = .goalConfirm(scorer: scorer, assist: assist, at: at)
                    }
                case .goalConfirm(let scorer, let assist, let at):
                    EventConfirmView(occurredAt: at, candidateLabel: "Gol de la semana") { isCandidate in
                        logEvent(type: .goal, userId: scorer.userId, assistUserId: assist?.userId, teamColor: scorer.color, occurredAt: at, isCandidate: isCandidate)
                        pickerMode = nil
                    }
                case .save(let at):
                    PlayerPickerView(title: "¿Quién para?", players: players, showSkip: false, onSkip: nil) { player in
                        pickerMode = .saveConfirm(player: player, at: at)
                    }
                case .saveConfirm(let player, let at):
                    EventConfirmView(occurredAt: at, candidateLabel: "Parada de la semana") { isCandidate in
                        logEvent(type: .save, userId: player.userId, assistUserId: nil, teamColor: player.color, occurredAt: at, isCandidate: isCandidate)
                        pickerMode = nil
                    }
                case .mvp:
                    PlayerPickerView(title: "MVP", players: players, showSkip: false, onSkip: nil) { player in
                        logEvent(type: .mvp, userId: player.userId, assistUserId: nil, teamColor: player.color, occurredAt: Date(), isCandidate: false)
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

    private func logEvent(type: PendingEventType, userId: Int, assistUserId: Int?, teamColor: String?, occurredAt: Date, isCandidate: Bool) {
        guard let matchId = store.state.activeMatchId else { return }
        let event = PendingEvent(
            matchId: matchId,
            type: type,
            minute: nil,
            userId: userId,
            assistUserId: assistUserId,
            teamColor: teamColor,
            createdAt: occurredAt,
            isCandidate: isCandidate
        )
        store.enqueue(event)
        Task { await sync.syncNow() }
    }
}
