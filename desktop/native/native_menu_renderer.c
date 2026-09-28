#include "native_menu_renderer.h"

#include <SDL3_ttf/SDL_ttf.h>

#include <limits.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define MENU_LOGICAL_WIDTH 432.0f
#define MENU_LOGICAL_HEIGHT 304.0f

typedef struct NativeMenuCanvas {
  SDL_FRect presentation;
  float scale_x;
  float scale_y;
  float scale;
  int logical_width;
  int logical_height;
  SDL_RendererLogicalPresentation logical_mode;
} NativeMenuCanvas;

typedef struct NativeMenuPalette {
  SDL_Color dim;
  SDL_Color shell;
  SDL_Color shell_shadow;
  SDL_Color shell_border;
  SDL_Color shell_inner;
  SDL_Color nav_panel;
  SDL_Color nav_text;
  SDL_Color detail_panel;
  SDL_Color detail_text;
  SDL_Color detail_muted;
  SDL_Color item_fill;
  SDL_Color item_border;
  SDL_Color item_text;
  SDL_Color focus_fill;
  SDL_Color focus_text;
  SDL_Color focus_shadow;
  SDL_Color accent_cyan;
  SDL_Color accent_yellow;
  SDL_Color accent_red;
  SDL_Color cream;
  SDL_Color footer;
  SDL_Color modal_dim;
  SDL_Color modal_panel;
  SDL_Color modal_text;
} NativeMenuPalette;

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

