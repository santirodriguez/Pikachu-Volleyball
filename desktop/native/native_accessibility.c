#include "native_accessibility.h"

#include <accesskit.h>

#include <limits.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define ROOT_ID ((accesskit_node_id)1)
#define MENU_DIALOG_ID ((accesskit_node_id)2)
#define STATUS_ID ((accesskit_node_id)3)
#define CONFIRMATION_DIALOG_ID ((accesskit_node_id)4)
#define ACTION_FOCUS_CODE 1
#define ACTION_CLICK_CODE 2
#define MAX_ACCESSIBLE_ITEMS 40
#define ACCESSIBLE_TEXT_LENGTH 768

typedef struct NativeAccessibleItem {
  accesskit_node_id node_id;
  char kind[24];
  char label[ACCESSIBLE_TEXT_LENGTH];
  double x;
  double y;
  double width;
  double height;
  bool focused;
  bool disabled;
} NativeAccessibleItem;

typedef struct NativeAccessibilitySnapshot {
  bool visible;
  bool modal_open;
  char title[ACCESSIBLE_TEXT_LENGTH];
  char panel_title[ACCESSIBLE_TEXT_LENGTH];
  char panel_body[ACCESSIBLE_TEXT_LENGTH];
  char status[ACCESSIBLE_TEXT_LENGTH];
  char modal_title[ACCESSIBLE_TEXT_LENGTH];
  char modal_message[ACCESSIBLE_TEXT_LENGTH];
  NativeAccessibleItem items[MAX_ACCESSIBLE_ITEMS];
  size_t item_count;
  accesskit_node_id focus;
  int window_width;
  int window_height;
} NativeAccessibilitySnapshot;

typedef struct NativeAccessibilityImpl {
  SDL_Window *window;
  SDL_Renderer *renderer;
  SDL_Mutex *mutex;
  accesskit_unix_adapter *adapter;
  Uint32 action_event_type;
  Uint32 window_id;
  NativeAccessibilitySnapshot snapshot;
} NativeAccessibilityImpl;

static bool get_bool(JSContext *context, JSValueConst object,
                     const char *name, bool *value_out) {
  JSValue value = JS_GetPropertyStr(context, object, name);
  if (JS_IsException(value)) {
    JS_FreeValue(context, value);
    return false;
  }
  int converted = JS_ToBool(context, value);
  JS_FreeValue(context, value);
  if (converted < 0) return false;
  *value_out = converted != 0;
  return true;
}

static bool get_double(JSContext *context, JSValueConst object,
                       const char *name, double *value_out) {
  JSValue value = JS_GetPropertyStr(context, object, name);
  if (JS_IsException(value)) {
    JS_FreeValue(context, value);
    return false;
  }
  int converted = JS_ToFloat64(context, value_out, value);
  JS_FreeValue(context, value);
  return converted == 0;
}

static bool get_node_id(JSContext *context, JSValueConst object,
                        accesskit_node_id *value_out) {
  JSValue value = JS_GetPropertyStr(context, object, "nodeId");
  if (JS_IsException(value)) {
    JS_FreeValue(context, value);
    return false;
  }
  int64_t converted_value = 0;
  int converted = JS_ToInt64(context, &converted_value, value);
  JS_FreeValue(context, value);
  if (converted != 0 || converted_value <= 4) return false;
  *value_out = (accesskit_node_id)converted_value;
  return true;
}

static bool get_string(JSContext *context, JSValueConst object,
                       const char *name, char *output, size_t output_size) {
  JSValue value = JS_GetPropertyStr(context, object, name);
  if (JS_IsException(value)) {
    JS_FreeValue(context, value);
    return false;
  }
  const char *text = JS_ToCString(context, value);
  JS_FreeValue(context, value);
  if (!text) return false;
  size_t length = strlen(text);
  bool fits = length < output_size;
  if (fits) memcpy(output, text, length + 1);
  JS_FreeCString(context, text);
  return fits;
}

