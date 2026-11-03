import { api } from './index';
import { LiveStraxApi } from './straxLive';
import { getDemoStraxApi } from './straxDemo';
import type { StraxApi } from './straxTypes';

export const straxApi: StraxApi = api.isDemo ? getDemoStraxApi(api) : new LiveStraxApi();
export type { StraxApi } from './straxTypes';
