#include <SDL3/SDL.h>
#include <SDL3/SDL_main.h>
#include <png.h>
#include <quickjs.h>

#include "native_audio.h"

#include <errno.h>
#include <limits.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
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
} NativeRuntime;

static bool render_frame(NativeRuntime *state, bool validate_pixels,
                         int *command_count_out);

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

static char *read_optional_preferences(const char *path) {
  size_t length = 0;
  char *content = read_text_file(path, &length);
  if (content) return content;
  if (errno != ENOENT) {
    fprintf(stderr, "Unable to read native preferences: %s\n", path);
    return NULL;
  }
  content = malloc(3);
  if (!content) return NULL;
  memcpy(content, "{}", 3);
  return content;
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
                                  const char *preferences_json) {
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

  JSValue argument = JS_NewString(state->context, preferences_json);
  JSValueConst arguments[] = {argument};
  JSValue result;
  bool ok = call_api(state, "initialize", 1, arguments, &result);
  JS_FreeValue(state->context, argument);
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

static bool run_self_test(NativeRuntime *state) {
  int target_fps = 0;
  char json[16384];

  if (!js_get_int(state, "getTargetFps", &target_fps) || target_fps != 25 ||
      !js_get_string(state, "getStateJson", json, sizeof(json)) ||
      !contains(json, "\"state\":\"intro\"")) {
    fprintf(stderr, "Default native JS initialization contract failed\n");
    return false;
  }

  if (!js_handle_key(state, "KeyZ", true, false) || !step_runtime(state) ||
      !js_handle_key(state, "KeyZ", false, false) ||
      !js_get_string(state, "getStateJson", json, sizeof(json)) ||
      !contains(json, "\"state\":\"menu\"")) {
    fprintf(stderr, "Power Hit did not advance intro to menu\n");
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
  bool persisted_ok =
      persisted && persisted_length > 0 &&
      contains(persisted, "\"pv-offline-graphic\":\"soft\"") &&
      contains(persisted, "\"pv-offline-bgm\":\"off\"") &&
      contains(persisted, "\"colorScheme\":\"dark\"") &&
      contains(persisted, "\"p1.left\":\"KeyA\"");
  free(persisted);
  if (!persisted_ok) {
    fprintf(stderr, "Persisted native preference bytes did not match\n");
    return false;
  }

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
  bool framebuffer_ok = !validate_pixels || validate_framebuffer(state);
  SDL_RenderPresent(state->renderer);

  JS_FreeValue(state->context, commands);
  JS_FreeValue(state->context, frame);
  if (command_count_out) *command_count_out = (int)command_count;
  return framebuffer_ok;
}

static void destroy_runtime(NativeRuntime *state) {
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
  NativeRuntime state;
  memset(&state, 0, sizeof(state));
  state.api = JS_UNDEFINED;

  const char *base_path = SDL_GetBasePath();
  if (!base_path || strlen(base_path) >= sizeof(state.base_path)) {
    fprintf(stderr, "Unable to determine executable base path: %s\n",
            SDL_GetError());
    return 2;
  }
  strcpy(state.base_path, base_path);
  if (!native_audio_init(&state.audio, state.base_path) ||
      !initialize_preferences_path(&state)) {
    fprintf(stderr, "Unable to initialize native platform paths\n");
    return 2;
  }

  if (!SDL_Init(SDL_INIT_VIDEO | SDL_INIT_AUDIO)) {
    fprintf(stderr, "SDL_Init failed: %s\n", SDL_GetError());
    return 2;
  }
  if (!SDL_CreateWindowAndRenderer(kWindowTitle, WINDOW_WIDTH, WINDOW_HEIGHT,
                                   SDL_WINDOW_RESIZABLE, &state.window,
                                   &state.renderer)) {
    fprintf(stderr, "SDL_CreateWindowAndRenderer failed: %s\n", SDL_GetError());
    destroy_runtime(&state);
    return 2;
  }
  if (!SDL_SetWindowMinimumSize(state.window, MIN_WINDOW_WIDTH,
                                MIN_WINDOW_HEIGHT) ||
      !SDL_SetRenderLogicalPresentation(
          state.renderer, LOGICAL_WIDTH, LOGICAL_HEIGHT,
          SDL_LOGICAL_PRESENTATION_LETTERBOX)) {
    fprintf(stderr, "Unable to configure native window/renderer: %s\n",
            SDL_GetError());
    destroy_runtime(&state);
    return 2;
  }

  char sprite_path[PATH_MAX];
  if (!join_path(sprite_path, sizeof(sprite_path), state.base_path,
                 "assets/sprite_sheet.png")) {
    destroy_runtime(&state);
    return 2;
  }
  state.sprite_texture =
      load_png_texture(state.renderer, sprite_path, &state.sprite_width,
                       &state.sprite_height);
  if (!state.sprite_texture || state.sprite_width != 476 ||
      state.sprite_height != 885) {
    fprintf(stderr, "Unable to load production sprite atlas\n");
    destroy_runtime(&state);
    return 2;
  }

  char *preferences = read_optional_preferences(state.preferences_path);
  if (!preferences || !initialize_javascript(&state, preferences)) {
    free(preferences);
    destroy_runtime(&state);
    return 2;
  }
  free(preferences);

  if (self_test) {
    bool ok = run_self_test(&state);
    printf("native_host_self_test=%s\n", ok ? "PASS" : "FAIL");
    destroy_runtime(&state);
    return ok ? 0 : 1;
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
      } else if (event.type == SDL_EVENT_WINDOW_FOCUS_LOST) {
        if (!js_reset_inputs(&state) ||
            !native_audio_set_muted(&state.audio, true)) {
          destroy_runtime(&state);
          return 2;
        }
      } else if (event.type == SDL_EVENT_WINDOW_FOCUS_GAINED) {
        if (!native_audio_set_muted(&state.audio, false)) {
          destroy_runtime(&state);
          return 2;
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
        !render_frame(&state, false, NULL)) {
      destroy_runtime(&state);
      return 2;
    }
    SDL_Delay(1);
  }

  destroy_runtime(&state);
  return 0;
}