static bool get_array_length(JSContext *context, JSValueConst array,
                             uint32_t *length_out) {
  JSValue length = JS_GetPropertyStr(context, array, "length");
  if (JS_IsException(length)) {
    JS_FreeValue(context, length);
    return false;
  }
  int converted = JS_ToUint32(context, length_out, length);
  JS_FreeValue(context, length);
  return converted == 0;
}

static bool map_bounds(NativeAccessibilityImpl *impl, double x, double y,
                       double width, double height, NativeAccessibleItem *item) {
  float left = (float)x;
  float top = (float)y;
  float right = (float)(x + width);
  float bottom = (float)(y + height);
  if (!SDL_RenderCoordinatesToWindow(impl->renderer, (float)x, (float)y,
                                     &left, &top) ||
      !SDL_RenderCoordinatesToWindow(impl->renderer, (float)(x + width),
                                     (float)(y + height), &right, &bottom)) {
    return false;
  }
  item->x = left;
  item->y = top;
  item->width = right - left;
  item->height = bottom - top;
  return item->width >= 0 && item->height >= 0;
}

static bool copy_item(NativeAccessibilityImpl *impl, JSContext *context,
                      JSValueConst source, NativeAccessibleItem *item) {
  double x = 0;
  double y = 0;
  double width = 0;
  double height = 0;
  memset(item, 0, sizeof(*item));
  return get_node_id(context, source, &item->node_id) &&
         get_string(context, source, "kind", item->kind,
                    sizeof(item->kind)) &&
         get_string(context, source, "label", item->label,
                    sizeof(item->label)) &&
         get_bool(context, source, "focused", &item->focused) &&
         get_bool(context, source, "disabled", &item->disabled) &&
         get_double(context, source, "x", &x) &&
         get_double(context, source, "y", &y) &&
         get_double(context, source, "width", &width) &&
         get_double(context, source, "height", &height) &&
         map_bounds(impl, x, y, width, height, item);
}

static bool collect_items(NativeAccessibilityImpl *impl, JSContext *context,
                          JSValueConst array,
                          NativeAccessibilitySnapshot *snapshot) {
  uint32_t length = 0;
  if (!get_array_length(context, array, &length)) return false;
  if (snapshot->item_count + length > MAX_ACCESSIBLE_ITEMS) return false;
  for (uint32_t index = 0; index < length; index += 1) {
    JSValue item = JS_GetPropertyUint32(context, array, index);
    bool ok =
        !JS_IsException(item) &&
        copy_item(impl, context, item,
                  &snapshot->items[snapshot->item_count]);
    JS_FreeValue(context, item);
    if (!ok) return false;
    if (snapshot->items[snapshot->item_count].focused) {
      snapshot->focus =
          snapshot->items[snapshot->item_count].node_id;
    }
    snapshot->item_count += 1;
  }
  return true;
}

static bool build_snapshot(NativeAccessibilityImpl *impl, JSContext *context,
                           JSValueConst frame,
                           NativeAccessibilitySnapshot *snapshot) {
  memset(snapshot, 0, sizeof(*snapshot));
  snapshot->focus = ROOT_ID;
  if (!SDL_GetWindowSize(impl->window, &snapshot->window_width,
                         &snapshot->window_height)) {
    return false;
  }
  if (!get_bool(context, frame, "visible", &snapshot->visible) ||
      !get_string(context, frame, "title", snapshot->title,
                  sizeof(snapshot->title)) ||
      !get_string(context, frame, "panelTitle", snapshot->panel_title,
                  sizeof(snapshot->panel_title)) ||
      !get_string(context, frame, "panelBody", snapshot->panel_body,
                  sizeof(snapshot->panel_body)) ||
      !get_string(context, frame, "status", snapshot->status,
                  sizeof(snapshot->status))) {
    return false;
  }
  if (!snapshot->visible) return true;

  JSValue modal = JS_GetPropertyStr(context, frame, "modal");
  if (JS_IsException(modal)) {
    JS_FreeValue(context, modal);
    return false;
  }
  snapshot->modal_open = !JS_IsNull(modal) && !JS_IsUndefined(modal);
  bool ok = true;
  if (snapshot->modal_open) {
    JSValue items = JS_GetPropertyStr(context, modal, "items");
    ok = get_string(context, modal, "title", snapshot->modal_title,
                    sizeof(snapshot->modal_title)) &&
         get_string(context, modal, "message", snapshot->modal_message,
                    sizeof(snapshot->modal_message)) &&
         !JS_IsException(items) &&
         collect_items(impl, context, items, snapshot);
    JS_FreeValue(context, items);
  } else {
    JSValue nav_items = JS_GetPropertyStr(context, frame, "navItems");
    JSValue panel_items = JS_GetPropertyStr(context, frame, "panelItems");
    ok = !JS_IsException(nav_items) && !JS_IsException(panel_items) &&
         collect_items(impl, context, nav_items, snapshot) &&
         collect_items(impl, context, panel_items, snapshot);
    JS_FreeValue(context, nav_items);
    JS_FreeValue(context, panel_items);
  }
  JS_FreeValue(context, modal);
  if (ok && snapshot->focus == ROOT_ID) snapshot->focus = MENU_DIALOG_ID;
  return ok;
}

