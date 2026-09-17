#include <SDL3/SDL.h>
#include <SDL3_ttf/SDL_ttf.h>
#include <limits.h>
#include <quickjs.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define LOCALE_COUNT 5

static const char *kLocales[LOCALE_COUNT] = {"en", "es-ar", "ca", "ko", "zh"};
static const char *kLanguageTags[LOCALE_COUNT] = {"en", "es-AR", "ca", "ko", "zh"};

static bool join_path(char *output, size_t output_size, const char *base,
                      const char *relative) {
  int written = snprintf(output, output_size, "%s%s", base, relative);
  return written > 0 && (size_t)written < output_size;
}

static char *read_text_file(const char *path, size_t *length_out) {
  FILE *file = fopen(path, "rb");
  if (!file) {
    fprintf(stderr, "Unable to open %s\n", path);
    return NULL;
  }

  if (fseek(file, 0, SEEK_END) != 0) {
    fclose(file);
    return NULL;
  }
  long length = ftell(file);
  if (length < 0 || fseek(file, 0, SEEK_SET) != 0) {
    fclose(file);
    return NULL;
  }

  char *buffer = malloc((size_t)length + 1);
  if (!buffer) {
    fclose(file);
    return NULL;
  }

  size_t read_length = fread(buffer, 1, (size_t)length, file);
  fclose(file);
  if (read_length != (size_t)length) {
    free(buffer);
    return NULL;
  }

  buffer[read_length] = '\0';
  if (length_out) {
    *length_out = read_length;
  }
  return buffer;
}

static void report_js_exception(JSContext *context, const char *operation) {
  JSValue exception = JS_GetException(context);
  const char *message = JS_ToCString(context, exception);
  fprintf(stderr, "QuickJS %s failed: %s\n", operation,
          message ? message : "unknown exception");
  if (message) {
    JS_FreeCString(context, message);
  }
  JS_FreeValue(context, exception);
}

static bool eval_script_file(JSContext *context, const char *path) {
  size_t source_length = 0;
  char *source = read_text_file(path, &source_length);
  if (!source) {
    return false;
  }

  JSValue result =
      JS_Eval(context, source, source_length, path, JS_EVAL_TYPE_GLOBAL);
  free(source);
  if (JS_IsException(result)) {
    JS_FreeValue(context, result);
    report_js_exception(context, path);
    return false;
  }
  JS_FreeValue(context, result);
  return true;
}

static char *get_locale_label(JSContext *context, int index) {
  char expression[512];
  int written = snprintf(
      expression, sizeof(expression),
      "((index) => { const locales = ['en', 'es-ar', 'ca', 'ko', 'zh']; "
      "const locale = locales[index]; "
      "const base = BASE_STRINGS[locale] || BASE_STRINGS.en; "
      "const strings = composeMenuStrings(locale, base); "
      "return strings.nav.language; })(%d)",
      index);
  if (written <= 0 || (size_t)written >= sizeof(expression)) {
    return NULL;
  }

  JSValue result = JS_Eval(context, expression, (size_t)written,
                           "native-locale-label", JS_EVAL_TYPE_GLOBAL);
  if (JS_IsException(result)) {
    JS_FreeValue(context, result);
    report_js_exception(context, "locale label evaluation");
    return NULL;
  }

  const char *value = JS_ToCString(context, result);
  char *copy = value ? strdup(value) : NULL;
  if (value) {
    JS_FreeCString(context, value);
  }
  JS_FreeValue(context, result);
  return copy;
}

static int next_utf8_codepoint(const unsigned char **cursor, Uint32 *codepoint) {
  const unsigned char *input = *cursor;
  unsigned char first = input[0];
  if (first == 0) {
    return 0;
  }

  if (first < 0x80) {
    *codepoint = first;
    *cursor = input + 1;
    return 1;
  }

  if (first >= 0xc2 && first <= 0xdf &&
      (input[1] & 0xc0) == 0x80) {
    *codepoint = ((Uint32)(first & 0x1f) << 6) | (Uint32)(input[1] & 0x3f);
    *cursor = input + 2;
    return 1;
  }

  if (first >= 0xe0 && first <= 0xef &&
      (input[1] & 0xc0) == 0x80 && (input[2] & 0xc0) == 0x80) {
    if ((first == 0xe0 && input[1] < 0xa0) ||
        (first == 0xed && input[1] >= 0xa0)) {
      return -1;
    }
    *codepoint = ((Uint32)(first & 0x0f) << 12) |
                 ((Uint32)(input[1] & 0x3f) << 6) |
                 (Uint32)(input[2] & 0x3f);
    *cursor = input + 3;
    return 1;
  }

  if (first >= 0xf0 && first <= 0xf4 &&
      (input[1] & 0xc0) == 0x80 && (input[2] & 0xc0) == 0x80 &&
      (input[3] & 0xc0) == 0x80) {
    if ((first == 0xf0 && input[1] < 0x90) ||
        (first == 0xf4 && input[1] > 0x8f)) {
      return -1;
    }
    *codepoint = ((Uint32)(first & 0x07) << 18) |
                 ((Uint32)(input[1] & 0x3f) << 12) |
                 ((Uint32)(input[2] & 0x3f) << 6) |
                 (Uint32)(input[3] & 0x3f);
    *cursor = input + 4;
    return 1;
  }

  return -1;
}

