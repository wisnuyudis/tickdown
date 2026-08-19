#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE (NotificationManager, NSObject)

RCT_EXTERN_METHOD(requestPermission : (RCTPromiseResolveBlock)resolve
                  reject : (RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(getPermission : (RCTPromiseResolveBlock)resolve
                  reject : (RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(sync : (NSArray *)alerts
                  resolve : (RCTPromiseResolveBlock)resolve
                  reject : (RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(listPending : (RCTPromiseResolveBlock)resolve
                  reject : (RCTPromiseRejectBlock)reject)

@end
