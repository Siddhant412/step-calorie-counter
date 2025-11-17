import Foundation
import UIKit

final class APIClient {
    enum APIError: LocalizedError {
        case invalidURL
        case invalidResponse

        var errorDescription: String? {
            switch self {
            case .invalidURL:
                return "Server URL is invalid"
            case .invalidResponse:
                return "Server responded with an error"
            }
        }
    }

    private var baseURL: URL?
    private let session: URLSession
    private let decoder: JSONDecoder
    private let encoder: JSONEncoder

    init(baseURL: String = "http://localhost:4000") {
        self.session = URLSession(configuration: .default)
        self.decoder = JSONDecoder()
        self.decoder.dateDecodingStrategy = .iso8601
        self.encoder = JSONEncoder()
        self.encoder.dateEncodingStrategy = .iso8601
        updateBaseURL(baseURL)
    }

    func updateBaseURL(_ string: String) {
        baseURL = URL(string: string.trimmingCharacters(in: .whitespacesAndNewlines))
    }

    func push(sample: StepSample, completion: @escaping (Result<Void, Error>) -> Void) {
        guard let baseURL else {
            completion(.failure(APIError.invalidURL))
            return
        }

        let endpoint = baseURL.appendingPathComponent("api/metrics")

        var request = URLRequest(url: endpoint)
        request.httpMethod = "POST"
        request.addValue("application/json", forHTTPHeaderField: "Content-Type")

        let payload = MetricsEnvelope(device: .init(
            deviceId: UIDevice.current.identifierForVendor?.uuidString ?? UUID().uuidString,
            model: UIDevice.current.name,
            osVersion: UIDevice.current.systemVersion
        ), sample: sample)

        do {
            request.httpBody = try encoder.encode(payload)
        } catch {
            completion(.failure(error))
            return
        }

        session.dataTask(with: request) { _, response, error in
            if let error {
                completion(.failure(error))
                return
            }

            guard let httpResponse = response as? HTTPURLResponse, 200..<300 ~= httpResponse.statusCode else {
                completion(.failure(APIError.invalidResponse))
                return
            }

            completion(.success(()))
        }.resume()
    }

    func resetMetrics(completion: @escaping (Result<Void, Error>) -> Void) {
        guard let baseURL else {
            completion(.failure(APIError.invalidURL))
            return
        }

        var request = URLRequest(url: baseURL.appendingPathComponent("api/metrics"))
        request.httpMethod = "DELETE"

        session.dataTask(with: request) { _, response, error in
            if let error {
                completion(.failure(error))
                return
            }

            guard let httpResponse = response as? HTTPURLResponse, 200..<300 ~= httpResponse.statusCode else {
                completion(.failure(APIError.invalidResponse))
                return
            }

            completion(.success(()))
        }.resume()
    }

    func fetchSummary(completion: @escaping (Result<SummaryPayload, Error>) -> Void) {
        guard let baseURL else {
            completion(.failure(APIError.invalidURL))
            return
        }

        let endpoint = baseURL.appendingPathComponent("api/summary")
        session.dataTask(with: endpoint) { data, response, error in
            if let error {
                completion(.failure(error))
                return
            }

            guard let data, let httpResponse = response as? HTTPURLResponse, 200..<300 ~= httpResponse.statusCode else {
                completion(.failure(APIError.invalidResponse))
                return
            }

            do {
                let summary = try self.decoder.decode(SummaryPayload.self, from: data)
                completion(.success(summary))
            } catch {
                completion(.failure(error))
            }
        }.resume()
    }

    func updateGoals(_ goals: GoalSettings, completion: @escaping (Result<SummaryPayload, Error>) -> Void) {
        guard let baseURL else {
            completion(.failure(APIError.invalidURL))
            return
        }

        var request = URLRequest(url: baseURL.appendingPathComponent("api/goals"))
        request.httpMethod = "PUT"
        request.addValue("application/json", forHTTPHeaderField: "Content-Type")

        do {
            request.httpBody = try JSONSerialization.data(withJSONObject: [
                "steps": goals.steps,
                "calories": goals.calories,
            ])
        } catch {
            completion(.failure(error))
            return
        }

        session.dataTask(with: request) { data, response, error in
            if let error {
                completion(.failure(error))
                return
            }

            guard let data, let httpResponse = response as? HTTPURLResponse, 200..<300 ~= httpResponse.statusCode else {
                completion(.failure(APIError.invalidResponse))
                return
            }

            do {
                let summary = try self.decoder.decode(SummaryPayload.self, from: data)
                completion(.success(summary))
            } catch {
                completion(.failure(error))
            }
        }.resume()
    }
}
