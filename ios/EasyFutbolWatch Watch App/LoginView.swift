import SwiftUI

struct LoginView: View {
    @ObservedObject var store = OfflineStore.shared

    @State private var email = ""
    @State private var password = ""
    @State private var loading = false
    @State private var errorMessage: String?

    var body: some View {
        ScrollView {
            VStack(spacing: 10) {
                Text("EasyFutbol")
                    .font(.headline)
                Text("Inicia sesión (solo hace falta una vez)")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)

                TextField("Email", text: $email)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()

                SecureField("Contraseña", text: $password)

                if let errorMessage {
                    Text(errorMessage)
                        .font(.caption2)
                        .foregroundStyle(.red)
                }

                Button(action: login) {
                    if loading {
                        ProgressView()
                    } else {
                        Text("Entrar")
                    }
                }
                .disabled(loading || email.isEmpty || password.isEmpty)
                .tint(.orange)
            }
            .padding(.horizontal, 4)
        }
    }

    private func login() {
        loading = true
        errorMessage = nil
        Task {
            do {
                let res = try await NetworkClient.shared.login(email: email, password: password)
                if res.ok, let token = res.token, let user = res.user {
                    store.saveLogin(token: token, userName: user.name)
                } else {
                    errorMessage = res.msg ?? "No se pudo iniciar sesión"
                }
            } catch APIError.server(let msg) {
                errorMessage = msg
            } catch {
                errorMessage = "Sin conexión. Acércate al móvil e inténtalo de nuevo."
            }
            loading = false
        }
    }
}
