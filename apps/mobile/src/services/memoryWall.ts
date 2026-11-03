import { api } from './index';
import { DemoMemoryWallApi } from './memoryWallDemo';
import { LiveMemoryWallApi } from './memoryWallLive';
import type { MemoryWallApi } from './memoryWallTypes';

export const memoryWallApi: MemoryWallApi = api.isDemo ? new DemoMemoryWallApi(api) : new LiveMemoryWallApi();
export type { MemoryWallApi } from './memoryWallTypes';
