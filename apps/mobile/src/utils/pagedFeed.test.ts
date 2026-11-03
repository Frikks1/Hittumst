import { describe, expect, it } from 'vitest';
import { emptyFeed, PagedFeed } from './pagedFeed';
type Item = { id: string };
const deferred = <T>() => { let resolve!: (value: T) => void; let reject!: (reason?: unknown) => void; const promise = new Promise<T>((a,b) => {resolve=a;reject=b;}); return {promise,resolve,reject}; };
describe('discovery request ordering', () => {
  it('preserves same-query cards during refresh and replaces all loaded pages together', async () => {
    const request = deferred<{items: Item[];nextCursor: string|null}>();
    let refreshing = false; let result = emptyFeed<Item>();
    const feed = new PagedFeed<Item,string>(async (_q, cursor) => {
      if (refreshing && !cursor) return request.promise;
      return cursor ? { items: [{ id: refreshing ? 'updated-tail' : 'old-tail' }], nextCursor: null }
        : { items: [{ id: 'old-first' }], nextCursor: 'next' };
    }, s => { result = s; });
    await feed.refresh('x', 'account-a:location-a:x'); await feed.more();
    refreshing = true;
    const pending = feed.refresh('x', 'account-a:location-a:x');
    expect(result.items).toEqual([{ id: 'old-first' }, { id: 'old-tail' }]);
    expect(result.loading).toBe(true);
    request.resolve({ items: [{ id: 'new-first' }], nextCursor: 'next' }); await pending;
    expect(result.items).toEqual([{ id: 'new-first' }, { id: 'updated-tail' }]);
    expect(result.cursor).toBeNull();
  });
  it.each(['account-b:location-a:x', 'account-a:location-b:x', 'account-a:location-a:other'])('does not preserve another authorization or query scope: %s', async key => {
    const request = deferred<{items: Item[];nextCursor: string|null}>();
    let result = emptyFeed<Item>(); let refresh = false;
    const feed = new PagedFeed<Item,string>(async () => refresh ? request.promise : {items:[{id:'private'}],nextCursor:null}, s => {result=s;});
    await feed.refresh('x', 'account-a:location-a:x'); refresh = true;
    const pending = feed.refresh('x', key);
    expect(result.items).toEqual([]);
    request.resolve({items:[{id:'allowed'}],nextCursor:null}); await pending;
    expect(result.items).toEqual([{id:'allowed'}]);
  });
  it('keeps only same-scope cards after a refresh error and never restores them after clear', async () => {
    let failing = false; let result = emptyFeed<Item>();
    const feed = new PagedFeed<Item,string>(async () => {
      if (failing) throw Error('offline');
      return {items:[{id:'visible'}],nextCursor:null};
    }, s => {result=s;});
    await feed.refresh('x', 'a:x'); failing = true;
    await feed.refresh('x', 'a:x');
    expect(result.items).toEqual([{id:'visible'}]); expect(result.error).toBe(true);
    feed.clear(); await feed.refresh('x', 'a:x');
    expect(result.items).toEqual([]);
  });
  it.each([{ code: '42501' }, { code: '28000' }, { status: 401 }, { status: 403 }])('clears previously visible cards when server access is revoked: %j', async denial => {
    let revoked = false; let result = emptyFeed<Item>();
    const feed = new PagedFeed<Item,string>(async () => {
      if (revoked) throw denial;
      return { items: [{ id: 'private' }], nextCursor: 'next' };
    }, snapshot => { result = snapshot; });
    await feed.refresh('x', 'same-account-and-location');
    revoked = true;
    await feed.more();
    expect(result.items).toEqual([]);
    expect(result.cursor).toBeNull();
    expect(result.error).toBe(true);
    await feed.refresh('x', 'same-account-and-location');
    expect(result.items).toEqual([]);
  });
  it('keeps visible cards behind a modal while ignoring an unfinished page', async () => {
    const page = deferred<{items: Item[];nextCursor: string|null}>();
    let result = emptyFeed<Item>();
    const feed = new PagedFeed<Item,string>(async (_q, cursor) => cursor
      ? page.promise : {items:[{id:'visible'}],nextCursor:'next'}, s => {result=s;});
    await feed.refresh('x');
    const pending = feed.more();
    feed.pause();
    expect(result.items).toEqual([{id:'visible'}]);
    expect(result.loading).toBe(false);
    page.resolve({items:[{id:'late'}],nextCursor:null});
    await pending;
    expect(result.items).toEqual([{id:'visible'}]);
    feed.clear();
    expect(result).toEqual(emptyFeed());
  });
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
