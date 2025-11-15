import Foundation

struct StepSample: Codable, Identifiable {
    let id: UUID
    let steps: Int
    let distance: Double
    let calories: Double
    let start: Date
    let end: Date

    init(id: UUID = .init(), steps: Int, distance: Double, calories: Double, start: Date, end: Date) {
        self.id = id
        self.steps = steps
        self.distance = distance
        self.calories = calories
        self.start = start
        self.end = end
    }
}

struct MetricsEnvelope: Codable {
    struct DevicePayload: Codable {
        let deviceId: String
        let model: String
        let osVersion: String
    }

    let device: DevicePayload
    let sample: StepSample
}
