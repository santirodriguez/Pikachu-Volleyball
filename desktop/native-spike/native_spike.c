#include <SDL3/SDL.h>
#include <SDL3/SDL_main.h>
#include <limits.h>
#include <mpg123.h>
#include <png.h>
#include <quickjs.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define WINDOW_WIDTH 640
#define WINDOW_HEIGHT 480
#define MENU_COUNT 3
#define LOCALE_COUNT 5

static const char *kLocales[LOCALE_COUNT] = {"en", "es-ar", "ca", "ko", "zh"};
static const char *kMenuLabels[MENU_COUNT] = {"Start", "Language", "Audio"};

typedef struct NativeState {
  JSRuntime *runtime;
  JSContext *context;
  SDL_Window *window;
  SDL_Renderer *renderer;
  SDL_Texture *sprite_texture;
  int sprite_width;
  int sprite_height;
  int last_audio_request;
  char base_path[PATH_MAX];
} NativeState;

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

static bool init_quickjs(NativeState *state) {
  char script_path[PATH_MAX];
  if (!join_path(script_path, sizeof(script_path), state->base_path,
                 "spike.js")) {
    return false;
  }

  size_t source_length = 0;
  char *source = read_text_file(script_path, &source_length);
  if (!source) {
    return false;
  }

  state->runtime = JS_NewRuntime();
  state->context = state->runtime ? JS_NewContext(state->runtime) : NULL;
  if (!state->context) {
    free(source);
    return false;
  }

  JSValue result = JS_Eval(state->context, source, source_length, script_path,
                           JS_EVAL_TYPE_GLOBAL);
  free(source);
  if (JS_IsException(result)) {
    JS_FreeValue(state->context, result);
    report_js_exception(state->context, "script evaluation");
    return false;
  }
  JS_FreeValue(state->context, result);
  return true;
}

static bool js_call_key(NativeState *state, const char *key) {
  JSValue global = JS_GetGlobalObject(state->context);
  JSValue function = JS_GetPropertyStr(state->context, global, "nativeHandleKey");
  JSValue argument = JS_NewString(state->context, key);
  JSValue result = JS_Call(state->context, function, global, 1, &argument);

  JS_FreeValue(state->context, argument);
  JS_FreeValue(state->context, function);
  JS_FreeValue(state->context, global);

  if (JS_IsException(result)) {
    JS_FreeValue(state->context, result);
    report_js_exception(state->context, "key dispatch");
    return false;
  }
  JS_FreeValue(state->context, result);
  return true;
}

static bool js_call_int(NativeState *state, const char *function_name,
                        int *value_out) {
  JSValue global = JS_GetGlobalObject(state->context);
  JSValue function =
      JS_GetPropertyStr(state->context, global, function_name);
  JSValue result = JS_Call(state->context, function, global, 0, NULL);

  JS_FreeValue(state->context, function);
  JS_FreeValue(state->context, global);

  if (JS_IsException(result)) {
    JS_FreeValue(state->context, result);
    report_js_exception(state->context, function_name);
    return false;
  }

  int32_t value = 0;
  int conversion = JS_ToInt32(state->context, &value, result);
  JS_FreeValue(state->context, result);
  if (conversion < 0) {
    return false;
  }
  *value_out = value;
  return true;
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

  SDL_Texture *texture =
      SDL_CreateTexture(renderer, SDL_PIXELFORMAT_RGBA32,
                        SDL_TEXTUREACCESS_STATIC, (int)image.width,
                        (int)image.height);
  if (!texture ||
      !SDL_UpdateTexture(texture, NULL, pixels, (int)image.width * 4)) {
    fprintf(stderr, "SDL texture creation failed: %s\n", SDL_GetError());
    if (texture) {
      SDL_DestroyTexture(texture);
    }
    texture = NULL;
  } else {
    *width_out = (int)image.width;
    *height_out = (int)image.height;
  }

  free(pixels);
  png_image_free(&image);
  return texture;
}

