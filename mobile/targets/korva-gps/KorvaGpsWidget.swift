import ActivityKit
import SwiftUI
import WidgetKit

@main
struct KorvaGpsWidget: Widget {
  private let night = Color(red: 16 / 255, green: 30 / 255, blue: 44 / 255)
  private let orange = Color(red: 252 / 255, green: 76 / 255, blue: 2 / 255)

  var body: some WidgetConfiguration {
    ActivityConfiguration(for: KorvaGpsAttributes.self) { context in
      VStack(spacing: 10) {
        ZStack(alignment: .trailing) {
          Text(context.state.timerStart == nil ? "En pausa" : context.attributes.sport)
            .font(.subheadline.weight(.semibold))
            .frame(maxWidth: .infinity)
          mark
        }
        metrics(context)
      }
      .padding(16)
      .foregroundStyle(.white)
      .activityBackgroundTint(night)
      .activitySystemActionForegroundColor(.white)
    } dynamicIsland: { context in
      DynamicIsland {
        DynamicIslandExpandedRegion(.leading) { mark }
        DynamicIslandExpandedRegion(.center) {
          Text(context.state.timerStart == nil ? "En pausa" : context.attributes.sport)
            .foregroundStyle(.white)
        }
        DynamicIslandExpandedRegion(.bottom) { metrics(context).foregroundStyle(.white) }
      } compactLeading: {
        mark
      } compactTrailing: {
        Text(context.state.distance).font(.caption2).foregroundStyle(.white)
      } minimal: {
        mark
      }
    }
  }

  private var mark: some View {
    Text("K").font(.subheadline.weight(.black)).foregroundStyle(orange)
  }

  private func metrics(_ context: ActivityViewContext<KorvaGpsAttributes>) -> some View {
    HStack(spacing: 6) {
      metric("Tiempo") {
        if let start = context.state.timerStart {
          Text(timerInterval: start...Date.distantFuture, countsDown: false)
            .multilineTextAlignment(.center)
        } else {
          let seconds = context.state.elapsed
          Text(String(format: "%02d:%02d", seconds / 60, seconds % 60))
        }
      }
      metric(context.attributes.sport == "Bici" ? "Velocidad media" : "Ritmo medio") {
        Text(context.state.average)
      }
      metric("Distancia") { Text(context.state.distance) }
    }
  }

  private func metric<Content: View>(_ label: String, @ViewBuilder value: () -> Content) -> some View {
    VStack(spacing: 3) {
      value()
        .font(.system(size: 20, weight: .semibold, design: .monospaced))
        .lineLimit(1)
        .minimumScaleFactor(0.65)
      Text(label).font(.caption2).lineLimit(1).minimumScaleFactor(0.75)
    }
    .frame(maxWidth: .infinity)
  }
}
