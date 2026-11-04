import SwiftUI

/// Último paso de un gol o una parada: la hora ya está capturada, solo falta
/// guardarlo normal o marcarlo como candidato de la semana.
struct EventConfirmView: View {
    let occurredAt: Date
    let candidateLabel: String
    let onSave: (_ isCandidate: Bool) -> Void

    var body: some View {
        ScrollView {
            VStack(spacing: 8) {
                Text(occurredAt, format: .dateTime.hour().minute())
                    .font(.system(size: 28, weight: .bold, design: .rounded))

                Button(action: { onSave(false) }) {
                    Text("Guardar")
                        .frame(maxWidth: .infinity)
                }
                .tint(.orange)

                Button(action: { onSave(true) }) {
                    Label(candidateLabel, systemImage: "star.fill")
                        .frame(maxWidth: .infinity)
                }
                .tint(.yellow)
            }
        }
    }
}