static bool verify_locales(NativeState *state) {
  for (int index = 0; index < LOCALE_COUNT; index += 1) {
    char relative[128];
    char path[PATH_MAX];
    snprintf(relative, sizeof(relative), "locales/%s/index.html", kLocales[index]);
    if (!join_path(path, sizeof(path), state->base_path, relative)) {
      return false;
    }

    size_t length = 0;
    char *content = read_text_file(path, &length);
    if (!content || length < 100) {
      free(content);
      fprintf(stderr, "Locale fixture is missing or unexpectedly small: %s\n", path);
      return false;
    }
    free(content);
    printf("locale[%s]=%zu bytes\n", kLocales[index], length);
  }
  return true;
}

static bool probe_mp3(NativeState *state) {
  char path[PATH_MAX];
  if (!join_path(path, sizeof(path), state->base_path, "assets/bgm.mp3")) {
    return false;
  }

  if (mpg123_init() != MPG123_OK) {
    fprintf(stderr, "mpg123 initialization failed\n");
    return false;
  }

  int error = MPG123_OK;
  mpg123_handle *decoder = mpg123_new(NULL, &error);
  if (!decoder || mpg123_open(decoder, path) != MPG123_OK) {
    fprintf(stderr, "mpg123 could not open %s\n", path);
    if (decoder) {
      mpg123_delete(decoder);
    }
    mpg123_exit();
    return false;
  }

  long rate = 0;
  int channels = 0;
  int encoding = 0;
  if (mpg123_getformat(decoder, &rate, &channels, &encoding) != MPG123_OK) {
    mpg123_close(decoder);
    mpg123_delete(decoder);
    mpg123_exit();
    return false;
  }

  size_t block_size = mpg123_outblock(decoder);
  unsigned char *buffer = malloc(block_size);
  size_t decoded = 0;
  int result = buffer ? mpg123_read(decoder, buffer, block_size, &decoded)
                      : MPG123_ERR;
  bool ok = buffer && decoded > 0 &&
            (result == MPG123_OK || result == MPG123_DONE || result == MPG123_NEW_FORMAT);

  printf("mp3_decode=%s rate=%ld channels=%d encoding=%d decoded=%zu\n",
         ok ? "pass" : "fail", rate, channels, encoding, decoded);

  free(buffer);
  mpg123_close(decoder);
  mpg123_delete(decoder);
  mpg123_exit();
  return ok;
}

static bool probe_wav(NativeState *state) {
  char path[PATH_MAX];
  if (!join_path(path, sizeof(path), state->base_path,
                 "assets/WAVE140_1.wav")) {
    return false;
  }

  SDL_AudioSpec spec;
  Uint8 *audio_buffer = NULL;
  Uint32 audio_length = 0;
  if (!SDL_LoadWAV(path, &spec, &audio_buffer, &audio_length)) {
    fprintf(stderr, "SDL_LoadWAV failed: %s\n", SDL_GetError());
    return false;
  }

  SDL_AudioStream *stream = SDL_OpenAudioDeviceStream(
      SDL_AUDIO_DEVICE_DEFAULT_PLAYBACK, &spec, NULL, NULL);
  if (!stream) {
    fprintf(stderr, "SDL_OpenAudioDeviceStream failed: %s\n", SDL_GetError());
    SDL_free(audio_buffer);
    return false;
  }

  bool ok = SDL_PutAudioStreamData(stream, audio_buffer, (int)audio_length) &&
            SDL_ResumeAudioStreamDevice(stream);
  if (!ok) {
    fprintf(stderr, "SDL audio queue failed: %s\n", SDL_GetError());
  } else {
    SDL_Delay(80);
  }

  SDL_DestroyAudioStream(stream);
  SDL_free(audio_buffer);
  printf("wav_playback=%s bytes=%u\n", ok ? "pass" : "fail", audio_length);
  return ok;
}

static const char *key_name(SDL_Keycode keycode) {
  switch (keycode) {
    case SDLK_UP:
      return "up";
    case SDLK_DOWN:
      return "down";
    case SDLK_LEFT:
      return "left";
    case SDLK_RIGHT:
      return "right";
    case SDLK_RETURN:
      return "enter";
    case SDLK_ESCAPE:
      return "escape";
    default:
      return NULL;
  }
}

