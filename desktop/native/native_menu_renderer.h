#ifndef PIKACHU_VOLLEYBALL_NATIVE_MENU_RENDERER_H
#define PIKACHU_VOLLEYBALL_NATIVE_MENU_RENDERER_H

#include <SDL3/SDL.h>
#include <quickjs.h>
#include <stdbool.h>

typedef struct NativeMenuRenderer NativeMenuRenderer;

struct NativeMenuRenderer {
  void *font;
  void *fallback_font;
  bool initialized;
};

bool native_menu_renderer_init(NativeMenuRenderer *menu, const char *base_path);
void native_menu_renderer_destroy(NativeMenuRenderer *menu);
bool native_menu_renderer_render_quick_rematch(NativeMenuRenderer *menu,
                                               SDL_Renderer *renderer,
                                               JSContext *context,
                                               JSValueConst frame);
bool native_menu_renderer_render(NativeMenuRenderer *menu,
                                 SDL_Renderer *renderer,
                                 JSContext *context,
                                 JSValueConst frame);

#endif
