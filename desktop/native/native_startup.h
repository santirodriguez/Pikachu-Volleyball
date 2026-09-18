#ifndef PIKACHU_VOLLEYBALL_NATIVE_STARTUP_H
#define PIKACHU_VOLLEYBALL_NATIVE_STARTUP_H

#include <SDL3/SDL.h>

#include <stdbool.h>

typedef enum NativeStartupError {
  NATIVE_STARTUP_ERROR_BASE_PATH = 0,
  NATIVE_STARTUP_ERROR_PLATFORM_PATHS,
  NATIVE_STARTUP_ERROR_SDL,
  NATIVE_STARTUP_ERROR_WINDOW,
  NATIVE_STARTUP_ERROR_RENDERER,
  NATIVE_STARTUP_ERROR_UI,
  NATIVE_STARTUP_ERROR_ASSETS,
  NATIVE_STARTUP_ERROR_JAVASCRIPT,
  NATIVE_STARTUP_ERROR_PREFERENCES,
} NativeStartupError;

const char *native_startup_normalize_locale(const char *language);
const char *native_startup_error_message(const char *locale,
                                         NativeStartupError error);
void native_startup_report_error(const char *locale, NativeStartupError error,
                                 const char *detail, SDL_Window *window);
void native_startup_checkpoint(const char *checkpoint);
bool native_startup_self_test(void);

#endif
