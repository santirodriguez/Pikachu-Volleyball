#include "native_audio.h"

#include <mpg123.h>

#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define NATIVE_AUDIO_RATE 44100
#define NATIVE_AUDIO_CHANNELS 2

typedef struct NativeAudioAssetDefinition {
  const char *name;
  const char *file;
  bool mp3;
} NativeAudioAssetDefinition;

static const NativeAudioAssetDefinition kAssetDefinitions[NATIVE_AUDIO_ASSET_COUNT] = {
    {"bgm", "assets/bgm.mp3", true},
    {"pipikachu", "assets/WAVE140_1.wav", false},
    {"pika", "assets/WAVE141_1.wav", false},
    {"chu", "assets/WAVE142_1.wav", false},
    {"pi", "assets/WAVE143_1.wav", false},
    {"pikachu", "assets/WAVE144_1.wav", false},
    {"powerHit", "assets/WAVE145_1.wav", false},
    {"ballTouchesGround", "assets/WAVE146_1.wav", false},
};

static SDL_AudioSpec target_spec(void) {
  SDL_AudioSpec spec;
  SDL_zero(spec);
  spec.format = SDL_AUDIO_F32;
  spec.channels = NATIVE_AUDIO_CHANNELS;
  spec.freq = NATIVE_AUDIO_RATE;
  return spec;
}

static bool join_path(char *output, size_t output_size, const char *base,
                      const char *relative) {
  int written = snprintf(output, output_size, "%s%s", base, relative);
  return written > 0 && (size_t)written < output_size;
}

static bool convert_samples(const SDL_AudioSpec *source_spec,
                            const Uint8 *source, int source_bytes,
                            NativeAudioAsset *asset) {
  SDL_AudioSpec destination = target_spec();
  Uint8 *converted = NULL;
  int converted_bytes = 0;
  if (!SDL_ConvertAudioSamples(source_spec, source, source_bytes, &destination,
                               &converted, &converted_bytes)) {
    fprintf(stderr, "SDL_ConvertAudioSamples failed: %s\n", SDL_GetError());
    return false;
  }
  if (!converted || converted_bytes <= 0 ||
      converted_bytes % (int)(sizeof(float) * NATIVE_AUDIO_CHANNELS) != 0) {
    if (converted) SDL_free(converted);
    fprintf(stderr, "Converted native audio asset is malformed\n");
    return false;
  }
  asset->samples = (float *)converted;
  asset->bytes = converted_bytes;
  return true;
}

static bool load_wav_asset(const char *path, NativeAudioAsset *asset) {
  SDL_AudioSpec source_spec;
  Uint8 *source = NULL;
  Uint32 source_bytes = 0;
  if (!SDL_LoadWAV(path, &source_spec, &source, &source_bytes)) {
    fprintf(stderr, "SDL_LoadWAV failed for %s: %s\n", path, SDL_GetError());
    return false;
  }
  bool ok = convert_samples(&source_spec, source, (int)source_bytes, asset);
  SDL_free(source);
  return ok;
}

static bool append_bytes(Uint8 **buffer, size_t *length, size_t *capacity,
                         const Uint8 *chunk, size_t chunk_length) {
  if (chunk_length == 0) return true;
  if (*length > SIZE_MAX - chunk_length) return false;
  size_t required = *length + chunk_length;
  if (required > *capacity) {
    size_t next = *capacity == 0 ? 65536 : *capacity;
    while (next < required) {
      if (next > SIZE_MAX / 2) {
        next = required;
        break;
      }
      next *= 2;
    }
    Uint8 *resized = realloc(*buffer, next);
    if (!resized) return false;
    *buffer = resized;
    *capacity = next;
  }
  memcpy(*buffer + *length, chunk, chunk_length);
  *length += chunk_length;
  return true;
}

