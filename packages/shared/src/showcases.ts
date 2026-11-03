import { z } from 'zod';

const referenceId = z.string().trim().min(1).max(160);
export const showcaseTemplates = ['hittingar', 'people', 'groups', 'passions', 'creations', 'milestones', 'places', 'together'] as const;
export const showcaseTemplateSchema = z.enum(showcaseTemplates);
export type ShowcaseTemplate = z.infer<typeof showcaseTemplateSchema>;
export const showcaseAudienceSchema = z.enum(['everyone', 'friends', 'no_one', 'group', 'people']);
export type ShowcaseAudience = z.infer<typeof showcaseAudienceSchema>;
export const showcaseAudienceScopeSchema = z.object({
  groupId: referenceId.optional(),
  personIds: z.array(referenceId).max(50).default([]),
}).strict();
export type ShowcaseAudienceScope = { groupId?: string; personIds?: string[] };
export function validateShowcaseAudienceScope(audience: ShowcaseAudience, scope: ShowcaseAudienceScope = {}) {
  const parsed = showcaseAudienceScopeSchema.parse(scope);
  if (new Set(parsed.personIds).size !== parsed.personIds.length ||
      (audience === 'group' ? !parsed.groupId || parsed.personIds.length > 0 : Boolean(parsed.groupId)) ||
      (audience === 'people' ? parsed.personIds.length === 0 : parsed.personIds.length > 0)) {
    throw new Error('invalid_showcase_audience_scope');
  }
  return parsed;
}
export const showcaseLayoutSchema = z.enum(['list', 'gallery']);
export const showcaseEntryKindSchema = z.enum(['story', 'event', 'person', 'group']);
export const showcaseMediaKindSchema = z.enum(['photo', 'video']);
export const showcaseTitleSchema = z.string().trim().min(1).max(80);
export const showcaseBodySchema = z.string().trim().max(2000);
export const showcaseCaptionSchema = z.string().trim().max(2000);

/** Descriptive joining information; these fields never change admission or payments. */
export const showcaseRequirementsSchema = z.object({
  minAge: z.number().int().min(18).max(120).optional(),
  maxAge: z.number().int().min(18).max(120).optional(),
  memberType: z.string().trim().min(1).max(120).optional(),
  meetupId: referenceId.optional(),
  text: z.string().trim().max(2000).optional(),
}).strict().refine(value => value.minAge === undefined || value.maxAge === undefined || value.minAge <= value.maxAge, { message: 'Invalid age range' });
export type ShowcaseRequirements = z.infer<typeof showcaseRequirementsSchema>;

export const showcaseMediaSchema = z.object({
  id: z.uuid(), kind: showcaseMediaKindSchema, sourceUploadId: z.uuid().optional(),
  caption: showcaseCaptionSchema.default(''),
  status: z.enum(['pending', 'approved', 'rejected']).optional(),
  bucket: z.string().min(1).max(100).optional(), storagePath: z.string().min(1).max(1024).optional(),
  posterPath: z.string().min(1).max(1024).optional(), url: z.string().optional(), posterUrl: z.string().optional(),
});
export type ShowcaseMedia = z.infer<typeof showcaseMediaSchema>;
export const showcaseMediaInputSchema = showcaseMediaSchema.pick({ id: true, kind: true, sourceUploadId: true, caption: true }).strict();
export type ShowcaseMediaInput = z.infer<typeof showcaseMediaInputSchema>;

const entryEditable = {
  id: z.uuid(), kind: showcaseEntryKindSchema, title: z.string().trim().max(80).default(''),
  body: showcaseBodySchema.default(''), personId: referenceId.optional(), groupId: referenceId.optional(),
  groupName: z.string().trim().max(80).optional(), meetupIds: z.array(referenceId).default([]),
  albumIds: z.array(referenceId).max(12).default([]), showMembers: z.boolean().default(false),
  review: showcaseBodySchema.default(''), reviewIdentified: z.boolean().default(false),
  rating: z.number().int().min(1).max(5).nullable().default(null), showCount: z.boolean().default(false),
  requirements: showcaseRequirementsSchema.optional(),
};
export const showcaseEntrySchema = z.object({
  ...entryEditable, verifiedCount: z.number().int().nonnegative().nullable().default(null),
  meetups: z.array(z.object({ id: referenceId, title: z.string().max(100) })).default([]),
  requirementMeetups: z.array(z.object({ id: referenceId, title: z.string().max(100) })).default([]),
  albums: z.array(z.object({ id: referenceId, title: z.string().max(100), shareId: referenceId.optional() })).default([]),
  groupMembers: z.array(z.object({ id: referenceId, displayName: z.string().max(80) })).default([]),
  requirementsInformational: z.literal(true).default(true),
  media: z.array(showcaseMediaSchema).max(12).default([]),
  approvalStatus: z.enum(['draft', 'pending', 'approved']).default('draft'),
});
export type ShowcaseEntry = z.infer<typeof showcaseEntrySchema>;
export const showcaseEntryInputSchema = z.object({ ...entryEditable, media: z.array(showcaseMediaInputSchema).max(12).default([]) }).strict();
export type ShowcaseEntryInput = z.infer<typeof showcaseEntryInputSchema>;

