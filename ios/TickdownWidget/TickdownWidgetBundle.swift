//
//  TickdownWidgetBundle.swift
//  TickdownWidget
//
//  Created by Wisnu Yudistirawan on 19/08/26.
//

import WidgetKit
import SwiftUI

@main
struct TickdownWidgetBundle: WidgetBundle {
    var body: some Widget {
        TickdownWidget()
        TickdownWidgetLiveActivity()
    }
}
