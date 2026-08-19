import ActivityKit
import Foundation
import React

/// Bridges Live Activities to JavaScript.
///
/// Deliberately small: start (which doubles as update), end, and enough
/// introspection for the JS side to reconcile what is on screen with what
/// should be. Everything is guarded on iOS 16.2 because the app itself still
/// supports iOS 15.1.
@objc(LiveActivityManager)
class LiveActivityManager: NSObject {

    @objc static func requiresMainQueueSetup() -> Bool {
        return false
    }

    @available(iOS 16.2, *)
    private static func activity(for timerId: String) -> Activity<TickdownActivityAttributes>? {
        return Activity<TickdownActivityAttributes>.activities.first {
            $0.attributes.timerId == timerId
        }
    }

    @objc(isSupported:reject:)
    func isSupported(_ resolve: @escaping RCTPromiseResolveBlock,
                     reject: @escaping RCTPromiseRejectBlock) {
        if #available(iOS 16.2, *) {
            resolve(ActivityAuthorizationInfo().areActivitiesEnabled)
        } else {
            resolve(false)
        }
    }

    /// Starts an activity, or updates the one already showing for this timer.
    @objc(start:resolve:reject:)
    func start(_ payload: NSDictionary,
               resolve: @escaping RCTPromiseResolveBlock,
               reject: @escaping RCTPromiseRejectBlock) {
        guard #available(iOS 16.2, *) else {
            resolve(false)
            return
        }
        guard ActivityAuthorizationInfo().areActivitiesEnabled else {
            resolve(false)
            return
        }
        guard let timerId = payload["timerId"] as? String,
              let deadlineMillis = payload["deadline"] as? Double else {
            reject("bad_payload", "timerId and deadline are required", nil)
            return
        }

        let deadline = Date(timeIntervalSince1970: deadlineMillis / 1000)
        let state = TickdownActivityAttributes.ContentState(
            deadline: deadline,
            countsUpWhenLate: payload["countsUpWhenLate"] as? Bool ?? false,
            isOnHold: payload["isOnHold"] as? Bool ?? false,
            heldMinutes: payload["heldMinutes"] as? Double ?? 0
        )
        // Going stale at the deadline is what flips the widget from counting
        // down to showing lateness, without an update from us.
        let content = ActivityContent(state: state, staleDate: deadline)

        if let existing = LiveActivityManager.activity(for: timerId) {
            Task {
                await existing.update(content)
                resolve(true)
            }
            return
        }

        let attributes = TickdownActivityAttributes(
            timerId: timerId,
            title: payload["title"] as? String ?? "",
            reference: payload["reference"] as? String ?? "",
            policyName: payload["policyName"] as? String ?? "",
            tintHex: payload["tintHex"] as? String ?? "#e5484d"
        )

        do {
            _ = try Activity<TickdownActivityAttributes>.request(
                attributes: attributes,
                content: content,
                pushType: nil
            )
            resolve(true)
        } catch {
            reject("start_failed", error.localizedDescription, error)
        }
    }

    @objc(end:resolve:reject:)
    func end(_ timerId: String,
             resolve: @escaping RCTPromiseResolveBlock,
             reject: @escaping RCTPromiseRejectBlock) {
        guard #available(iOS 16.2, *) else {
            resolve(false)
            return
        }
        guard let activity = LiveActivityManager.activity(for: timerId) else {
            resolve(false)
            return
        }
        Task {
            await activity.end(nil, dismissalPolicy: .immediate)
            resolve(true)
        }
    }

    /// Timer ids that currently have an activity on screen.
    @objc(listActive:reject:)
    func listActive(_ resolve: @escaping RCTPromiseResolveBlock,
                    reject: @escaping RCTPromiseRejectBlock) {
        guard #available(iOS 16.2, *) else {
            resolve([])
            return
        }
        resolve(Activity<TickdownActivityAttributes>.activities.map { $0.attributes.timerId })
    }
}
