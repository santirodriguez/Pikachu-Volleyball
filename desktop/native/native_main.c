#include <SDL3/SDL.h>
#include <SDL3/SDL_main.h>
#include <png.h>
#include <quickjs.h>

#include "native_accessibility.h"
#include "native_audio.h"
#include "native_menu_renderer.h"
#include "native_startup.h"

#include <errno.h>
#include <limits.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <sys/wait.h>
#include <unistd.h>

#define WINDOW_WIDTH 1024
#define WINDOW_HEIGHT 768
#define MIN_WINDOW_WIDTH 800
#define MIN_WINDOW_HEIGHT 600
#define LOGICAL_WIDTH 432
#define LOGICAL_HEIGHT 304

static const char *kWindowTitle = "Pikachu Volleyball Native";

typedef struct NativeRuntime {
  JSRuntime *runtime;
  JSContext *context;
  JSValue api;
  SDL_Window *window;
  SDL_Renderer *renderer;
  SDL_Texture *sprite_texture;
  int sprite_width;
  int sprite_height;
  char base_path[PATH_MAX];
  char preferences_dir[PATH_MAX];
  char preferences_path[PATH_MAX];
  NativeAudio audio;
  NativeMenuRenderer menu_renderer;
  NativeAccessibility accessibility;
} NativeRuntime;

static bool render_frame(NativeRuntime *state, bool validate_pixels,
                         int *command_count_out);
static char *read_text_file(const char *path, size_t *length_out);
static bool persist_preferences(NativeRuntime *state);

static bool join_path(char *output, size_t output_size, const char *base,
                      const char *relative) {
  int written = snprintf(output, output_size, "%s%s", base, relative);
  return written > 0 && (size_t)written < output_size;
}

static bool join_directory_file(char *output, size_t output_size,
                                const char *directory, const char *filename) {
  size_t length = strlen(directory);
  const char *separator =
      length > 0 && directory[length - 1] == '/' ? "" : "/";
  int written =
      snprintf(output, output_size, "%s%s%s", directory, separator, filename);
  return written > 0 && (size_t)written < output_size;
}

static bool initialize_preferences_path(NativeRuntime *state) {
  const char *override = getenv("PV_NATIVE_PREFS_DIR");
  if (override && override[0] != '\0') {
    if (strlen(override) >= sizeof(state->preferences_dir)) return false;
    strcpy(state->preferences_dir, override);
    if (mkdir(state->preferences_dir, 0700) != 0 && errno != EEXIST) {
      fprintf(stderr, "Unable to create native preference directory: %s\n",
              state->preferences_dir);
      return false;
    }
  } else {
    char *path = SDL_GetPrefPath("santirodriguez", "Pikachu Volleyball");
    if (!path || strlen(path) >= sizeof(state->preferences_dir)) {
      if (path) SDL_free(path);
      return false;
    }
    strcpy(state->preferences_dir, path);
    SDL_free(path);
  }
  return join_directory_file(state->preferences_path,
                             sizeof(state->preferences_path),
                             state->preferences_dir, "preferences.json");
}

static bool path_exists(const char *path) {
  return access(path, F_OK) == 0;
}

static bool append_electron_leveldb_path(char *output, size_t output_size,
                                         const char *user_data) {
  char local_storage[PATH_MAX];
  return join_directory_file(local_storage, sizeof(local_storage), user_data,
                             "Local Storage") &&
         join_directory_file(output, output_size, local_storage, "leveldb");
}

static bool get_electron_database_path(char *output, size_t output_size) {
  const char *override = getenv("PV_ELECTRON_USER_DATA_DIR");
  if (override && override[0] != '\0') {
    return append_electron_leveldb_path(output, output_size, override) &&
           path_exists(output);
  }

  const char *config = getenv("XDG_CONFIG_HOME");
  char fallback[PATH_MAX];
  if (!config || config[0] == '\0') {
    const char *home = getenv("HOME");
    if (!home || home[0] == '\0') return false;
    int written = snprintf(fallback, sizeof(fallback), "%s/.config", home);
    if (written <= 0 || (size_t)written >= sizeof(fallback)) return false;
    config = fallback;
  }

  const char *names[] = {"Pikachu Volleyball", "pikachu-volleyball"};
  char selected[PATH_MAX] = "";
  int matches = 0;
  for (size_t index = 0; index < sizeof(names) / sizeof(names[0]); index += 1) {
    char user_data[PATH_MAX];
    char database[PATH_MAX];
    if (!join_directory_file(user_data, sizeof(user_data), config,
                             names[index]) ||
        !append_electron_leveldb_path(database, sizeof(database), user_data)) {
      return false;
    }
    if (path_exists(database)) {
      matches += 1;
      if (strlen(database) >= sizeof(selected)) return false;
      strcpy(selected, database);
    }
  }

  if (matches > 1) {
    fprintf(stderr,
            "Multiple Electron preference profiles exist; refusing to guess which one to migrate.\n");
    return false;
  }
  if (matches != 1 || strlen(selected) >= output_size) return false;
  strcpy(output, selected);
  return true;
}

static bool run_electron_importer(NativeRuntime *state,
                                  const char *database_path,
                                  const char *output_path) {
  char importer_path[PATH_MAX];
  if (!join_path(importer_path, sizeof(importer_path), state->base_path,
                 "electron-preferences-importer")) {
    return false;
  }
  if (!path_exists(importer_path)) {
    fprintf(stderr, "Electron preference importer is missing: %s\n",
            importer_path);
    return false;
  }

  pid_t child = fork();
  if (child < 0) {
    perror("fork");
    return false;
  }
  if (child == 0) {
    execl(importer_path, importer_path, database_path, output_path,
          "--allow-partial", (char *)NULL);
    _exit(127);
  }

  int status = 0;
  if (waitpid(child, &status, 0) < 0) {
    perror("waitpid");
    return false;
  }
  return WIFEXITED(status) && WEXITSTATUS(status) == 0;
}

static char *load_initial_preferences(NativeRuntime *state,
                                      bool *migrated_out) {
  *migrated_out = false;
  if (path_exists(state->preferences_path)) {
    return read_text_file(state->preferences_path, NULL);
  }

  char database_path[PATH_MAX];
  if (!get_electron_database_path(database_path, sizeof(database_path))) {
    char *empty = malloc(3);
    if (empty) memcpy(empty, "{}", 3);
    return empty;
  }

  char migration_path[PATH_MAX];
  if (!join_directory_file(migration_path, sizeof(migration_path),
                           state->preferences_dir,
                           "electron-migration.json")) {
    return NULL;
  }
  unlink(migration_path);
  if (!run_electron_importer(state, database_path, migration_path)) {
    fprintf(stderr,
            "Electron preferences exist but could not be imported safely; using defaults.\n");
    unlink(migration_path);
    char *empty = malloc(3);
    if (empty) memcpy(empty, "{}", 3);
    return empty;
  }

  char *migrated = read_text_file(migration_path, NULL);
  unlink(migration_path);
  if (migrated) {
    *migrated_out = true;
  }
  return migrated;
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
  if (length_out) *length_out = read_length;
  return buffer;
}

