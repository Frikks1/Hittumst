import { describe, expect, it } from 'vitest';
import { evaluateReadiness } from './operations-readiness';
function snapshot() { return {
 workers: Object.fromEntries(['account-deletion','media','commerce','push','voice','billing'].map(name => [name, {state:'passed', ageSeconds:2, successAgeSeconds:2}])),
 queues: Object.fromEntries(['media','cleanup','accountDeletion','push','billing'].map(name => [name,{pending:0,overdue:0,failed:0}])),
}; }
describe('operational readiness', () => {
 it('requires actual backend metrics and all intended workers', () => {
  expect(evaluateReadiness(snapshot()).status).toBe('ok');
  expect(evaluateReadiness({}).status).toBe('degraded');
 });
 it('detects missing schedules, failed runs and overdue cleanup', () => {
  const input=snapshot(); input.workers.voice!.ageSeconds=31; input.workers.media!.state='failed'; input.queues.cleanup!.overdue=1;
  expect(evaluateReadiness(input).issues).toEqual(expect.arrayContaining(['voice_unhealthy','media_unhealthy','cleanup_backlog']));
 });
 it('never reflects raw database/provider strings or member fields', () => {
  const input=snapshot(); input.workers.media!.state='private credential';
  const result=evaluateReadiness({...input, privateMember:'private credential'});
  expect(JSON.stringify(result)).not.toContain('private credential');
  expect(result.status).toBe('degraded');
 });
});

