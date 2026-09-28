import {describe,it,expect} from 'vitest';
import {accountMediaFilename,attachmentFilename} from './account-download';
describe('account media download names',()=>{
 it('preserves allowed image/video extensions without exposing original paths',()=>{expect(accountMediaFilename('id','private/owner/file.JPG')).toBe('id.jpg');expect(accountMediaFilename('id','quarantine/video.mp4')).toBe('id.mp4');expect(accountMediaFilename('id','private/script.html')).toBe('id.bin');});
 it('uses the server attachment name only when it is a safe basename with an allowed extension',()=>{expect(attachmentFilename('attachment; filename="opaque-file.jpg"','fallback.bin')).toBe('opaque-file.jpg');for(const input of ['attachment; filename="../secret.jpg"','attachment; filename="script.exe"','inline; filename="data.jpg"','attachment; filename="a\\b.jpg"',null])expect(attachmentFilename(input,'fallback.bin')).toBe('fallback.bin');});
});
