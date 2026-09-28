#import <React/RCTBridgeModule.h>
@interface RCT_EXTERN_MODULE(PrivateNativeDiagnostics, NSObject)
RCT_EXTERN_METHOD(setSession:(NSString * _Nullable)sessionKey expiresAtMs:(double)expiresAtMs resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
@end
