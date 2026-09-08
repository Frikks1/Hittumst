# Dependency security checkpoint

The application pins `decode-uri-component` to 0.5.0 to address malformed-link denial of service through Expo Router's `query-string` dependency. Upstream 0.5.0 is ESM; query-string 7 still requires CommonJS. The versioned patch adds a CommonJS export with the same upstream decoding algorithm and keeps the original ESM entry and MIT license intact.

Every installation applies the patch and checks the dependency actually resolved by query-string. Tests compare the bridge with the upstream source, verify Icelandic decoding and run malformed input in a separate process with a five-second limit. A patch or resolution failure fails the installation. Reassess and remove this bridge when Expo Router adopts a compatible fixed dependency.

Use npm 11.19.1 (`npx --yes npm@11.19.1 ci`). Earlier npm releases could ignore overrides through workspace links; CI installs the pinned package manager before installing the lockfile. Do not use a forced audit fix that changes the Expo/React Native compatibility set.

Sources: [upstream advisory](https://github.com/advisories/GHSA-vcc3-ghjq-m6fr), [0.5.0 source](https://github.com/SamVerschueren/decode-uri-component/blob/v0.5.0/index.js), [npm workspace override fix](https://github.com/npm/cli/pull/9671).

An audit must still be recorded for each release. A clean dependency check does not replace authorization, device or upload-processing tests.

On 8 September 2026, the clean install passed. `npm audit --omit=dev` reports 11 moderate dependency-chain entries, no high or critical findings; the full audit reports 12 moderate entries. The underlying remaining advisory is [uuid buffer bounds](https://github.com/advisories/GHSA-w5hq-g745-h8pq), reached through Expo build/configuration tooling. The installed xcode generator uses `uuid.v4()` without a caller-supplied buffer; the reported v3/v5/v6 path is not used there. No application module imports uuid. These findings remain recorded and must be reviewed again before signing, especially after toolchain changes; they are not described as fixed. The audit's suggested Expo 46 downgrade is incompatible with this Expo 57 application and is not applied.
