import ActivityKit
import Foundation

/// Shared between the app (which starts and ends activities) and the widget
/// extension (which renders them), so both agree on the payload shape.
@available(iOS 16.2, *)
struct TickdownActivityAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        /// Absolute instant the SLA expires.
        ///
        /// Fixed for as long as the timer runs, which is the whole trick: SwiftUI
        /// can tick against it on its own, so no code of ours has to run in the
        /// background and no server has to push updates.
        var deadline: Date

        /// True for round-the-clock policies. Their lateness is plain wall-clock
        /// time, so the widget can count it upward unaided. Business-hours
        /// policies cannot — the widget has no calendar — so they show a static
        /// overdue state instead.
        var countsUpWhenLate: Bool

        var isOnHold: Bool

        /// Working minutes still held, shown while the timer is on hold.
        var heldMinutes: Double
    }

    /// Our own timer id, so an activity can be matched back to its timer even
    /// after the app has been relaunched.
    var timerId: String
    var title: String
    var reference: String
    var policyName: String
    var tintHex: String
}
