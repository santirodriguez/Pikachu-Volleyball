#ifndef PIKACHU_VOLLEYBALL_NATIVE_AUDIO_H
#define PIKACHU_VOLLEYBALL_NATIVE_AUDIO_H

#include <SDL3/SDL.h>

#include <limits.h>
#include <stdbool.h>

#define NATIVE_AUDIO_ASSET_COUNT 8
#define NATIVE_AUDIO_SFX_STREAM_COUNT 8

typedef struct NativeAudioAsset {
  const char *name;
  float *samples;
  int bytes;
} NativeAudioAsset;

typedef struct NativeAudio {
  char base_path[PATH_MAX];
  SDL_AudioDeviceID device;
  SDL_AudioStream *bgm_stream;
  SDL_AudioStream *sfx_streams[NATIVE_AUDIO_SFX_STREAM_COUNT];
  NativeAudioAsset assets[NATIVE_AUDIO_ASSET_COUNT];
  bool loaded;
  bool bgm_playing;
  bool muted;
  int next_sfx_stream;
} NativeAudio;

bool native_audio_init(NativeAudio *audio, const char *base_path);
void native_audio_destroy(NativeAudio *audio);
bool native_audio_play(NativeAudio *audio, const char *sound, float volume,
                       float pan, bool loop);
bool native_audio_stop(NativeAudio *audio, const char *sound);
bool native_audio_set_bgm_gain(NativeAudio *audio, float volume);
bool native_audio_set_muted(NativeAudio *audio, bool muted);
bool native_audio_pump(NativeAudio *audio);
bool native_audio_self_test(NativeAudio *audio);

#endif
