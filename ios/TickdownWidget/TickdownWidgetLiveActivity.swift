//
//  TickdownWidgetLiveActivity.swift
//  TickdownWidget
//
//  Created by Wisnu Yudistirawan on 19/08/26.
//

import ActivityKit
import WidgetKit
import SwiftUI

struct TickdownWidgetAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        // Dynamic stateful properties about your activity go here!
        var emoji: String
    }

    // Fixed non-changing properties about your activity go here!
    var name: String
}

struct TickdownWidgetLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: TickdownWidgetAttributes.self) { context in
            // Lock screen/banner UI goes here
            VStack {
                Text("Hello \(context.state.emoji)")
            }
            .activityBackgroundTint(Color.cyan)
            .activitySystemActionForegroundColor(Color.black)

        } dynamicIsland: { context in
            DynamicIsland {
                // Expanded UI goes here.  Compose the expanded UI through
                // various regions, like leading/trailing/center/bottom
                DynamicIslandExpandedRegion(.leading) {
                    Text("Leading")
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Text("Trailing")
                }
                DynamicIslandExpandedRegion(.bottom) {
                    Text("Bottom \(context.state.emoji)")
                    // more content
                }
            } compactLeading: {
                Text("L")
            } compactTrailing: {
                Text("T \(context.state.emoji)")
            } minimal: {
                Text(context.state.emoji)
            }
            .widgetURL(URL(string: "http://www.apple.com"))
            .keylineTint(Color.red)
        }
    }
}

extension TickdownWidgetAttributes {
    fileprivate static var preview: TickdownWidgetAttributes {
        TickdownWidgetAttributes(name: "World")
    }
}

extension TickdownWidgetAttributes.ContentState {
    fileprivate static var smiley: TickdownWidgetAttributes.ContentState {
        TickdownWidgetAttributes.ContentState(emoji: "😀")
     }
     
     fileprivate static var starEyes: TickdownWidgetAttributes.ContentState {
         TickdownWidgetAttributes.ContentState(emoji: "🤩")
     }
}

#Preview("Notification", as: .content, using: TickdownWidgetAttributes.preview) {
   TickdownWidgetLiveActivity()
} contentStates: {
    TickdownWidgetAttributes.ContentState.smiley
    TickdownWidgetAttributes.ContentState.starEyes
}
