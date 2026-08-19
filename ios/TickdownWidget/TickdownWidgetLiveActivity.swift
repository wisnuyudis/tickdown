import ActivityKit
import SwiftUI
import WidgetKit

@available(iOS 16.2, *)
struct TickdownWidgetLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: TickdownActivityAttributes.self) { context in
            LockScreenView(context: context)
                .activitySystemActionForegroundColor(.primary)
        } dynamicIsland: { context in
            let tint = Color(hex: context.attributes.tintHex)

            return DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    HStack(spacing: 5) {
                        Circle().fill(tint).frame(width: 7, height: 7)
                        Text(context.attributes.policyName)
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                    }
                    .padding(.leading, 4)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Text(context.attributes.reference)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                        .padding(.trailing, 4)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    HStack(alignment: .firstTextBaseline) {
                        Text(context.attributes.title)
                            .font(.subheadline.weight(.medium))
                            .lineLimit(1)
                        Spacer(minLength: 8)
                        ActivityTimerText(state: context.state, isStale: context.isStale, font: .title3.weight(.semibold))
                            .foregroundStyle(accent(for: context))
                    }
                    .padding(.horizontal, 4)
                }
            } compactLeading: {
                Circle().fill(tint).frame(width: 7, height: 7)
            } compactTrailing: {
                ActivityTimerText(state: context.state, isStale: context.isStale, font: .caption2.weight(.semibold))
                    .foregroundStyle(accent(for: context))
                    .frame(maxWidth: 62)
            } minimal: {
                ActivityTimerText(state: context.state, isStale: context.isStale, font: .caption2.weight(.semibold))
                    .foregroundStyle(accent(for: context))
            }
            .keylineTint(tint)
        }
    }

    /// The number stays neutral while the timer is simply running. Red is spent
    /// on the one thing worth spotting from across the room: the deadline has
    /// passed. Using the policy colour here would make a red-tinted P1 look
    /// identical whether it had thirty minutes left or was an hour late.
    private func accent(
        for context: ActivityViewContext<TickdownActivityAttributes>
    ) -> Color {
        if context.state.isOnHold { return .secondary }
        return isPastDue(context) ? .red : .primary
    }

    private func isPastDue(_ context: ActivityViewContext<TickdownActivityAttributes>) -> Bool {
        return context.isStale || context.state.deadline <= Date()
    }
}

@available(iOS 16.2, *)
private struct LockScreenView: View {
    let context: ActivityViewContext<TickdownActivityAttributes>

    var body: some View {
        let tint = Color(hex: context.attributes.tintHex)
        let pastDue = context.isStale || context.state.deadline <= Date()
        // Neutral while running; red is reserved for "this is late".
        let accent: Color = context.state.isOnHold ? .secondary : (pastDue ? .red : .primary)

        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                Circle().fill(tint).frame(width: 7, height: 7)
                Text(context.attributes.policyName)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Spacer(minLength: 8)
                if !context.attributes.reference.isEmpty {
                    Text(context.attributes.reference)
                        .font(.caption)
                        .foregroundStyle(.tertiary)
                }
            }

            Text(context.attributes.title)
                .font(.headline)
                .lineLimit(1)

            HStack(alignment: .firstTextBaseline) {
                ActivityTimerText(
                    state: context.state,
                    isStale: context.isStale,
                    font: .system(size: 34, weight: .bold, design: .rounded)
                )
                .foregroundStyle(accent)

                Spacer(minLength: 8)

                Text(caption(pastDue: pastDue))
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(16)
    }

    private func caption(pastDue: Bool) -> String {
        if context.state.isOnHold { return "on hold" }
        if pastDue { return context.state.countsUpWhenLate ? "overdue" : "past due" }
        return "until \(context.state.deadline.formatted(date: .omitted, time: .shortened))"
    }
}

/// Renders the live number: counting down before the deadline, counting the
/// lateness afterwards. Nothing here runs on a timer — SwiftUI ticks against
/// the fixed deadline by itself.
@available(iOS 16.2, *)
private struct ActivityTimerText: View {
    let state: TickdownActivityAttributes.ContentState
    let isStale: Bool
    var font: Font = .title

    var body: some View {
        Group {
            if state.isOnHold {
                Text(heldText)
            } else if let range = countdownRange {
                Text(timerInterval: range, countsDown: true)
            } else if state.countsUpWhenLate {
                Text(timerInterval: lateRange, countsDown: false)
            } else {
                Text("overdue")
            }
        }
        .font(font)
        .monospacedDigit()
        .lineLimit(1)
    }

    private var countdownRange: ClosedRange<Date>? {
        let now = Date()
        guard !isStale, state.deadline > now else { return nil }
        return now...state.deadline
    }

    /// A week is far more than any Live Activity will ever be allowed to live,
    /// so it simply acts as an open upper bound for the count-up.
    private var lateRange: ClosedRange<Date> {
        return state.deadline...state.deadline.addingTimeInterval(60 * 60 * 24 * 7)
    }

    private var heldText: String {
        let minutes = max(0, Int(state.heldMinutes.rounded()))
        let hours = minutes / 60
        let rest = minutes % 60
        if hours == 0 { return "\(rest)m" }
        return rest == 0 ? "\(hours)h" : "\(hours)h \(rest)m"
    }
}

extension Color {
    init(hex: String) {
        let cleaned = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var value: UInt64 = 0
        Scanner(string: cleaned).scanHexInt64(&value)
        guard cleaned.count == 6 else {
            self = .red
            return
        }
        self.init(
            .sRGB,
            red: Double((value >> 16) & 0xFF) / 255,
            green: Double((value >> 8) & 0xFF) / 255,
            blue: Double(value & 0xFF) / 255
        )
    }
}
