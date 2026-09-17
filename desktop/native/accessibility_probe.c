#include <SDL3/SDL.h>
#include <SDL3/SDL_main.h>
#include <accesskit.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define WINDOW_WIDTH 800
#define WINDOW_HEIGHT 600
#define ROOT_ID ((accesskit_node_id)0)
#define CONTINUE_ID ((accesskit_node_id)1)
#define RESTART_ID ((accesskit_node_id)2)
#define STATUS_ID ((accesskit_node_id)3)
#define DIALOG_ID ((accesskit_node_id)4)
#define ACCEPT_ID ((accesskit_node_id)5)
#define CANCEL_ID ((accesskit_node_id)6)

#define ACTION_FOCUS_CODE 1
#define ACTION_CLICK_CODE 2

static const char *WINDOW_TITLE = "Pikachu Volleyball Accessibility Probe";

typedef struct ProbeState {
  SDL_Window *window;
  SDL_Renderer *renderer;
  SDL_Mutex *mutex;
  accesskit_unix_adapter *adapter;
  accesskit_node_id focus;
  bool modal_open;
  bool quit;
  const char *status;
  const char *last_action;
  Uint32 action_event_type;
  Uint32 window_id;
  const char *state_file;
} ProbeState;

static accesskit_node *build_button(accesskit_node_id id, const char *label,
                                    accesskit_rect bounds) {
  accesskit_node *node = accesskit_node_new(ACCESSKIT_ROLE_BUTTON);
  accesskit_node_set_label(node, label);
  accesskit_node_set_bounds(node, bounds);
  accesskit_node_add_action(node, ACCESSKIT_ACTION_FOCUS);
  accesskit_node_add_action(node, ACCESSKIT_ACTION_CLICK);
  (void)id;
  return node;
}

static accesskit_node *build_status(const ProbeState *state) {
  accesskit_node *node = accesskit_node_new(ACCESSKIT_ROLE_LABEL);
  accesskit_node_set_label(node, state->status);
  accesskit_node_set_live(node, ACCESSKIT_LIVE_POLITE);
  accesskit_rect bounds = {40.0, 320.0, 760.0, 370.0};
  accesskit_node_set_bounds(node, bounds);
  return node;
}

static accesskit_node *build_dialog(void) {
  accesskit_node *node = accesskit_node_new(ACCESSKIT_ROLE_DIALOG);
  accesskit_node_set_label(node, "Restart match?");
  accesskit_node_set_modal(node);
  accesskit_rect bounds = {150.0, 120.0, 650.0, 420.0};
  accesskit_node_set_bounds(node, bounds);
  accesskit_node_push_child(node, ACCEPT_ID);
  accesskit_node_push_child(node, CANCEL_ID);
  return node;
}

static accesskit_node *build_root(const ProbeState *state) {
  accesskit_node *node = accesskit_node_new(ACCESSKIT_ROLE_WINDOW);
  accesskit_node_set_label(node, WINDOW_TITLE);
  accesskit_rect bounds = {0.0, 0.0, WINDOW_WIDTH, WINDOW_HEIGHT};
  accesskit_node_set_bounds(node, bounds);
  accesskit_node_push_child(node, CONTINUE_ID);
  accesskit_node_push_child(node, RESTART_ID);
  accesskit_node_push_child(node, STATUS_ID);
  if (state->modal_open) {
    accesskit_node_push_child(node, DIALOG_ID);
  }
  return node;
}

