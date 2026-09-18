# v3 Manual AppImage QA

## Purpose

This checklist is the human acceptance pass required after automated
`RELEASE_READY` evidence and before any promotion of the v3 line to `main`.

Use the exact AppImage produced by the current release-candidate workflow. Do
not substitute an older Phase 6 artifact when the branch head has changed.

Record the tested commit SHA and AppImage SHA-256 before starting.

## Candidate identity

```text
commit_sha=
appimage_sha256=
appimage_filename=
linux_distribution=
desktop_environment=
session_type=wayland|x11|other
```

Verify the downloaded artifact first:

```bash
candidate="Pikachu-Volleyball-3.0.0-x86_64.AppImage"
sha256sum "$candidate"
chmod +x "$candidate"
"./$candidate"
```

## Required manual checks

### Startup and basic desktop behavior

- [ ] AppImage starts directly without extraction or special flags.
- [ ] Startup is subjectively fast and does not show an abnormal long delay.
- [ ] Main game window renders correctly at launch.
- [ ] Closing the window exits the process normally.
- [ ] Native Quit exits cleanly.
- [ ] No terminal/runtime error is observed during normal launch or exit.

### Gameplay

- [ ] Start and finish a normal match.
- [ ] Player movement, jump and Power Hit behave normally.
- [ ] Ball collision, scoring and win transition look unchanged from 2.1.
- [ ] Quick rematch works at the end of a match.
- [ ] The visible quick-rematch hint is present.
- [ ] Pause/resume works.
- [ ] Restart works.
- [ ] Practice/reset behavior works with `B`.

### Controls and persistence

- [ ] Player 1 default controls work.
- [ ] Player 2 default controls work.
- [ ] Remap at least one Player 1 control.
- [ ] Remap at least one Player 2 control.
- [ ] Conflict detection behaves correctly.
- [ ] Restore defaults works.
- [ ] Close and reopen the AppImage; remapped/default control state persists as expected.
- [ ] Focus loss does not leave a movement/action key stuck.

### Graphics and interface

- [ ] Both graphics modes render correctly.
- [ ] Light theme is visibly light.
- [ ] Dark theme is visibly dark.
- [ ] Theme persists after restart.
- [ ] Pause/menu keyboard navigation works.
- [ ] Pointer interaction works where expected.
- [ ] Modal dialogs and focus behavior look coherent.

### Audio

- [ ] BGM plays normally.
- [ ] BGM Off mutes music.
- [ ] Turning BGM back On resumes from the preserved playback position rather than visibly restarting the track.
- [ ] Stereo SFX work.
- [ ] Mono SFX mode works.
- [ ] SFX Off works.
- [ ] Audio settings persist after restart.

### Locales

Open each supported locale and inspect gameplay plus the pause/menu surface:

- [ ] English.
- [ ] Español.
- [ ] Català.
- [ ] 한국어.
- [ ] 中文.
- [ ] Localized text fits reasonably and no obvious missing-glyph boxes appear.
- [ ] Language change/navigation behaves as expected.

### External links and security-facing behavior

- [ ] Expected About/external links open through the system browser.
- [ ] Unexpected navigation is not exposed through normal UI.
- [ ] No shell/terminal window is launched by normal link actions.

### Legacy 2.1 preference migration

Prefer a disposable copy of a real 2.1 profile if available. Do not risk the
only copy of a live profile.

- [ ] First native launch imports the expected legacy settings.
- [ ] Imported controls/settings match the old profile.
- [ ] Subsequent native launches use the native preference store and remain stable.
- [ ] Repeating the test does not corrupt the disposable legacy profile.

If a real legacy profile is not available, record that this item was covered by
the deterministic automated LevelDB migration fixture only.

## Result

```text
manual_appimage_qa=PASS|FAIL
tested_commit_sha=
tested_appimage_sha256=
blocking_issues=
notes=
```

A failure in any release-blocking item returns the workstream to a focused fix,
fresh candidate build and targeted retest.

Passing this checklist does not authorize a merge to `main`, tag creation,
GitHub Release publication or public distribution.
