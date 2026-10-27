import SwiftUI

/// Rueda (se mueve con la Corona Digital) para fijar el minuto exacto de un
/// evento — más rápido y preciso que tocar "-1"/"+1" en el cronómetro general.
struct MinutePickerView: View {
    let title: String
    @State var minute: Int
    let onConfirm: (Int) -> Void

    var body: some View {
        VStack(spacing: 4) {
            Text(title)
                .font(.caption)
                .foregroundStyle(.secondary)

            Picker("Minuto", selection: $minute) {
                ForEach(0...130, id: \.self) { m in
                    Text("\(m)'").tag(m)
                }
            }
            .pickerStyle(.wheel)
            .frame(height: 90)
            .labelsHidden()

            Button("Confirmar") { onConfirm(minute) }
                .tint(.orange)
        }
        .navigationTitle("Minuto")
    }
}
