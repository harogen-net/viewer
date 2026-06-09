# Fixtures

Phase2 compatibility and risk-control fixture layout.

## Directories
- `fixtures/legacy/v2/`: v2+ compatibility data (`.hvd`, `.hvz`)
- `fixtures/legacy/png/`: embedded png data fixtures
- `fixtures/sensitive/`: sensitive mode fixtures (encrypted/non-encrypted pairs)

## Naming
- `compat_v2_minimal.hvd`
- `compat_v2_minimal.hvz`
- `compat_png_embedded_minimal.png`
- `sensitive_locked_sample.hvd`
- `sensitive_unlocked_sample.hvd`

## Notes
- Do not store personal or production data.
- Keep fixtures minimal and deterministic for regression testing.
