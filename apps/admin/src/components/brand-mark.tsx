export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className="brand" aria-label="Hittumst Safety">
      <span className="brand-glyph" aria-hidden="true">
        <span />
        <span />
      </span>
      {!compact && (
        <span className="brand-copy">
          <strong>Hittumst</strong>
          <small>Safety desk</small>
        </span>
      )}
    </div>
  );
}
