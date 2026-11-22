import ActivityKit
import Foundation

@available(iOS 16.2, *)
struct KorvaGpsAttributes: ActivityAttributes {
  struct ContentState: Codable, Hashable {
    let elapsed: Int
    let timerStart: Date?
    let average: String
    let distance: String
  }

  let sessionId: String
  let sport: String
}