static bool dispatch_sdl_event(NativeState *state, const SDL_Event *event,
                               bool *quit_out) {
  if (event->type == SDL_EVENT_QUIT) {
    *quit_out = true;
    return true;
  }
  if (event->type != SDL_EVENT_KEY_DOWN || event->key.repeat) {
    return true;
  }

  const char *name = key_name(event->key.key);
  if (!name) {
    return true;
  }
  if (!js_call_key(state, name)) {
    return false;
  }

  int quit = 0;
  if (!js_call_int(state, "nativeGetQuit", &quit)) {
    return false;
  }
  *quit_out = quit != 0;
  return true;
}

static bool render_frame(NativeState *state) {
  int selected = 0;
  int locale_index = 0;
  if (!js_call_int(state, "nativeGetSelected", &selected) ||
      !js_call_int(state, "nativeGetLocaleIndex", &locale_index)) {
    return false;
  }
  if (selected < 0 || selected >= MENU_COUNT || locale_index < 0 ||
      locale_index >= LOCALE_COUNT) {
    return false;
  }

  SDL_SetRenderDrawColor(state->renderer, 20, 36, 60, 255);
  SDL_RenderClear(state->renderer);

  if (state->sprite_texture) {
    SDL_FRect destination = {352.0f, 32.0f, 240.0f, 160.0f};
    SDL_RenderTexture(state->renderer, state->sprite_texture, NULL, &destination);
  }

  SDL_SetRenderDrawColor(state->renderer, 245, 245, 245, 255);
  SDL_RenderDebugText(state->renderer, 36.0f, 28.0f,
                      "Pikachu Volleyball native feasibility spike");
  SDL_RenderDebugText(state->renderer, 36.0f, 48.0f,
                      "SDL3 rendering/input + QuickJS state + real assets");

  for (int index = 0; index < MENU_COUNT; index += 1) {
    char line[128];
    if (index == 1) {
      snprintf(line, sizeof(line), "%s %s: %s", selected == index ? ">" : " ",
               kMenuLabels[index], kLocales[locale_index]);
    } else {
      snprintf(line, sizeof(line), "%s %s", selected == index ? ">" : " ",
               kMenuLabels[index]);
    }
    SDL_RenderDebugText(state->renderer, 64.0f, 132.0f + index * 28.0f, line);
  }

  SDL_RenderDebugText(state->renderer, 36.0f, 248.0f,
                      "Up/Down navigate | Left/Right language | Enter activate");
  SDL_RenderDebugText(state->renderer, 36.0f, 268.0f, "Esc exits");

  char title[160];
  snprintf(title, sizeof(title), "Pikachu Volleyball Native Spike [%s]",
           kLocales[locale_index]);
  SDL_SetWindowTitle(state->window, title);
  SDL_RenderPresent(state->renderer);
  return true;
}

static bool process_audio_request(NativeState *state) {
  int requests = 0;
  if (!js_call_int(state, "nativeGetAudioRequests", &requests)) {
    return false;
  }
  if (requests > state->last_audio_request) {
    if (!probe_wav(state)) {
      return false;
    }
    state->last_audio_request = requests;
  }
  return true;
}

static bool push_test_key(SDL_Keycode keycode) {
  SDL_Event event;
  SDL_zero(event);
  event.type = SDL_EVENT_KEY_DOWN;
  event.key.key = keycode;
  event.key.repeat = false;
  return SDL_PushEvent(&event);
}

