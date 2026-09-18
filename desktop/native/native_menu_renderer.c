#include "native_menu_renderer.h"

#include <SDL3_ttf/SDL_ttf.h>

#include <limits.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static bool get_bool(JSContext *context, JSValueConst object, const char *name,
                     bool *value_out) {
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

static char *get_string(JSContext *context, JSValueConst object,
                        const char *name) {
  JSValue value = JS_GetPropertyStr(context, object, name);
  if (JS_IsException(value)) {
    JS_FreeValue(context, value);
    return NULL;
  }
  const char *text = JS_ToCString(context, value);
  JS_FreeValue(context, value);
  if (!text) return NULL;
  char *copy = strdup(text);
  JS_FreeCString(context, text);
  return copy;
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

static const char *locale_language_tag(const char *locale) {
  if (strcmp(locale, "es-ar") == 0) return "es-AR";
  if (strcmp(locale, "ca") == 0) return "ca";
  if (strcmp(locale, "ko") == 0) return "ko";
  if (strcmp(locale, "zh") == 0) return "zh";
  return "en";
}

typedef struct NativeMenuPalette {
  SDL_Color overlay;
  SDL_Color primary;
  SDL_Color secondary;
  SDL_Color item;
  SDL_Color focus_fill;
  SDL_Color focus_text;
  SDL_Color modal;
} NativeMenuPalette;

static NativeMenuPalette menu_palette(bool dark) {
  if (dark) {
    return (NativeMenuPalette){
        .overlay = {14, 16, 22, 235},
        .primary = {250, 250, 250, 255},
        .secondary = {190, 198, 210, 255},
        .item = {245, 245, 245, 255},
        .focus_fill = {238, 196, 54, 235},
        .focus_text = {18, 18, 22, 255},
        .modal = {35, 38, 48, 250},
    };
  }
  return (NativeMenuPalette){
      .overlay = {244, 244, 224, 240},
      .primary = {18, 35, 46, 255},
      .secondary = {62, 74, 82, 255},
      .item = {24, 42, 50, 255},
      .focus_fill = {238, 196, 54, 235},
      .focus_text = {18, 18, 22, 255},
      .modal = {226, 232, 214, 250},
  };
}

static bool render_text(NativeMenuRenderer *menu, SDL_Renderer *renderer,
                        const char *text, float x, float y, int wrap_width,
                        SDL_Color color) {
  if (!text || text[0] == '\0') return true;
  TTF_Font *font = (TTF_Font *)menu->font;
  SDL_Surface *surface =
      wrap_width > 0
          ? TTF_RenderText_Blended_Wrapped(font, text, 0, color, wrap_width)
          : TTF_RenderText_Blended(font, text, 0, color);
  if (!surface) {
    fprintf(stderr, "TTF text render failed: %s\n", SDL_GetError());
    return false;
  }

  SDL_Texture *texture = SDL_CreateTextureFromSurface(renderer, surface);
  if (!texture) {
    fprintf(stderr, "SDL_CreateTextureFromSurface failed: %s\n",
            SDL_GetError());
    SDL_DestroySurface(surface);
    return false;
  }
  if (!SDL_SetTextureScaleMode(texture, SDL_SCALEMODE_NEAREST)) {
    fprintf(stderr, "SDL_SetTextureScaleMode failed for menu text: %s\n",
            SDL_GetError());
    SDL_DestroyTexture(texture);
    SDL_DestroySurface(surface);
    return false;
  }

  SDL_FRect destination = {
      x,
      y,
      (float)surface->w,
      (float)surface->h,
  };
  bool ok = SDL_RenderTexture(renderer, texture, NULL, &destination);
  SDL_DestroyTexture(texture);
  SDL_DestroySurface(surface);
  return ok;
}

static bool render_centered_text(NativeMenuRenderer *menu,
                                 SDL_Renderer *renderer,
                                 const char *text,
                                 float center_x,
                                 float y,
                                 int wrap_width,
                                 SDL_Color color) {
  if (!text || text[0] == '\0') return true;
  TTF_Font *font = (TTF_Font *)menu->font;
  SDL_Surface *surface =
      TTF_RenderText_Blended_Wrapped(font, text, 0, color, wrap_width);
  if (!surface) {
    fprintf(stderr, "TTF centered text render failed: %s\n", SDL_GetError());
    return false;
  }
  SDL_Texture *texture = SDL_CreateTextureFromSurface(renderer, surface);
  if (!texture) {
    SDL_DestroySurface(surface);
    return false;
  }
  if (!SDL_SetTextureScaleMode(texture, SDL_SCALEMODE_NEAREST)) {
    fprintf(stderr, "SDL_SetTextureScaleMode failed for centered menu text: %s\n",
            SDL_GetError());
    SDL_DestroyTexture(texture);
    SDL_DestroySurface(surface);
    return false;
  }
  SDL_FRect destination = {
      center_x - (float)surface->w / 2.0f,
      y,
      (float)surface->w,
      (float)surface->h,
  };
  bool ok = SDL_RenderTexture(renderer, texture, NULL, &destination);
  SDL_DestroyTexture(texture);
  SDL_DestroySurface(surface);
  return ok;
}

static bool render_item(NativeMenuRenderer *menu, SDL_Renderer *renderer,
                        JSContext *context, JSValueConst item,
                        const NativeMenuPalette *palette) {
  double x = 0;
  double y = 0;
  double width = 0;
  double height = 0;
  bool focused = false;
  if (!get_double(context, item, "x", &x) ||
      !get_double(context, item, "y", &y) ||
      !get_double(context, item, "width", &width) ||
      !get_double(context, item, "height", &height) ||
      !get_bool(context, item, "focused", &focused)) {
    return false;
  }

  char *label = get_string(context, item, "label");
  if (!label) return false;

  SDL_FRect bounds = {
      (float)x,
      (float)y,
      (float)width,
      (float)height,
  };
  if (focused) {
    SDL_SetRenderDrawColor(renderer, palette->focus_fill.r,
                          palette->focus_fill.g, palette->focus_fill.b,
                          palette->focus_fill.a);
    if (!SDL_RenderFillRect(renderer, &bounds)) {
      free(label);
      return false;
    }
  }

  SDL_Color color = focused ? palette->focus_text : palette->item;
  bool ok = render_text(menu, renderer, label, (float)x + 3.0f,
                        (float)y + 2.0f, (int)width - 6, color);
  free(label);
  return ok;
}

static bool render_item_array(NativeMenuRenderer *menu, SDL_Renderer *renderer,
                              JSContext *context, JSValueConst array,
                              const NativeMenuPalette *palette) {
  uint32_t length = 0;
  if (!get_array_length(context, array, &length)) return false;
  for (uint32_t index = 0; index < length; index += 1) {
    JSValue item = JS_GetPropertyUint32(context, array, index);
    bool ok =
        !JS_IsException(item) &&
        render_item(menu, renderer, context, item, palette);
    JS_FreeValue(context, item);
    if (!ok) return false;
  }
  return true;
}

bool native_menu_renderer_init(NativeMenuRenderer *menu,
                               const char *base_path) {
  memset(menu, 0, sizeof(*menu));
  if (!TTF_Init()) {
    fprintf(stderr, "TTF_Init failed: %s\n", SDL_GetError());
    return false;
  }

  char font_path[PATH_MAX];
  int written = snprintf(font_path, sizeof(font_path),
                         "%sfonts/unifont-17.0.04.otf", base_path);
  if (written <= 0 || (size_t)written >= sizeof(font_path)) {
    TTF_Quit();
    return false;
  }

  TTF_Font *font = TTF_OpenFont(font_path, 10.0f);
  if (!font) {
    fprintf(stderr, "Unable to load native menu font %s: %s\n", font_path,
            SDL_GetError());
    TTF_Quit();
    return false;
  }

  menu->font = font;
  menu->initialized = true;
  return true;
}

void native_menu_renderer_destroy(NativeMenuRenderer *menu) {
  if (!menu || !menu->initialized) return;
  if (menu->font) TTF_CloseFont((TTF_Font *)menu->font);
  menu->font = NULL;
  menu->initialized = false;
  TTF_Quit();
}

bool native_menu_renderer_render_quick_rematch(NativeMenuRenderer *menu,
                                               SDL_Renderer *renderer,
                                               JSContext *context,
                                               JSValueConst frame) {
  if (!menu || !menu->initialized) return false;

  bool visible = false;
  if (!get_bool(context, frame, "quickRematchVisible", &visible)) return false;
  if (!visible) return true;

  char *locale = get_string(context, frame, "locale");
  char *text = get_string(context, frame, "quickRematchText");
  if (!locale || !text) {
    free(locale);
    free(text);
    return false;
  }

  TTF_Font *font = (TTF_Font *)menu->font;
  bool ok = TTF_SetFontLanguage(font, locale_language_tag(locale));
  if (ok) {
    SDL_SetRenderDrawBlendMode(renderer, SDL_BLENDMODE_BLEND);
    SDL_SetRenderDrawColor(renderer, 0, 0, 0, 150);
    SDL_FRect background = {24, 267, 384, 23};
    ok = SDL_RenderFillRect(renderer, &background) &&
         render_centered_text(menu, renderer, text, 216.0f, 273.0f, 372,
                              (SDL_Color){255, 255, 255, 255});
    SDL_SetRenderDrawBlendMode(renderer, SDL_BLENDMODE_NONE);
  }

  free(locale);
  free(text);
  return ok;
}

bool native_menu_renderer_render(NativeMenuRenderer *menu,
                                 SDL_Renderer *renderer,
                                 JSContext *context,
                                 JSValueConst frame) {
  if (!menu || !menu->initialized) return false;

  bool visible = false;
  if (!get_bool(context, frame, "visible", &visible)) return false;
  if (!visible) return true;

  char *locale = get_string(context, frame, "locale");
  char *color_scheme = get_string(context, frame, "colorScheme");
  char *title = get_string(context, frame, "title");
  char *panel_title = get_string(context, frame, "panelTitle");
  char *panel_body = get_string(context, frame, "panelBody");
  char *status = get_string(context, frame, "status");
  if (!locale || !color_scheme || !title || !panel_title || !panel_body ||
      !status) {
    free(locale);
    free(color_scheme);
    free(title);
    free(panel_title);
    free(panel_body);
    free(status);
    return false;
  }
  NativeMenuPalette palette = menu_palette(strcmp(color_scheme, "dark") == 0);

  TTF_Font *font = (TTF_Font *)menu->font;
  if (!TTF_SetFontLanguage(font, locale_language_tag(locale))) {
    fprintf(stderr, "TTF_SetFontLanguage failed for %s: %s\n", locale,
            SDL_GetError());
    free(locale);
    free(color_scheme);
    free(title);
    free(panel_title);
    free(panel_body);
    free(status);
    return false;
  }

  SDL_SetRenderDrawBlendMode(renderer, SDL_BLENDMODE_BLEND);
  SDL_SetRenderDrawColor(renderer, palette.overlay.r, palette.overlay.g,
                         palette.overlay.b, palette.overlay.a);
  SDL_FRect overlay = {0, 0, 432, 304};
  if (!SDL_RenderFillRect(renderer, &overlay)) {
    free(locale);
    free(color_scheme);
    free(title);
    free(panel_title);
    free(panel_body);
    free(status);
    return false;
  }

  SDL_Color primary = palette.primary;
  SDL_Color secondary = palette.secondary;
  bool ok =
      render_text(menu, renderer, title, 12, 10, 0, primary) &&
      render_text(menu, renderer, panel_title, 154, 22, 260, primary) &&
      render_text(menu, renderer, panel_body, 154, 34, 260, secondary) &&
      render_text(menu, renderer, status, 12, 287, 408, secondary);

  JSValue nav_items = JS_GetPropertyStr(context, frame, "navItems");
  JSValue panel_items = JS_GetPropertyStr(context, frame, "panelItems");
  if (ok) {
    ok = !JS_IsException(nav_items) && !JS_IsException(panel_items) &&
         render_item_array(menu, renderer, context, nav_items, &palette) &&
         render_item_array(menu, renderer, context, panel_items, &palette);
  }

  JSValue modal = JS_GetPropertyStr(context, frame, "modal");
  if (ok && !JS_IsNull(modal) && !JS_IsUndefined(modal)) {
    char *modal_title = get_string(context, modal, "title");
    char *modal_message = get_string(context, modal, "message");
    JSValue items = JS_GetPropertyStr(context, modal, "items");
    SDL_SetRenderDrawColor(renderer, palette.modal.r, palette.modal.g,
                           palette.modal.b, palette.modal.a);
    SDL_FRect card = {92, 172, 248, 108};
    ok = modal_title && modal_message && !JS_IsException(items) &&
         SDL_RenderFillRect(renderer, &card) &&
         render_text(menu, renderer, modal_title, 106, 181, 220, primary) &&
         render_text(menu, renderer, modal_message, 106, 194, 220, secondary) &&
         render_item_array(menu, renderer, context, items, &palette);
    free(modal_title);
    free(modal_message);
    JS_FreeValue(context, items);
  }

  JS_FreeValue(context, modal);
  JS_FreeValue(context, nav_items);
  JS_FreeValue(context, panel_items);
  free(locale);
  free(color_scheme);
  free(title);
  free(panel_title);
  free(panel_body);
  free(status);

  SDL_SetRenderDrawBlendMode(renderer, SDL_BLENDMODE_NONE);
  return ok;
}
