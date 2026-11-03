import { api } from './index';
import { DemoSocialFeedApi } from './socialFeedDemo';
import { LiveSocialFeedApi } from './socialFeedLive';
import type { SocialFeedApi } from './socialFeedTypes';
export const socialFeedApi: SocialFeedApi = api.isDemo
  ? new DemoSocialFeedApi(api)
  : new LiveSocialFeedApi();
export type { SocialFeedApi } from './socialFeedTypes';