static char *get_optional_string(JSContext *context,
                                 JSValueConst object,
                                 const char *name) {
  JSValue value = JS_GetPropertyStr(context, object, name);
  if (JS_IsException(value)) {
    JS_FreeValue(context, value);
    return NULL;
  }
  if (JS_IsNull(value) || JS_IsUndefined(value)) {
    JS_FreeValue(context, value);
    return strdup("");
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

static NativeMenuPalette menu_palette(bool dark) {
  if (dark) {
    return (NativeMenuPalette){
        .dim = {3, 13, 20, 166},
        .shell = {13, 41, 63, 255},
        .shell_shadow = {2, 11, 17, 205},
        .shell_border = {9, 24, 36, 255},
        .shell_inner = {115, 204, 235, 255},
        .nav_panel = {5, 23, 35, 255},
        .nav_text = {234, 248, 255, 255},
        .detail_panel = {117, 201, 238, 255},
        .detail_text = {16, 35, 49, 255},
        .detail_muted = {31, 72, 94, 255},
        .item_fill = {20, 59, 87, 255},
        .item_border = {23, 56, 75, 255},
        .item_text = {255, 248, 215, 255},
        .focus_fill = {247, 220, 82, 255},
        .focus_text = {22, 35, 49, 255},
        .focus_shadow = {189, 67, 56, 255},
        .accent_cyan = {139, 220, 255, 255},
        .accent_yellow = {244, 212, 77, 255},
        .accent_red = {189, 67, 56, 255},
        .cream = {255, 248, 215, 255},
        .footer = {5, 20, 31, 255},
        .modal_dim = {3, 13, 20, 190},
        .modal_panel = {117, 201, 238, 255},
        .modal_text = {16, 35, 49, 255},
    };
  }

  return (NativeMenuPalette){
      .dim = {22, 44, 57, 118},
      .shell = {221, 246, 255, 255},
      .shell_shadow = {86, 55, 45, 150},
      .shell_border = {9, 24, 36, 255},
      .shell_inner = {117, 201, 238, 255},
      .nav_panel = {255, 248, 215, 255},
      .nav_text = {20, 59, 87, 255},
      .detail_panel = {202, 239, 250, 255},
      .detail_text = {16, 35, 49, 255},
      .detail_muted = {50, 84, 99, 255},
      .item_fill = {20, 59, 87, 255},
      .item_border = {9, 24, 36, 255},
      .item_text = {255, 248, 215, 255},
      .focus_fill = {247, 220, 82, 255},
      .focus_text = {22, 35, 49, 255},
      .focus_shadow = {189, 67, 56, 255},
      .accent_cyan = {52, 151, 194, 255},
      .accent_yellow = {244, 212, 77, 255},
      .accent_red = {189, 67, 56, 255},
      .cream = {255, 248, 215, 255},
      .footer = {20, 59, 87, 255},
      .modal_dim = {3, 13, 20, 150},
      .modal_panel = {202, 239, 250, 255},
      .modal_text = {16, 35, 49, 255},
  };
}

static bool begin_menu_canvas(SDL_Renderer *renderer,
                              NativeMenuCanvas *canvas) {
  if (!SDL_GetRenderLogicalPresentation(
          renderer, &canvas->logical_width, &canvas->logical_height,
          &canvas->logical_mode) ||
      canvas->logical_width <= 0 || canvas->logical_height <= 0 ||
      !SDL_GetRenderLogicalPresentationRect(renderer, &canvas->presentation)) {
    fprintf(stderr, "Unable to inspect logical menu presentation: %s\n",
            SDL_GetError());
    return false;
  }

  canvas->scale_x = canvas->presentation.w / MENU_LOGICAL_WIDTH;
  canvas->scale_y = canvas->presentation.h / MENU_LOGICAL_HEIGHT;
  canvas->scale =
      canvas->scale_x < canvas->scale_y ? canvas->scale_x : canvas->scale_y;
  if (canvas->scale <= 0.0f) return false;

  if (!SDL_SetRenderLogicalPresentation(
          renderer, 0, 0, SDL_LOGICAL_PRESENTATION_DISABLED)) {
    fprintf(stderr, "Unable to disable logical presentation for menu UI: %s\n",
            SDL_GetError());
    return false;
  }
  return true;
}

static bool end_menu_canvas(SDL_Renderer *renderer,
                            const NativeMenuCanvas *canvas) {
  if (!SDL_SetRenderLogicalPresentation(
          renderer, canvas->logical_width, canvas->logical_height,
          canvas->logical_mode)) {
    fprintf(stderr, "Unable to restore logical presentation after menu UI: %s\n",
            SDL_GetError());
    return false;
  }
  return true;
}

static SDL_FRect menu_rect(const NativeMenuCanvas *canvas, float x, float y,
                           float width, float height) {
  return (SDL_FRect){
      canvas->presentation.x + x * canvas->scale_x,
      canvas->presentation.y + y * canvas->scale_y,
      width * canvas->scale_x,
      height * canvas->scale_y,
  };
}

static bool set_draw_color(SDL_Renderer *renderer, SDL_Color color) {
  return SDL_SetRenderDrawColor(renderer, color.r, color.g, color.b, color.a);
}

static bool fill_menu_rect(SDL_Renderer *renderer,
                           const NativeMenuCanvas *canvas, float x, float y,
                           float width, float height, SDL_Color color) {
  SDL_FRect rect = menu_rect(canvas, x, y, width, height);
  return set_draw_color(renderer, color) &&
         SDL_RenderFillRect(renderer, &rect);
}

static bool outline_menu_rect(SDL_Renderer *renderer,
                              const NativeMenuCanvas *canvas, float x, float y,
                              float width, float height, float thickness,
                              SDL_Color color) {
  if (thickness <= 0.0f) return true;
  return fill_menu_rect(renderer, canvas, x, y, width, thickness, color) &&
         fill_menu_rect(renderer, canvas, x, y + height - thickness, width,
                        thickness, color) &&
         fill_menu_rect(renderer, canvas, x, y, thickness, height, color) &&
         fill_menu_rect(renderer, canvas, x + width - thickness, y, thickness,
                        height, color);
}

static bool render_menu_text(NativeMenuRenderer *menu, SDL_Renderer *renderer,
                             const NativeMenuCanvas *canvas, const char *text,
                             float x, float y, int wrap_width,
                             float logical_size, SDL_Color color) {
  if (!text || text[0] == '\0') return true;
  TTF_Font *font = (TTF_Font *)menu->font;
  TTF_Font *fallback = (TTF_Font *)menu->fallback_font;
  float point_size = logical_size * canvas->scale;
  if (point_size < 8.0f) point_size = 8.0f;
  if (!TTF_SetFontSize(font, point_size) ||
      (fallback && !TTF_SetFontSize(fallback, point_size))) {
    fprintf(stderr, "TTF_SetFontSize failed: %s\n", SDL_GetError());
    return false;
  }

  int physical_wrap =
      wrap_width > 0 ? (int)(wrap_width * canvas->scale_x) : 0;
  SDL_Surface *surface =
      physical_wrap > 0
          ? TTF_RenderText_Blended_Wrapped(font, text, 0, color, physical_wrap)
          : TTF_RenderText_Blended(font, text, 0, color);
  if (!surface) {
    fprintf(stderr, "TTF menu text render failed: %s\n", SDL_GetError());
    return false;
  }

  SDL_Texture *texture = SDL_CreateTextureFromSurface(renderer, surface);
  if (!texture) {
    fprintf(stderr, "SDL_CreateTextureFromSurface failed: %s\n",
            SDL_GetError());
    SDL_DestroySurface(surface);
    return false;
  }

  SDL_FRect destination = {
      canvas->presentation.x + x * canvas->scale_x,
      canvas->presentation.y + y * canvas->scale_y,
      (float)surface->w,
      (float)surface->h,
  };
  bool ok = SDL_RenderTexture(renderer, texture, NULL, &destination);
  SDL_DestroyTexture(texture);
  SDL_DestroySurface(surface);
  return ok;
}

static bool render_logical_centered_text(NativeMenuRenderer *menu,
                                         SDL_Renderer *renderer,
                                         const char *text, float center_x,
                                         float y, int wrap_width,
                                         SDL_Color color) {
  if (!text || text[0] == '\0') return true;
  TTF_Font *font = (TTF_Font *)menu->font;
  TTF_Font *fallback = (TTF_Font *)menu->fallback_font;
  if (!TTF_SetFontSize(font, 10.0f) ||
      (fallback && !TTF_SetFontSize(fallback, 10.0f))) {
    return false;
  }
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
                        const NativeMenuCanvas *canvas, JSContext *context,
                        JSValueConst item,
                        const NativeMenuPalette *palette) {
  double x = 0;
  double y = 0;
  double width = 0;
  double height = 0;
  bool focused = false;
  bool disabled = false;
  bool selected = false;
  bool hovered = false;
  if (!get_double(context, item, "x", &x) ||
      !get_double(context, item, "y", &y) ||
      !get_double(context, item, "width", &width) ||
      !get_double(context, item, "height", &height) ||
      !get_bool(context, item, "focused", &focused) ||
      !get_bool(context, item, "disabled", &disabled)) {
    return false;
  }
  JSValue selected_value = JS_GetPropertyStr(context, item, "selected");
  if (!JS_IsException(selected_value) && !JS_IsUndefined(selected_value)) {
    int converted = JS_ToBool(context, selected_value);
    if (converted >= 0) selected = converted != 0;
  }
  JS_FreeValue(context, selected_value);
  JSValue hovered_value = JS_GetPropertyStr(context, item, "hovered");
  if (!JS_IsException(hovered_value) && !JS_IsUndefined(hovered_value)) {
    int converted = JS_ToBool(context, hovered_value);
    if (converted >= 0) hovered = converted != 0;
  }
  JS_FreeValue(context, hovered_value);

  char *label = get_string(context, item, "label");
  char *kind = get_string(context, item, "kind");
  char *id = get_string(context, item, "id");
  char *display_label = get_optional_string(context, item, "displayLabel");
  char *secondary_label = get_optional_string(context, item, "secondaryLabel");
  char *group_label = get_optional_string(context, item, "groupLabel");
  if (!label || !kind || !id || !display_label || !secondary_label ||
      !group_label) {
    free(label);
    free(kind);
    free(id);
    free(display_label);
    free(secondary_label);
    free(group_label);
    return false;
  }

  const char *primary_label = display_label[0] != '\0' ? display_label : label;
  bool is_nav = strcmp(kind, "nav") == 0;
  bool is_modal = strcmp(kind, "modal") == 0;
  bool is_control = strcmp(kind, "control") == 0;
  bool is_trigger = strcmp(kind, "trigger") == 0;
  SDL_Color fill =
      is_trigger ? palette->footer
                 : (is_nav ? palette->nav_panel : palette->item_fill);
  SDL_Color border =
      is_trigger ? palette->accent_yellow
                 : (is_nav ? palette->shell_inner : palette->item_border);
  SDL_Color text_color =
      is_trigger ? palette->cream
                 : (is_nav ? palette->nav_text : palette->item_text);
  if (is_trigger) fill.a = 160;
  float font_size =
      is_trigger ? 5.8f
                 : (is_nav ? 6.8f
                           : (is_modal ? 6.7f
                                       : (is_control ? 6.0f : 6.3f)));

  if (is_nav && selected && !focused) border = palette->accent_yellow;
  if (hovered && !focused) {
    border = palette->accent_cyan;
    if (is_trigger) fill = palette->shell;
  }
  if (is_modal && !focused) {
    if (strcmp(id, "modal:accept") == 0) {
      fill = palette->accent_red;
      text_color = palette->cream;
    } else {
      fill = palette->cream;
      text_color = palette->detail_text;
    }
  }

  if (group_label[0] != '\0' &&
      !render_menu_text(menu, renderer, canvas, group_label, (float)x + 2.0f,
                        (float)y - 10.0f, (int)width - 4, 5.2f,
                        palette->detail_text)) {
    free(label); free(kind); free(id); free(display_label);
    free(secondary_label); free(group_label);
    return false;
  }

  if (focused) {
    if (!fill_menu_rect(renderer, canvas, (float)x + 2.5f, (float)y + 2.5f,
                        (float)width, (float)height, palette->focus_shadow)) {
      free(label); free(kind); free(id); free(display_label);
      free(secondary_label); free(group_label);
      return false;
    }
    fill = palette->focus_fill;
    border = palette->cream;
    text_color = palette->focus_text;
  }

  bool ok = fill_menu_rect(renderer, canvas, (float)x, (float)y,
                           (float)width, (float)height, fill) &&
            outline_menu_rect(renderer, canvas, (float)x, (float)y,
                              (float)width, (float)height, 1.0f, border);

  if (ok && is_nav && selected) {
    ok = fill_menu_rect(renderer, canvas, (float)x, (float)y, 3.0f,
                        (float)height, palette->accent_red);
  }

  if (ok) {
    SDL_Color final_text = disabled ? palette->detail_muted : text_color;
    float key_width = secondary_label[0] != '\0' ? (is_control ? 44.0f : 72.0f) : 0.0f;
    float label_width = (float)width - key_width - 14.0f;
    if (label_width < 28.0f) label_width = (float)width - 12.0f;
    float text_y = (float)y + ((float)height - font_size * 1.18f) / 2.0f;
    if (text_y < (float)y + 1.0f) text_y = (float)y + 1.0f;
    ok = render_menu_text(menu, renderer, canvas, primary_label,
                          (float)x + 6.0f, text_y, (int)label_width,
                          font_size, final_text);
    if (ok && secondary_label[0] != '\0') {
      float key_x = (float)x + (float)width - key_width - 4.0f;
      float key_y = (float)y + 3.0f;
      float key_height = (float)height - 6.0f;
      SDL_Color key_fill = focused ? palette->accent_cyan : palette->cream;
      ok = fill_menu_rect(renderer, canvas, key_x, key_y, key_width,
                          key_height, key_fill) &&
           outline_menu_rect(renderer, canvas, key_x, key_y, key_width,
                             key_height, 1.0f, palette->shell_border) &&
           render_menu_text(menu, renderer, canvas, secondary_label,
                            key_x + 4.0f, key_y + 1.0f,
                            (int)key_width - 8, font_size - 0.4f,
                            palette->detail_text);
    }
  }

  free(label); free(kind); free(id); free(display_label);
  free(secondary_label); free(group_label);
  return ok;
}

static bool render_item_array(NativeMenuRenderer *menu, SDL_Renderer *renderer,
                              const NativeMenuCanvas *canvas,
                              JSContext *context, JSValueConst array,
                              const NativeMenuPalette *palette) {
  uint32_t length = 0;
  if (!get_array_length(context, array, &length)) return false;
  for (uint32_t index = 0; index < length; index += 1) {
    JSValue item = JS_GetPropertyUint32(context, array, index);
    bool ok =
        !JS_IsException(item) &&
        render_item(menu, renderer, canvas, context, item, palette);
    JS_FreeValue(context, item);
    if (!ok) return false;
  }
  return true;
}

static bool render_menu_chrome(NativeMenuRenderer *menu,
                               SDL_Renderer *renderer,
                               const NativeMenuCanvas *canvas,
                               const NativeMenuPalette *palette,
                               const char *product_name,
                               const char *title,
                               const char *panel_kicker,
                               const char *panel_title,
                               const char *panel_body,
                               const char *panel_poster,
                               const char *panel_help,
                               const char *status,
                               const char *navigation_hint) {
  SDL_FRect full = canvas->presentation;
  if (!set_draw_color(renderer, palette->dim) || !SDL_RenderFillRect(renderer, &full)) return false;
  if (!fill_menu_rect(renderer, canvas, 9, 11, 416, 286, palette->shell_shadow) ||
      !fill_menu_rect(renderer, canvas, 6, 8, 416, 286, palette->shell) ||
      !outline_menu_rect(renderer, canvas, 6, 8, 416, 286, 2.0f, palette->shell_border) ||
      !outline_menu_rect(renderer, canvas, 9, 11, 410, 280, 1.0f, palette->shell_inner) ||
      !fill_menu_rect(renderer, canvas, 10, 12, 138, 266, palette->nav_panel) ||
      !fill_menu_rect(renderer, canvas, 150, 12, 272, 266, palette->detail_panel) ||
      !outline_menu_rect(renderer, canvas, 150, 12, 272, 266, 2.0f, palette->shell_border)) return false;
  if (!fill_menu_rect(renderer, canvas, 154, 17, 4, 22, palette->accent_red) ||
      !fill_menu_rect(renderer, canvas, 10, 278, 196, 4, palette->accent_yellow) ||
      !fill_menu_rect(renderer, canvas, 206, 278, 10, 4, palette->cream) ||
      !fill_menu_rect(renderer, canvas, 216, 278, 206, 4, palette->accent_red) ||
      !fill_menu_rect(renderer, canvas, 10, 282, 412, 12, palette->footer)) return false;

  if (!render_menu_text(menu, renderer, canvas, product_name, 18, 17, 120, 5.1f, palette->accent_cyan) ||
      !render_menu_text(menu, renderer, canvas, title, 18, 42, 120, 7.6f, palette->nav_text) ||
      !render_menu_text(menu, renderer, canvas, panel_kicker, 164, 18, 242, 5.0f, palette->accent_red) ||
      !render_menu_text(menu, renderer, canvas, panel_title, 164, 29, 242, 8.0f, palette->detail_text) ||
      !render_menu_text(menu, renderer, canvas, panel_body, 164, 48, 242, 5.7f, palette->detail_muted) ||
      !render_menu_text(menu, renderer, canvas, status, 18, 284, 232, 5.0f, palette->accent_yellow) ||
      !render_menu_text(menu, renderer, canvas, navigation_hint, 260, 284, 150, 4.8f, palette->cream)) return false;

  if (panel_poster[0] != '\0') {
    if (!fill_menu_rect(renderer, canvas, 164, 96, 244, 42, palette->accent_yellow) ||
        !outline_menu_rect(renderer, canvas, 164, 96, 244, 42, 1.0f, palette->shell_border) ||
        !render_menu_text(menu, renderer, canvas, panel_poster, 176, 106, 220, 7.0f, palette->detail_text)) return false;
  }
  if (panel_help[0] != '\0' &&
      !render_menu_text(menu, renderer, canvas, panel_help, 170, 148, 232, 5.8f, palette->detail_text)) return false;
  return true;
}

static bool render_modal(NativeMenuRenderer *menu, SDL_Renderer *renderer,
                         const NativeMenuCanvas *canvas, JSContext *context,
                         JSValueConst modal,
                         const NativeMenuPalette *palette) {
  char *modal_title = get_string(context, modal, "title");
  char *modal_message = get_string(context, modal, "message");
  double x = 0;
  double y = 0;
  double width = 0;
  double height = 0;
  JSValue items = JS_GetPropertyStr(context, modal, "items");
  if (!modal_title || !modal_message || JS_IsException(items) ||
      !get_double(context, modal, "x", &x) ||
      !get_double(context, modal, "y", &y) ||
      !get_double(context, modal, "width", &width) ||
      !get_double(context, modal, "height", &height)) {
    free(modal_title);
    free(modal_message);
    JS_FreeValue(context, items);
    return false;
  }

  SDL_FRect full = canvas->presentation;
  bool ok =
      set_draw_color(renderer, palette->modal_dim) &&
      SDL_RenderFillRect(renderer, &full) &&
      fill_menu_rect(renderer, canvas, (float)x + 4.0f, (float)y + 4.0f,
                     (float)width, (float)height, palette->focus_shadow) &&
      fill_menu_rect(renderer, canvas, (float)x, (float)y, (float)width,
                     (float)height, palette->modal_panel) &&
      outline_menu_rect(renderer, canvas, (float)x, (float)y, (float)width,
                        (float)height, 2.0f, palette->shell_border) &&
      outline_menu_rect(renderer, canvas, (float)x + 3.0f, (float)y + 3.0f,
                        (float)width - 6.0f, (float)height - 6.0f, 1.0f,
                        palette->cream) &&
      fill_menu_rect(renderer, canvas, (float)x + 15.0f, (float)y + 12.0f,
                     22.0f, 12.0f, palette->accent_red) &&
      render_menu_text(menu, renderer, canvas, "!", (float)x + 23.0f,
                       (float)y + 11.0f, 0, 6.4f, palette->cream) &&
      render_menu_text(menu, renderer, canvas, modal_title,
                       (float)x + 44.0f, (float)y + 10.0f,
                       (int)width - 62, 8.2f, palette->modal_text) &&
      render_menu_text(menu, renderer, canvas, modal_message,
                       (float)x + 15.0f, (float)y + 29.0f,
                       (int)width - 30, 6.1f, palette->modal_text) &&
      render_item_array(menu, renderer, canvas, context, items, palette);

  free(modal_title);
  free(modal_message);
  JS_FreeValue(context, items);
  return ok;
}

bool native_menu_renderer_init(NativeMenuRenderer *menu,
                               const char *base_path) {
  memset(menu, 0, sizeof(*menu));
  if (!TTF_Init()) {
    fprintf(stderr, "TTF_Init failed: %s\n", SDL_GetError());
    return false;
  }

  char font_path[PATH_MAX];
  char fallback_path[PATH_MAX];
  int written = snprintf(font_path, sizeof(font_path),
                         "%sfonts/InterVariable.ttf", base_path);
  int fallback_written =
      snprintf(fallback_path, sizeof(fallback_path),
               "%sfonts/unifont-17.0.04.otf", base_path);
  if (written <= 0 || (size_t)written >= sizeof(font_path) ||
      fallback_written <= 0 ||
      (size_t)fallback_written >= sizeof(fallback_path)) {
    TTF_Quit();
    return false;
  }

  TTF_Font *font = TTF_OpenFont(font_path, 10.0f);
  TTF_Font *fallback = TTF_OpenFont(fallback_path, 10.0f);
  if (!font || !fallback || !TTF_AddFallbackFont(font, fallback)) {
    fprintf(stderr,
            "Unable to load native menu primary/fallback fonts: %s\n",
            SDL_GetError());
    if (font) TTF_CloseFont(font);
    if (fallback) TTF_CloseFont(fallback);
    TTF_Quit();
    return false;
  }

  TTF_SetFontHinting(font, TTF_HINTING_LIGHT);
  TTF_SetFontHinting(fallback, TTF_HINTING_LIGHT);
  TTF_SetFontKerning(font, true);
  TTF_SetFontKerning(fallback, true);

  menu->font = font;
  menu->fallback_font = fallback;
  menu->initialized = true;
  return true;
}

void native_menu_renderer_destroy(NativeMenuRenderer *menu) {
  if (!menu || !menu->initialized) return;
  TTF_Font *font = (TTF_Font *)menu->font;
  TTF_Font *fallback = (TTF_Font *)menu->fallback_font;
  if (font) TTF_ClearFallbackFonts(font);
  if (fallback) TTF_CloseFont(fallback);
  if (font) TTF_CloseFont(font);
  menu->font = NULL;
  menu->fallback_font = NULL;
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
  TTF_Font *fallback = (TTF_Font *)menu->fallback_font;
  const char *language = locale_language_tag(locale);
  bool ok = TTF_SetFontLanguage(font, language) &&
            (!fallback || TTF_SetFontLanguage(fallback, language)) &&
            TTF_SetFontSize(font, 10.0f) &&
            (!fallback || TTF_SetFontSize(fallback, 10.0f));
  if (ok) {
    SDL_SetRenderDrawBlendMode(renderer, SDL_BLENDMODE_BLEND);
    SDL_SetRenderDrawColor(renderer, 0, 0, 0, 150);
    SDL_FRect background = {24, 267, 384, 23};
    ok = SDL_RenderFillRect(renderer, &background) &&
         render_logical_centered_text(menu, renderer, text, 216.0f, 273.0f,
                                      372, (SDL_Color){255, 255, 255, 255});
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

  char *locale = get_string(context, frame, "locale");
  char *color_scheme = get_string(context, frame, "colorScheme");
  if (!locale || !color_scheme) {
    free(locale);
    free(color_scheme);
    return false;
  }

  NativeMenuPalette palette = menu_palette(strcmp(color_scheme, "dark") == 0);
  TTF_Font *font = (TTF_Font *)menu->font;
  TTF_Font *fallback = (TTF_Font *)menu->fallback_font;
  const char *language = locale_language_tag(locale);
  if (!TTF_SetFontLanguage(font, language) ||
      (fallback && !TTF_SetFontLanguage(fallback, language))) {
    fprintf(stderr, "TTF_SetFontLanguage failed for %s: %s\n", locale,
            SDL_GetError());
    free(locale);
    free(color_scheme);
    return false;
  }

  NativeMenuCanvas canvas;
  if (!begin_menu_canvas(renderer, &canvas)) {
    free(locale);
    free(color_scheme);
    return false;
  }

  SDL_SetRenderDrawBlendMode(renderer, SDL_BLENDMODE_BLEND);
  bool ok = true;

  if (!visible) {
    JSValue trigger = JS_GetPropertyStr(context, frame, "trigger");
    ok = !JS_IsException(trigger) && !JS_IsNull(trigger) &&
         !JS_IsUndefined(trigger) &&
         render_item(menu, renderer, &canvas, context, trigger, &palette);
    JS_FreeValue(context, trigger);
  } else {
    char *product_name = get_string(context, frame, "productName");
    char *title = get_string(context, frame, "title");
    char *panel_kicker = get_string(context, frame, "panelKicker");
    char *panel_title = get_string(context, frame, "panelTitle");
    char *panel_body = get_string(context, frame, "panelBody");
    char *panel_poster = get_string(context, frame, "panelPoster");
    char *panel_help = get_string(context, frame, "panelHelp");
    char *status = get_string(context, frame, "status");
    char *navigation_hint = get_string(context, frame, "navigationHint");

    if (!product_name || !title || !panel_kicker || !panel_title ||
        !panel_body || !panel_poster || !panel_help || !status ||
        !navigation_hint) {
      ok = false;
    } else {
      ok = render_menu_chrome(
          menu, renderer, &canvas, &palette, product_name, title, panel_kicker,
          panel_title, panel_body, panel_poster, panel_help, status,
          navigation_hint);
    }

    JSValue nav_items = JS_GetPropertyStr(context, frame, "navItems");
    JSValue panel_items = JS_GetPropertyStr(context, frame, "panelItems");
    if (ok) {
      ok = !JS_IsException(nav_items) && !JS_IsException(panel_items) &&
           render_item_array(menu, renderer, &canvas, context, nav_items,
                             &palette) &&
           render_item_array(menu, renderer, &canvas, context, panel_items,
                             &palette);
    }

    JSValue modal = JS_GetPropertyStr(context, frame, "modal");
    if (ok && !JS_IsNull(modal) && !JS_IsUndefined(modal)) {
      ok = render_modal(menu, renderer, &canvas, context, modal, &palette);
    }

    JS_FreeValue(context, modal);
    JS_FreeValue(context, nav_items);
    JS_FreeValue(context, panel_items);
    free(product_name);
    free(title);
    free(panel_kicker);
    free(panel_title);
    free(panel_body);
    free(panel_poster);
    free(panel_help);
    free(status);
    free(navigation_hint);
  }

  SDL_SetRenderDrawBlendMode(renderer, SDL_BLENDMODE_NONE);
  bool restored = end_menu_canvas(renderer, &canvas);
  free(locale);
  free(color_scheme);
  return ok && restored;
}