static accesskit_rect item_rect(const NativeAccessibleItem *item) {
  accesskit_rect rect = {
      item->x,
      item->y,
      item->x + item->width,
      item->y + item->height,
  };
  return rect;
}

static accesskit_node *build_item_node(const NativeAccessibleItem *item) {
  enum accesskit_role role =
      strcmp(item->kind, "link") == 0 ? ACCESSKIT_ROLE_LINK
                                      : ACCESSKIT_ROLE_BUTTON;
  accesskit_node *node = accesskit_node_new(role);
  accesskit_node_set_label(node, item->label);
  accesskit_node_set_bounds(node, item_rect(item));
  if (item->disabled) {
    accesskit_node_set_disabled(node);
  } else {
    accesskit_node_add_action(node, ACCESSKIT_ACTION_FOCUS);
    accesskit_node_add_action(node, ACCESSKIT_ACTION_CLICK);
  }
  return node;
}

static accesskit_tree_update *build_tree_locked(
    const NativeAccessibilityImpl *impl, bool initial) {
  const NativeAccessibilitySnapshot *snapshot = &impl->snapshot;
  size_t capacity = 1;
  if (snapshot->visible) {
    capacity += 2 + snapshot->item_count;
    if (snapshot->modal_open) capacity += 1;
  }
  accesskit_tree_update *update =
      accesskit_tree_update_with_capacity_and_focus(capacity, snapshot->focus);
  if (initial) {
    accesskit_tree *tree = accesskit_tree_new(ROOT_ID);
    accesskit_tree_update_set_tree(update, tree);
  }

  const int width = snapshot->window_width;
  const int height = snapshot->window_height;
  accesskit_node *root = accesskit_node_new(ACCESSKIT_ROLE_WINDOW);
  accesskit_node_set_label(root, "Pikachu Volleyball Native");
  accesskit_rect root_bounds = {0.0, 0.0, (double)width, (double)height};
  accesskit_node_set_bounds(root, root_bounds);
  if (snapshot->visible) accesskit_node_push_child(root, MENU_DIALOG_ID);
  accesskit_tree_update_push_node(update, ROOT_ID, root);

  if (!snapshot->visible) return update;

  accesskit_node *menu = accesskit_node_new(ACCESSKIT_ROLE_DIALOG);
  accesskit_node_set_label(menu, snapshot->title);
  accesskit_node_set_description(menu, snapshot->panel_body);
  accesskit_node_set_modal(menu);
  accesskit_node_set_bounds(menu, root_bounds);
  if (snapshot->modal_open) {
    accesskit_node_push_child(menu, CONFIRMATION_DIALOG_ID);
  } else {
    for (size_t index = 0; index < snapshot->item_count; index += 1) {
      accesskit_node_push_child(menu, snapshot->items[index].node_id);
    }
  }
  accesskit_node_push_child(menu, STATUS_ID);
  accesskit_tree_update_push_node(update, MENU_DIALOG_ID, menu);

  accesskit_node *status = accesskit_node_new(ACCESSKIT_ROLE_STATUS);
  accesskit_node_set_label(status, snapshot->status);
  accesskit_node_set_live(status, ACCESSKIT_LIVE_POLITE);
  accesskit_rect status_bounds = {0.0, (double)(height > 40 ? height - 40 : 0),
                                  (double)width, (double)height};
  accesskit_node_set_bounds(status, status_bounds);
  accesskit_tree_update_push_node(update, STATUS_ID, status);

  if (snapshot->modal_open) {
    accesskit_node *dialog = accesskit_node_new(ACCESSKIT_ROLE_DIALOG);
    accesskit_node_set_label(dialog, snapshot->modal_title);
    accesskit_node_set_description(dialog, snapshot->modal_message);
    accesskit_node_set_modal(dialog);
    accesskit_rect dialog_bounds = {
        width * 0.2, height * 0.45, width * 0.8, height * 0.92};
    accesskit_node_set_bounds(dialog, dialog_bounds);
    for (size_t index = 0; index < snapshot->item_count; index += 1) {
      accesskit_node_push_child(dialog, snapshot->items[index].node_id);
    }
    accesskit_tree_update_push_node(update, CONFIRMATION_DIALOG_ID, dialog);
  }

  for (size_t index = 0; index < snapshot->item_count; index += 1) {
    accesskit_tree_update_push_node(
        update, snapshot->items[index].node_id,
        build_item_node(&snapshot->items[index]));
  }
  return update;
}

