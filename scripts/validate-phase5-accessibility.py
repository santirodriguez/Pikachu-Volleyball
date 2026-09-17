#!/usr/bin/env python3
import json
import os
import sys
import time

import pyatspi

WINDOW_NAME = "Pikachu Volleyball Accessibility Probe"
TIMEOUT_SECONDS = 20.0


def node_name(node):
    try:
        return node.name or ""
    except Exception:
        return ""


def role_name(node):
    try:
        return node.getRoleName() or ""
    except Exception:
        return ""


def walk(node, depth=0):
    yield node, depth
    try:
        count = node.childCount
    except Exception:
        return
    for index in range(count):
        try:
            child = node.getChildAtIndex(index)
        except Exception:
            continue
        yield from walk(child, depth + 1)


def snapshot():
    desktop = pyatspi.Registry.getDesktop(0)
    return list(walk(desktop))


def find_exact(name):
    return [node for node, _ in snapshot() if node_name(node) == name]


def wait_for(predicate, description, timeout=TIMEOUT_SECONDS):
    deadline = time.monotonic() + timeout
    last = None
    while time.monotonic() < deadline:
        try:
            value = predicate()
            if value:
                return value
            last = value
        except Exception as error:
            last = repr(error)
        time.sleep(0.15)
    raise AssertionError(f"Timed out waiting for {description}; last={last!r}")


def require_single(name):
    nodes = wait_for(lambda: find_exact(name), f"accessible node {name!r}")
    if len(nodes) != 1:
        raise AssertionError(f"Expected one node named {name!r}, found {len(nodes)}")
    return nodes[0]


def assert_role(node, expected_fragment):
    actual = role_name(node).lower()
    if expected_fragment.lower() not in actual:
        raise AssertionError(
            f"Expected role containing {expected_fragment!r} for {node_name(node)!r}, got {actual!r}"
        )


def has_state(node, state):
    return node.getState().contains(state)


def focus(node):
    component = node.queryComponent()
    if not component.grabFocus():
        raise AssertionError(f"AT-SPI focus request failed for {node_name(node)!r}")
    wait_for(
        lambda: bool(find_exact(node_name(node)))
        and has_state(find_exact(node_name(node))[0], pyatspi.STATE_FOCUSED),
        f"focus on {node_name(node)!r}",
    )


def click(node):
    action = node.queryAction()
    names = [action.getName(index).lower() for index in range(action.nActions)]
    preferred = ["click", "press", "activate"]
    index = next(
        (names.index(candidate) for candidate in preferred if candidate in names),
        None,
    )
    if index is None:
        raise AssertionError(
            f"No click-like AT-SPI action for {node_name(node)!r}; actions={names!r}"
        )
    if not action.doAction(index):
        raise AssertionError(f"AT-SPI action failed for {node_name(node)!r}")


def dump_tree():
    rows = []
    for node, depth in snapshot():
        name = node_name(node)
        role = role_name(node)
        if name or WINDOW_NAME in name:
            rows.append({"depth": depth, "role": role, "name": name})
    return rows


def main():
    window = require_single(WINDOW_NAME)
    continue_button = require_single("Continue")
    restart_button = require_single("Restart")
    ready_status = require_single("Ready")

    assert_role(window, "frame") if "frame" in role_name(window).lower() else assert_role(window, "window")
    assert_role(continue_button, "button")
    assert_role(restart_button, "button")
    assert_role(ready_status, "label")

    focus(restart_button)
    click(require_single("Restart"))

    dialog = require_single("Restart match?")
    assert_role(dialog, "dialog")
    if hasattr(pyatspi, "STATE_MODAL") and not has_state(dialog, pyatspi.STATE_MODAL):
        raise AssertionError("Restart confirmation dialog is not exposed as modal")

    confirm = require_single("Confirm restart")
    cancel = require_single("Cancel")
    assert_role(confirm, "button")
    assert_role(cancel, "button")
    wait_for(
        lambda: has_state(require_single("Confirm restart"), pyatspi.STATE_FOCUSED),
        "modal focus on Confirm restart",
    )
    click(confirm)
    require_single("Restart confirmed")
    wait_for(lambda: not find_exact("Restart match?"), "restart dialog to close")

    restart_button = require_single("Restart")
    focus(restart_button)
    click(restart_button)
    require_single("Restart match?")
    cancel = require_single("Cancel")
    focus(cancel)
    click(cancel)
    require_single("Restart cancelled")
    wait_for(lambda: not find_exact("Restart match?"), "cancelled dialog to close")

    state_file = os.environ.get("PV_A11Y_PROBE_STATE_FILE")
    state_text = ""
    if state_file:
        wait_for(lambda: os.path.exists(state_file), "probe state file")
        with open(state_file, "r", encoding="utf-8") as handle:
            state_text = handle.read()
        if "last_action=cancel" not in state_text or "modal_open=0" not in state_text:
            raise AssertionError(f"Unexpected probe state after AT-SPI actions:\n{state_text}")

    report = {
        "window": {"name": node_name(window), "role": role_name(window)},
        "initial_controls": ["Continue", "Restart"],
        "modal": "Restart match?",
        "modal_state_verified": hasattr(pyatspi, "STATE_MODAL"),
        "actions": ["focus Restart", "click Restart", "click Confirm restart", "click Restart", "focus Cancel", "click Cancel"],
        "final_status": "Restart cancelled",
        "state_file": state_text,
        "tree": dump_tree(),
    }
    print(json.dumps(report, indent=2, ensure_ascii=False))
    print("accesskit_atspi_probe=PASS")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"accesskit_atspi_probe=FAIL: {error}", file=sys.stderr)
        print(json.dumps({"tree": dump_tree()}, indent=2, ensure_ascii=False), file=sys.stderr)
        raise
