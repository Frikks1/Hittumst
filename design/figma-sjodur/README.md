# Sjóður in Figma

Edited directly in Figma desktop using a local development plugin.

[Open the sponsor designs](https://www.figma.com/design/zFMhaTVnbO70o1soPjNmhL/?node-id=53-193)

[Play the prototype](https://www.figma.com/proto/zFMhaTVnbO70o1soPjNmhL/?node-id=53-193&starting-point-node-id=53%3A193&scaling=scale-down&page-id=0%3A1)

- The three existing event cards now display Sjóður, its payout purpose, and a sponsor disclosure.
- Sponsor overlays show amounts, one-off or monthly support, and cumulative recognition.
- Limited-group attendance lists show sponsors first with a priority label.
- Figures and names are sample data, clearly marked Dæmi.
- Colors, spacing, radii and text styles reuse the file's existing variables/styles.

The plugin has no network permissions. Import manifest.json into Figma desktop to inspect or focus the design. state.json records the affected screens. Sponsor and attendance rows are editable components with text properties.

## Export the current UI source

The already registered development plugin now has a separate **Export source (read only)** button. It exports the current native source so the app can reproduce the layout precisely.

1. Open [Hittingar — Events Discovery Redesign](https://www.figma.com/design/zFMhaTVnbO70o1soPjNmhL/?node-id=0-1) in the Figma Design editor and select the **Screens** page (`0:1`).
2. Run **Plugins → Development → Hittingar — Sjóður and sponsors**. If the new button is missing, close and run the plugin again.
3. Click **Export source (read only)** and keep the page open without editing until export finishes. This button does not run **Apply design**.
4. Click **Save source JSON**, save the file, and give Codex its local path. The filename starts with `hittingar-figma-source-`.

Exporting reads the ordered hierarchy, native geometry, auto-layout, paints, typography and styled text ranges, prototype reactions, component references, styles, variable collections and original image bytes. Image bytes are deduplicated by hash, including images used in strokes and rich text. PNG references cover visible root frames/components/instances; SVG assets cover visible vector geometry. Hidden nodes remain in the hierarchy, but their SVGs and screen references are not rendered. This captures the current views rather than every possible interactive state. Font identities are included; the Plugin API does not expose font files.

The export path does not create, remove, resize, reparent or edit nodes; change selection or viewport; or write plugin data. It temporarily disables the plugin's invisible-instance traversal shortcut and restores it afterward. The existing **Apply design**, focus and audit actions keep their separate behavior. Closing the plugin cancels an export.

The JSON format is `hittingar-figma-source`, version `1`, with `file`, `page`, `resources`, `assets`, `requiredAssets`, `failedAssets`, `warnings`, `stats` and `complete`. Asset entries contain a controlled relative `path`, `kind`, `mimeType`, `byteLength`, base64 bytes, and their node ID or image hash. Missing reads, unsupported media, oversized assets and export failures set `complete: false` explicitly. PNG/JPEG/GIF/WebP images and SVG vectors are supported; other original bytes may be retained for diagnosis but make the export incomplete. No truncated export is presented as complete.

Regular development plugins cannot usually read `figma.fileKey`, so `file.key` remains `null` and `file.verified` remains `false` with a warning. **Confirm the open file URL contains `zFMhaTVnbO70o1soPjNmhL` before using the export.** The plugin rejects a different exposed file key or a page other than **Screens** (`0:1`); the page check alone does not prove file identity.

Limits are 32 MiB per binary asset, 128 MiB total binary assets, 64 megapixels per screen reference and 256 MiB of JSON characters. The local iframe receives acknowledged chunks and offers an explicit Blob download link. Binary assets, failures and required paths are recorded so the extraction script can verify completeness before any UI changes.

Local validation covers JavaScript syntax, frozen mock node reads, mixed rich text, image deduplication, hidden visibility, asset manifest parity, missing/unknown assets, file/page guards, cyclic/proxy values, exact binary base64, and the complete download message flow including an emoji at a chunk boundary. Running the exporter and saving a real file in Figma remain unverified while desktop control is unavailable.

Run the preserved checks from the repository root:

```powershell
node --check design/figma-sjodur/build.js
node --test design/figma-sjodur/source-export.test.mjs
```