static accesskit_tree_update *build_initial_tree(void *userdata) {
  NativeAccessibilityImpl *impl = userdata;
  SDL_LockMutex(impl->mutex);
  accesskit_tree_update *update = build_tree_locked(impl, true);
  SDL_UnlockMutex(impl->mutex);
  return update;
}

static accesskit_tree_update *build_current_tree(void *userdata) {
  NativeAccessibilityImpl *impl = userdata;
  SDL_LockMutex(impl->mutex);
  accesskit_tree_update *update = build_tree_locked(impl, false);
  SDL_UnlockMutex(impl->mutex);
  return update;
}

static void deactivate_accessibility(void *userdata) { (void)userdata; }

static void queue_accessibility_action(accesskit_action_request *request,
                                       void *userdata) {
  NativeAccessibilityImpl *impl = userdata;
  SDL_Event event;
  SDL_zero(event);
  event.type = impl->action_event_type;
  event.user.windowID = impl->window_id;
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

static void write_state_file(const NativeAccessibilitySnapshot *snapshot) {
  const char *path = getenv("PV_NATIVE_A11Y_STATE_FILE");
  if (!path || path[0] == '\0') return;
  FILE *file = fopen(path, "w");
  if (!file) return;
  fprintf(file, "visible=%d\n", snapshot->visible ? 1 : 0);
  fprintf(file, "focus=%llu\n", (unsigned long long)snapshot->focus);
  fprintf(file, "modal_open=%d\n", snapshot->modal_open ? 1 : 0);
  fprintf(file, "status=%s\n", snapshot->status);
  fclose(file);
}

bool native_accessibility_init(NativeAccessibility *accessibility,
                               SDL_Window *window, SDL_Renderer *renderer) {
  if (!accessibility || !window || !renderer) return false;
  NativeAccessibilityImpl *impl = calloc(1, sizeof(*impl));
  if (!impl) return false;
  impl->window = window;
  impl->renderer = renderer;
  impl->window_id = SDL_GetWindowID(window);
  impl->action_event_type = SDL_RegisterEvents(1);
  impl->mutex = SDL_CreateMutex();
  if (impl->action_event_type == (Uint32)-1 || !impl->mutex) {
    if (impl->mutex) SDL_DestroyMutex(impl->mutex);
    free(impl);
    return false;
  }
  impl->snapshot.focus = ROOT_ID;
  impl->adapter = accesskit_unix_adapter_new(
      build_initial_tree, impl, queue_accessibility_action, impl,
      deactivate_accessibility, impl);
  if (!impl->adapter) {
    SDL_DestroyMutex(impl->mutex);
    free(impl);
    return false;
  }
  accessibility->impl = impl;
  native_accessibility_update_window_bounds(accessibility);
  accesskit_unix_adapter_update_window_focus_state(impl->adapter, true);
  return true;
}

void native_accessibility_destroy(NativeAccessibility *accessibility) {
  if (!accessibility || !accessibility->impl) return;
  NativeAccessibilityImpl *impl = accessibility->impl;
  accesskit_unix_adapter_update_window_focus_state(impl->adapter, false);
  accesskit_unix_adapter_free(impl->adapter);
  SDL_DestroyMutex(impl->mutex);
  free(impl);
  accessibility->impl = NULL;
}

bool native_accessibility_sync(NativeAccessibility *accessibility,
                               JSContext *context, JSValueConst menu_frame) {
  if (!accessibility || !accessibility->impl || !context) return false;
  NativeAccessibilityImpl *impl = accessibility->impl;
  NativeAccessibilitySnapshot next;
  if (!build_snapshot(impl, context, menu_frame, &next)) return false;

  SDL_LockMutex(impl->mutex);
  bool changed = memcmp(&impl->snapshot, &next, sizeof(next)) != 0;
  if (changed) impl->snapshot = next;
  SDL_UnlockMutex(impl->mutex);
  if (changed) {
    accesskit_unix_adapter_update_if_active(
        impl->adapter, build_current_tree, impl);
    write_state_file(&next);
  }
  return true;
}

void native_accessibility_set_window_focus(NativeAccessibility *accessibility,
                                           bool focused) {
  if (!accessibility || !accessibility->impl) return;
  NativeAccessibilityImpl *impl = accessibility->impl;
  accesskit_unix_adapter_update_window_focus_state(impl->adapter, focused);
}

void native_accessibility_update_window_bounds(
    NativeAccessibility *accessibility) {
  if (!accessibility || !accessibility->impl) return;
  NativeAccessibilityImpl *impl = accessibility->impl;
  int x = 0;
  int y = 0;
  int width = 0;
  int height = 0;
  int top = 0;
  int left = 0;
  int bottom = 0;
  int right = 0;
  if (!SDL_GetWindowPosition(impl->window, &x, &y) ||
      !SDL_GetWindowSize(impl->window, &width, &height)) {
    return;
  }
  SDL_GetWindowBordersSize(impl->window, &top, &left, &bottom, &right);
  accesskit_rect outer = {x - left, y - top, x + width + right,
                          y + height + bottom};
  accesskit_rect inner = {x, y, x + width, y + height};
  accesskit_unix_adapter_set_root_window_bounds(impl->adapter, outer, inner);
}

bool native_accessibility_is_window_geometry_event(Uint32 type) {
  return type == SDL_EVENT_WINDOW_SHOWN || type == SDL_EVENT_WINDOW_MOVED ||
         type == SDL_EVENT_WINDOW_RESIZED ||
         type == SDL_EVENT_WINDOW_PIXEL_SIZE_CHANGED ||
         type == SDL_EVENT_WINDOW_MAXIMIZED ||
         type == SDL_EVENT_WINDOW_RESTORED;
}

bool native_accessibility_translate_event(
    NativeAccessibility *accessibility, const SDL_Event *event,
    uint64_t *node_id_out, NativeAccessibilityAction *action_out) {
  if (!accessibility || !accessibility->impl || !event || !node_id_out ||
      !action_out) {
    return false;
  }
  NativeAccessibilityImpl *impl = accessibility->impl;
  if (event->type != impl->action_event_type ||
      event->user.windowID != impl->window_id) {
    return false;
  }
  *node_id_out = (uint64_t)(uintptr_t)event->user.data1;
  if (event->user.code == ACTION_FOCUS_CODE) {
    *action_out = NATIVE_ACCESSIBILITY_ACTION_FOCUS;
  } else if (event->user.code == ACTION_CLICK_CODE) {
    *action_out = NATIVE_ACCESSIBILITY_ACTION_CLICK;
  } else {
    *action_out = NATIVE_ACCESSIBILITY_ACTION_NONE;
    return false;
  }
  return true;
}
