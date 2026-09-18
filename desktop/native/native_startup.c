#include "native_startup.h"

#include <stdio.h>
#include <string.h>

typedef struct NativeStartupMessages {
  const char *base_path;
  const char *platform_paths;
  const char *sdl;
  const char *window;
  const char *renderer;
  const char *ui;
  const char *assets;
  const char *javascript;
  const char *preferences;
} NativeStartupMessages;

static const NativeStartupMessages kEnglish = {
    "Could not locate the application files.",
    "Could not initialize application storage.",
    "Could not initialize the SDL platform.",
    "Could not create the game window.",
    "Could not configure the game renderer.",
    "Could not initialize the native menu or accessibility support.",
    "Could not load the required game assets.",
    "Could not initialize application logic.",
    "Could not save migrated preferences.",
};

static const NativeStartupMessages kSpanish = {
    "No se pudieron localizar los archivos de la aplicación.",
    "No se pudo inicializar el almacenamiento de la aplicación.",
    "No se pudo inicializar la plataforma SDL.",
    "No se pudo crear la ventana del juego.",
    "No se pudo configurar el renderizador del juego.",
    "No se pudo inicializar el menú nativo o la accesibilidad.",
    "No se pudieron cargar los recursos necesarios del juego.",
    "No se pudo inicializar la lógica de la aplicación.",
    "No se pudieron guardar las preferencias migradas.",
};

static const NativeStartupMessages kCatalan = {
    "No s'han pogut localitzar els fitxers de l'aplicació.",
    "No s'ha pogut inicialitzar l'emmagatzematge de l'aplicació.",
    "No s'ha pogut inicialitzar la plataforma SDL.",
    "No s'ha pogut crear la finestra del joc.",
    "No s'ha pogut configurar el renderitzador del joc.",
    "No s'ha pogut inicialitzar el menú natiu o l'accessibilitat.",
    "No s'han pogut carregar els recursos necessaris del joc.",
    "No s'ha pogut inicialitzar la lògica de l'aplicació.",
    "No s'han pogut desar les preferències migrades.",
};

static const NativeStartupMessages kKorean = {
    "애플리케이션 파일을 찾을 수 없습니다.",
    "애플리케이션 저장소를 초기화할 수 없습니다.",
    "SDL 플랫폼을 초기화할 수 없습니다.",
    "게임 창을 만들 수 없습니다.",
    "게임 렌더러를 구성할 수 없습니다.",
    "네이티브 메뉴 또는 접근성 지원을 초기화할 수 없습니다.",
    "필수 게임 리소스를 불러올 수 없습니다.",
    "애플리케이션 로직을 초기화할 수 없습니다.",
    "마이그레이션한 환경설정을 저장할 수 없습니다.",
};

static const NativeStartupMessages kChinese = {
    "无法找到应用程序文件。",
    "无法初始化应用程序存储。",
    "无法初始化 SDL 平台。",
    "无法创建游戏窗口。",
    "无法配置游戏渲染器。",
    "无法初始化原生菜单或无障碍支持。",
    "无法加载所需的游戏资源。",
    "无法初始化应用程序逻辑。",
    "无法保存迁移后的偏好设置。",
};

static bool starts_with_locale(const char *language, const char *prefix) {
  if (!language || !prefix) return false;
  size_t length = strlen(prefix);
  if (strncmp(language, prefix, length) != 0) return false;
  char next = language[length];
  return next == '\0' || next == '-' || next == '_' || next == '.';
}

const char *native_startup_normalize_locale(const char *language) {
  if (starts_with_locale(language, "es")) return "es-ar";
  if (starts_with_locale(language, "ca")) return "ca";
  if (starts_with_locale(language, "ko")) return "ko";
  if (starts_with_locale(language, "zh")) return "zh";
  return "en";
}

static const NativeStartupMessages *messages_for_locale(const char *locale) {
  const char *normalized = native_startup_normalize_locale(locale);
  if (strcmp(normalized, "es-ar") == 0) return &kSpanish;
  if (strcmp(normalized, "ca") == 0) return &kCatalan;
  if (strcmp(normalized, "ko") == 0) return &kKorean;
  if (strcmp(normalized, "zh") == 0) return &kChinese;
  return &kEnglish;
}

const char *native_startup_error_message(const char *locale,
                                         NativeStartupError error) {
  const NativeStartupMessages *messages = messages_for_locale(locale);
  switch (error) {
    case NATIVE_STARTUP_ERROR_BASE_PATH:
      return messages->base_path;
    case NATIVE_STARTUP_ERROR_PLATFORM_PATHS:
      return messages->platform_paths;
    case NATIVE_STARTUP_ERROR_SDL:
      return messages->sdl;
    case NATIVE_STARTUP_ERROR_WINDOW:
      return messages->window;
    case NATIVE_STARTUP_ERROR_RENDERER:
      return messages->renderer;
    case NATIVE_STARTUP_ERROR_UI:
      return messages->ui;
    case NATIVE_STARTUP_ERROR_ASSETS:
      return messages->assets;
    case NATIVE_STARTUP_ERROR_JAVASCRIPT:
      return messages->javascript;
    case NATIVE_STARTUP_ERROR_PREFERENCES:
      return messages->preferences;
    default:
      return messages->javascript;
  }
}

void native_startup_report_error(const char *locale, NativeStartupError error,
                                 const char *detail, SDL_Window *window) {
  const char *message = native_startup_error_message(locale, error);
  char combined[1536];
  if (detail && detail[0] != '\0') {
    snprintf(combined, sizeof(combined), "%s\n\n%s", message, detail);
  } else {
    snprintf(combined, sizeof(combined), "%s", message);
  }
  fprintf(stderr, "%s\n", combined);
  if (window) {
    (void)SDL_ShowSimpleMessageBox(SDL_MESSAGEBOX_ERROR, "Pikachu Volleyball",
                                   combined, window);
  }
}

void native_startup_checkpoint(const char *checkpoint) {
  if (checkpoint && checkpoint[0] != '\0') {
    printf("native_startup_checkpoint=%s\n", checkpoint);
  }
}

bool native_startup_self_test(void) {
  static const char *inputs[] = {
      "en_US.UTF-8", "es_AR.UTF-8", "ca_ES.UTF-8", "ko_KR.UTF-8",
      "zh_CN.UTF-8",
  };
  static const char *expected[] = {"en", "es-ar", "ca", "ko", "zh"};
  for (size_t index = 0; index < sizeof(inputs) / sizeof(inputs[0]); index += 1) {
    const char *locale = native_startup_normalize_locale(inputs[index]);
    const char *message =
        native_startup_error_message(locale, NATIVE_STARTUP_ERROR_JAVASCRIPT);
    if (strcmp(locale, expected[index]) != 0 || !message || message[0] == '\0') {
      return false;
    }
    printf("native_startup_locale[%s]=PASS\n", locale);
  }
  return true;
}
