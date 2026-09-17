#include <SDL3/SDL.h>
#include <SDL3/SDL_main.h>
#include <quickjs.h>

#include <limits.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

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
  char base_path[PATH_MAX];
} NativeRuntime;

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
  if (length_out) *length_out = read_length;
  return buffer;
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

  if (!js_handle_key(state, "KeyZ", true, false) || !js_step(state) ||
      !js_handle_key(state, "KeyZ", false, false) ||
      !js_get_string(state, "getStateJson", json, sizeof(json)) ||
      !contains(json, "\"state\":\"menu\"")) {
    fprintf(stderr, "Power Hit did not advance intro to menu\n");
    return false;
  }

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
      !js_handle_key(state, "KeyA", true, false) || !js_step(state) ||
      !js_get_string(state, "getStateJson", json, sizeof(json)) ||
      !contains(json, "\"speed\":\"fast\"") ||
      !contains(json, "\"sfx\":\"mono\"") ||
      !contains(json, "\"winningScore\":10") ||
      !contains(json, "\"lastFrameInputs\":[{\"xDirection\":-1")) {
    fprintf(stderr, "Persisted settings/remapped input bridge contract failed\n");
    return false;
  }

  if (!js_reset_inputs(state) || !js_step(state) ||
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
  return true;
}

static void render_frame(NativeRuntime *state) {
  char state_id[96] = "unknown";
  int target_fps = 0;
  js_get_string(state, "getStateId", state_id, sizeof(state_id));
  js_get_int(state, "getTargetFps", &target_fps);

  SDL_SetRenderDrawColor(state->renderer, 16, 22, 30, 255);
  SDL_RenderClear(state->renderer);
  SDL_SetRenderDrawColor(state->renderer, 245, 245, 245, 255);
  SDL_RenderDebugText(state->renderer, 24.0f, 24.0f,
                      "Pikachu Volleyball native production host");
  SDL_RenderDebugText(state->renderer, 24.0f, 44.0f,
                      "Phase 5.2: SDL3 + QuickJS shared-core bridge");
  char status[160];
  snprintf(status, sizeof(status), "Core state: %s | target FPS: %d", state_id,
           target_fps);
  SDL_RenderDebugText(state->renderer, 24.0f, 72.0f, status);
  SDL_RenderDebugText(state->renderer, 24.0f, 96.0f,
                      "Presentation parity replaces this diagnostic view in 5.3");
  SDL_RenderPresent(state->renderer);
}

static void destroy_runtime(NativeRuntime *state) {
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

  if (!SDL_Init(SDL_INIT_VIDEO)) {
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

  if (!initialize_javascript(&state, "{}")) {
    destroy_runtime(&state);
    return 2;
  }

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
        if (!js_reset_inputs(&state)) {
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

    render_frame(&state);
    SDL_Delay(1);
  }

  destroy_runtime(&state);
  return 0;
}
