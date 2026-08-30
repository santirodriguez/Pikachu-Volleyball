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

## Version 3 integration

- `v3` is the integration branch for Pikachu Volleyball 3 development.
- Task branches use the `v3-<task>` naming pattern and target `v3`.
- `main` remains the stable published line until the final v3 promotion is explicitly authorized.
- The final v3 promotion pull request will target `main` from `v3`.
- Review relevant changes made to `main` during development and selectively bring them into `v3` when required.
- Do not create v3 tags, releases, or publication artifacts before the final release gate is explicitly approved.

## Preservation requirements

- Treat Pikachu Volleyball 2.1 at commit `d7735b13654904a5b48a0c2d1217c8b8507a8409` as the frozen behavioral baseline for v3 migration work.
- Preserve the original physics, AI, timing, rendering, game states, scoring, and default controls unless a task explicitly requires a change.
- Preserve all accepted 2.1 behavior listed in `docs/v2.1-preservation-baseline.md`.
- Keep `docs/2.0-preservation-matrix.md` as historical 2.0 documentation rather than an active authority.
- Do not modify physics, AI, scoring rules, collision equations, or timing values without an explicit requirement and regression evidence.
- Do not remove a feature merely because its implementation is reorganized or its desktop runtime changes.

## Web and desktop boundaries

- Keep the web build and static locale outputs working.
- Neutralino is the supported v3 desktop runtime after Phase 4 Electron retirement.
- Keep desktop-only runtime code under `desktop/neutralino/` and expose only the narrow `pvDesktop` renderer contract.
- Preserve the accepted Neutralino 6.9.0 WebKitGTK host-navigation patch, native external-link mediator, renderer privilege allowlist, window behavior, persistence, input, audio, and Quit behavior unless a separately approved phase changes them.
- Keep unrestricted `Neutralino.os.open` unavailable to renderer JavaScript.
- Final Linux distribution format, dependency bundling, installer/AppImage design, and end-user packaging policy belong to Phase 5; do not infer them from the retired 2.1 Electron/AppImage toolchain.

## Validation

- Run `npm run quality:check` for runtime, asset, build, or configuration changes.
- Run additional characterization tests introduced by the affected area.
- Validate every supported locale output after localization or build-template changes.
- State clearly in the pull request when a check could not be run and why.
- Desktop-runtime changes require a reproducible Neutralino artifact build and real Linux/WebKitGTK validation before merge readiness.
- During runtime migration, compare behavior against the frozen 2.1 preservation and regression baseline rather than relying only on implementation-level tests.

## Pull request expectations

Every implementation pull request must explain:

- what changed;
- why it changed;
- affected preservation items;
- validation performed;
- validation not performed;
- remaining manual checks;
- screenshots for visible changes;
- bundle or artifact size impact when relevant.

Do not merge when unrelated changes are present, required validation is missing without explanation, accessibility regresses, locale coverage is incomplete, or web and desktop behavior diverge unintentionally.
