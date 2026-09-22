import SwiftUI

struct ContentView: View {
    @ObservedObject var store = OfflineStore.shared

    var body: some View {
        NavigationStack {
            if !store.isLoggedIn {
                LoginView()
            } else if store.state.activeMatchId == nil {
                MatchPickerView()
            } else {
                LiveEventsView()
            }
        }
    }
}