static accesskit_tree_update *build_full_tree(const ProbeState *state,
                                               bool initial) {
  const size_t capacity = state->modal_open ? 7 : 4;
  accesskit_tree_update *update =
      accesskit_tree_update_with_capacity_and_focus(capacity, state->focus);
  if (initial) {
    accesskit_tree *tree = accesskit_tree_new(ROOT_ID);
    accesskit_tree_update_set_tree(update, tree);
  }

  accesskit_rect continue_bounds = {80.0, 80.0, 340.0, 180.0};
  accesskit_rect restart_bounds = {460.0, 80.0, 720.0, 180.0};
  accesskit_tree_update_push_node(update, ROOT_ID, build_root(state));
  accesskit_tree_update_push_node(
      update, CONTINUE_ID,
      build_button(CONTINUE_ID, "Continue", continue_bounds));
  accesskit_tree_update_push_node(
      update, RESTART_ID,
      build_button(RESTART_ID, "Restart", restart_bounds));
  accesskit_tree_update_push_node(update, STATUS_ID, build_status(state));

  if (state->modal_open) {
    accesskit_rect accept_bounds = {220.0, 260.0, 390.0, 340.0};
    accesskit_rect cancel_bounds = {410.0, 260.0, 580.0, 340.0};
    accesskit_tree_update_push_node(update, DIALOG_ID, build_dialog());
    accesskit_tree_update_push_node(
        update, ACCEPT_ID,
        build_button(ACCEPT_ID, "Confirm restart", accept_bounds));
    accesskit_tree_update_push_node(
        update, CANCEL_ID,
        build_button(CANCEL_ID, "Cancel", cancel_bounds));
  }
  return update;
}

static void write_state_file(const ProbeState *state) {
  if (!state->state_file || state->state_file[0] == '\0') {
    return;
  }
  FILE *file = fopen(state->state_file, "w");
  if (!file) {
    fprintf(stderr, "Unable to write probe state file: %s\n", state->state_file);
    return;
  }
  fprintf(file, "focus=%llu\n", (unsigned long long)state->focus);
  fprintf(file, "modal_open=%d\n", state->modal_open ? 1 : 0);
  fprintf(file, "status=%s\n", state->status);
  fprintf(file, "last_action=%s\n", state->last_action);
  fclose(file);
}

static accesskit_tree_update *build_initial_tree(void *userdata) {
  ProbeState *state = userdata;
  SDL_LockMutex(state->mutex);
  accesskit_tree_update *update = build_full_tree(state, true);
  SDL_UnlockMutex(state->mutex);
  return update;
}

static accesskit_tree_update *build_current_tree(void *userdata) {
  ProbeState *state = userdata;
  SDL_LockMutex(state->mutex);
  accesskit_tree_update *update = build_full_tree(state, false);
  SDL_UnlockMutex(state->mutex);
  return update;
}

static void deactivate_accessibility(void *userdata) { (void)userdata; }

static void request_accessibility_update(ProbeState *state) {
  accesskit_unix_adapter_update_if_active(state->adapter, build_current_tree,
                                          state);
  write_state_file(state);
}

static void queue_accessibility_action(accesskit_action_request *request,
                                       void *userdata) {
  ProbeState *state = userdata;
  SDL_Event event;
  SDL_zero(event);
  event.type = state->action_event_type;
  event.user.windowID = state->window_id;
  event.user.data1 = (void *)(uintptr_t)request->target_node;
  if (request->action == ACCESSKIT_ACTION_FOCUS) {
    event.user.code = ACTION_FOCUS_CODE;
    SDL_PushEvent(&event);
  } else if (request->action == ACCESSKIT_ACTION_CLICK) {
    event.user.code = ACTION_CLICK_CODE;
    SDL_PushEvent(&event);
  }
  accesskit_action_request_free(request);
}

static void update_root_window_bounds(ProbeState *state) {
  int x = 0;
  int y = 0;
  int width = 0;
  int height = 0;
  int top = 0;
  int left = 0;
  int bottom = 0;
  int right = 0;
  if (!SDL_GetWindowPosition(state->window, &x, &y) ||
      !SDL_GetWindowSize(state->window, &width, &height)) {
    return;
  }
  SDL_GetWindowBordersSize(state->window, &top, &left, &bottom, &right);
  accesskit_rect outer = {x - left, y - top, x + width + right,
                          y + height + bottom};
  accesskit_rect inner = {x, y, x + width, y + height};
  accesskit_unix_adapter_set_root_window_bounds(state->adapter, outer, inner);
}

static bool is_button_id(accesskit_node_id id) {
  return id == CONTINUE_ID || id == RESTART_ID || id == ACCEPT_ID ||
         id == CANCEL_ID;
}