export const showcaseSchema = z.object({
  id: z.uuid(), ownerId: referenceId, template: showcaseTemplateSchema, title: showcaseTitleSchema,
  introduction: z.string().trim().max(500).default(''), layout: showcaseLayoutSchema.default('list'),
  coverMediaId: z.uuid().nullable().default(null), audience: showcaseAudienceSchema.nullable().default(null),
  audienceGroupId: referenceId.nullable().default(null), audiencePersonIds: z.array(referenceId).max(50).default([]),
  audienceGroupName: z.string().max(80).nullable().default(null),
  audiencePeople: z.array(z.object({ id: referenceId, displayName: z.string().max(80) })).max(50).default([]),
  status: z.enum(['draft', 'published']).default('draft'), revision: z.number().int().min(1),
  order: z.number().int().nonnegative().default(0), entries: z.array(showcaseEntrySchema).max(50).default([]),
});
export type Showcase = z.infer<typeof showcaseSchema>;
export const showcaseSaveInputSchema = z.object({
  id: z.uuid().nullable().default(null), expectedRevision: z.number().int().nonnegative(),
  template: showcaseTemplateSchema, title: showcaseTitleSchema, introduction: z.string().trim().max(500).default(''),
  layout: showcaseLayoutSchema.default('list'), coverMediaId: z.uuid().nullable().default(null),
  entries: z.array(showcaseEntryInputSchema).max(50).default([]),
}).strict();
export type ShowcaseSaveInput = z.infer<typeof showcaseSaveInputSchema>;

export const showcasePickerMediaSchema = showcaseMediaSchema.extend({ uploaderId: referenceId, meetupId: referenceId.optional() });
export type ShowcasePickerMedia = z.infer<typeof showcasePickerMediaSchema>;
export const showcasePickersSchema = z.object({
  events: z.array(z.object({ id: referenceId, title: z.string().max(100), seriesId: referenceId.nullable().default(null), private: z.boolean(), ownReview: showcaseBodySchema.default('') })),
  requirementEvents: z.array(z.object({ id: referenceId, title: z.string().max(100), private: z.boolean() })).default([]),
  friends: z.array(z.object({ id: referenceId, displayName: z.string().max(80) })),
  groups: z.array(z.object({ id: referenceId, name: z.string().max(80),
    members: z.array(z.object({ id: referenceId, displayName: z.string().max(80) })).default([]),
    memberVisible: z.boolean().default(true),
  })),
  albums: z.array(z.object({ id: referenceId, title: z.string().max(100) })).default([]),
  media: z.array(showcasePickerMediaSchema),
});
export type ShowcasePickers = z.infer<typeof showcasePickersSchema>;

export const showcaseApprovalSchema = z.object({
  id: z.uuid(), showcaseId: z.uuid(), entryId: z.uuid(), revision: z.number().int().min(1),
  role: z.enum(['person', 'group', 'host', 'media']), recipientId: referenceId,
  status: z.enum(['pending', 'approved', 'declined', 'revoked']), audience: showcaseAudienceSchema,
  audienceGroupId: referenceId.nullable().default(null), audiencePersonIds: z.array(referenceId).max(50).default([]),
  audienceGroupName: z.string().max(80).nullable().default(null),
  audiencePeople: z.array(z.object({ id: referenceId, displayName: z.string().max(80) })).max(50).default([]),
  showcaseTitle: showcaseTitleSchema, entryTitle: z.string().max(80), entryBody: showcaseBodySchema,
  snapshot: showcaseEntrySchema,
  countOnly: z.boolean().default(false),
});
export type ShowcaseApproval = z.infer<typeof showcaseApprovalSchema>;
export const showcaseApprovalActionSchema = z.enum(['approve', 'decline', 'revoke']);
export type ShowcaseApprovalAction = z.infer<typeof showcaseApprovalActionSchema>;
export const showcaseUploadReservationSchema = z.object({ id: z.uuid(), bucket: z.literal('media-quarantine'), path: z.string().min(1).max(1024) });

/** Never send derived counts, approval states, signing URLs or storage paths as draft input. */
export function toShowcaseEntryInput(entry: ShowcaseEntry): ShowcaseEntryInput {
  const { verifiedCount: _count, approvalStatus: _approval, meetups: _meetups, requirementMeetups: _requirementMeetups, requirementsInformational: _informational, albums: _albums, groupMembers: _members, media, ...editable } = entry;
  return showcaseEntryInputSchema.parse({ ...editable, media: media.map(item => ({
    id: item.id, kind: item.kind, sourceUploadId: item.sourceUploadId, caption: item.caption,
  })) });
}
export function showcaseSaveInput(showcase: Showcase): ShowcaseSaveInput {
  return showcaseSaveInputSchema.parse({ id: showcase.id, expectedRevision: showcase.revision, template: showcase.template,
    title: showcase.title, introduction: showcase.introduction, layout: showcase.layout, coverMediaId: showcase.coverMediaId,
    entries: showcase.entries.map(toShowcaseEntryInput) });
}
