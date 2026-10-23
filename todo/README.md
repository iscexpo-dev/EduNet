# TODO Index

`todo/100-production-gates.md` is the current gate ledger. The numbered files in
this directory (00–16) are the original implementation checklists and are kept
for historical traceability; many boxes are stale.

Use these instead:

- `docs/product/PRODUCT-FOUNDATION.md` — scope, requirements, metrics, risks
- `docs/EDUNET-ROADMAP-GAP-MATRIX.md` — per-workstream status and critical path
- `docs/EDUNET-IMPLEMENTATION-STATE.md` — verified evidence and defects
- `docs/EDUNET-FINAL-STATUS.md` — PASS/PARTIAL release status and blockers
- `docs/operations/OPERATIONS.md` — deployment, backup and incident runbook

Rule: do not check a gate because code exists; check it when the implementation
and the required test, drill or operational evidence have both been executed.
