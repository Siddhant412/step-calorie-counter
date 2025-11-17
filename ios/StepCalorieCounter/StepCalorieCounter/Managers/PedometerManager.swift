import Combine
import CoreMotion
import Foundation

final class PedometerManager: ObservableObject {
    enum AuthorizationState {
        case notDetermined
        case authorized
        case denied
        case restricted
    }

    @Published private(set) var authorizationState: AuthorizationState = .notDetermined
    @Published private(set) var currentSample: StepSample?
    @Published private(set) var lastUploadAt: Date?
    @Published private(set) var errorMessage: String?
    @Published private(set) var isTracking = false
    @Published private(set) var uploadInterval: Double

    private let pedometer = CMPedometer()
    private let apiClient = APIClient()
    private var configuration = UserConfiguration.default
    private var lastAutoUpload = Date.distantPast
    private let intervalDefaultsKey = "uploadIntervalSeconds"
    private var lastUploadedSample: StepSample?

    init() {
        let storedInterval = UserDefaults.standard.double(forKey: intervalDefaultsKey)
        if storedInterval > 0 {
            uploadInterval = storedInterval
        } else {
            uploadInterval = 60
            UserDefaults.standard.set(60.0, forKey: intervalDefaultsKey)
        }
    }

    func startTracking() {
        guard CMPedometer.isStepCountingAvailable() else {
            errorMessage = "Step counting is not supported on this device."
            return
        }

        refreshAuthorizationStatus()
        lastAutoUpload = .distantPast

        pedometer.startUpdates(from: Date()) { [weak self] data, error in
            guard let self else { return }

            if let error {
                DispatchQueue.main.async {
                    self.errorMessage = error.localizedDescription
                }
                return
            }

            guard let data else { return }
            self.handle(data)
        }

        DispatchQueue.main.async {
            self.isTracking = true
            self.errorMessage = nil
        }
    }

    func stopTracking() {
        pedometer.stopUpdates()
        pushLatestSample()
        DispatchQueue.main.async {
            self.isTracking = false
        }
    }

    func pushLatestSample() {
        guard let sample = currentSample else { return }
        lastAutoUpload = Date()
        upload(sample)
    }

    func updateConfiguration(serverURL: String, weightKg: Double, heightCm: Double) {
        configuration = UserConfiguration(weightKg: weightKg, heightCm: heightCm)
        apiClient.updateBaseURL(serverURL)
    }

    func updateUploadInterval(_ seconds: Double) {
        uploadInterval = seconds
        lastAutoUpload = .distantPast
        UserDefaults.standard.set(seconds, forKey: intervalDefaultsKey)
    }

    func resetServerData(completion: @escaping (Result<Void, Error>) -> Void) {
        apiClient.resetMetrics { result in
            DispatchQueue.main.async {
                if case .success = result {
                    self.currentSample = nil
                    self.lastUploadAt = nil
                    self.errorMessage = nil
                }
                completion(result)
            }
        }
    }

    private func handle(_ data: CMPedometerData) {
        let stepCount = data.numberOfSteps.intValue
        let distance = data.distance?.doubleValue ?? Double(stepCount) * configuration.strideLength
        let sample = StepSample(
            steps: stepCount,
            distance: distance,
            calories: configuration.estimateCalories(for: data),
            start: data.startDate,
            end: data.endDate
        )

        DispatchQueue.main.async {
            self.currentSample = sample
        }

        maybeUpload(sample)
    }

    private func maybeUpload(_ sample: StepSample) {
        if let lastUploadedSample,
           lastUploadedSample.steps == sample.steps,
           abs(lastUploadedSample.calories - sample.calories) < 0.01,
           abs(lastUploadedSample.distance - sample.distance) < 0.5 {
            return
        }
        let elapsed = Date().timeIntervalSince(lastAutoUpload)
        guard elapsed >= uploadInterval else { return }
        lastAutoUpload = Date()
        upload(sample)
    }

    private func upload(_ sample: StepSample) {
        apiClient.push(sample: sample) { [weak self] result in
            DispatchQueue.main.async {
                switch result {
                case .success:
                    self?.lastUploadAt = Date()
                    self?.errorMessage = nil
                    self?.lastUploadedSample = sample
                case .failure(let error):
                    self?.errorMessage = error.localizedDescription
                }
            }
        }
    }

    private func refreshAuthorizationStatus() {
        switch CMPedometer.authorizationStatus() {
        case .authorized:
            authorizationState = .authorized
        case .denied:
            authorizationState = .denied
        case .restricted:
            authorizationState = .restricted
        case .notDetermined:
            authorizationState = .notDetermined
        @unknown default:
            authorizationState = .notDetermined
        }
    }

}

private struct UserConfiguration {
    let weightKg: Double
    let heightCm: Double

    static let `default` = UserConfiguration(weightKg: 72, heightCm: 175)

    var strideLength: Double {
        // Rough conversion from height to stride length.
        (heightCm / 100) * 0.414
    }

    var walkingMET: Double { 3.5 }

    func estimateCalories(for data: CMPedometerData) -> Double {
        let durationHours = max(data.endDate.timeIntervalSince(data.startDate), 1) / 3600
        return walkingMET * weightKg * durationHours
    }
}
