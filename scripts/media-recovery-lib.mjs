import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
const magic = Buffer.from('HITTUMST-MEDIA-1\0');
export const approvedBuckets = ['profile-photos','profile-videos','album-media','message-images','meetup-media'];
export function recoveryKey(value) {
 if (!/^[a-f0-9]{64}$/i.test(value ?? '')) throw new Error('256_bit_backup_key_required');
 return Buffer.from(value,'hex');
}
export function encryptRecovery(bytes,key) {
 const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);
 cipher.setAAD(magic);
 const ciphertext=Buffer.concat([cipher.update(bytes),cipher.final()]);
 return Buffer.concat([magic,iv,cipher.getAuthTag(),ciphertext]);
}
export function decryptRecovery(bytes,key) {
 if(bytes.length<magic.length+28||!bytes.subarray(0,magic.length).equals(magic))throw new Error('invalid_backup_format');
 const decipher=createDecipheriv('aes-256-gcm',key,bytes.subarray(magic.length,magic.length+12));
 decipher.setAAD(magic);decipher.setAuthTag(bytes.subarray(magic.length+12,magic.length+28));
 return Buffer.concat([decipher.update(bytes.subarray(magic.length+28)),decipher.final()]);
}
export function checksum(bytes) {return createHash('sha256').update(bytes).digest('hex');}
export function validateRecoveryObject(entry) {
 if(!entry||!approvedBuckets.includes(entry.bucket)||!/^[a-f0-9-]{36}$/i.test(entry.ownerId??'')||typeof entry.name!=='string'||entry.name.length>512||
  !/^[a-f0-9-]{36}\/[a-z0-9/._-]+$/i.test(entry.name)||entry.name.split('/').some(piece=>piece==='.'||piece==='..')||
  !/^[a-f0-9-]{36}\.enc$/i.test(entry.file)||!/^[a-f0-9]{64}$/.test(entry.sha256)||
  !Number.isSafeInteger(entry.bytes)||entry.bytes<1||entry.bytes>52428800||
  !['image/jpeg','image/png','image/webp','video/mp4'].includes(entry.contentType))throw new Error('invalid_backup_manifest');
 return entry;
}
export async function restoreRecoveryObject(entry,bytes,operations) {
 validateRecoveryObject(entry);
 if(bytes.length!==entry.bytes||checksum(bytes)!==entry.sha256)throw new Error('backup_checksum_failed');
 // Both the current canonical database and restored target must still reference this approved object.
 if(operations.journalDenies?.(entry))return 'excluded';
 if(!await operations.sourceCurrent(entry)||!await operations.targetCurrent(entry))return 'excluded';
 const existing=await operations.existing(entry);
 if(existing){if(checksum(existing)!==entry.sha256)throw new Error('restore_object_conflict');return 'existing';}
 await operations.upload(entry,bytes); // Always upsert:false.
 const restored=await operations.existing(entry);
 if(!restored||checksum(restored)!==entry.sha256)throw new Error('restored_checksum_failed');
 if(!await operations.sourceCurrent(entry)||!await operations.targetCurrent(entry)){
  await operations.remove(entry);return 'excluded';
 }
 return 'restored';
}