static bool run_self_test(NativeState *state) {
  if (!verify_locales(state) || !probe_mp3(state)) {
    return false;
  }

  if (!push_test_key(SDLK_DOWN) || !push_test_key(SDLK_RIGHT) ||
      !push_test_key(SDLK_DOWN) || !push_test_key(SDLK_RETURN)) {
    fprintf(stderr, "Unable to push synthetic SDL input events: %s\n",
            SDL_GetError());
    return false;
  }

  bool quit = false;
  SDL_Event event;
  int handled = 0;
  while (SDL_PollEvent(&event)) {
    if (!dispatch_sdl_event(state, &event, &quit)) {
      return false;
    }
    handled += 1;
  }

  if (!process_audio_request(state) || !render_frame(state)) {
    return false;
  }

  int selected = -1;
  int locale_index = -1;
  int audio_requests = -1;
  int quit_value = -1;
  if (!js_call_int(state, "nativeGetSelected", &selected) ||
      !js_call_int(state, "nativeGetLocaleIndex", &locale_index) ||
      !js_call_int(state, "nativeGetAudioRequests", &audio_requests) ||
      !js_call_int(state, "nativeGetQuit", &quit_value)) {
    return false;
  }

  bool ok = handled >= 4 && selected == 2 && locale_index == 1 &&
            audio_requests == 1 && quit_value == 0;
  printf("input_path=%s events=%d selected=%d locale=%s audio_requests=%d\n",
         ok ? "pass" : "fail", handled, selected,
         locale_index >= 0 && locale_index < LOCALE_COUNT ? kLocales[locale_index]
                                                          : "invalid",
         audio_requests);
  printf("render_path=%s sprite=%dx%d\n",
         state->sprite_texture ? "pass" : "fail", state->sprite_width,
         state->sprite_height);
  printf("quickjs_state=%s\n", ok ? "pass" : "fail");
  return ok && state->sprite_texture != NULL;
}

static void destroy_state(NativeState *state) {
  if (state->sprite_texture) {
    SDL_DestroyTexture(state->sprite_texture);
  }
  if (state->renderer) {
    SDL_DestroyRenderer(state->renderer);
  }
  if (state->window) {
    SDL_DestroyWindow(state->window);
  }
  if (state->context) {
    JS_FreeContext(state->context);
  }
  if (state->runtime) {
    JS_FreeRuntime(state->runtime);
  }
  SDL_Quit();
}

int main(int argc, char **argv) {
  bool self_test = argc > 1 && strcmp(argv[1], "--self-test") == 0;
  NativeState state;
  memset(&state, 0, sizeof(state));

  const char *base_path = SDL_GetBasePath();
  if (!base_path || strlen(base_path) >= sizeof(state.base_path)) {
    fprintf(stderr, "Unable to determine executable base path: %s\n",
            SDL_GetError());
    return 2;
  }
  strcpy(state.base_path, base_path);

  if (!SDL_Init(SDL_INIT_VIDEO | SDL_INIT_AUDIO)) {
    fprintf(stderr, "SDL_Init failed: %s\n", SDL_GetError());
    return 2;
  }

  if (!SDL_CreateWindowAndRenderer("Pikachu Volleyball Native Spike", WINDOW_WIDTH,
                                   WINDOW_HEIGHT, 0, &state.window,
                                   &state.renderer)) {
    fprintf(stderr, "SDL_CreateWindowAndRenderer failed: %s\n", SDL_GetError());
    destroy_state(&state);
    return 2;
  }

  char sprite_path[PATH_MAX];
  if (!join_path(sprite_path, sizeof(sprite_path), state.base_path,
                 "assets/sprite_sheet.png")) {
    destroy_state(&state);
    return 2;
  }
  state.sprite_texture = load_png_texture(state.renderer, sprite_path,
                                          &state.sprite_width,
                                          &state.sprite_height);
  if (!state.sprite_texture || !init_quickjs(&state)) {
    destroy_state(&state);
    return 2;
  }

  if (self_test) {
    bool ok = run_self_test(&state);
    printf("native_spike_self_test=%s\n", ok ? "PASS" : "FAIL");
    destroy_state(&state);
    return ok ? 0 : 1;
  }

  if (!verify_locales(&state) || !probe_mp3(&state)) {
    destroy_state(&state);
    return 2;
  }

  bool quit = false;
  while (!quit) {
    SDL_Event event;
    while (SDL_PollEvent(&event)) {
      if (!dispatch_sdl_event(&state, &event, &quit)) {
        destroy_state(&state);
        return 2;
      }
    }
    if (!process_audio_request(&state) || !render_frame(&state)) {
      destroy_state(&state);
      return 2;
    }
    SDL_Delay(16);
  }

  destroy_state(&state);
  return 0;
}
