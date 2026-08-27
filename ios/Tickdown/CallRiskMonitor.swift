import AppSealingFramework
import Foundation
import React

/// Bridges AppSealing's Call Risk Protection callback to JavaScript, and closes
/// the app itself when the signal is strong.
///
/// Sealing runs with `-call-protection=enable,action=callback`, so the SDK
/// reports call-like activity and does nothing else: no alert, no termination.
/// That buys us our own sheet instead of the SDK's fixed alert, but it also
/// means the enforcement is now ours to provide.
///
/// It lives here rather than in JavaScript on purpose. The countdown to `exit`
/// runs in compiled code inside the app binary, covered by AppSealing's
/// integrity hash and anti-hooking, so a tampered JavaScript runtime can
/// suppress the sheet but cannot keep the app open. Defeating this means
/// patching the binary, which trips the environment checks instead.
///
/// The handler is registered from `AppDelegate` rather than from this module's
/// `init`, because React Native builds native modules lazily on first use. A
/// call already in progress at launch would otherwise be reported before
/// JavaScript ever touched us, and lost. Events that arrive before JavaScript is
/// listening are held and delivered on subscribe.
@objc(CallRiskMonitor)
class CallRiskMonitor: RCTEventEmitter {

    private static let eventName = "callRiskDetected"

    /// Long enough for the user to read why the app is closing — the same grace
    /// period the SDK's own `warning-exit` action gives. Kept in step with the
    /// copy in `src/ui/SecuritySheet.tsx`.
    private static let graceSeconds = 5.0

    /// Set once the app delegate has wired us to the SDK.
    private static var registered = false

    /// The live emitter, if JavaScript is currently subscribed.
    private static weak var sink: CallRiskMonitor?

    /// Holds the most recent event while nothing is listening.
    private static var pending: [String: Any]?

    /// The close is scheduled once per process; a second call must not extend it.
    private static var watchdogArmed = false

    private static let lock = NSLock()

    /// Registers with AppSealing. Call once, as early in launch as possible.
    @objc static func startMonitoring() {
        lock.lock()
        defer { lock.unlock() }
        guard !registered else { return }
        registered = true

        AppSealingInterface._NotifyCallProtectionDetected { event in
            let payload = event as? [String: Any] ?? [:]
            // "high" for a CallKit call, "medium" for a bare audio
            // interruption, which other system events can also cause. Only the
            // former is certain enough to close the app over.
            let confidence = payload["confidence"] as? String ?? "medium"

            if confidence == "high" {
                armWatchdog()
            }

            deliver([
                "reason": payload["reason"] as? String ?? "unknown",
                "confidence": confidence,
            ])
        }
    }

    /// Schedules the close. Deliberately has no cancel path: nothing JavaScript
    /// does, or fails to do, may call it off.
    private static func armWatchdog() {
        lock.lock()
        let alreadyArmed = watchdogArmed
        watchdogArmed = true
        lock.unlock()

        guard !alreadyArmed else { return }
        DispatchQueue.main.asyncAfter(deadline: .now() + graceSeconds) {
            exit(0)
        }
    }

    private static func deliver(_ body: [String: Any]) {
        lock.lock()
        let target = sink
        if target == nil {
            pending = body
        }
        lock.unlock()

        guard let target else { return }
        target.sendEvent(withName: eventName, body: body)
    }

    override static func requiresMainQueueSetup() -> Bool {
        return false
    }

    override func supportedEvents() -> [String] {
        return [CallRiskMonitor.eventName]
    }

    override func startObserving() {
        CallRiskMonitor.lock.lock()
        CallRiskMonitor.sink = self
        let held = CallRiskMonitor.pending
        CallRiskMonitor.pending = nil
        CallRiskMonitor.lock.unlock()

        if let held {
            sendEvent(withName: CallRiskMonitor.eventName, body: held)
        }
    }

    override func stopObserving() {
        CallRiskMonitor.lock.lock()
        if CallRiskMonitor.sink === self {
            CallRiskMonitor.sink = nil
        }
        CallRiskMonitor.lock.unlock()
    }
}
