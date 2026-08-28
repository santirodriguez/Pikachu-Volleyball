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

## Version 2.1 integration

- `v2.1` is the integration branch for Pikachu Volleyball 2.1.
- Task branches use the `v2.1-<task>` naming pattern and target `v2.1`.
- The final release pull request will target `main` from `v2.1`.
- Review relevant changes made to `main` during development and selectively bring them into `v2.1`.

## Preservation requirements

- Preserve the original physics, AI, timing, rendering, game states, scoring, and default controls unless a task explicitly requires a change.
- Preserve all accepted fork improvements listed in `docs/2.0-preservation-matrix.md`.
- Do not modify physics, AI, or timing without an explicit requirement and regression evidence.
- Do not remove a feature merely because its implementation is reorganized.

## Web and desktop boundaries

- Keep the web build and static locale outputs working.
- Keep desktop-only code under `desktop/` and expose only narrow, secure APIs to the renderer.
- Keep `contextIsolation`, sandboxing, and external-navigation restrictions enabled.
- Linux packaging remains AppImage-only unless requirements explicitly change.

## Validation

- Run `npm run quality:check` for runtime, asset, build, or configuration changes.
- Run additional tests introduced by the affected area.
- Validate every supported locale output after localization or build-template changes.
- State clearly in the pull request when a check could not be run and why.
- Packaging-sensitive changes require a real AppImage build and manual Linux validation before release.

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

Do not merge when unrelated changes are present, required validation is missing without explanation, accessibility regresses, locale coverage is incomplete, or web and Electron behavior diverge unintentionally.