static SDL_Texture *load_png_texture(SDL_Renderer *renderer, const char *path,
                                     int *width_out, int *height_out) {
  png_image image;
  memset(&image, 0, sizeof(image));
  image.version = PNG_IMAGE_VERSION;

  if (!png_image_begin_read_from_file(&image, path)) {
    fprintf(stderr, "libpng could not read %s: %s\n", path, image.message);
    return NULL;
  }

  image.format = PNG_FORMAT_RGBA;
  size_t buffer_size = PNG_IMAGE_SIZE(image);
  void *pixels = malloc(buffer_size);
  if (!pixels) {
    png_image_free(&image);
    return NULL;
  }

  if (!png_image_finish_read(&image, NULL, pixels, 0, NULL)) {
    fprintf(stderr, "libpng could not decode %s: %s\n", path, image.message);
    free(pixels);
    png_image_free(&image);
    return NULL;
  }

  SDL_Texture *texture = SDL_CreateTexture(
      renderer, SDL_PIXELFORMAT_RGBA32, SDL_TEXTUREACCESS_STATIC,
      (int)image.width, (int)image.height);
  if (!texture ||
      !SDL_UpdateTexture(texture, NULL, pixels, (int)image.width * 4) ||
      !SDL_SetTextureBlendMode(texture, SDL_BLENDMODE_BLEND)) {
    fprintf(stderr, "SDL texture creation failed: %s\n", SDL_GetError());
    if (texture) SDL_DestroyTexture(texture);
    texture = NULL;
  } else {
    *width_out = (int)image.width;
    *height_out = (int)image.height;
  }

  free(pixels);
  png_image_free(&image);
  return texture;
}


static void report_js_exception(JSContext *context, const char *operation) {
  JSValue exception = JS_GetException(context);
  const char *message = JS_ToCString(context, exception);
  fprintf(stderr, "QuickJS %s failed: %s\n", operation,
          message ? message : "unknown exception");
  if (message) JS_FreeCString(context, message);
  JS_FreeValue(context, exception);
}

static bool call_api(NativeRuntime *state, const char *name, int argc,
                     JSValueConst *argv, JSValue *result_out) {
  JSValue function = JS_GetPropertyStr(state->context, state->api, name);
  if (!JS_IsFunction(state->context, function)) {
    fprintf(stderr, "Native JavaScript API is missing method: %s\n", name);
    JS_FreeValue(state->context, function);
    return false;
  }
  JSValue result =
      JS_Call(state->context, function, state->api, argc, argv);
  JS_FreeValue(state->context, function);
  if (JS_IsException(result)) {
    JS_FreeValue(state->context, result);
    report_js_exception(state->context, name);
    return false;
  }
  if (result_out) {
    *result_out = result;
  } else {
    JS_FreeValue(state->context, result);
  }
  return true;
}

static bool write_atomic_text(const char *path, const char *text, size_t length) {
  char temporary[PATH_MAX];
  int written = snprintf(temporary, sizeof(temporary), "%s.tmp", path);
  if (written <= 0 || (size_t)written >= sizeof(temporary)) return false;

  FILE *file = fopen(temporary, "wb");
  if (!file) return false;
  bool ok = fwrite(text, 1, length, file) == length && fflush(file) == 0;
  if (ok && fsync(fileno(file)) != 0) ok = false;
  if (fclose(file) != 0) ok = false;
  if (!ok) {
    unlink(temporary);
    return false;
  }
  if (rename(temporary, path) != 0) {
    unlink(temporary);
    return false;
  }
  return true;
}

static bool persist_preferences(NativeRuntime *state) {
  JSValue result;
  if (!call_api(state, "getPersistedPreferencesJson", 0, NULL, &result)) {
    return false;
  }
  size_t length = 0;
  const char *text = JS_ToCStringLen(state->context, &length, result);
  JS_FreeValue(state->context, result);
  if (!text) return false;
  bool ok = write_atomic_text(state->preferences_path, text, length);
  JS_FreeCString(state->context, text);
  if (!ok) {
    fprintf(stderr, "Unable to atomically persist native preferences\n");
  }
  return ok;
}

static bool persist_preferences_if_dirty(NativeRuntime *state) {
  JSValue result;
  if (!call_api(state, "consumePreferencesDirty", 0, NULL, &result)) {
    return false;
  }
  int dirty = JS_ToBool(state->context, result);
  JS_FreeValue(state->context, result);
  if (dirty < 0) return false;
  return dirty == 0 || persist_preferences(state);
}

static bool initialize_javascript(NativeRuntime *state,
                                  const char *preferences_json,
                                  const char *initial_locale) {
  char bundle_path[PATH_MAX];
  if (!join_path(bundle_path, sizeof(bundle_path), state->base_path,
                 "native-app.bundle.js")) {
    return false;
  }

  size_t source_length = 0;
  char *source = read_text_file(bundle_path, &source_length);
  if (!source) return false;

  state->runtime = JS_NewRuntime();
  state->context = state->runtime ? JS_NewContext(state->runtime) : NULL;
  if (!state->context) {
    free(source);
    return false;
  }

  JSValue evaluated = JS_Eval(state->context, source, source_length,
                              bundle_path, JS_EVAL_TYPE_GLOBAL);
  free(source);
  if (JS_IsException(evaluated)) {
    JS_FreeValue(state->context, evaluated);
    report_js_exception(state->context, "bundle evaluation");
    return false;
  }
  JS_FreeValue(state->context, evaluated);

  JSValue global = JS_GetGlobalObject(state->context);
  state->api =
      JS_GetPropertyStr(state->context, global, "PikachuNativeApp");
  JS_FreeValue(state->context, global);
  if (!JS_IsObject(state->api)) {
    fprintf(stderr, "PikachuNativeApp global was not created by bundle\n");
    return false;
  }

  JSValue arguments[2] = {
      JS_NewString(state->context, preferences_json),
      JS_NewString(state->context, initial_locale),
  };
  JSValueConst const_arguments[2] = {arguments[0], arguments[1]};
  JSValue result;
  bool ok = call_api(state, "initialize", 2, const_arguments, &result);
  JS_FreeValue(state->context, arguments[0]);
  JS_FreeValue(state->context, arguments[1]);
  if (!ok) return false;
  int initialized = JS_ToBool(state->context, result);
  JS_FreeValue(state->context, result);
  return initialized == 1;
}

static bool js_handle_key(NativeRuntime *state, const char *code, bool is_down,
                          bool repeat) {
  JSValue arguments[3] = {
      JS_NewString(state->context, code),
      JS_NewBool(state->context, is_down),
      JS_NewBool(state->context, repeat),
  };
  JSValueConst const_arguments[3] = {arguments[0], arguments[1], arguments[2]};
  bool ok = call_api(state, "handleKey", 3, const_arguments, NULL);
  for (size_t index = 0; index < 3; index += 1) {
    JS_FreeValue(state->context, arguments[index]);
  }
  return ok;
}

static bool js_handle_pointer(NativeRuntime *state, double x, double y,
                              bool is_down) {
  JSValue arguments[3] = {
      JS_NewFloat64(state->context, x),
      JS_NewFloat64(state->context, y),
      JS_NewBool(state->context, is_down),
  };
  JSValueConst const_arguments[3] = {arguments[0], arguments[1], arguments[2]};
  JSValue result;
  bool ok = call_api(state, "handlePointer", 3, const_arguments, &result);
  for (int index = 0; index < 3; index += 1) {
    JS_FreeValue(state->context, arguments[index]);
  }
  if (!ok) return false;
  JS_FreeValue(state->context, result);
  return true;
}

static bool js_handle_accessibility_action(NativeRuntime *state,
                                           uint64_t node_id,
                                           const char *action) {
  JSValue arguments[2] = {
      JS_NewInt64(state->context, (int64_t)node_id),
      JS_NewString(state->context, action),
  };
  JSValueConst const_arguments[2] = {arguments[0], arguments[1]};
  JSValue result;
  bool ok =
      call_api(state, "handleAccessibilityAction", 2, const_arguments, &result);
  JS_FreeValue(state->context, arguments[0]);
  JS_FreeValue(state->context, arguments[1]);
  if (!ok) return false;
  int accepted = JS_ToBool(state->context, result);
  JS_FreeValue(state->context, result);
  return accepted == 1;
}

