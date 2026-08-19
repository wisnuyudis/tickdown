import Foundation
import React
import UserNotifications

/// Schedules the SLA warnings as plain local notifications.
///
/// Every alert is an absolute instant worked out on the business clock before
/// it gets here, so iOS can hold them itself. Nothing of ours needs to run:
/// they fire on time even if the app has not been opened for days, which is
/// exactly what a Live Activity cannot promise.
@objc(NotificationManager)
class NotificationManager: NSObject, UNUserNotificationCenterDelegate {

    /// Namespaces our requests so a sweep never disturbs anything else.
    private static let prefix = "tickdown:"

    /// iOS keeps only the 64 soonest pending notifications per app and silently
    /// drops the rest, so we choose which ones survive rather than let it guess.
    private static let pendingLimit = 64

    override init() {
        super.init()
        UNUserNotificationCenter.current().delegate = self
    }

    @objc static func requiresMainQueueSetup() -> Bool {
        return true
    }

    @objc(requestPermission:reject:)
    func requestPermission(_ resolve: @escaping RCTPromiseResolveBlock,
                           reject: @escaping RCTPromiseRejectBlock) {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { granted, error in
            if let error = error {
                reject("permission_failed", error.localizedDescription, error)
            } else {
                resolve(granted)
            }
        }
    }

    /// "granted", "denied" or "undetermined".
    @objc(getPermission:reject:)
    func getPermission(_ resolve: @escaping RCTPromiseResolveBlock,
                       reject: @escaping RCTPromiseRejectBlock) {
        UNUserNotificationCenter.current().getNotificationSettings { settings in
            switch settings.authorizationStatus {
            case .authorized, .provisional, .ephemeral:
                resolve("granted")
            case .denied:
                resolve("denied")
            default:
                resolve("undetermined")
            }
        }
    }

    /// Replaces every pending Tickdown notification with exactly this set.
    ///
    /// Reconciliation rather than incremental edits: the caller says what the
    /// world should look like and this makes it so, which stays correct after
    /// a timer is paused, resolved, deleted or has its policy changed.
    @objc(sync:resolve:reject:)
    func sync(_ alerts: NSArray,
              resolve: @escaping RCTPromiseResolveBlock,
              reject: @escaping RCTPromiseRejectBlock) {
        let center = UNUserNotificationCenter.current()

        let wanted: [(id: String, fireAt: Date, title: String, body: String)] = alerts
            .compactMap { entry in
                guard let alert = entry as? NSDictionary,
                      let id = alert["id"] as? String,
                      let fireAtMillis = alert["fireAt"] as? Double else {
                    return nil
                }
                return (
                    id: NotificationManager.prefix + id,
                    fireAt: Date(timeIntervalSince1970: fireAtMillis / 1000),
                    title: alert["title"] as? String ?? "Tickdown",
                    body: alert["body"] as? String ?? ""
                )
            }
            .filter { $0.fireAt > Date() }
            .sorted { $0.fireAt < $1.fireAt }
            .prefix(NotificationManager.pendingLimit)
            .map { $0 }

        center.getPendingNotificationRequests { pending in
            let ours = pending
                .map { $0.identifier }
                .filter { $0.hasPrefix(NotificationManager.prefix) }
            center.removePendingNotificationRequests(withIdentifiers: ours)

            let calendar = Calendar.current
            let fields: Set<Calendar.Component> = [.year, .month, .day, .hour, .minute, .second]

            for alert in wanted {
                let content = UNMutableNotificationContent()
                content.title = alert.title
                content.body = alert.body
                content.sound = .default

                let trigger = UNCalendarNotificationTrigger(
                    dateMatching: calendar.dateComponents(fields, from: alert.fireAt),
                    repeats: false
                )
                center.add(UNNotificationRequest(identifier: alert.id, content: content, trigger: trigger))
            }

            resolve(wanted.count)
        }
    }

    /// Identifiers currently scheduled, without the namespace prefix.
    @objc(listPending:reject:)
    func listPending(_ resolve: @escaping RCTPromiseResolveBlock,
                     reject: @escaping RCTPromiseRejectBlock) {
        UNUserNotificationCenter.current().getPendingNotificationRequests { pending in
            resolve(
                pending
                    .map { $0.identifier }
                    .filter { $0.hasPrefix(NotificationManager.prefix) }
                    .map { String($0.dropFirst(NotificationManager.prefix.count)) }
            )
        }
    }

    // Without this, iOS swallows the banner whenever the app is already open —
    // which is precisely when someone is watching the countdown.
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        completionHandler([.banner, .sound, .list])
    }
}
