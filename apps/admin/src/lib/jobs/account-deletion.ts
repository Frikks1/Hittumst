export type DeletionJob = { id: string; account_id: string; objects: { bucket: string; name: string }[] };
export type DeletionOperations = {
  publishDeletionTombstone(job: DeletionJob): Promise<void>;
  removeObjects(bucket: string, names: string[]): Promise<void>;
  revokeIdentityProvider(accountId: string): Promise<void>;
  deleteAuthUser(accountId: string): Promise<void>;
  finish(jobId: string, succeeded: boolean): Promise<void>;
};

/** Retries are safe: deleting an already absent object/user is treated as success by the adapter. */
export async function runDeletionJob(job: DeletionJob, operations: DeletionOperations): Promise<boolean> {
  try {
    // Publish and read-verify the independent tombstone before removing any bytes or Auth identity.
    await operations.publishDeletionTombstone(job);
    const buckets = new Map<string, string[]>();
    for (const object of job.objects) {
      const names = buckets.get(object.bucket) ?? [];
      names.push(object.name); buckets.set(object.bucket, names);
    }
    for (const [bucket, names] of buckets) {
      for (let offset = 0; offset < names.length; offset += 100) await operations.removeObjects(bucket, names.slice(offset, offset + 100));
    }
    await operations.revokeIdentityProvider(job.account_id);
    await operations.deleteAuthUser(job.account_id);
    await operations.finish(job.id, true);
    return true;
  } catch {
    // The durable queue owns retry timing; logs and responses contain no member data.
    await operations.finish(job.id, false);
    return false;
  }
}
