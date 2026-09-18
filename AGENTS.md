# Repository Working Agreements

These rules apply to all future work in this repository.

## Technical language

- Write code, comments, identifiers, filenames, branch names, commit messages, pull request titles, prompts, blueprints, and technical documentation in English.
- End-user interface text must follow the locale being edited.

## Development model

- `main` is the current integration authority.
- Create focused task branches from `main` and target `main` with one pull request per task.
- Prefer direct repository work for focused and reasonably scoped changes.
- Use Codex only when a change is genuinely broad, repetitive, or requires a coordinated multi-file refactor.
- Treat Codex output as an implementation proposal that still requires repository, diff, and validation review.
- Avoid unrelated refactors and formatting-only churn.
- Treat the v3 restart plans and phase documents as historical engineering evidence, not as an active branching model.
- Version changes, tags, GitHub Releases and publication require explicit authorization.

## Preservation requirements

- Preserve the original physics, AI, timing, rendering, game states, scoring and default control definitions unless a task explicitly requires a change.
- Treat the current `main` behavior and regression suite as the active authority.
- Keep `docs/v2.1-preservation-baseline.md` and `docs/2.0-preservation-matrix.md` as historical regression references where still applicable.
- Do not modify physics, AI, scoring, collision equations or timing values without an explicit requirement and regression evidence.
- Do not remove a feature merely because its implementation is reorganized.

## Architecture boundaries

- The selected Linux desktop architecture is SDL3 + QuickJS.
- Keep production native platform code under `desktop/native/`; feasibility/spike material is historical provenance and must not become a production dependency.
- Keep gameplay rules in the accepted shared JavaScript core. Native C owns platform responsibilities such as windowing, rendering execution, audio, event translation, persistence, accessibility, external-link opening, startup/error handling and Quit.
- Keep native external-link handling fail-closed with an exact allowlist and no shell interpolation.
- The bounded Electron preference importer is legacy-upgrade compatibility only; Electron is not an active desktop runtime.
- Linux packaging remains AppImage-only unless an explicitly approved requirement changes the packaging target.
- Treat compression and packaging changes as measured engineering decisions backed by real artifacts.
- CI gates must validate the product runtime, dependency, security and behavior contract rather than incidental runner packages.

## Web and desktop boundaries

- Keep the web build and static locale outputs working.
- Keep Web/PWA and native desktop behavior aligned unless a task explicitly requires a platform-specific difference.
- Preserve all five production locales.
- Report runner capability limitations separately from product failures.

## Validation

- Run `npm run quality:check` for runtime, asset, build or configuration changes.
- Run additional tests introduced by the affected area.
- Validate every supported locale output after localization or build-template changes.
- Packaging-sensitive changes require a real AppImage build and relevant Linux validation.
- Use the manual `Release Candidate Readiness` workflow before a future release when native packaging, runtime, dependency, accessibility or cross-distro evidence matters.
- Size, startup and dependency claims must come from measured artifacts or workflow evidence, not assumptions.
- State clearly in the pull request when a relevant check could not be run and why.

## Pull request expectations

Every implementation pull request must explain, as applicable:

- what changed;
- why it changed;
- affected preservation behavior;
- validation performed;
- validation not performed;
- remaining manual checks;
- screenshots for visible changes;
- bundle or artifact size impact;
- architecture or release impact.

Do not merge when unrelated changes are present, required validation is missing without explanation, accessibility regresses, locale coverage is incomplete, or web and desktop behavior diverge unintentionally.
