import type {SupabaseClient} from '@supabase/supabase-js';
import {beforeEach,describe,it,expect,vi} from 'vitest';
const mocks=vi.hoisted(()=>({open:vi.fn(),revoke:vi.fn()}));
vi.mock('./apple-tokens',()=>({openAppleToken:mocks.open,revokeAppleToken:mocks.revoke}));
import {revokeAppleAccount} from './apple-account';
const rpc=vi.fn(),db={rpc} as unknown as SupabaseClient;
beforeEach(()=>{vi.resetAllMocks();mocks.open.mockReturnValue('private-token');});
describe('Apple deletion revocation',()=>{
 it('permits deletion when an Apple account has no stored revocable token',async()=>{rpc.mockResolvedValue({data:{requiresRevocation:true,token:null},error:null});await revokeAppleAccount(db,'account');expect(mocks.revoke).not.toHaveBeenCalled();});
 it('always revokes an existing ciphertext even when the identity was later unlinked',async()=>{rpc.mockResolvedValue({data:{requiresRevocation:false,token:{sealedToken:'cipher',clientId:'client'}},error:null});await revokeAppleAccount(db,'account');expect(mocks.open).toHaveBeenCalledWith('cipher','account','client');expect(mocks.revoke).toHaveBeenCalledWith('private-token','client');});
 it('does not treat read/decryption/provider errors as absence of a token',async()=>{rpc.mockResolvedValue({error:{code:'offline'},data:null});await expect(revokeAppleAccount(db,'account')).rejects.toThrow('apple_revocation_pending');rpc.mockResolvedValue({data:{token:{sealedToken:'cipher',clientId:'client'}},error:null});mocks.open.mockImplementationOnce(()=>{throw Error('decrypt');});await expect(revokeAppleAccount(db,'account')).rejects.toThrow('decrypt');mocks.revoke.mockRejectedValueOnce(Error('provider'));await expect(revokeAppleAccount(db,'account')).rejects.toThrow('provider');});
 it('does not silently skip a malformed stored token envelope',async()=>{rpc.mockResolvedValue({data:{requiresRevocation:true,token:{}},error:null});await expect(revokeAppleAccount(db,'account')).rejects.toThrow('apple_revocation_pending');});
});