static void focus_node(ProbeState *state, accesskit_node_id id) {
  if (!is_button_id(id)) {
    return;
  }
  if (!state->modal_open && (id == ACCEPT_ID || id == CANCEL_ID)) {
    return;
  }
  if (state->modal_open && (id == CONTINUE_ID || id == RESTART_ID)) {
    return;
  }
  state->focus = id;
  state->last_action = "focus";
  request_accessibility_update(state);
}

static void click_node(ProbeState *state, accesskit_node_id id) {
  if (id == CONTINUE_ID && !state->modal_open) {
    state->focus = CONTINUE_ID;
    state->status = "Continue activated";
    state->last_action = "continue";
  } else if (id == RESTART_ID && !state->modal_open) {
    state->modal_open = true;
    state->focus = ACCEPT_ID;
    state->status = "Restart confirmation opened";
    state->last_action = "restart";
  } else if (id == ACCEPT_ID && state->modal_open) {
    state->modal_open = false;
    state->focus = RESTART_ID;
    state->status = "Restart confirmed";
    state->last_action = "confirm";
  } else if (id == CANCEL_ID && state->modal_open) {
    state->modal_open = false;
    state->focus = RESTART_ID;
    state->status = "Restart cancelled";
    state->last_action = "cancel";
  } else {
    return;
  }
  request_accessibility_update(state);
}

static void handle_keyboard(ProbeState *state, SDL_Keycode key) {
  if (key == SDLK_TAB) {
    if (state->modal_open) {
      focus_node(state, state->focus == ACCEPT_ID ? CANCEL_ID : ACCEPT_ID);
    } else {
      focus_node(state,
                 state->focus == CONTINUE_ID ? RESTART_ID : CONTINUE_ID);
    }
  } else if (key == SDLK_RETURN || key == SDLK_SPACE) {
    click_node(state, state->focus);
  } else if (key == SDLK_ESCAPE) {
    if (state->modal_open) {
      click_node(state, CANCEL_ID);
    } else {
      state->quit = true;
    }
  }
}

static void render_frame(ProbeState *state) {
  SDL_SetRenderDrawColor(state->renderer, 24, 24, 28, 255);
  SDL_RenderClear(state->renderer);

  SDL_SetRenderDrawColor(state->renderer, 240, 240, 240, 255);
  SDL_RenderDebugText(state->renderer, 40.0f, 30.0f,
                      "Pikachu Volleyball accessibility probe");
  SDL_RenderDebugText(state->renderer, 40.0f, 52.0f,
                      "Tab moves focus | Enter activates | Escape cancels");
  SDL_RenderDebugText(state->renderer, 100.0f, 120.0f,
                      state->focus == CONTINUE_ID ? "> Continue" : "  Continue");
  SDL_RenderDebugText(state->renderer, 500.0f, 120.0f,
                      state->focus == RESTART_ID ? "> Restart" : "  Restart");
  SDL_RenderDebugText(state->renderer, 40.0f, 340.0f, state->status);

  if (state->modal_open) {
    SDL_SetRenderDrawColor(state->renderer, 65, 65, 72, 255);
    SDL_FRect dialog = {150.0f, 120.0f, 500.0f, 300.0f};
    SDL_RenderFillRect(state->renderer, &dialog);
    SDL_SetRenderDrawColor(state->renderer, 250, 250, 250, 255);
    SDL_RenderDebugText(state->renderer, 260.0f, 170.0f, "Restart match?");
    SDL_RenderDebugText(state->renderer, 220.0f, 280.0f,
                        state->focus == ACCEPT_ID ? "> Confirm restart"
                                                  : "  Confirm restart");
    SDL_RenderDebugText(state->renderer, 440.0f, 280.0f,
                        state->focus == CANCEL_ID ? "> Cancel" : "  Cancel");
  }
  SDL_RenderPresent(state->renderer);
}

