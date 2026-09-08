import { afterEach, describe, expect, it, vi } from 'vitest';
import { getRuntimeConfig } from './env';
afterEach(()=>vi.unstubAllEnvs());
describe('admin release configuration',()=>{
  it('never exposes a demo admin in production',()=>{
    vi.stubEnv('NODE_ENV','production');vi.stubEnv('NEXT_PUBLIC_RUMMAL_DEMO_MODE','true');
    expect(()=>getRuntimeConfig()).toThrow(/demo/i);
  });
  it('rejects a production build without a backend',()=>{
    vi.stubEnv('NODE_ENV','production');vi.stubEnv('NEXT_PUBLIC_RUMMAL_DEMO_MODE','false');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL','');vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY','');
    expect(()=>getRuntimeConfig()).toThrow(/configured/i);
  });
  it('rejects secret keys and arbitrary JWTs',()=>{
    vi.stubEnv('NODE_ENV','production');vi.stubEnv('NEXT_PUBLIC_RUMMAL_DEMO_MODE','false');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL','https://example.supabase.co');
    for(const key of ['sb_secret_example_long_enough','header.service_role.signature']){
      vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',key);expect(()=>getRuntimeConfig()).toThrow();
    }
  });
});
