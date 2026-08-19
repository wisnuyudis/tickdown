#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE (LiveActivityManager, NSObject)

RCT_EXTERN_METHOD(isSupported : (RCTPromiseResolveBlock)resolve
                  reject : (RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(start : (NSDictionary *)payload
                  resolve : (RCTPromiseResolveBlock)resolve
                  reject : (RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(end : (NSString *)timerId
                  resolve : (RCTPromiseResolveBlock)resolve
                  reject : (RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(listActive : (RCTPromiseResolveBlock)resolve
                  reject : (RCTPromiseRejectBlock)reject)

@end