static bool verify_glyph_coverage(TTF_Font *font, const char *text,
                                  int *glyph_count_out) {
  const unsigned char *cursor = (const unsigned char *)text;
  int glyph_count = 0;

  while (*cursor) {
    Uint32 codepoint = 0;
    int status = next_utf8_codepoint(&cursor, &codepoint);
    if (status <= 0) {
      fprintf(stderr, "Invalid UTF-8 in locale text\n");
      return false;
    }
    if (!TTF_FontHasGlyph(font, codepoint)) {
      fprintf(stderr, "Font is missing U+%04X for locale text: %s\n",
              codepoint, text);
      return false;
    }
    glyph_count += 1;
  }

  *glyph_count_out = glyph_count;
  return glyph_count > 0;
}

int main(void) {
  int exit_code = 1;
  JSRuntime *runtime = NULL;
  JSContext *context = NULL;
  TTF_Font *font = NULL;

  if (!SDL_Init(0)) {
    fprintf(stderr, "SDL_Init failed: %s\n", SDL_GetError());
    return 2;
  }
  if (!TTF_Init()) {
    fprintf(stderr, "TTF_Init failed: %s\n", SDL_GetError());
    SDL_Quit();
    return 2;
  }

  const char *base_path = SDL_GetBasePath();
  if (!base_path) {
    fprintf(stderr, "SDL_GetBasePath failed: %s\n", SDL_GetError());
    goto cleanup;
  }

  char strings_path[PATH_MAX];
  char font_path[PATH_MAX];
  if (!join_path(strings_path, sizeof(strings_path), base_path,
                 "integrated_menu_strings.js") ||
      !join_path(font_path, sizeof(font_path), base_path,
                 "fonts/unifont-17.0.04.otf")) {
    goto cleanup;
  }

  runtime = JS_NewRuntime();
  context = runtime ? JS_NewContext(runtime) : NULL;
  if (!context || !eval_script_file(context, strings_path)) {
    goto cleanup;
  }

  font = TTF_OpenFont(font_path, 22.0f);
  if (!font) {
    fprintf(stderr, "TTF_OpenFont failed: %s\n", SDL_GetError());
    goto cleanup;
  }

  SDL_Color color = {245, 245, 245, 255};
  for (int index = 0; index < LOCALE_COUNT; index += 1) {
    char *label = get_locale_label(context, index);
    if (!label || label[0] == '\0') {
      fprintf(stderr, "Missing locale label for %s\n", kLocales[index]);
      free(label);
      goto cleanup;
    }

    if (!TTF_SetFontLanguage(font, kLanguageTags[index])) {
      fprintf(stderr, "TTF_SetFontLanguage failed for %s: %s\n",
              kLocales[index], SDL_GetError());
      free(label);
      goto cleanup;
    }

    int glyph_count = 0;
    if (!verify_glyph_coverage(font, label, &glyph_count)) {
      free(label);
      goto cleanup;
    }

    SDL_Surface *surface = TTF_RenderText_Blended(font, label, 0, color);
    if (!surface || surface->w <= 0 || surface->h <= 0) {
      fprintf(stderr, "UTF-8 render failed for %s: %s\n", kLocales[index],
              SDL_GetError());
      if (surface) {
        SDL_DestroySurface(surface);
      }
      free(label);
      goto cleanup;
    }

    printf("unicode_render[%s]=PASS glyphs=%d size=%dx%d text=%s\n",
           kLocales[index], glyph_count, surface->w, surface->h, label);
    SDL_DestroySurface(surface);
    free(label);
  }

  printf("native_unicode_self_test=PASS\n");
  exit_code = 0;

cleanup:
  if (font) {
    TTF_CloseFont(font);
  }
  if (context) {
    JS_FreeContext(context);
  }
  if (runtime) {
    JS_FreeRuntime(runtime);
  }
  TTF_Quit();
  SDL_Quit();
  return exit_code;
}
