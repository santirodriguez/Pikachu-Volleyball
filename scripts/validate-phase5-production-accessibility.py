#!/usr/bin/env python3
import json
import os
import sys
import time

import pyatspi

WINDOW_NAME = "Pikachu Volleyball Native"
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


def assert_role(node, fragment):
    actual = role_name(node).lower()
    if fragment.lower() not in actual:
        raise AssertionError(
            f"Expected role containing {fragment!r} for {node_name(node)!r}, got {actual!r}"
        )


def has_state(node, state):
    return node.getState().contains(state)


def focus(node):
    if not node.queryComponent().grabFocus():
        raise AssertionError(f"AT-SPI focus request failed for {node_name(node)!r}")
    wait_for(
        lambda: bool(find_exact(node_name(node)))
        and has_state(find_exact(node_name(node))[0], pyatspi.STATE_FOCUSED),
        f"focus on {node_name(node)!r}",
    )


def click(node):
    action = node.queryAction()
    names = [action.getName(index).lower() for index in range(action.nActions)]
    index = next(
        (names.index(candidate) for candidate in ["click", "press", "activate"]
         if candidate in names),
        None,
    )
    if index is None:
        raise AssertionError(
            f"No click-like AT-SPI action for {node_name(node)!r}; actions={names!r}"
        )
    if not action.doAction(index):
        raise AssertionError(f"AT-SPI action failed for {node_name(node)!r}")


def dump_tree():
    return [
        {"depth": depth, "role": role_name(node), "name": node_name(node)}
        for node, depth in snapshot()
        if node_name(node)
    ]


def main():
    window = require_single(WINDOW_NAME)
    assert_role(window, "frame") if "frame" in role_name(window).lower() else assert_role(window, "window")

    status = require_single("Game paused. Choose an action.")
    assert_role(status, "status")

    restart = require_single("Restart Match")
    assert_role(restart, "button")
    focus(restart)
    click(restart)

    dialog = require_single("Are you sure?")
    assert_role(dialog, "dialog")
    if hasattr(pyatspi, "STATE_MODAL") and not has_state(dialog, pyatspi.STATE_MODAL):
        raise AssertionError("Native restart confirmation is not exposed as modal")
    cancel = require_single("Cancel")
    focus(cancel)
    click(cancel)
    wait_for(lambda: not find_exact("Are you sure?"), "restart dialog to close")

    match = require_single("Match Settings")
    focus(match)
    click(match)
    winning = require_single("Winning Score: 15 PTS")
    focus(winning)
    click(winning)
    require_single("Winning Score: 5 PTS")
    require_single("Setting applied.")

    quit_node = require_single("Quit")
    focus(quit_node)
    click(quit_node)
    require_single("Are you sure?")
    confirm = require_single("Confirm")
    focus(confirm)
    click(confirm)

    state_file = os.environ.get("PV_NATIVE_A11Y_STATE_FILE")
    state_text = ""
    if state_file:
        wait_for(lambda: os.path.exists(state_file), "native accessibility state file")
        with open(state_file, "r", encoding="utf-8") as handle:
            state_text = handle.read()

    report = {
        "window": {"name": node_name(window), "role": role_name(window)},
        "restart_modal": True,
        "setting_status": "Setting applied.",
        "quit_requested": True,
        "state_file": state_text,
        "tree": dump_tree(),
    }
    print(json.dumps(report, indent=2, ensure_ascii=False))
    print("production_accesskit_atspi=PASS")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"production_accesskit_atspi=FAIL: {error}", file=sys.stderr)
        print(json.dumps({"tree": dump_tree()}, indent=2, ensure_ascii=False), file=sys.stderr)
        raise
