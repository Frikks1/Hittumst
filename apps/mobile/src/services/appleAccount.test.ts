import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks=vi.hoisted(()=>({request:vi.fn(),available:vi.fn(),signIn:vi.fn(),browser:vi.fn(),platform:{OS:'ios'},env:{isDemo:false}}));
vi.mock('./memberApi',()=>({memberRequest:mocks.request}));
vi.mock('./env',()=>({runtimeEnv:mocks.env}));
vi.mock('react-native',()=>({Platform:mocks.platform}));
vi.mock('expo-apple-authentication',()=>({isAvailableAsync:mocks.available,signInAsync:mocks.signIn}));
vi.mock('expo-web-browser',()=>({openAuthSessionAsync:mocks.browser}));
import { prepareAppleAccountDeletion } from './appleAccount';
beforeEach(()=>{
  vi.resetAllMocks();mocks.env.isDemo=false;mocks.platform.OS='ios';
  mocks.request.mockResolvedValue({requiresRevocation:true,ready:false});mocks.available.mockResolvedValue(true);
  mocks.signIn.mockResolvedValue({authorizationCode:'synthetic-code'});
});
describe('Apple deletion preparation',()=>{
  it.each([{requiresRevocation:false,ready:true},{requiresRevocation:true,ready:true}])('does not reauthorize an account already ready for deletion (%j)',async state=>{
    mocks.request.mockResolvedValue(state);expect(await prepareAppleAccountDeletion('account-a')).toBe('ready');
    expect(mocks.signIn).not.toHaveBeenCalled();expect(mocks.request).toHaveBeenCalledWith('/api/account/apple',undefined,'account-a');
  });
  it('stores reauthorized credentials only for the account requesting deletion',async()=>{
    expect(await prepareAppleAccountDeletion('account-a')).toBe('ready');
    expect(mocks.request).toHaveBeenLastCalledWith('/api/account/apple',{code:'synthetic-code'},'account-a');
  });
  it.each(['cancelled','unavailable'])('offers manual continuation when Apple is %s',async reason=>{
    mocks.signIn.mockRejectedValue(new Error(reason));expect(await prepareAppleAccountDeletion('account-a')).toBe('manual_revocation');
    expect(mocks.request).toHaveBeenCalledTimes(1);
  });
  it('offers manual continuation when token custody cannot be reached',async()=>{
    mocks.request.mockRejectedValue(new Error('service_unavailable'));expect(await prepareAppleAccountDeletion('account-a')).toBe('manual_revocation');
    expect(mocks.signIn).not.toHaveBeenCalled();
  });
  it('does not turn a changed or missing account into an authorization bypass',async()=>{
    mocks.request.mockRejectedValue(new Error('authentication_required'));
    await expect(prepareAppleAccountDeletion('account-a')).rejects.toThrow('authentication_required');
  });
  it('does not open an untrusted reauthorization destination',async()=>{
    mocks.platform.OS='android';mocks.request.mockResolvedValueOnce({requiresRevocation:true,ready:false}).mockResolvedValueOnce({url:'https://untrusted.example/auth/authorize'});
    expect(await prepareAppleAccountDeletion('account-a')).toBe('manual_revocation');expect(mocks.browser).not.toHaveBeenCalled();
  });
  it('offers manual continuation after cancelling browser reauthorization',async()=>{
    mocks.platform.OS='android';mocks.request.mockResolvedValueOnce({requiresRevocation:true,ready:false}).mockResolvedValueOnce({url:'https://appleid.apple.com/auth/authorize'});mocks.browser.mockResolvedValue({type:'cancel'});
    expect(await prepareAppleAccountDeletion('account-a')).toBe('manual_revocation');
  });
  it('requires server confirmation even after a successful browser return',async()=>{
    mocks.platform.OS='android';mocks.request.mockResolvedValueOnce({requiresRevocation:true,ready:false}).mockResolvedValueOnce({url:'https://appleid.apple.com/auth/authorize'}).mockResolvedValueOnce({requiresRevocation:true,ready:false});mocks.browser.mockResolvedValue({type:'success'});
    expect(await prepareAppleAccountDeletion('account-a')).toBe('manual_revocation');
    expect(mocks.request).toHaveBeenLastCalledWith('/api/account/apple',undefined,'account-a');
  });
});
