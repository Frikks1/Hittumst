import {
  RekognitionClient,
  DetectModerationLabelsCommand,
  StartContentModerationCommand,
  GetContentModerationCommand,
} from '@aws-sdk/client-rekognition';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { randomUUID } from 'node:crypto';

export async function moderateMedia(bytes: Uint8Array, kind: 'image' | 'video'): Promise<boolean> {
  if (
    process.env.AWS_REGION !== 'eu-central-1' ||
    process.env.AWS_MEDIA_PRIVACY_VERIFIED !== 'true' ||
    !process.env.AWS_MEDIA_BUCKET
  )
    throw new Error('moderation_privacy_unverified');
  const rekognition = new RekognitionClient({ region: 'eu-central-1', maxAttempts: 3 });
  if (kind === 'image') {
    const result = await rekognition.send(
      new DetectModerationLabelsCommand({ Image: { Bytes: bytes }, MinConfidence: 70 }),
      { abortSignal: AbortSignal.timeout(30000) },
    );
    return !result.ModerationLabels?.length;
  }
  const s3 = new S3Client({ region: 'eu-central-1', maxAttempts: 3 });
  const Bucket = process.env.AWS_MEDIA_BUCKET;
  const Key = `moderation/${randomUUID()}.mp4`;
  await s3.send(
    new PutObjectCommand({
      Bucket,
      Key,
      Body: bytes,
      ContentType: 'video/mp4',
      ServerSideEncryption: 'AES256',
    }),
    { abortSignal: AbortSignal.timeout(30000) },
  );
  try {
    const started = await rekognition.send(
      new StartContentModerationCommand({
        Video: { S3Object: { Bucket, Name: Key } },
        MinConfidence: 70,
        ClientRequestToken: randomUUID(),
      }),
      { abortSignal: AbortSignal.timeout(30000) },
    );
    if (!started.JobId) throw new Error('moderation_unavailable');
    const deadline = Date.now() + 180000;
    let next: string | undefined;
    do {
      const result = await rekognition.send(
        new GetContentModerationCommand({ JobId: started.JobId, NextToken: next }),
        { abortSignal: AbortSignal.timeout(30000) },
      );
      if (result.JobStatus === 'FAILED') throw new Error('moderation_failed');
      if (result.JobStatus === 'IN_PROGRESS') {
        if (Date.now() > deadline) throw new Error('moderation_pending');
        await new Promise((resolve) => setTimeout(resolve, 3000));
        continue;
      }
      if (result.JobStatus !== 'SUCCEEDED') throw new Error('moderation_unavailable');
      if (result.ModerationLabels?.length) return false;
      next = result.NextToken;
      if (!next) return true;
    } while (Date.now() < deadline);
    throw new Error('moderation_pending');
  } finally {
    await s3.send(new DeleteObjectCommand({ Bucket, Key }), { abortSignal: AbortSignal.timeout(30000) });
  }
}
