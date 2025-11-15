import SwiftUI

struct ContentView: View {
    @EnvironmentObject private var pedometer: PedometerManager

    @AppStorage("serverURL") private var serverURL: String = "http://localhost:4000"
    @AppStorage("weightKg") private var weightKg: Double = 72
    @AppStorage("heightCm") private var heightCm: Double = 175
    @State private var uploadInterval: Double = 60

    private var numberFormatter: NumberFormatter {
        let formatter = NumberFormatter()
        formatter.minimumFractionDigits = 0
        formatter.maximumFractionDigits = 1
        return formatter
    }

    var body: some View {
        NavigationView {
            Form {
                Section(header: Text("Live Metrics")) {
                    if let sample = pedometer.currentSample {
                        MetricRow(title: "Steps", value: "\(sample.steps)")
                        MetricRow(title: "Calories", value: sample.calories.formatted(.number.precision(.fractionLength(1))))
                        MetricRow(title: "Distance", value: sample.distanceKilometersText)
                        MetricRow(title: "Window", value: sample.windowText)
                    } else {
                        Text("No samples yet. Start tracking to view live data.")
                            .font(.footnote)
                            .foregroundColor(.secondary)
                    }
                }

                Section(header: Text("Tracking")) {
                    HStack {
                        Text("Authorization")
                        Spacer()
                        Text(pedometer.authorizationState.displayName)
                            .foregroundColor(pedometer.authorizationState == .authorized ? .green : .orange)
                    }

                    if let lastUpload = pedometer.lastUploadAt {
                        HStack {
                            Text("Last upload")
                            Spacer()
                            Text(lastUpload, style: .time)
                        }
                    }

                    if let error = pedometer.errorMessage {
                        Text(error)
                            .font(.footnote)
                            .foregroundColor(.red)
                    }

                    Button(pedometer.isTracking ? "Stop Tracking" : "Start Tracking") {
                        pedometer.isTracking ? pedometer.stopTracking() : pedometer.startTracking()
                    }

                    Button("Send Latest to Server") {
                        pedometer.pushLatestSample()
                    }
                    .disabled(pedometer.currentSample == nil)
                }

                Section(header: Text("Profile & API"), footer: Text("Server URL should point to the backend POST /api/metrics endpoint running on your network.")) {
                    TextField("Server URL", text: $serverURL)
                        .keyboardType(.URL)
                        .autocapitalization(.none)
                        .disableAutocorrection(true)
                        .onSubmit(updateConfiguration)
                        .onChange(of: serverURL) { _ in updateConfiguration() }

                    HStack {
                        Text("Weight (kg)")
                        Spacer()
                        TextField("Weight", value: $weightKg, formatter: numberFormatter)
                            .keyboardType(.decimalPad)
                            .multilineTextAlignment(.trailing)
                    }
                    .onChange(of: weightKg) { _ in updateConfiguration() }

                    HStack {
                        Text("Height (cm)")
                        Spacer()
                        TextField("Height", value: $heightCm, formatter: numberFormatter)
                            .keyboardType(.decimalPad)
                            .multilineTextAlignment(.trailing)
                    }
                    .onChange(of: heightCm) { _ in updateConfiguration() }

                    VStack(alignment: .leading) {
                        HStack {
                            Text("Upload every")
                            Spacer()
                            Text("\(Int(uploadInterval)) s")
                                .monospacedDigit()
                        }
                        Slider(value: $uploadInterval, in: 20...300, step: 10) { _ in
                            pedometer.updateUploadInterval(uploadInterval)
                        }
                    }
                }
            }
            .navigationTitle("Step Counter")
            .onAppear {
                uploadInterval = pedometer.uploadInterval
                updateConfiguration()
            }
        }
    }

    private func updateConfiguration() {
        pedometer.updateConfiguration(serverURL: serverURL, weightKg: weightKg, heightCm: heightCm)
    }
}

private struct MetricRow: View {
    let title: String
    let value: String

    var body: some View {
        HStack {
            Text(title)
            Spacer()
            Text(value)
                .monospacedDigit()
                .foregroundColor(.primary)
        }
    }
}

private extension StepSample {
    var distanceKilometersText: String {
        let distanceKm = distance / 1000
        return distanceKm.formatted(.number.precision(.fractionLength(2))) + " km"
    }

    var windowText: String {
        "\(start.formatted(date: .omitted, time: .shortened)) - \(end.formatted(date: .omitted, time: .shortened))"
    }
}

private extension PedometerManager.AuthorizationState {
    var displayName: String {
        switch self {
        case .authorized: return "Authorized"
        case .denied: return "Denied"
        case .restricted: return "Restricted"
        case .notDetermined: return "Pending"
        }
    }
}
