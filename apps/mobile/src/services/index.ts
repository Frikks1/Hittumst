import { runtimeEnv } from './env';
import { LiveRummalApi } from './liveApi';
import { MockRummalApi } from './mockApi';

export const api = runtimeEnv.isDemo ? new MockRummalApi() : new LiveRummalApi();
export { authService } from './auth';
export { runtimeEnv } from './env';
export type { AuthProvider, AuthService, AuthUser, OnboardingPayload, RummalApi } from './types';
