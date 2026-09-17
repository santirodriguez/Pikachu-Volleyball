# Repository Working Agreements

These rules apply to all future work in this repository.

## Technical language

- Write code, comments, identifiers, filenames, branch names, commit messages, pull request titles, prompts, blueprints, and technical documentation in English.
- End-user interface text must follow the locale being edited.

## Development model

- Prefer direct repository work for focused and reasonably scoped changes.
- Use Codex only when a change is genuinely broad, repetitive, or requires a coordinated multi-file refactor.
- Treat Codex output as an implementation proposal that still requires repository, diff, and validation review.
- Keep changes small and focused. Use one task branch and one pull request per task.
- Avoid unrelated refactors and formatting-only churn.

## Version 3 restart integration

- `v3-restart` is the integration branch for the new Pikachu Volleyball 3 attempt.
- Task branches use the `v3-restart-<task>` naming pattern and target `v3-restart`.
- Start new v3 work from the accepted restart plan in `docs/v3-restart-plan.md`.
- Treat the historical `v3` and `v3-phase5-linux-distribution` branches as evidence only. Do not branch from them or reuse their implementation wholesale.
- Reuse a historical test, measurement, or implementation fragment only after reviewing it against the current `v3-restart` authority and preservation requirements.
- Promotion from `v3-restart` to `main`, versioning, tags, releases, and publication remain separate explicit decisions.

## Preservation requirements

- Preserve the original physics, AI, timing, rendering, game states, scoring, and default controls unless a task explicitly requires a change.
- Preserve all accepted 2.1 behavior listed in `docs/v2.1-preservation-baseline.md`; it is the regression authority for the v3 restart until an approved later phase deliberately supersedes a requirement.
- Keep `docs/2.0-preservation-matrix.md` as historical 2.0 documentation rather than an active authority.
- Do not modify physics, AI, scoring, collision equations, or timing values without an explicit requirement and regression evidence.
- Do not remove a feature merely because its implementation is reorganized.

## Architecture gates

- Do not select a replacement desktop runtime before its phase gate is satisfied.
- Phase 2 must measure a supported Electron candidate before any native migration is approved.
- SDL3 + QuickJS work is limited to the Phase 3 feasibility spike until `NATIVE_GO` is explicitly established from real functional and AppImage evidence.
- Shared-core refactoring begins only after feasibility is established and characterization coverage protects the behavior being moved.

## Web and desktop boundaries

- Keep the web build and static locale outputs working.
- Keep desktop-only code under `desktop/` while Electron remains the active desktop implementation, and expose only narrow, secure APIs to the renderer.
- Keep `contextIsolation`, sandboxing, and external-navigation restrictions enabled while Electron remains in use.
- Linux packaging remains AppImage-only unless an approved v3 phase explicitly changes the packaging requirement.

## Validation

- Run `npm run quality:check` for runtime, asset, build, or configuration changes.
- Run additional tests introduced by the affected area.
- Validate every supported locale output after localization or build-template changes.
- State clearly in the pull request when a check could not be run and why.
- Packaging-sensitive changes require a real AppImage build and relevant Linux validation before their phase gate can pass.
- Size, startup, and dependency claims must come from measured artifacts or workflow evidence, not assumptions.

## Pull request expectations

Every implementation pull request must explain:

- what changed;
- why it changed;
- affected preservation items;
- validation performed;
- validation not performed;
- remaining manual checks;
- screenshots for visible changes;
- bundle or artifact size impact when relevant;
- the current v3 phase and gate affected by the change.

Do not merge when unrelated changes are present, required validation is missing without explanation, accessibility regresses, locale coverage is incomplete, or web and desktop behavior diverge unintentionally.