static bool js_set_locale(NativeRuntime *state, const char *locale) {
  JSValue argument = JS_NewString(state->context, locale);
  JSValueConst arguments[1] = {argument};
  JSValue result;
  bool ok = call_api(state, "setLocale", 1, arguments, &result);
  JS_FreeValue(state->context, argument);
  if (!ok) return false;
  int accepted = JS_ToBool(state->context, result);
  JS_FreeValue(state->context, result);
  return accepted == 1;
}

static bool js_reset_inputs(NativeRuntime *state) {
  return call_api(state, "resetInputs", 0, NULL, NULL);
}

static bool js_step(NativeRuntime *state) {
  return call_api(state, "step", 0, NULL, NULL);
}

static bool js_set_setting(NativeRuntime *state, const char *name,
                           const char *value) {
  JSValue arguments[2] = {
      JS_NewString(state->context, name),
      JS_NewString(state->context, value),
  };
  JSValueConst const_arguments[2] = {arguments[0], arguments[1]};
  JSValue result;
  bool ok = call_api(state, "setSetting", 2, const_arguments, &result);
  for (int index = 0; index < 2; index += 1) {
    JS_FreeValue(state->context, arguments[index]);
  }
  if (!ok) return false;
  int accepted = JS_ToBool(state->context, result);
  JS_FreeValue(state->context, result);
  return accepted == 1;
}

static bool js_set_control_binding(NativeRuntime *state,
                                   const char *binding_id,
                                   const char *code) {
  JSValue arguments[2] = {
      JS_NewString(state->context, binding_id),
      JS_NewString(state->context, code),
  };
  JSValueConst const_arguments[2] = {arguments[0], arguments[1]};
  JSValue result;
  bool ok =
      call_api(state, "setControlBinding", 2, const_arguments, &result);
  for (int index = 0; index < 2; index += 1) {
    JS_FreeValue(state->context, arguments[index]);
  }
  if (!ok) return false;
  JSValue accepted_value =
      JS_GetPropertyStr(state->context, result, "ok");
  int accepted = JS_ToBool(state->context, accepted_value);
  JS_FreeValue(state->context, accepted_value);
  JS_FreeValue(state->context, result);
  return accepted == 1;
}

static bool js_get_int(NativeRuntime *state, const char *name, int *value_out) {
  JSValue result;
  if (!call_api(state, name, 0, NULL, &result)) return false;
  int32_t value = 0;
  int converted = JS_ToInt32(state->context, &value, result);
  JS_FreeValue(state->context, result);
  if (converted < 0) return false;
  *value_out = value;
  return true;
}

static bool js_get_string(NativeRuntime *state, const char *name, char *output,
                          size_t output_size) {
  JSValue result;
  if (!call_api(state, name, 0, NULL, &result)) return false;
  const char *value = JS_ToCString(state->context, result);
  JS_FreeValue(state->context, result);
  if (!value) return false;
  size_t length = strlen(value);
  bool fits = length < output_size;
  if (fits) memcpy(output, value, length + 1);
  JS_FreeCString(state->context, value);
  return fits;
}

static bool js_object_get_double(JSContext *context, JSValueConst object,
                                 const char *name, double *value_out) {
  JSValue value = JS_GetPropertyStr(context, object, name);
  if (JS_IsException(value)) {
    JS_FreeValue(context, value);
    return false;
  }
  int status = JS_ToFloat64(context, value_out, value);
  JS_FreeValue(context, value);
  return status == 0;
}