static bool is_window_geometry_event(Uint32 type) {
  return type == SDL_EVENT_WINDOW_SHOWN || type == SDL_EVENT_WINDOW_MOVED ||
         type == SDL_EVENT_WINDOW_RESIZED ||
         type == SDL_EVENT_WINDOW_PIXEL_SIZE_CHANGED ||
         type == SDL_EVENT_WINDOW_MAXIMIZED ||
         type == SDL_EVENT_WINDOW_RESTORED;
}

int main(int argc, char **argv) {
  (void)argc;
  (void)argv;
  ProbeState state;
  memset(&state, 0, sizeof(state));
  state.focus = CONTINUE_ID;
  state.status = "Ready";
  state.last_action = "startup";
  state.state_file = getenv("PV_A11Y_PROBE_STATE_FILE");

  if (!SDL_Init(SDL_INIT_VIDEO)) {
    fprintf(stderr, "SDL_Init failed: %s\n", SDL_GetError());
    return 2;
  }
  if (!SDL_CreateWindowAndRenderer(WINDOW_TITLE, WINDOW_WIDTH, WINDOW_HEIGHT, 0,
                                   &state.window, &state.renderer)) {
    fprintf(stderr, "SDL_CreateWindowAndRenderer failed: %s\n", SDL_GetError());
    SDL_Quit();
    return 2;
  }

  state.window_id = SDL_GetWindowID(state.window);
  state.action_event_type = SDL_RegisterEvents(1);
  state.mutex = SDL_CreateMutex();
  if (state.action_event_type == (Uint32)-1 || !state.mutex) {
    fprintf(stderr, "Unable to initialize probe event/mutex: %s\n", SDL_GetError());
    SDL_DestroyRenderer(state.renderer);
    SDL_DestroyWindow(state.window);
    SDL_Quit();
    return 2;
  }

  state.adapter = accesskit_unix_adapter_new(
      build_initial_tree, &state, queue_accessibility_action, &state,
      deactivate_accessibility, &state);
  if (!state.adapter) {
    fprintf(stderr, "Unable to create AccessKit Unix adapter\n");
    SDL_DestroyMutex(state.mutex);
    SDL_DestroyRenderer(state.renderer);
    SDL_DestroyWindow(state.window);
    SDL_Quit();
    return 2;
  }

  update_root_window_bounds(&state);
  accesskit_unix_adapter_update_window_focus_state(state.adapter, true);
  write_state_file(&state);
  render_frame(&state);

  while (!state.quit) {
    SDL_Event event;
    if (!SDL_WaitEventTimeout(&event, 50)) {
      render_frame(&state);
      continue;
    }
    if (event.type == SDL_EVENT_QUIT) {
      state.quit = true;
    } else if (event.type == SDL_EVENT_KEY_DOWN && !event.key.repeat &&
               event.key.windowID == state.window_id) {
      handle_keyboard(&state, event.key.key);
    } else if (event.type == SDL_EVENT_WINDOW_FOCUS_GAINED &&
               event.window.windowID == state.window_id) {
      accesskit_unix_adapter_update_window_focus_state(state.adapter, true);
    } else if (event.type == SDL_EVENT_WINDOW_FOCUS_LOST &&
               event.window.windowID == state.window_id) {
      accesskit_unix_adapter_update_window_focus_state(state.adapter, false);
    } else if (is_window_geometry_event(event.type) &&
               event.window.windowID == state.window_id) {
      update_root_window_bounds(&state);
    } else if (event.type == state.action_event_type &&
               event.user.windowID == state.window_id) {
      accesskit_node_id target = (accesskit_node_id)(uintptr_t)event.user.data1;
      if (event.user.code == ACTION_FOCUS_CODE) {
        focus_node(&state, target);
      } else if (event.user.code == ACTION_CLICK_CODE) {
        click_node(&state, target);
      }
    }
    render_frame(&state);
  }

  accesskit_unix_adapter_update_window_focus_state(state.adapter, false);
  accesskit_unix_adapter_free(state.adapter);
  SDL_DestroyMutex(state.mutex);
  SDL_DestroyRenderer(state.renderer);
  SDL_DestroyWindow(state.window);
  SDL_Quit();
  return 0;
}
