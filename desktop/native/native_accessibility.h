#ifndef PIKACHU_VOLLEYBALL_NATIVE_ACCESSIBILITY_H
#define PIKACHU_VOLLEYBALL_NATIVE_ACCESSIBILITY_H

#include <SDL3/SDL.h>
#include <quickjs.h>

#include <stdbool.h>
#include <stdint.h>

typedef enum NativeAccessibilityAction {
  NATIVE_ACCESSIBILITY_ACTION_NONE = 0,
  NATIVE_ACCESSIBILITY_ACTION_FOCUS = 1,
  NATIVE_ACCESSIBILITY_ACTION_CLICK = 2,
} NativeAccessibilityAction;

typedef struct NativeAccessibility {
  void *impl;
} NativeAccessibility;

bool native_accessibility_init(NativeAccessibility *accessibility,
                               SDL_Window *window, SDL_Renderer *renderer);
void native_accessibility_destroy(NativeAccessibility *accessibility);
bool native_accessibility_sync(NativeAccessibility *accessibility,
                               JSContext *context, JSValueConst menu_frame);
void native_accessibility_set_window_focus(NativeAccessibility *accessibility,
                                           bool focused);
void native_accessibility_update_window_bounds(
    NativeAccessibility *accessibility);
bool native_accessibility_is_window_geometry_event(Uint32 type);
bool native_accessibility_translate_event(
    NativeAccessibility *accessibility, const SDL_Event *event,
    uint64_t *node_id_out, NativeAccessibilityAction *action_out);

#endif
