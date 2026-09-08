import { beforeEach,describe,expect,it,vi } from 'vitest';
const mock=vi.hoisted(()=>({from:vi.fn(),getUser:vi.fn()}));
vi.mock('./supabase',()=>({supabase:{from:mock.from,auth:{getUser:mock.getUser}}}));
vi.mock('expo-crypto',()=>({randomUUID:()=> 'new-id'}));
vi.mock('expo-image-manipulator',()=>({manipulateAsync:vi.fn(),SaveFormat:{JPEG:'jpeg'}}));
import { LiveRummalApi } from './liveApi';
const row={id:'stable-id',conversation_id:'chat',sender_id:'me',body:'Hello',image_path:null,message_kind:'text',album_share_id:null,album_item_id:null,created_at:'2026-09-07T12:00:00Z',deleted_at:null};
function chain(result:unknown){const query:any={};for(const method of ['insert','select','eq','update','lt'])query[method]=vi.fn(()=>query);query.single=vi.fn(async()=>result);return query;}
beforeEach(()=>{vi.clearAllMocks();mock.getUser.mockResolvedValue({data:{user:{id:'me'}},error:null});});
describe('live text delivery',()=>{
  it('reuses the caller message identifier in its insert',async()=>{
    const query=chain({data:row,error:null});mock.from.mockReturnValue(query);
    const result=await new LiveRummalApi().sendText('chat',' Hello ','stable-id');
    expect(query.insert).toHaveBeenCalledWith({id:'stable-id',conversation_id:'chat',sender_id:'me',body:'Hello'});
    expect(result.status).toBe('sent');
  });
  it('recovers a confirmed insert after the first acknowledgement was lost',async()=>{
    const insert=chain({data:null,error:{code:'23505'}}),read=chain({data:row,error:null});mock.from.mockReturnValueOnce(insert).mockReturnValueOnce(read);
    const result=await new LiveRummalApi().sendText('chat','Hello','stable-id');
    expect(result.id).toBe('stable-id');expect(read.eq.mock.calls).toEqual([['id','stable-id'],['conversation_id','chat'],['sender_id','me']]);
  });
  it('never treats a reused identifier with different text as a success',async()=>{
    mock.from.mockReturnValueOnce(chain({data:null,error:{code:'23505'}})).mockReturnValueOnce(chain({data:{...row,body:'Other text'},error:null}));
    await expect(new LiveRummalApi().sendText('chat','Hello','stable-id')).rejects.toMatchObject({code:'23505'});
  });
  it('rejects an invalid message before contacting the backend',async()=>{
    await expect(new LiveRummalApi().sendText('chat',' '.repeat(8))).rejects.toThrow('invalid_message_body');expect(mock.from).not.toHaveBeenCalled();
  });
});
