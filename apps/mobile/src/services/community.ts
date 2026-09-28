import { api } from './index';
import { LiveCommunityApi } from './communityLive';
import { DemoCommunityApi } from './communityDemo';
import type { CommunityApi } from './communityTypes';
export const communityApi: CommunityApi = api.isDemo ? new DemoCommunityApi(api) : new LiveCommunityApi();
export type { CommunityApi } from './communityTypes';