static bool js_object_get_bool(JSContext *context, JSValueConst object,
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

static bool js_object_get_string(JSContext *context, JSValueConst object,
                                 const char *name, char *output,
                                 size_t output_size) {
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

static bool js_array_length(JSContext *context, JSValueConst array,
                            uint32_t *length_out) {
  JSValue length = JS_GetPropertyStr(context, array, "length");
  if (JS_IsException(length)) {
    JS_FreeValue(context, length);
    return false;
  }
  int status = JS_ToUint32(context, length_out, length);
  JS_FreeValue(context, length);
  return status == 0;
}

static bool is_allowed_external_url(const char *url) {
  static const char *allowed[] = {
      "https://santiagorodriguez.com",
      "https://github.com/santirodriguez/pikachu-volleyball",
      "https://github.com/gorisanson/pikachu-volleyball",
  };
  for (size_t index = 0; index < sizeof(allowed) / sizeof(allowed[0]);
       index += 1) {
    if (strcmp(url, allowed[index]) == 0) return true;
  }
  return false;
}

static bool process_platform_commands(NativeRuntime *state, bool *quit_out,
                                      bool dry_run) {
  JSValue commands;
  if (!call_api(state, "drainPlatformCommands", 0, NULL, &commands)) {
    return false;
  }

  uint32_t length = 0;
  if (!js_array_length(state->context, commands, &length)) {
    JS_FreeValue(state->context, commands);
    return false;
  }

  bool ok = true;
  for (uint32_t index = 0; index < length && ok; index += 1) {
    JSValue command =
        JS_GetPropertyUint32(state->context, commands, index);
    char type[32];
    ok = !JS_IsException(command) &&
         js_object_get_string(state->context, command, "type", type,
                              sizeof(type));
    if (ok && strcmp(type, "quit") == 0) {
      if (quit_out) *quit_out = true;
    } else if (ok && strcmp(type, "openUrl") == 0) {
      char url[256];
      ok = js_object_get_string(state->context, command, "url", url,
                                sizeof(url)) &&
           is_allowed_external_url(url);
      if (ok && !dry_run) {
        ok = SDL_OpenURL(url);
      }
    } else if (ok) {
      fprintf(stderr, "Unknown native platform command: %s\n", type);
      ok = false;
    }
    JS_FreeValue(state->context, command);
  }

  JS_FreeValue(state->context, commands);
  return ok;
}

static const char *detect_initial_locale(void) {
  return native_startup_normalize_locale(getenv("LANG"));
}

static bool write_render_trace(NativeRuntime *state) {
  const char *path = getenv("PV_NATIVE_RENDER_TRACE_PATH");
  if (!path || path[0] == '\0') return true;

  JSValue result;
  if (!call_api(state, "getRenderFrameJson", 0, NULL, &result)) return false;
  size_t length = 0;
  const char *text = JS_ToCStringLen(state->context, &length, result);
  JS_FreeValue(state->context, result);
  if (!text) return false;

  FILE *file = fopen(path, "wb");
  bool ok = file && fwrite(text, 1, length, file) == length;
  if (file) fclose(file);
  JS_FreeCString(state->context, text);
  if (!ok) {
    fprintf(stderr, "Unable to write native render trace: %s\n", path);
    return false;
  }
  printf("native_render_trace_bytes=%zu\n", length);
  return true;
}

static bool validate_framebuffer(NativeRuntime *state) {
  SDL_Surface *surface = SDL_RenderReadPixels(state->renderer, NULL);
  if (!surface) {
    fprintf(stderr, "SDL_RenderReadPixels failed: %s\n", SDL_GetError());
    return false;
  }

  int bytes_per_pixel = SDL_BYTESPERPIXEL(surface->format);
  bool varied = false;
  if (bytes_per_pixel > 0 && surface->pixels) {
    const Uint8 *first = (const Uint8 *)surface->pixels;
    for (int y = 0; y < surface->h && !varied; y += 1) {
      const Uint8 *row = (const Uint8 *)surface->pixels + y * surface->pitch;
      for (int x = 0; x < surface->w; x += 1) {
        if (memcmp(row + x * bytes_per_pixel, first,
                   (size_t)bytes_per_pixel) != 0) {
          varied = true;
          break;
        }
      }
    }
  }

  const char *path = getenv("PV_NATIVE_FRAMEBUFFER_PATH");
  bool saved = true;
  if (path && path[0] != '\0') {
    saved = SDL_SaveBMP(surface, path);
    if (!saved) {
      fprintf(stderr, "SDL_SaveBMP failed: %s\n", SDL_GetError());
    }
  }

  SDL_DestroySurface(surface);
  printf("native_framebuffer_variation=%s\n", varied ? "PASS" : "FAIL");
  return varied && saved;
}


static bool process_audio_commands(NativeRuntime *state) {
  JSValue commands;
  if (!call_api(state, "drainAudioCommands", 0, NULL, &commands)) {
    return false;
  }
  uint32_t count = 0;
  if (!js_array_length(state->context, commands, &count)) {
    JS_FreeValue(state->context, commands);
    return false;
  }

  bool ok = true;
  for (uint32_t index = 0; index < count && ok; index += 1) {
    JSValue command =
        JS_GetPropertyUint32(state->context, commands, index);
    char type[16];
    char sound[32];
    ok = !JS_IsException(command) &&
         js_object_get_string(state->context, command, "type", type,
                              sizeof(type)) &&
         js_object_get_string(state->context, command, "sound", sound,
                              sizeof(sound));
    if (ok && strcmp(type, "play") == 0) {
      double volume = 0;
      double pan = 0;
      bool loop = false;
      ok = js_object_get_double(state->context, command, "volume", &volume) &&
           js_object_get_double(state->context, command, "pan", &pan) &&
           js_object_get_bool(state->context, command, "loop", &loop) &&
           native_audio_play(&state->audio, sound, (float)volume, (float)pan,
                             loop);
    } else if (ok && strcmp(type, "stop") == 0) {
      ok = native_audio_stop(&state->audio, sound);
    } else if (ok && strcmp(type, "gain") == 0) {
      double volume = 0;
      ok = strcmp(sound, "bgm") == 0 &&
           js_object_get_double(state->context, command, "volume", &volume) &&
           native_audio_set_bgm_gain(&state->audio, (float)volume);
    } else if (ok) {
      fprintf(stderr, "Unknown native audio command: %s\n", type);
      ok = false;
    }
    JS_FreeValue(state->context, command);
  }
  JS_FreeValue(state->context, commands);
  return ok;
}

static bool step_runtime(NativeRuntime *state) {
  return js_step(state) && process_audio_commands(state) &&
         persist_preferences_if_dirty(state);
}

static const char *scancode_to_code(SDL_Scancode scancode, char *buffer,
                                    size_t buffer_size) {
  if (scancode >= SDL_SCANCODE_A && scancode <= SDL_SCANCODE_Z) {
    snprintf(buffer, buffer_size, "Key%c", 'A' + (scancode - SDL_SCANCODE_A));
    return buffer;
  }
  if (scancode >= SDL_SCANCODE_1 && scancode <= SDL_SCANCODE_9) {
    snprintf(buffer, buffer_size, "Digit%d", 1 + (scancode - SDL_SCANCODE_1));
    return buffer;
  }
  if (scancode >= SDL_SCANCODE_F1 && scancode <= SDL_SCANCODE_F12) {
    snprintf(buffer, buffer_size, "F%d", 1 + (scancode - SDL_SCANCODE_F1));
    return buffer;
  }
  if (scancode >= SDL_SCANCODE_F13 && scancode <= SDL_SCANCODE_F24) {
    snprintf(buffer, buffer_size, "F%d", 13 + (scancode - SDL_SCANCODE_F13));
    return buffer;
  }
  if (scancode >= SDL_SCANCODE_KP_1 && scancode <= SDL_SCANCODE_KP_9) {
    snprintf(buffer, buffer_size, "Numpad%d",
             1 + (scancode - SDL_SCANCODE_KP_1));
    return buffer;
  }

  switch (scancode) {
    case SDL_SCANCODE_0:
      return "Digit0";
    case SDL_SCANCODE_RETURN:
      return "Enter";
    case SDL_SCANCODE_ESCAPE:
      return "Escape";
    case SDL_SCANCODE_BACKSPACE:
      return "Backspace";
    case SDL_SCANCODE_TAB:
      return "Tab";
    case SDL_SCANCODE_SPACE:
      return "Space";
    case SDL_SCANCODE_MINUS:
      return "Minus";
    case SDL_SCANCODE_EQUALS:
      return "Equal";
    case SDL_SCANCODE_LEFTBRACKET:
      return "BracketLeft";
    case SDL_SCANCODE_RIGHTBRACKET:
      return "BracketRight";
    case SDL_SCANCODE_BACKSLASH:
      return "Backslash";
    case SDL_SCANCODE_NONUSBACKSLASH:
      return "IntlBackslash";
    case SDL_SCANCODE_INTERNATIONAL1:
      return "IntlRo";
    case SDL_SCANCODE_INTERNATIONAL2:
      return "KanaMode";
    case SDL_SCANCODE_INTERNATIONAL3:
      return "IntlYen";
    case SDL_SCANCODE_INTERNATIONAL4:
      return "Convert";
    case SDL_SCANCODE_INTERNATIONAL5:
      return "NonConvert";
    case SDL_SCANCODE_LANG1:
      return "Lang1";
    case SDL_SCANCODE_LANG2:
      return "Lang2";
    case SDL_SCANCODE_LANG3:
      return "Lang3";
    case SDL_SCANCODE_LANG4:
      return "Lang4";
    case SDL_SCANCODE_LANG5:
      return "Lang5";
    case SDL_SCANCODE_SEMICOLON:
      return "Semicolon";
    case SDL_SCANCODE_APOSTROPHE:
      return "Quote";
    case SDL_SCANCODE_GRAVE:
      return "Backquote";
    case SDL_SCANCODE_COMMA:
      return "Comma";
    case SDL_SCANCODE_PERIOD:
      return "Period";
    case SDL_SCANCODE_SLASH:
      return "Slash";
    case SDL_SCANCODE_CAPSLOCK:
      return "CapsLock";
    case SDL_SCANCODE_PRINTSCREEN:
      return "PrintScreen";
    case SDL_SCANCODE_SCROLLLOCK:
      return "ScrollLock";
    case SDL_SCANCODE_PAUSE:
      return "Pause";
    case SDL_SCANCODE_APPLICATION:
    case SDL_SCANCODE_MENU:
      return "ContextMenu";
    case SDL_SCANCODE_HELP:
      return "Help";
    case SDL_SCANCODE_SELECT:
      return "Select";
    case SDL_SCANCODE_AGAIN:
      return "Again";
    case SDL_SCANCODE_UNDO:
      return "Undo";
    case SDL_SCANCODE_CUT:
      return "Cut";
    case SDL_SCANCODE_COPY:
      return "Copy";
    case SDL_SCANCODE_PASTE:
      return "Paste";
    case SDL_SCANCODE_FIND:
      return "Find";
    case SDL_SCANCODE_POWER:
      return "Power";
    case SDL_SCANCODE_RIGHT:
      return "ArrowRight";
    case SDL_SCANCODE_LEFT:
      return "ArrowLeft";
    case SDL_SCANCODE_DOWN:
      return "ArrowDown";
    case SDL_SCANCODE_UP:
      return "ArrowUp";
    case SDL_SCANCODE_LCTRL:
      return "ControlLeft";
    case SDL_SCANCODE_LSHIFT:
      return "ShiftLeft";
    case SDL_SCANCODE_LALT:
      return "AltLeft";
    case SDL_SCANCODE_LGUI:
      return "MetaLeft";
    case SDL_SCANCODE_RCTRL:
      return "ControlRight";
    case SDL_SCANCODE_RSHIFT:
      return "ShiftRight";
    case SDL_SCANCODE_RALT:
      return "AltRight";
    case SDL_SCANCODE_RGUI:
      return "MetaRight";
    case SDL_SCANCODE_KP_0:
      return "Numpad0";
    case SDL_SCANCODE_KP_ENTER:
      return "NumpadEnter";
    case SDL_SCANCODE_KP_PERIOD:
      return "NumpadDecimal";
    case SDL_SCANCODE_KP_PLUS:
      return "NumpadAdd";
    case SDL_SCANCODE_KP_MINUS:
      return "NumpadSubtract";
    case SDL_SCANCODE_KP_MULTIPLY:
      return "NumpadMultiply";
    case SDL_SCANCODE_KP_DIVIDE:
      return "NumpadDivide";
    case SDL_SCANCODE_KP_EQUALS:
      return "NumpadEqual";
    case SDL_SCANCODE_KP_COMMA:
      return "NumpadComma";
    case SDL_SCANCODE_NUMLOCKCLEAR:
      return "NumLock";
    case SDL_SCANCODE_DELETE:
      return "Delete";
    case SDL_SCANCODE_INSERT:
      return "Insert";
    case SDL_SCANCODE_HOME:
      return "Home";
    case SDL_SCANCODE_END:
      return "End";
    case SDL_SCANCODE_PAGEUP:
      return "PageUp";
    case SDL_SCANCODE_PAGEDOWN:
      return "PageDown";
    case SDL_SCANCODE_MUTE:
      return "AudioVolumeMute";
    case SDL_SCANCODE_VOLUMEUP:
      return "AudioVolumeUp";
    case SDL_SCANCODE_VOLUMEDOWN:
      return "AudioVolumeDown";
    case SDL_SCANCODE_MEDIA_NEXT_TRACK:
      return "MediaTrackNext";
    case SDL_SCANCODE_MEDIA_PREVIOUS_TRACK:
      return "MediaTrackPrevious";
    case SDL_SCANCODE_MEDIA_STOP:
      return "MediaStop";
    case SDL_SCANCODE_MEDIA_PLAY:
    case SDL_SCANCODE_MEDIA_PAUSE:
    case SDL_SCANCODE_MEDIA_PLAY_PAUSE:
      return "MediaPlayPause";
    case SDL_SCANCODE_MEDIA_RECORD:
      return "MediaRecord";
    case SDL_SCANCODE_MEDIA_FAST_FORWARD:
      return "MediaFastForward";
    case SDL_SCANCODE_MEDIA_REWIND:
      return "MediaRewind";
    case SDL_SCANCODE_MEDIA_SELECT:
      return "MediaSelect";
    case SDL_SCANCODE_AC_OPEN:
      return "Open";
    case SDL_SCANCODE_AC_PROPERTIES:
      return "Props";
    case SDL_SCANCODE_AC_SEARCH:
      return "BrowserSearch";
    case SDL_SCANCODE_AC_HOME:
      return "BrowserHome";
    case SDL_SCANCODE_AC_BACK:
      return "BrowserBack";
    case SDL_SCANCODE_AC_FORWARD:
      return "BrowserForward";
    case SDL_SCANCODE_AC_STOP:
      return "BrowserStop";
    case SDL_SCANCODE_AC_REFRESH:
      return "BrowserRefresh";
    case SDL_SCANCODE_AC_BOOKMARKS:
      return "BrowserFavorites";
    case SDL_SCANCODE_MEDIA_EJECT:
      return "Eject";
    case SDL_SCANCODE_SLEEP:
      return "Sleep";
    case SDL_SCANCODE_WAKE:
      return "WakeUp";
    default:
      return NULL;
  }
}

static bool dispatch_key_event(NativeRuntime *state, const SDL_KeyboardEvent *event,
                               bool is_down) {
  char code_buffer[32];
  const char *code =
      scancode_to_code(event->scancode, code_buffer, sizeof(code_buffer));
  if (!code) return true;
  return js_handle_key(state, code, is_down, event->repeat);
}

static bool contains(const char *text, const char *needle) {
  return strstr(text, needle) != NULL;
}

static bool validate_scancode_mapping(void) {
  struct MappingCase {
    SDL_Scancode scancode;
    const char *code;
  };
  static const struct MappingCase cases[] = {
      {SDL_SCANCODE_F13, "F13"},
      {SDL_SCANCODE_F24, "F24"},
      {SDL_SCANCODE_NONUSBACKSLASH, "IntlBackslash"},
      {SDL_SCANCODE_KP_EQUALS, "NumpadEqual"},
      {SDL_SCANCODE_INTERNATIONAL1, "IntlRo"},
      {SDL_SCANCODE_INTERNATIONAL2, "KanaMode"},
      {SDL_SCANCODE_INTERNATIONAL3, "IntlYen"},
      {SDL_SCANCODE_INTERNATIONAL4, "Convert"},
      {SDL_SCANCODE_INTERNATIONAL5, "NonConvert"},
  };

  char buffer[32];
  for (size_t index = 0; index < sizeof(cases) / sizeof(cases[0]); index += 1) {
    const char *code =
        scancode_to_code(cases[index].scancode, buffer, sizeof(buffer));
    if (!code || strcmp(code, cases[index].code) != 0) return false;
  }
  return true;
}

static bool run_self_test(NativeRuntime *state) {
  int target_fps = 0;
  char json[16384];

  bool expect_migration =
      getenv("PV_NATIVE_EXPECT_MIGRATION") != NULL;
  if (!validate_scancode_mapping()) {
    fprintf(stderr, "Native remap scancode coverage failed\n");
    return false;
  }
  printf("native_remap_scancode_coverage=PASS\n");

  if (!js_get_int(state, "getTargetFps", &target_fps) ||
      target_fps != (expect_migration ? 30 : 25) ||
      !js_get_string(state, "getStateJson", json, sizeof(json)) ||
      !contains(json, "\"state\":\"intro\"") ||
      (expect_migration &&
       (!contains(json, "\"graphic\":\"soft\"") ||
        !contains(json, "\"bgm\":\"off\"") ||
        !contains(json, "\"sfx\":\"mono\"") ||
        !contains(json, "\"winningScore\":\"10\"") ||
        !contains(json, "\"p1.left\":\"KeyA\"")))) {
    fprintf(stderr,
            "Native JS initialization/migration contract failed\n");
    return false;
  }
  if (expect_migration) {
    printf("electron_migration_runtime=PASS\n");
  }

  const char *power_hit_code = expect_migration ? "KeyQ" : "KeyZ";
  if (!js_handle_key(state, power_hit_code, true, false) ||
      !step_runtime(state) ||
      !js_handle_key(state, power_hit_code, false, false) ||
      !js_get_string(state, "getStateJson", json, sizeof(json)) ||
      !contains(json, "\"state\":\"menu\"")) {
    fprintf(stderr,
            "Power Hit did not advance intro to menu with active binding %s\n",
            power_hit_code);
    return false;
  }

  if (!step_runtime(state)) {
    fprintf(stderr, "Native menu presentation step failed\n");
    return false;
  }

  int render_command_count = 0;
  if (!render_frame(state, true, &render_command_count) ||
      render_command_count < 20 || !write_render_trace(state)) {
    fprintf(stderr, "Native atlas presentation self-test failed\n");
    return false;
  }
  printf("native_render_commands=PASS count=%d\n", render_command_count);

  if (!js_get_string(state, "getRenderFrameJson", json, sizeof(json)) ||
      !contains(json, "\"quickRematchVisible\":false") ||
      !contains(json, "\"quickRematchText\":")) {
    fprintf(stderr, "Native quick-rematch render-frame contract failed\n");
    return false;
  }
  const char *rematch_fixture =
      "{\"quickRematchVisible\":true,\"locale\":\"en\","
      "\"quickRematchText\":\"Press Power Hit for a quick rematch\"}";
  JSValue rematch_frame =
      JS_ParseJSON(state->context, rematch_fixture, strlen(rematch_fixture),
                   "<quick-rematch-self-test>");
  bool rematch_ok =
      !JS_IsException(rematch_frame) &&
      native_menu_renderer_render_quick_rematch(
          &state->menu_renderer, state->renderer, state->context,
          rematch_frame);
  JS_FreeValue(state->context, rematch_frame);
  if (!rematch_ok) {
    fprintf(stderr, "Native quick-rematch hint renderer failed\n");
    return false;
  }
  printf("native_quick_rematch_hint=PASS\n");

  if (!js_handle_key(state, "KeyP", true, false) ||
      !js_get_string(state, "getStateJson", json, sizeof(json)) ||
      !contains(json, "\"paused\":true") ||
      !js_handle_key(state, "KeyP", false, false) ||
      !js_handle_key(state, "KeyP", true, false) ||
      !js_get_string(state, "getStateJson", json, sizeof(json)) ||
      !contains(json, "\"paused\":false") ||
      !js_handle_key(state, "KeyP", false, false)) {
    fprintf(stderr, "Fixed pause recovery key contract failed\n");
    return false;
  }

  const char *custom_preferences =
      "{\"pv-offline-speed\":\"fast\","
      "\"pv-offline-winningScore\":\"10\","
      "\"pv-offline-sfx\":\"mono\","
      "\"pv-control-bindings-v1\":"
      "\"{\\\"version\\\":1,\\\"bindings\\\":{\\\"p1.left\\\":\\\"KeyA\\\"}}\"}";
  JSValue argument = JS_NewString(state->context, custom_preferences);
  JSValueConst arguments[] = {argument};
  JSValue result;
  bool initialized = call_api(state, "initialize", 1, arguments, &result);
  JS_FreeValue(state->context, argument);
  if (!initialized) return false;
  int initialized_value = JS_ToBool(state->context, result);
  JS_FreeValue(state->context, result);
  if (initialized_value != 1 ||
      !js_get_int(state, "getTargetFps", &target_fps) || target_fps != 30 ||
      !js_handle_key(state, "KeyA", true, false) || !step_runtime(state) ||
      !js_get_string(state, "getStateJson", json, sizeof(json)) ||
      !contains(json, "\"speed\":\"fast\"") ||
      !contains(json, "\"sfx\":\"mono\"") ||
      !contains(json, "\"winningScore\":10") ||
      !contains(json, "\"lastFrameInputs\":[{\"xDirection\":-1")) {
    fprintf(stderr, "Persisted settings/remapped input bridge contract failed\n");
    return false;
  }

  if (!js_reset_inputs(state) || !step_runtime(state) ||
      !js_get_string(state, "getStateJson", json, sizeof(json)) ||
      !contains(json, "\"lastFrameInputs\":[{\"xDirection\":0")) {
    fprintf(stderr, "Focus-loss input reset contract failed\n");
    return false;
  }

  if (!js_set_setting(state, "colorScheme", "light") ||
      !js_handle_key(state, "KeyP", true, false) ||
      !js_handle_key(state, "KeyP", false, false) ||
      !render_frame(state, false, NULL) ||
      !js_get_string(state, "getStateJson", json, sizeof(json)) ||
      !contains(json, "\"colorScheme\":\"light\"") ||
      !js_set_setting(state, "colorScheme", "dark") ||
      !render_frame(state, false, NULL) ||
      !js_get_string(state, "getStateJson", json, sizeof(json)) ||
      !contains(json, "\"colorScheme\":\"dark\"") ||
      !js_handle_key(state, "KeyP", true, false) ||
      !js_handle_key(state, "KeyP", false, false)) {
    fprintf(stderr, "Native menu theme rendering contract failed\n");
    return false;
  }
  printf("native_menu_theme=PASS\n");

  printf("native_js_bundle=PASS\n");
  printf("shared_core_bridge=PASS\n");
  printf("semantic_input_bridge=PASS\n");
  printf("settings_bridge=PASS\n");
  printf("focus_reset_bridge=PASS\n");
  if (!native_audio_self_test(&state->audio) ||
      !js_set_setting(state, "graphic", "soft") ||
      !js_set_setting(state, "bgm", "off") ||
      !js_set_setting(state, "colorScheme", "dark") ||
      !js_set_control_binding(state, "p1.left", "KeyA") ||
      !persist_preferences_if_dirty(state)) {
    fprintf(stderr, "Native audio/preference self-test failed\n");
    return false;
  }

  size_t persisted_length = 0;
  char *persisted =
      read_text_file(state->preferences_path, &persisted_length);
  JSValue expected_preferences;
  if (!persisted ||
      !call_api(state, "getPersistedPreferencesJson", 0, NULL,
                &expected_preferences)) {
    free(persisted);
    fprintf(stderr, "Unable to read back persisted native preferences\n");
    return false;
  }
  size_t expected_length = 0;
  const char *expected_text =
      JS_ToCStringLen(state->context, &expected_length,
                      expected_preferences);
  JS_FreeValue(state->context, expected_preferences);
  bool persisted_ok =
      expected_text && persisted_length == expected_length &&
      memcmp(persisted, expected_text, expected_length) == 0;
  free(persisted);
  if (expected_text) JS_FreeCString(state->context, expected_text);
  if (!persisted_ok) {
    fprintf(stderr,
            "Persisted native preference bytes did not match shared JS serialization\n");
    return false;
  }

  if (!is_allowed_external_url("https://santiagorodriguez.com") ||
      !is_allowed_external_url(
          "https://github.com/santirodriguez/pikachu-volleyball") ||
      !is_allowed_external_url(
          "https://github.com/gorisanson/pikachu-volleyball") ||
      is_allowed_external_url("https://santiagorodriguez.com.evil.test") ||
      is_allowed_external_url(
          "https://github.com/santirodriguez/pikachu-volleyball?x=1") ||
      is_allowed_external_url("file:///tmp/pikachu")) {
    fprintf(stderr, "Native external URL allowlist contract failed\n");
    return false;
  }
  printf("native_external_url_allowlist=PASS\n");

  if (!js_handle_key(state, "KeyP", true, false) ||
      !js_handle_key(state, "KeyP", false, false) ||
      !js_handle_pointer(state, 20.0, 103.0, true) ||
      !js_handle_pointer(state, 160.0, 60.0, true) ||
      !js_get_string(state, "getStateJson", json, sizeof(json)) ||
      !contains(json, "\"winningScore\":15")) {
    fprintf(stderr, "Native pointer menu path failed\n");
    return false;
  }
  printf("native_pointer_menu=PASS\n");

  const char *locales[] = {"en", "es-ar", "ca", "ko", "zh"};
  for (size_t index = 0; index < sizeof(locales) / sizeof(locales[0]);
       index += 1) {
    if (!js_set_locale(state, locales[index]) ||
        !render_frame(state, false, NULL)) {
      fprintf(stderr, "Native menu locale render failed: %s\n",
              locales[index]);
      return false;
    }
    printf("native_menu_locale[%s]=PASS\n", locales[index]);
  }
  printf("native_locale_menu=PASS\n");

  if (!js_handle_key(state, "KeyP", true, false) ||
      !js_handle_key(state, "KeyP", false, false) ||
      !js_handle_key(state, "KeyP", true, false) ||
      !js_handle_key(state, "KeyP", false, false) ||
      !js_handle_key(state, "ArrowUp", true, false) ||
      !js_handle_key(state, "ArrowUp", false, false) ||
      !js_handle_key(state, "Enter", true, false) ||
      !js_handle_key(state, "Enter", false, false) ||
      !js_handle_key(state, "Enter", true, false) ||
      !js_handle_key(state, "Enter", false, false)) {
    fprintf(stderr, "Native Quit menu keyboard path failed\n");
    return false;
  }
  bool requested_quit = false;
  if (!process_platform_commands(state, &requested_quit, true) ||
      !requested_quit) {
    fprintf(stderr, "Native Quit platform command was not emitted\n");
    return false;
  }
  printf("native_quit_path=PASS\n");

  if (!native_startup_self_test()) {
    fprintf(stderr, "Native startup localization contract failed\n");
    return false;
  }
  printf("native_startup_localization=PASS\n");

  printf("native_graphics_bridge=PASS\n");
  printf("native_preferences_store=PASS\n");
  return true;
}

static bool render_frame(NativeRuntime *state, bool validate_pixels,
                         int *command_count_out) {
  JSValue frame;
  if (!call_api(state, "getRenderFrame", 0, NULL, &frame)) return false;

  char scale_mode[16];
  if (!js_object_get_string(state->context, frame, "scaleMode", scale_mode,
                            sizeof(scale_mode))) {
    JS_FreeValue(state->context, frame);
    return false;
  }

  SDL_ScaleMode sdl_scale_mode =
      strcmp(scale_mode, "linear") == 0 ? SDL_SCALEMODE_LINEAR
                                        : SDL_SCALEMODE_NEAREST;
  if (!SDL_SetTextureScaleMode(state->sprite_texture, sdl_scale_mode)) {
    fprintf(stderr, "SDL_SetTextureScaleMode failed: %s\n", SDL_GetError());
    JS_FreeValue(state->context, frame);
    return false;
  }

  JSValue commands = JS_GetPropertyStr(state->context, frame, "commands");
  if (JS_IsException(commands)) {
    JS_FreeValue(state->context, commands);
    JS_FreeValue(state->context, frame);
    return false;
  }

  uint32_t command_count = 0;
  if (!js_array_length(state->context, commands, &command_count)) {
    JS_FreeValue(state->context, commands);
    JS_FreeValue(state->context, frame);
    return false;
  }

  SDL_SetRenderDrawColor(state->renderer, 0, 0, 0, 255);
  SDL_RenderClear(state->renderer);

  for (uint32_t index = 0; index < command_count; index += 1) {
    JSValue command = JS_GetPropertyUint32(state->context, commands, index);
    if (JS_IsException(command)) {
      JS_FreeValue(state->context, command);
      JS_FreeValue(state->context, commands);
      JS_FreeValue(state->context, frame);
      return false;
    }

    double sx = 0;
    double sy = 0;
    double sw = 0;
    double sh = 0;
    double x = 0;
    double y = 0;
    double width = 0;
    double height = 0;
    double anchor_x = 0;
    double anchor_y = 0;
    double alpha = 1;
    bool flip_x = false;

    bool ok =
        js_object_get_double(state->context, command, "sx", &sx) &&
        js_object_get_double(state->context, command, "sy", &sy) &&
        js_object_get_double(state->context, command, "sw", &sw) &&
        js_object_get_double(state->context, command, "sh", &sh) &&
        js_object_get_double(state->context, command, "x", &x) &&
        js_object_get_double(state->context, command, "y", &y) &&
        js_object_get_double(state->context, command, "width", &width) &&
        js_object_get_double(state->context, command, "height", &height) &&
        js_object_get_double(state->context, command, "anchorX", &anchor_x) &&
        js_object_get_double(state->context, command, "anchorY", &anchor_y) &&
        js_object_get_double(state->context, command, "alpha", &alpha) &&
        js_object_get_bool(state->context, command, "flipX", &flip_x);

    if (!ok) {
      JS_FreeValue(state->context, command);
      JS_FreeValue(state->context, commands);
      JS_FreeValue(state->context, frame);
      return false;
    }

    if (width > 0 && height > 0 && alpha > 0) {
      SDL_FRect source = {(float)sx, (float)sy, (float)sw, (float)sh};
      SDL_FRect destination = {
          (float)(x - width * anchor_x),
          (float)(y - height * anchor_y),
          (float)width,
          (float)height,
      };
      double clamped_alpha = alpha < 0 ? 0 : (alpha > 1 ? 1 : alpha);
      Uint8 alpha_mod = (Uint8)(clamped_alpha * 255.0 + 0.5);
      if (!SDL_SetTextureAlphaMod(state->sprite_texture, alpha_mod) ||
          !SDL_RenderTextureRotated(
              state->renderer, state->sprite_texture, &source, &destination,
              0.0, NULL, flip_x ? SDL_FLIP_HORIZONTAL : SDL_FLIP_NONE)) {
        fprintf(stderr, "SDL atlas render failed: %s\n", SDL_GetError());
        JS_FreeValue(state->context, command);
        JS_FreeValue(state->context, commands);
        JS_FreeValue(state->context, frame);
        return false;
      }
    }

    JS_FreeValue(state->context, command);
  }

  SDL_SetTextureAlphaMod(state->sprite_texture, 255);

  if (!native_menu_renderer_render_quick_rematch(
          &state->menu_renderer, state->renderer, state->context, frame)) {
    JS_FreeValue(state->context, commands);
    JS_FreeValue(state->context, frame);
    return false;
  }

  JSValue menu_frame;
  if (!call_api(state, "getMenuFrame", 0, NULL, &menu_frame)) {
    JS_FreeValue(state->context, commands);
    JS_FreeValue(state->context, frame);
    return false;
  }
  bool menu_ok =
      native_accessibility_sync(&state->accessibility, state->context,
                                menu_frame) &&
      native_menu_renderer_render(&state->menu_renderer, state->renderer,
                                  state->context, menu_frame);
  JS_FreeValue(state->context, menu_frame);

  bool framebuffer_ok =
      menu_ok && (!validate_pixels || validate_framebuffer(state));
  SDL_RenderPresent(state->renderer);

  JS_FreeValue(state->context, commands);
  JS_FreeValue(state->context, frame);
  if (command_count_out) *command_count_out = (int)command_count;
  return framebuffer_ok;
}

static void destroy_runtime(NativeRuntime *state) {
  native_accessibility_destroy(&state->accessibility);
  native_menu_renderer_destroy(&state->menu_renderer);
  native_audio_destroy(&state->audio);
  if (state->sprite_texture) SDL_DestroyTexture(state->sprite_texture);
  if (state->renderer) SDL_DestroyRenderer(state->renderer);
  if (state->window) SDL_DestroyWindow(state->window);
  if (state->context && !JS_IsUndefined(state->api)) {
    JS_FreeValue(state->context, state->api);
  }
  if (state->context) JS_FreeContext(state->context);
  if (state->runtime) JS_FreeRuntime(state->runtime);
  SDL_Quit();
}

int main(int argc, char **argv) {
  bool self_test = argc > 1 && strcmp(argv[1], "--self-test") == 0;
  bool a11y_test = argc > 1 && strcmp(argv[1], "--a11y-test") == 0;
  const char *startup_locale = detect_initial_locale();

  if (argc > 1 && strcmp(argv[1], "--startup-error-test") == 0) {
    const char *test_locale = argc > 2 ? argv[2] : startup_locale;
    const char *normalized = native_startup_normalize_locale(test_locale);
    native_startup_report_error(normalized, NATIVE_STARTUP_ERROR_JAVASCRIPT,
                                "startup-error-test", NULL);
    printf("native_startup_error_test[%s]=PASS\n", normalized);
    return 2;
  }

  NativeRuntime state;
  memset(&state, 0, sizeof(state));
  state.api = JS_UNDEFINED;

  const char *base_path = SDL_GetBasePath();
  if (!base_path || strlen(base_path) >= sizeof(state.base_path)) {
    native_startup_report_error(startup_locale, NATIVE_STARTUP_ERROR_BASE_PATH,
                                SDL_GetError(), NULL);
    return 2;
  }
  strcpy(state.base_path, base_path);
  if (!native_audio_init(&state.audio, state.base_path) ||
      !initialize_preferences_path(&state)) {
    native_startup_report_error(startup_locale,
                                NATIVE_STARTUP_ERROR_PLATFORM_PATHS, NULL,
                                NULL);
    return 2;
  }
  native_startup_checkpoint("platform-paths");

  if (!SDL_Init(SDL_INIT_VIDEO | SDL_INIT_AUDIO)) {
    native_startup_report_error(startup_locale, NATIVE_STARTUP_ERROR_SDL,
                                SDL_GetError(), NULL);
    return 2;
  }
  native_startup_checkpoint("sdl");

  if (!SDL_CreateWindowAndRenderer(kWindowTitle, WINDOW_WIDTH, WINDOW_HEIGHT,
                                   SDL_WINDOW_RESIZABLE, &state.window,
                                   &state.renderer)) {
    native_startup_report_error(startup_locale, NATIVE_STARTUP_ERROR_WINDOW,
                                SDL_GetError(), NULL);
    destroy_runtime(&state);
    return 2;
  }
  native_startup_checkpoint("window");

  if (!SDL_SetWindowMinimumSize(state.window, MIN_WINDOW_WIDTH,
                                MIN_WINDOW_HEIGHT) ||
      !SDL_SetRenderLogicalPresentation(
          state.renderer, LOGICAL_WIDTH, LOGICAL_HEIGHT,
          SDL_LOGICAL_PRESENTATION_LETTERBOX)) {
    native_startup_report_error(startup_locale, NATIVE_STARTUP_ERROR_RENDERER,
                                SDL_GetError(), state.window);
    destroy_runtime(&state);
    return 2;
  }
  native_startup_checkpoint("renderer");

  if (!native_menu_renderer_init(&state.menu_renderer, state.base_path) ||
      !native_accessibility_init(&state.accessibility, state.window,
                                 state.renderer)) {
    native_startup_report_error(startup_locale, NATIVE_STARTUP_ERROR_UI, NULL,
                                state.window);
    destroy_runtime(&state);
    return 2;
  }
  native_startup_checkpoint("native-ui");

  char sprite_path[PATH_MAX];
  if (!join_path(sprite_path, sizeof(sprite_path), state.base_path,
                 "assets/sprite_sheet.png")) {
    native_startup_report_error(startup_locale, NATIVE_STARTUP_ERROR_ASSETS,
                                "sprite_sheet.png", state.window);
    destroy_runtime(&state);
    return 2;
  }
  state.sprite_texture =
      load_png_texture(state.renderer, sprite_path, &state.sprite_width,
                       &state.sprite_height);
  if (!state.sprite_texture || state.sprite_width != 476 ||
      state.sprite_height != 885) {
    native_startup_report_error(startup_locale, NATIVE_STARTUP_ERROR_ASSETS,
                                "sprite_sheet.png", state.window);
    destroy_runtime(&state);
    return 2;
  }
  native_startup_checkpoint("assets");

  bool migrated_preferences = false;
  char *preferences =
      load_initial_preferences(&state, &migrated_preferences);
  if (!preferences ||
      !initialize_javascript(&state, preferences, startup_locale)) {
    free(preferences);
    native_startup_report_error(startup_locale,
                                NATIVE_STARTUP_ERROR_JAVASCRIPT, NULL,
                                state.window);
    destroy_runtime(&state);
    return 2;
  }
  free(preferences);
  native_startup_checkpoint("javascript");

  if (migrated_preferences) {
    if (!persist_preferences(&state)) {
      native_startup_report_error(startup_locale,
                                  NATIVE_STARTUP_ERROR_PREFERENCES, NULL,
                                  state.window);
      destroy_runtime(&state);
      return 2;
    }
    printf("electron_preferences_migrated=PASS\n");
  }
  native_startup_checkpoint("ready");

  if (self_test) {
    bool ok = run_self_test(&state);
    printf("native_host_self_test=%s\n", ok ? "PASS" : "FAIL");
    destroy_runtime(&state);
    return ok ? 0 : 1;
  }

  if (a11y_test &&
      (!js_handle_key(&state, "KeyP", true, false) ||
       !js_handle_key(&state, "KeyP", false, false))) {
    destroy_runtime(&state);
    return 2;
  }

  bool quit = false;
  uint64_t next_tick = SDL_GetTicks();
  while (!quit) {
    SDL_Event event;
    while (SDL_PollEvent(&event)) {
      if (event.type == SDL_EVENT_QUIT) {
        quit = true;
      } else if (event.type == SDL_EVENT_KEY_DOWN) {
        if (!dispatch_key_event(&state, &event.key, true)) {
          destroy_runtime(&state);
          return 2;
        }
      } else if (event.type == SDL_EVENT_KEY_UP) {
        if (!dispatch_key_event(&state, &event.key, false)) {
          destroy_runtime(&state);
          return 2;
        }
      } else if (event.type == SDL_EVENT_MOUSE_BUTTON_DOWN &&
                 event.button.button == SDL_BUTTON_LEFT) {
        SDL_Event logical_event = event;
        if (!SDL_ConvertEventToRenderCoordinates(state.renderer,
                                                 &logical_event) ||
            !js_handle_pointer(&state, logical_event.button.x,
                               logical_event.button.y, true)) {
          destroy_runtime(&state);
          return 2;
        }
      } else if (event.type == SDL_EVENT_WINDOW_FOCUS_LOST) {
        native_accessibility_set_window_focus(&state.accessibility, false);
        if (!js_reset_inputs(&state) ||
            !native_audio_set_muted(&state.audio, true)) {
          destroy_runtime(&state);
          return 2;
        }
      } else if (event.type == SDL_EVENT_WINDOW_FOCUS_GAINED) {
        native_accessibility_set_window_focus(&state.accessibility, true);
        if (!native_audio_set_muted(&state.audio, false)) {
          destroy_runtime(&state);
          return 2;
        }
      } else if (native_accessibility_is_window_geometry_event(event.type)) {
        native_accessibility_update_window_bounds(&state.accessibility);
      } else {
        uint64_t accessible_node_id = 0;
        NativeAccessibilityAction accessible_action =
            NATIVE_ACCESSIBILITY_ACTION_NONE;
        if (native_accessibility_translate_event(
                &state.accessibility, &event, &accessible_node_id,
                &accessible_action)) {
          const char *action =
              accessible_action == NATIVE_ACCESSIBILITY_ACTION_FOCUS
                  ? "focus"
                  : "click";
          if (!js_handle_accessibility_action(&state, accessible_node_id,
                                              action)) {
            destroy_runtime(&state);
            return 2;
          }
        }
      }
    }

    int target_fps = 25;
    if (!js_get_int(&state, "getTargetFps", &target_fps) || target_fps <= 0) {
      destroy_runtime(&state);
      return 2;
    }
    uint64_t now = SDL_GetTicks();
    if (now >= next_tick) {
      if (!js_step(&state)) {
        destroy_runtime(&state);
        return 2;
      }
      uint64_t frame_ms = (uint64_t)(1000 / target_fps);
      next_tick = now + (frame_ms > 0 ? frame_ms : 1);
    }

    if (!native_audio_pump(&state.audio) ||
        !persist_preferences_if_dirty(&state) ||
        !process_platform_commands(&state, &quit, false) ||
        !render_frame(&state, false, NULL)) {
      destroy_runtime(&state);
      return 2;
    }
    SDL_Delay(1);
  }

  destroy_runtime(&state);
  return 0;
}
