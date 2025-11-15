import SwiftUI

@main
struct StepCalorieCounterApp: App {
    @StateObject private var pedometerManager = PedometerManager()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(pedometerManager)
        }
    }
}