static bool load_mp3_asset(const char *path, NativeAudioAsset *asset) {
  if (mpg123_init() != MPG123_OK) {
    fprintf(stderr, "mpg123_init failed\n");
    return false;
  }

  int error = MPG123_OK;
  mpg123_handle *decoder = mpg123_new(NULL, &error);
  if (!decoder) {
    fprintf(stderr, "mpg123_new failed: %d\n", error);
    mpg123_exit();
    return false;
  }

  bool ok = false;
  Uint8 *decoded = NULL;
  size_t decoded_length = 0;
  size_t decoded_capacity = 0;
  Uint8 *chunk = NULL;

  if (mpg123_format_none(decoder) != MPG123_OK ||
      mpg123_format(decoder, NATIVE_AUDIO_RATE, MPG123_STEREO,
                    MPG123_ENC_SIGNED_16) != MPG123_OK ||
      mpg123_open(decoder, path) != MPG123_OK) {
    fprintf(stderr, "mpg123 could not configure/open %s\n", path);
    goto cleanup;
  }

  long rate = 0;
  int channels = 0;
  int encoding = 0;
  if (mpg123_getformat(decoder, &rate, &channels, &encoding) != MPG123_OK ||
      rate != NATIVE_AUDIO_RATE || channels != MPG123_STEREO ||
      encoding != MPG123_ENC_SIGNED_16) {
    fprintf(stderr, "Unexpected mpg123 output format for %s\n", path);
    goto cleanup;
  }

  size_t block = mpg123_outblock(decoder);
  if (block == 0) goto cleanup;
  chunk = malloc(block);
  if (!chunk) goto cleanup;

  for (;;) {
    size_t done = 0;
    int result = mpg123_read(decoder, chunk, block, &done);
    if (!append_bytes(&decoded, &decoded_length, &decoded_capacity, chunk,
                      done)) {
      goto cleanup;
    }
    if (result == MPG123_DONE) break;
    if (result == MPG123_NEW_FORMAT || result == MPG123_OK) continue;
    fprintf(stderr, "mpg123_read failed for %s: %s\n", path,
            mpg123_strerror(decoder));
    goto cleanup;
  }

  if (decoded_length == 0 || decoded_length > INT_MAX) goto cleanup;
  SDL_AudioSpec source_spec;
  SDL_zero(source_spec);
  source_spec.format = SDL_AUDIO_S16;
  source_spec.channels = NATIVE_AUDIO_CHANNELS;
  source_spec.freq = NATIVE_AUDIO_RATE;
  ok = convert_samples(&source_spec, decoded, (int)decoded_length, asset);

cleanup:
  free(chunk);
  free(decoded);
  mpg123_close(decoder);
  mpg123_delete(decoder);
  mpg123_exit();
  return ok;
}

static NativeAudioAsset *find_asset(NativeAudio *audio, const char *name) {
  for (int index = 0; index < NATIVE_AUDIO_ASSET_COUNT; index += 1) {
    if (audio->assets[index].name &&
        strcmp(audio->assets[index].name, name) == 0) {
      return &audio->assets[index];
    }
  }
  return NULL;
}

static bool create_streams(NativeAudio *audio) {
  SDL_AudioSpec source_spec = target_spec();
  audio->device =
      SDL_OpenAudioDevice(SDL_AUDIO_DEVICE_DEFAULT_PLAYBACK, &source_spec);
  if (!audio->device) {
    fprintf(stderr, "SDL_OpenAudioDevice failed: %s\n", SDL_GetError());
    return false;
  }

  audio->bgm_stream = SDL_CreateAudioStream(&source_spec, NULL);
  if (!audio->bgm_stream ||
      !SDL_BindAudioStream(audio->device, audio->bgm_stream)) {
    fprintf(stderr, "Unable to create/bind BGM audio stream: %s\n",
            SDL_GetError());
    return false;
  }

  for (int index = 0; index < NATIVE_AUDIO_SFX_STREAM_COUNT; index += 1) {
    audio->sfx_streams[index] = SDL_CreateAudioStream(&source_spec, NULL);
    if (!audio->sfx_streams[index] ||
        !SDL_BindAudioStream(audio->device, audio->sfx_streams[index])) {
      fprintf(stderr, "Unable to create/bind SFX audio stream: %s\n",
              SDL_GetError());
      return false;
    }
  }

  return SDL_SetAudioDeviceGain(audio->device, audio->muted ? 0.0f : 1.0f);
}

static bool ensure_loaded(NativeAudio *audio) {
  if (audio->loaded) return true;

  for (int index = 0; index < NATIVE_AUDIO_ASSET_COUNT; index += 1) {
    const NativeAudioAssetDefinition *definition = &kAssetDefinitions[index];
    char path[PATH_MAX];
    if (!join_path(path, sizeof(path), audio->base_path, definition->file)) {
      return false;
    }
    audio->assets[index].name = definition->name;
    bool ok = definition->mp3
                  ? load_mp3_asset(path, &audio->assets[index])
                  : load_wav_asset(path, &audio->assets[index]);
    if (!ok) return false;
  }

  if (!create_streams(audio)) return false;
  audio->loaded = true;
  return true;
}

bool native_audio_init(NativeAudio *audio, const char *base_path) {
  memset(audio, 0, sizeof(*audio));
  if (!base_path || strlen(base_path) >= sizeof(audio->base_path)) {
    return false;
  }
  strcpy(audio->base_path, base_path);
  return true;
}

void native_audio_destroy(NativeAudio *audio) {
  if (!audio) return;
  if (audio->bgm_stream) SDL_DestroyAudioStream(audio->bgm_stream);
  for (int index = 0; index < NATIVE_AUDIO_SFX_STREAM_COUNT; index += 1) {
    if (audio->sfx_streams[index]) {
      SDL_DestroyAudioStream(audio->sfx_streams[index]);
    }
  }
  if (audio->device) SDL_CloseAudioDevice(audio->device);
  for (int index = 0; index < NATIVE_AUDIO_ASSET_COUNT; index += 1) {
    if (audio->assets[index].samples) SDL_free(audio->assets[index].samples);
  }
  memset(audio, 0, sizeof(*audio));
}

