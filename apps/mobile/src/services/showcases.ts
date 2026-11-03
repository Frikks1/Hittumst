import { api } from './index';
import { DemoShowcaseApi, DemoShowcaseStore } from './showcaseDemo';
import { LiveShowcaseApi } from './showcaseLive';
import type { ShowcaseApi } from './showcaseTypes';

export const showcaseApi: ShowcaseApi = api.isDemo ? new DemoShowcaseApi(api, new DemoShowcaseStore(), { simulateMediaReview: true }) : new LiveShowcaseApi();
export type { ShowcaseApi } from './showcaseTypes';
