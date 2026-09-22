import SwiftUI

/// Lista de la plantilla cacheada (blancos + negros) para elegir un jugador.
/// Se usa para marcador, asistencia, parada y MVP — siempre la misma lista.
struct PlayerPickerView: View {
    let title: String
    let players: [TeamPlayer]
    let showSkip: Bool
    let onSkip: (() -> Void)?
    let onPick: (TeamPlayer) -> Void

    var body: some View {
        List {
            if showSkip, let onSkip {
                Button(action: onSkip) {
                    Text("Sin asistencia").bold()
                }
                .tint(.gray)
            }
            Section("Blancos") {
                ForEach(players.filter { $0.color == "white" }) { player in
                    Button(action: { onPick(player) }) {
                        Text(player.name)
                    }
                }
            }
            Section("Negros") {
                ForEach(players.filter { $0.color == "black" }) { player in
                    Button(action: { onPick(player) }) {
                        Text(player.name)
                    }
                }
            }
        }
        .navigationTitle(title)
    }
}
