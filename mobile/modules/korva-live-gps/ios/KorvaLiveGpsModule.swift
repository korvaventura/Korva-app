import ActivityKit
import ExpoModulesCore
import Foundation

public class KorvaLiveGpsModule: Module {
  public func definition() -> ModuleDefinition {
    Name("KorvaLiveGps")

    AsyncFunction("sync") { (id: String, sport: String, elapsed: Int, startedAt: Double?, average: String, distance: String, transition: Bool) async throws in
      guard #available(iOS 16.2, *), ActivityAuthorizationInfo().areActivitiesEnabled else { return }
      let state = KorvaGpsAttributes.ContentState(
        elapsed: elapsed,
        timerStart: startedAt.map { Date(timeIntervalSince1970: $0 / 1000) },
        average: average,
        distance: distance
      )
      let content = ActivityContent(state: state, staleDate: nil)
      let activities = Activity<KorvaGpsAttributes>.activities
      if let activity = activities.first(where: { $0.attributes.sessionId == id }) {
        guard transition || activity.content.state.timerStart != nil else { return }
        await activity.update(content)
      } else if transition, startedAt != nil {
        for activity in activities {
          await activity.end(nil, dismissalPolicy: .immediate)
        }
        _ = try Activity.request(
          attributes: KorvaGpsAttributes(sessionId: id, sport: sport),
          content: content,
          pushType: nil
        )
      }
    }

    AsyncFunction("end") { (id: String) async in
      guard #available(iOS 16.2, *) else { return }
      for activity in Activity<KorvaGpsAttributes>.activities where activity.attributes.sessionId == id {
        await activity.end(nil, dismissalPolicy: .immediate)
      }
    }
  }
}
