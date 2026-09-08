"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { can } from "@/lib/auth/roles";
import { requireAdmin } from "@/lib/auth/session";
import { isDemoMode } from "@/lib/env";
import {
  type ModerationAction,
  permissionForAction,
  validateModerationAction,
} from "@/lib/moderation/rules";
import { getMeetupLocationEvidence } from "@/lib/moderation/repository";
import type { MeetupLocationEvidence } from "@/lib/moderation/types";
import { createClient } from "@/lib/supabase/server";

function value(formData: FormData, key: string) {
  const candidate = formData.get(key);
  return typeof candidate === "string" ? candidate.trim() : "";
}

function resultUrl(path: string, state: "success" | "error", message: string) {
  const params = new URLSearchParams({ state, message });
  return `${path}?${params.toString()}`;
}

export async function performModerationAction(formData: FormData) {
  const admin = await requireAdmin();
  const reportId = value(formData, "reportId");
  const profileId = value(formData, "profileId") || undefined;
  const meetupId = value(formData, "meetupId") || undefined;
  const action = value(formData, "action");
  const reason = value(formData, "reason");
  const suspensionDaysRaw = value(formData, "suspensionDays");
  const suspensionDays = suspensionDaysRaw ? Number(suspensionDaysRaw) : undefined;
  const path = `/reports/${encodeURIComponent(reportId)}`;

  const validation = validateModerationAction(
    { reportId, profileId, meetupId, action, reason, suspensionDays },
    admin.roles,
  );
  if (!validation.ok) {
    redirect(resultUrl(path, "error", validation.errors.join(" ")));
  }

  if (!isDemoMode()) {
    const supabase = await createClient();
    let error: { message: string } | null;

    if (["meetup_remove", "meetup_restore", "host_restrict"].includes(validation.value.action)) {
      const meetupAction = validation.value.action === "meetup_remove"
        ? "remove"
        : validation.value.action === "meetup_restore"
          ? "restore"
          : "restrict_host";
      const result = await supabase.rpc("admin_moderate_meetup", {
        p_meetup_id: meetupId,
        p_action: meetupAction,
        p_reason: reason,
        p_report_id: reportId,
      });
      error = result.error;
    } else if (["resolve", "dismiss", "note"].includes(validation.value.action)) {
      const status =
        validation.value.action === "resolve"
          ? "resolved"
          : validation.value.action === "dismiss"
            ? "dismissed"
            : "in_review";
      const result = await supabase.rpc("admin_moderate_report", {
        p_report_id: reportId,
        p_status: status,
        p_resolution_notes: reason,
      });
      error = result.error;
    } else {
      const result = await supabase.rpc("admin_take_action", {
        p_profile_id: profileId,
        p_action: validation.value.action,
        p_reason: reason,
        p_expires_at: validation.expiresAt ?? null,
        p_report_id: reportId,
      });
      error = result.error;
    }

    if (error) {
      redirect(resultUrl(path, "error", `Action failed: ${error.message}`));
    }
  }

  revalidatePath(path);
  revalidatePath("/reports");
  revalidatePath("/dashboard");
  redirect(resultUrl(path, "success", "Action recorded in the audit log."));
}

export interface MeetupEvidenceActionState {
  evidence?: MeetupLocationEvidence;
  error?: string;
}

export async function revealMeetupLocationEvidence(
  _previous: MeetupEvidenceActionState,
  formData: FormData,
): Promise<MeetupEvidenceActionState> {
  const admin = await requireAdmin();
  if (!can(admin.roles, "meetup.evidence")) {
    return { error: "Your staff role cannot access meetup location evidence." };
  }
  const reportId = value(formData, "reportId");
  const reason = value(formData, "reason");
  if (!reportId) return { error: "A report is required." };
  if (reason.length < 12) {
    return { error: "Explain the case-specific need in at least 12 characters." };
  }
  try {
    return { evidence: await getMeetupLocationEvidence(reportId, reason) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Evidence access failed." };
  }
}

export async function reviewPhoto(formData: FormData) {
  const admin = await requireAdmin();
  if (!can(admin.roles, "photo.review")) {
    redirect(resultUrl("/photos", "error", "Your role cannot review photos."));
  }

  const photoId = value(formData, "photoId");
  const decision = value(formData, "decision");
  const reason = value(formData, "reason");
  if (!photoId || !["approved", "rejected"].includes(decision)) {
    redirect(resultUrl("/photos", "error", "Invalid photo review request."));
  }
  if (decision === "rejected" && reason.length < 8) {
    redirect(
      resultUrl(
        "/photos",
        "error",
        "Rejections need an internal reason of at least 8 characters.",
      ),
    );
  }

  if (!isDemoMode()) {
    const supabase = await createClient();
    const { error } = await supabase.rpc("admin_moderate_photo", {
      p_photo_id: photoId,
      p_decision: decision,
      p_reason: reason || null,
    });
    if (error) {
      redirect(resultUrl("/photos", "error", `Review failed: ${error.message}`));
    }
  }

  revalidatePath("/photos");
  revalidatePath("/dashboard");
  redirect(resultUrl("/photos", "success", "Photo review recorded."));
}

export async function assertActionAllowed(
  action: ModerationAction,
  roles: Parameters<typeof can>[0],
) {
  return can(roles, permissionForAction(action));
}