static bool queue_bgm(NativeAudio *audio, NativeAudioAsset *asset,
                      float volume) {
  if (!SDL_ClearAudioStream(audio->bgm_stream) ||
      !SDL_SetAudioStreamGain(audio->bgm_stream, volume) ||
      !SDL_PutAudioStreamData(audio->bgm_stream, asset->samples,
                              asset->bytes)) {
    fprintf(stderr, "Unable to queue native BGM: %s\n", SDL_GetError());
    return false;
  }
  audio->bgm_playing = true;
  return native_audio_pump(audio);
}

static bool queue_sfx(NativeAudio *audio, NativeAudioAsset *asset,
                      float volume, float pan) {
  int selected = -1;
  for (int offset = 0; offset < NATIVE_AUDIO_SFX_STREAM_COUNT; offset += 1) {
    int index =
        (audio->next_sfx_stream + offset) % NATIVE_AUDIO_SFX_STREAM_COUNT;
    if (SDL_GetAudioStreamQueued(audio->sfx_streams[index]) == 0) {
      selected = index;
      break;
    }
  }
  if (selected < 0) selected = audio->next_sfx_stream;
  audio->next_sfx_stream =
      (selected + 1) % NATIVE_AUDIO_SFX_STREAM_COUNT;

  SDL_AudioStream *stream = audio->sfx_streams[selected];
  if (!SDL_ClearAudioStream(stream)) return false;

  float clamped_pan = pan < -1.0f ? -1.0f : pan > 1.0f ? 1.0f : pan;
  float left_gain = volume;
  float right_gain = volume;
  if (clamped_pan < 0.0f) {
    right_gain *= 1.0f + clamped_pan;
  } else if (clamped_pan > 0.0f) {
    left_gain *= 1.0f - clamped_pan;
  }

  float *mixed = SDL_malloc((size_t)asset->bytes);
  if (!mixed) return false;
  int sample_count = asset->bytes / (int)sizeof(float);
  for (int index = 0; index + 1 < sample_count; index += 2) {
    mixed[index] = asset->samples[index] * left_gain;
    mixed[index + 1] = asset->samples[index + 1] * right_gain;
  }
  bool ok = SDL_PutAudioStreamData(stream, mixed, asset->bytes);
  SDL_free(mixed);
  if (!ok) {
    fprintf(stderr, "Unable to queue native SFX: %s\n", SDL_GetError());
  }
  return ok;
}

bool native_audio_play(NativeAudio *audio, const char *sound, float volume,
                       float pan, bool loop) {
  (void)loop;
  if (!ensure_loaded(audio)) return false;
  NativeAudioAsset *asset = find_asset(audio, sound);
  if (!asset) {
    fprintf(stderr, "Unknown native audio asset: %s\n", sound);
    return false;
  }
  if (strcmp(sound, "bgm") == 0) {
    return queue_bgm(audio, asset, volume);
  }
  return queue_sfx(audio, asset, volume, pan);
}

bool native_audio_stop(NativeAudio *audio, const char *sound) {
  if (!audio->loaded) return true;
  if (strcmp(sound, "bgm") == 0) {
    audio->bgm_playing = false;
    return SDL_ClearAudioStream(audio->bgm_stream);
  }
  for (int index = 0; index < NATIVE_AUDIO_SFX_STREAM_COUNT; index += 1) {
    if (!SDL_ClearAudioStream(audio->sfx_streams[index])) return false;
  }
  return true;
}

bool native_audio_set_muted(NativeAudio *audio, bool muted) {
  audio->muted = muted;
  if (!audio->loaded) return true;
  return SDL_SetAudioDeviceGain(audio->device, muted ? 0.0f : 1.0f);
}

bool native_audio_pump(NativeAudio *audio) {
  if (!audio->loaded || !audio->bgm_playing) return true;
  NativeAudioAsset *bgm = find_asset(audio, "bgm");
  if (!bgm) return false;
  int queued = SDL_GetAudioStreamQueued(audio->bgm_stream);
  if (queued < 0) return false;
  if (queued < bgm->bytes) {
    return SDL_PutAudioStreamData(audio->bgm_stream, bgm->samples, bgm->bytes);
  }
  return true;
}

bool native_audio_self_test(NativeAudio *audio) {
  if (!ensure_loaded(audio) || !SDL_PauseAudioDevice(audio->device)) {
    return false;
  }
  bool ok =
      native_audio_play(audio, "bgm", 0.2f, 0.0f, true) &&
      native_audio_play(audio, "pi", 0.35f, -0.75f, false) &&
      native_audio_play(audio, "powerHit", 0.35f, 0.75f, false) &&
      SDL_GetAudioStreamQueued(audio->bgm_stream) > 0 &&
      native_audio_set_muted(audio, true) &&
      native_audio_set_muted(audio, false) &&
      native_audio_stop(audio, "bgm");
  if (!SDL_ResumeAudioDevice(audio->device)) ok = false;
  printf("native_audio_assets=%d\n", NATIVE_AUDIO_ASSET_COUNT);
  printf("native_audio_mixer=%s\n", ok ? "PASS" : "FAIL");
  return ok;
}
