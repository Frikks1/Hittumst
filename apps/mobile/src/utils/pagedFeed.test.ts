import { describe, expect, it } from 'vitest';
import { emptyFeed, PagedFeed } from './pagedFeed';
type Item = { id: string };
const deferred = <T>() => { let resolve!: (value: T) => void; let reject!: (reason?: unknown) => void; const promise = new Promise<T>((a,b) => {resolve=a;reject=b;}); return {promise,resolve,reject}; };
describe('discovery request ordering', () => {
  it('discards responses from a previous filter', async () => {
    const first = deferred<{items: Item[];nextCursor: string|null}>();
    let result = emptyFeed<Item>();
    const feed = new PagedFeed<Item,string>(q => q === 'old' ? first.promise : Promise.resolve({items:[{id:'new'}],nextCursor:null}), s => {result=s;});
    const older = feed.refresh('old'); await feed.refresh('new');
    first.resolve({items:[{id:'old'}],nextCursor:null}); await older;
    expect(result.items).toEqual([{id:'new'}]);
  });
  it('does not restore profiles after location access is lost', async () => {
    const request = deferred<{items: Item[];nextCursor: string|null}>(); let result = emptyFeed<Item>();
    const feed = new PagedFeed<Item,string>(() => request.promise, s => {result=s;});
    const loading=feed.refresh('x'); feed.clear(); request.resolve({items:[{id:'private'}],nextCursor:null}); await loading;
    expect(result).toEqual(emptyFeed());
  });
  it('deduplicates pages, retries a failed page, and stops a repeated cursor', async () => {
    let calls=0; let result=emptyFeed<Item>();
    const feed=new PagedFeed<Item,string>(async (_q,cursor) => {
      calls++; if(calls===2) throw Error('offline');
      return cursor ? {items:[{id:'a'},{id:'b'}],nextCursor:'next'} : {items:[{id:'a'}],nextCursor:'next'};
    },s=>{result=s;});
    await feed.refresh('x'); await feed.more(); expect(result.error).toBe(true);
    expect(result.items).toEqual([{id:'a'}]); await feed.more();
    expect(result.items).toEqual([{id:'a'},{id:'b'}]); expect(result.cursor).toBeNull();
  });
  it('ignores a stale error while a newer request is loading', async () => {
    const a=deferred<{items:Item[];nextCursor:null}>(), b=deferred<{items:Item[];nextCursor:null}>();
    let result=emptyFeed<Item>(); const feed=new PagedFeed<Item,string>(q=>q==='a'?a.promise:b.promise,s=>{result=s;});
    const old=feed.refresh('a'), current=feed.refresh('b'); a.reject(Error('offline')); await old;
    expect(result.loading).toBe(true); expect(result.error).toBe(false);
    b.resolve({items:[],nextCursor:null}); await current; expect(result.loading).toBe(false);
  });
});
