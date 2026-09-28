# Dependency security checkpoint

The application pins `decode-uri-component` to 0.5.0 to address malformed-link denial of service through Expo Router's `query-string` dependency. Upstream 0.5.0 is ESM; query-string 7 still requires CommonJS. The versioned patch adds a CommonJS export with the same upstream decoding algorithm and keeps the original ESM entry and MIT license intact.

Every installation applies the patch and checks the dependency actually resolved by query-string. Tests compare the bridge with the upstream source, verify Icelandic decoding and run malformed input in a separate process with a five-second limit. A patch or resolution failure fails the installation. Reassess and remove this bridge when Expo Router adopts a compatible fixed dependency.

Use npm 11.19.1 (`npx --yes npm@11.19.1 ci`). Earlier npm releases could ignore overrides through workspace links; CI installs the pinned package manager before installing the lockfile. Do not use a forced audit fix that changes the Expo/React Native compatibility set.

Sources: [upstream advisory](https://github.com/advisories/GHSA-vcc3-ghjq-m6fr), [0.5.0 source](https://github.com/SamVerschueren/decode-uri-component/blob/v0.5.0/index.js), [npm workspace override fix](https://github.com/npm/cli/pull/9671).

An audit must still be recorded for each release. A clean dependency check does not replace authorization, device or upload-processing tests.

On 8 September 2026, the later tier delivery resolved the remaining [uuid buffer-bounds advisory](https://github.com/advisories/GHSA-w5hq-g745-h8pq) through scoped `xcode` and `@expo/ngrok` overrides to patched UUID 11.1.1. The dependency tests verify both resolved versions, CommonJS `v4()` and the xcode identifier generator. The lockfile was updated using npm 11.19.1. Both full and production audits then reported **zero vulnerabilities**. This supersedes the earlier 11/12 moderate-entry checkpoint; it does not establish application security or native compatibility by itself. See [UUID 11.1.1 release](https://github.com/uuidjs/uuid/releases/tag/v11.1.1).


The final native verification on 8 September found duplicated `react-native-reanimated` (4.5.1/4.6.0) and `react-native-worklets` (0.10.1/0.12.1); the latter also violated Expo Modules Core's supported peer range. The mobile Expo SDK 57 packages were updated to the SDK-recommended patch set (Expo 57.0.21), and root overrides now keep the existing SDK-supported Reanimated 4.5.1 and Worklets 0.10.1 versions consistent across consumers. A regression test resolves the actual installed modules from the app, router, Expo core and animation package to detect a recurrence. The five dependency checks passed, the installation audit reported zero vulnerabilities, and Expo Doctor 1.20.4 passed all 21 checks. This does not establish signed native build or device compatibility. The approach follows [Expo's monorepo native dependency guidance](https://docs.expo.dev/guides/monorepos/#duplicate-native-packages-within-monorepos).
