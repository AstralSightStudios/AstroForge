# Vela Backend, Packager, and Compat Runner

This document describes the executable backend path that starts from an
AstroForge IR document and ends in a Vela-compatible debug `.rpk`.

## Build Pipeline

`astroforge build --target vela` performs four steps:

1. Runs `pnpm exec rsbuild build` in the project root unless `--skip-rsbuild`
   or `--ir <path>` is provided.
2. Loads `node_modules/.cache/astroforge/ir-document.json` through
   `astroforge_ir::io`, including `IR_VERSION` validation.
3. Lowers the IR with `astroforge-vela` into Vela-compatible JS modules.
4. Writes an unpacked package directory and a debug `.rpk` through
   `astroforge-packager`.

The default output path is:

```text
dist/<package>.debug.rpk
dist/unpacked/
```

`astroforge release --target vela` currently uses the same packaging path with a
`.release.rpk` filename. The packager defaults to a development signing identity
compatible with aiot-toolkit's fallback behavior. Production signing material can
be supplied with `ASTROFORGE_VELA_PRIVATE_KEY` and
`ASTROFORGE_VELA_CERTIFICATE`; both variables must be set together.

## Vela JS Output

The Vela backend emits:

- `manifest.json` with Vela field names such as `versionName`,
  `minPlatformVersion`, and `deviceTypeList`.
- `app.js` with the module wrapper, manifest module, app lifecycle object, and
  `$translateStyle$` registration.
- `pages/<route>/<component>.js` with page script, template, style table, system
  API bridge imports, component registrations, and VM data normalization.
- Static assets copied to their package paths, for example `common/logo.svg`.

The template printer maps Component IR to Vela calls:

- Built-in nodes: `aiot.__ce__`.
- Custom components: `aiot.__cc__`.
- Conditional branches: `aiot.__ci__`.
- List rendering: `aiot.__cf__`.

The output is designed for ABI-level comparison. Exact whitespace is not part
of the compatibility contract.

## Packager Commands

Inspect a package:

```bash
astroforge inspect rpk dist/com.example.debug.rpk
```

Unpack a package:

```bash
astroforge unpack dist/com.example.debug.rpk --out .tmp/unpacked
```

The current Vela debug package follows the aiot-toolkit container layout:
`META-INF/CERT`, `manifest-watch.json`, `manifest.json`, `app.js`, page modules,
assets, and `META-INF/build.txt` are written in the same structural order as
official output.

## Compat Runner

`astroforge test-compat` discovers `fixtures/*/astroforge`, builds each project,
and writes the AstroForge-side golden output:

```text
fixtures/<fixture>/golden/astroforge/app.rpk
fixtures/<fixture>/golden/astroforge/unpacked/
fixtures/<fixture>/golden/astroforge/summary.json
```

`summary.json` records the file list, normalized manifest, and per-JS-file
runtime call sequence for `aiot.__ce__` / `__cc__` / `__ci__` / `__cf__`.

By default the official `aiot-toolkit` side is not executed. Use:

```bash
astroforge test-compat --official
```

to additionally invoke the `official/` project for each fixture. That mode
writes the official-side output to:

```text
fixtures/<fixture>/golden/aiot/app.rpk
fixtures/<fixture>/golden/aiot/unpacked/
fixtures/<fixture>/golden/aiot/summary.json
```

The command exits with an error if any comparison bucket has a non-zero
`diff_count`, including the RPK container structure bucket.

`ASTROFORGE_AIOT_BIN` can be used to point at a specific `aiot-toolkit` binary;
otherwise the runner falls back to the aiot-demo workspace path used for local
research and then to `aiot` in `PATH`.

## RPK Container Contract

The compat report records zip-level metadata in `comparison.rpk_structure`.
AstroForge's Vela packager now matches the official structural contract checked
by this bucket:

- Uses DEFLATE level 9 for files and stored entries for directories.
- Adds a zip archive comment containing toolkit metadata such as `toolkit`,
  `timeStamp`, `node`, `platform`, `arch`, and `component`.
- Emits explicit directory entries such as `META-INF/`, `pages/`,
  `pages/index/`, and `common/`.
- Emits `manifest-watch.json` before `manifest.json`.
- Emits `META-INF/build.txt` with toolkit metadata.
- Emits `META-INF/CERT`, itself a zip containing `hash.json` with SHA-256
  digests for package files.
- Signs both `META-INF/CERT` and the outer `.rpk` with the Vela
  `RPK Sig Block 42` format. The compat runner records signature presence, KV
  IDs, and size-field consistency for both layers.
- Sorts entries using the priority order implemented by aiot-toolkit
  `ZipUtil.getPriorities`: cert, secondary manifests, `manifest.json`,
  `app.js`, entry page files, `common/`, remaining JS files, then
  `META-INF/build.txt`.

This is a structural contract, not byte-for-byte identity. The JS module bytes
are produced by AstroForge and therefore differ from aiot-toolkit. Dynamic
metadata such as timestamps, toolkit versions, and signatures are normalized by
compat checks; the structural requirement is that the same container features
and signature block shape are present.

## Device Hooks

`astroforge install <rpk>` validates the package path and then executes
`ASTROFORGE_INSTALL_CMD` if configured. The command may contain `{rpk}`, which
is replaced with the package path.

`astroforge log` executes `ASTROFORGE_LOG_CMD` if configured, otherwise falls
back to `adb logcat` when `adb` is available in `PATH`.
