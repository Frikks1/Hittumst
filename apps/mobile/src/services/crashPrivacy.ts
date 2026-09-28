import type { Event, ErrorEvent } from '@sentry/react-native';

/** Rebuild reports from an allowlist; user content and device identities never pass through. */
export function privateCrashEvent(
  event: Event,
  release: string,
  environment: string,
): ErrorEvent | null {
  if (!event.exception?.values?.length) return null;
  const errors = new Set([
    'Error',
    'TypeError',
    'ReferenceError',
    'RangeError',
    'SyntaxError',
    'URIError',
    'AggregateError',
  ]);
  return {
    type: undefined,
    ...(typeof event.event_id === 'string' && /^[a-f0-9]{32}$/.test(event.event_id)
      ? { event_id: event.event_id }
      : {}),
    platform: 'javascript',
    level: 'error',
    release,
    environment,
    exception: {
      values: event.exception.values.slice(0, 3).map((value) => ({
        type: errors.has(value.type ?? '') ? value.type : 'Error',
        value: 'Application error (message withheld)',
        stacktrace: {
          frames: (value.stacktrace?.frames ?? []).slice(-40).flatMap((frame) => {
            // Keep only bundle offsets; filenames, functions and source snippets can contain personal data.
            if (!Number.isSafeInteger(frame.lineno) || frame.lineno! < 0) return [];
            return [
              {
                filename: 'app://index.bundle',
                lineno: frame.lineno,
                ...(Number.isSafeInteger(frame.colno) && frame.colno! >= 0
                  ? { colno: frame.colno }
                  : {}),
              },
            ];
          }),
        },
        mechanism: { type: 'generic', handled: value.mechanism?.handled !== false },
      })),
    },
  };
}
