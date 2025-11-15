import SwiftUI

struct ContentView: View {
    @EnvironmentObject private var pedometer: PedometerManager

    @AppStorage("serverURL") private var serverURL: String = "http://localhost:4000"
    @AppStorage("weightKg") private var weightKg: Double = 72
    @AppStorage("heightCm") private var heightCm: Double = 175
    @State private var uploadInterval: Double = 60
    @State private var showingResetConfirmation = false
    @State private var resetAlertMessage: String?

    private var numberFormatter: NumberFormatter {
        let formatter = NumberFormatter()
        formatter.minimumFractionDigits = 0
        formatter.maximumFractionDigits = 1
        return formatter
    }

    var body: some View {
        Group {
            if #available(iOS 16.0, *) {
                NavigationStack {
                    contentBody
                }
                .toolbar(.hidden, for: .navigationBar)
            } else {
                NavigationView {
                    contentBody
                }
                .navigationBarHidden(true)
            }
        }
    }

    private var contentBody: some View {
        rootContent
            .onAppear {
                uploadInterval = pedometer.uploadInterval
                updateConfiguration()
            }
            .confirmationDialog(
                "Delete all metrics from the server?",
                isPresented: $showingResetConfirmation,
                titleVisibility: .visible
            ) {
                Button("Delete All", role: .destructive) {
                    resetServerData()
                }
                Button("Cancel", role: .cancel) { }
            }
            .alert("Server Reset", isPresented: resetAlertBinding) {
                Button("OK", role: .cancel) { }
            } message: {
                Text(resetAlertMessage ?? "")
            }
    }

    @ViewBuilder
    private var rootContent: some View {
        ZStack {
            LinearGradient(colors: [Color(.systemGroupedBackground), Color(.secondarySystemBackground)], startPoint: .topLeading, endPoint: .bottomTrailing)
                .ignoresSafeArea()

            scrollContainer
        }
    }

    @ViewBuilder
    private var scrollContainer: some View {
        if #available(iOS 16.0, *) {
            baseScroll.scrollIndicators(.hidden)
        } else {
            baseScroll
        }
    }

    private var baseScroll: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Step Counter")
                        .font(.largeTitle)
                        .fontWeight(.bold)
                    Text("Live pedometer sync & server control")
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                }

                SectionCard(title: "Live Metrics") {
                    if let sample = pedometer.currentSample {
                        LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 16) {
                            MetricTile(title: "Steps", value: "\(sample.steps)")
                            MetricTile(title: "Calories", value: sample.calories.formatted(.number.precision(.fractionLength(1))))
                            MetricTile(title: "Distance", value: sample.distanceKilometersText)
                            MetricTile(title: "Window", value: sample.windowText)
                        }
                    } else {
                        Text("Start tracking to see live step, calorie, and distance data.")
                            .font(.footnote)
                            .foregroundColor(.secondary)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                }

                SectionCard(title: "Tracking Controls") {
                    StatusRow(label: "Authorization", value: pedometer.authorizationState.displayName, tint: pedometer.authorizationState == .authorized ? .green : .orange)

                    if let lastUpload = pedometer.lastUploadAt {
                        StatusRow(label: "Last upload", value: lastUpload.formatted(date: .omitted, time: .standard), tint: .blue)
                    }

                    if let error = pedometer.errorMessage {
                        Text(error)
                            .font(.footnote)
                            .foregroundColor(.red)
                    }

                    VStack(spacing: 12) {
                        Button(pedometer.isTracking ? "Stop Tracking" : "Start Tracking") {
                            pedometer.isTracking ? pedometer.stopTracking() : pedometer.startTracking()
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(pedometer.isTracking ? .orange : .blue)
                        .frame(maxWidth: .infinity)

                        Button("Send Latest to Server") {
                            pedometer.pushLatestSample()
                        }
                        .buttonStyle(.bordered)
                        .frame(maxWidth: .infinity)
                        .disabled(pedometer.currentSample == nil)

                        Button("Reset Server Data", role: .destructive) {
                            showingResetConfirmation = true
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(.red)
                        .frame(maxWidth: .infinity)
                    }
                }

                SectionCard(title: "Profile & API", footer: "Server URL should point to the backend POST /api/metrics endpoint running on your network.") {
                    TextField("Server URL", text: $serverURL)
                        .keyboardType(.URL)
                        .textInputAutocapitalization(.never)
                        .disableAutocorrection(true)
                        .textFieldStyle(.roundedBorder)
                        .onSubmit(updateConfiguration)
                        .onChange(of: serverURL) { _ in updateConfiguration() }

                    VStack(spacing: 12) {
                        LabeledTextField(label: "Weight (kg)", value: $weightKg, formatter: numberFormatter)
                            .onChange(of: weightKg) { _ in updateConfiguration() }

                        LabeledTextField(label: "Height (cm)", value: $heightCm, formatter: numberFormatter)
                            .onChange(of: heightCm) { _ in updateConfiguration() }
                    }

                    VStack(alignment: .leading, spacing: 8) {
                        HStack {
                            Text("Upload every")
                            Spacer()
                            Text("\(Int(uploadInterval)) s").monospacedDigit()
                        }
                        Slider(value: $uploadInterval, in: 20...300, step: 10) { _ in
                            pedometer.updateUploadInterval(uploadInterval)
                        }
                    }
                }
            }
            .padding(.horizontal)
            .padding(.vertical, 24)
        }
    }

    private func updateConfiguration() {
        pedometer.updateConfiguration(serverURL: serverURL, weightKg: weightKg, heightCm: heightCm)
    }

    private func resetServerData() {
        pedometer.resetServerData { result in
            switch result {
            case .success:
                resetAlertMessage = "All samples were deleted from the server."
            case .failure(let error):
                resetAlertMessage = error.localizedDescription
            }
        }
    }

    private var resetAlertBinding: Binding<Bool> {
        Binding(
            get: { resetAlertMessage != nil },
            set: { if !$0 { resetAlertMessage = nil } }
        )
    }
}

private struct SectionCard<Content: View>: View {
    let title: String
    var footer: String?
    @ViewBuilder var content: Content

    init(title: String, footer: String? = nil, @ViewBuilder content: () -> Content) {
        self.title = title
        self.footer = footer
        self.content = content()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text(title)
                .font(.headline)
            content
            if let footer {
                Text(footer)
                    .font(.footnote)
                    .foregroundColor(.secondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding()
        .background(.thinMaterial)
        .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
    }
}

private struct MetricTile: View {
    let title: String
    let value: String

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title.uppercased())
                .font(.caption)
                .fontWeight(.semibold)
                .foregroundColor(.secondary)
            Text(value)
                .font(.title3)
                .fontWeight(.bold)
                .foregroundColor(.primary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding()
        .background(Color(.systemBackground).opacity(0.7))
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
    }
}

private struct StatusRow: View {
    let label: String
    let value: String
    let tint: Color

    var body: some View {
        HStack {
            Text(label)
            Spacer()
            Text(value)
                .font(.subheadline)
                .fontWeight(.medium)
                .foregroundColor(tint)
        }
    }
}

private struct LabeledTextField: View {
    let label: String
    @Binding var value: Double
    let formatter: NumberFormatter

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label)
                .font(.caption)
                .foregroundColor(.secondary)
            TextField(label, value: $value, formatter: formatter)
                .keyboardType(.decimalPad)
                .textFieldStyle(.roundedBorder)
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
