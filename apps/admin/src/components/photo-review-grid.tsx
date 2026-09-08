import { reviewPhoto } from "@/app/actions";
import type { PhotoReviewItem } from "@/lib/moderation/types";
import { Icons } from "./icon";

export function PhotoReviewGrid({ photos }: { photos: PhotoReviewItem[] }) {
  if (!photos.length) {
    return <div className="empty-state panel"><Icons.Check aria-hidden="true" /><strong>Photo queue is clear</strong><span>New submissions will appear here.</span></div>;
  }

  return (
    <div className="photo-review-grid">
      {photos.map((photo, index) => (
        <article className="photo-review-card" key={photo.id}>
          <div className={`review-image review-image-${index % 3}`}>
            {photo.signedUrl ? (
              // Private, short-lived staff URL generated on the server.
              <img src={photo.signedUrl} alt={`Submitted profile photo from ${photo.profile.displayName}`} />
            ) : (
              <div className="review-placeholder" aria-label="Demo photo placeholder"><span>{photo.profile.initials}</span><small>Private image preview</small></div>
            )}
            <span className="photo-position">Photo {photo.position} of 6</span>
          </div>
          <div className="review-card-body">
            <div className="review-member">
              <div><strong>{photo.profile.displayName}</strong><span>{[photo.profile.age, photo.profile.identity, photo.profile.region].filter(Boolean).join(" · ")}</span></div>
              <span className="pending-chip"><span aria-hidden="true" /> Pending</span>
            </div>
            {photo.safetySignals.length > 0 && (
              <div className="signal-list">{photo.safetySignals.map((signal) => <span key={signal}>{signal}</span>)}</div>
            )}
            <form action={reviewPhoto} className="photo-review-form">
              <input type="hidden" name="photoId" value={photo.id} />
              <label><span className="sr-only">Internal rejection reason for {photo.profile.displayName}</span><input name="reason" placeholder="Reason required only for rejection" minLength={8} /></label>
              <div>
                <button className="button button-approve" name="decision" value="approved" type="submit"><Icons.Check aria-hidden="true" /> Approve</button>
                <button className="button button-reject" name="decision" value="rejected" type="submit"><Icons.X aria-hidden="true" /> Reject</button>
              </div>
            </form>
          </div>
        </article>
      ))}
    </div>
  );
}
