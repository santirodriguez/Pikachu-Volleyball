#define _POSIX_C_SOURCE 200809L

#include <arpa/inet.h>
#include <ctype.h>
#include <errno.h>
#include <netdb.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/socket.h>
#include <sys/types.h>
#include <sys/wait.h>
#include <unistd.h>

#define MAX_INPUT_BYTES 16384
#define MAX_MESSAGE_BYTES 65536
#define MAX_URL_BYTES 4096
#define MAX_HOST_BYTES 256
#define EXTENSION_EVENT "openExternal"

static int fill_random(unsigned char *buffer, size_t length) {
  FILE *file = fopen("/dev/urandom", "rb");
  if (file == NULL) return -1;
  const size_t read_bytes = fread(buffer, 1, length, file);
  fclose(file);
  return read_bytes == length ? 0 : -1;
}

static char *read_stdin_json(void) {
  char *buffer = calloc(MAX_INPUT_BYTES + 1, 1);
  if (buffer == NULL) return NULL;
  const size_t read_bytes = fread(buffer, 1, MAX_INPUT_BYTES, stdin);
  if (ferror(stdin) || (!feof(stdin) && read_bytes == MAX_INPUT_BYTES)) {
    free(buffer);
    return NULL;
  }
  buffer[read_bytes] = '\0';
  return buffer;
}

static int hex_value(char value) {
  if (value >= '0' && value <= '9') return value - '0';
  if (value >= 'a' && value <= 'f') return value - 'a' + 10;
  if (value >= 'A' && value <= 'F') return value - 'A' + 10;
  return -1;
}

static int json_extract_string(const char *json, const char *key, char *output,
                               size_t output_size) {
  char pattern[128];
  if (snprintf(pattern, sizeof(pattern), "\"%s\"", key) < 0) return 0;
  const char *cursor = strstr(json, pattern);
  if (cursor == NULL) return 0;
  cursor += strlen(pattern);
  while (isspace((unsigned char)*cursor)) cursor++;
  if (*cursor != ':') return 0;
  cursor++;
  while (isspace((unsigned char)*cursor)) cursor++;
  if (*cursor != '"') return 0;
  cursor++;

  size_t written = 0;
  while (*cursor != '\0' && *cursor != '"') {
    unsigned char value = (unsigned char)*cursor++;
    if (value == '\\') {
      const char escaped = *cursor++;
      switch (escaped) {
        case '"': value = '"'; break;
        case '\\': value = '\\'; break;
        case '/': value = '/'; break;
        case 'b': value = '\b'; break;
        case 'f': value = '\f'; break;
        case 'n': value = '\n'; break;
        case 'r': value = '\r'; break;
        case 't': value = '\t'; break;
        case 'u': {
          int codepoint = 0;
          for (int index = 0; index < 4; index++) {
            const int digit = hex_value(cursor[index]);
            if (digit < 0) return 0;
            codepoint = (codepoint << 4) | digit;
          }
          cursor += 4;
          if (codepoint > 0x7f) return 0;
          value = (unsigned char)codepoint;
          break;
        }
        default:
          return 0;
      }
    }
    if (written + 1 >= output_size) return 0;
    output[written++] = (char)value;
  }
  if (*cursor != '"') return 0;
  output[written] = '\0';
  return 1;
}

static int is_valid_host(const char *host) {
  const size_t length = strlen(host);
  if (length == 0 || length >= MAX_HOST_BYTES || host[0] == '.' ||
      host[length - 1] == '.' || strstr(host, "..") != NULL) {
    return 0;
  }
  for (size_t index = 0; index < length; index++) {
    const unsigned char value = (unsigned char)host[index];
    if (!(isalnum(value) || value == '-' || value == '.')) return 0;
  }
  return 1;
}

static int contains_unsafe_url_byte(const char *url) {
  for (const unsigned char *cursor = (const unsigned char *)url; *cursor; cursor++) {
    if (*cursor <= 0x20 || *cursor == 0x7f || *cursor == '\\') return 1;
  }
  return 0;
}

static int normalize_allowed_url(const char *input, char *output, size_t output_size) {
  const size_t length = strlen(input);
  if (length == 0 || length >= MAX_URL_BYTES || contains_unsafe_url_byte(input)) return 0;

  const char scheme[] = "https://";
  if (length < sizeof(scheme) - 1) return 0;
  for (size_t index = 0; index < sizeof(scheme) - 1; index++) {
    if (tolower((unsigned char)input[index]) != scheme[index]) return 0;
  }

  const char *authority = input + sizeof(scheme) - 1;
  const char *tail = authority;
  while (*tail != '\0' && *tail != '/' && *tail != '?' && *tail != '#') tail++;
  const size_t authority_length = (size_t)(tail - authority);
  if (authority_length == 0 || authority_length >= MAX_HOST_BYTES + 5) return 0;

  char authority_buffer[MAX_HOST_BYTES + 5];
  memcpy(authority_buffer, authority, authority_length);
  authority_buffer[authority_length] = '\0';
  if (strchr(authority_buffer, '@') != NULL || strchr(authority_buffer, '[') != NULL ||
      strchr(authority_buffer, ']') != NULL) {
    return 0;
  }

  char *port = strrchr(authority_buffer, ':');
  if (port != NULL) {
    if (strcmp(port, ":443") != 0) return 0;
    *port = '\0';
  }

  for (char *cursor = authority_buffer; *cursor; cursor++) {
    *cursor = (char)tolower((unsigned char)*cursor);
  }
  if (!is_valid_host(authority_buffer)) return 0;

  const int website_host =
      strcmp(authority_buffer, "santiagorodriguez.com") == 0 ||
      strcmp(authority_buffer, "www.santiagorodriguez.com") == 0;
  const int github_host = strcmp(authority_buffer, "github.com") == 0;
  if (!website_host && !github_host) return 0;

  if (github_host) {
    const char *path_end = tail;
    while (*path_end != '\0' && *path_end != '?' && *path_end != '#') path_end++;
    const size_t path_length = (size_t)(path_end - tail);
    const char *allowed_path_one = "/santirodriguez/pikachu-volleyball";
    const char *allowed_path_two = "/gorisanson/pikachu-volleyball";
    const int first_match = path_length == strlen(allowed_path_one) &&
                            strncmp(tail, allowed_path_one, path_length) == 0;
    const int second_match = path_length == strlen(allowed_path_two) &&
                             strncmp(tail, allowed_path_two, path_length) == 0;
    if (!first_match && !second_match) return 0;
  }

  const char *normalized_tail = tail;
  char prefixed_tail[MAX_URL_BYTES];
  if (*tail == '\0') {
    normalized_tail = "/";
  } else if (*tail == '?' || *tail == '#') {
    if (snprintf(prefixed_tail, sizeof(prefixed_tail), "/%s", tail) < 0) return 0;
    normalized_tail = prefixed_tail;
  }

  const int written = snprintf(output, output_size, "https://%s%s", authority_buffer,
                               normalized_tail);
  return written > 0 && (size_t)written < output_size;
}

static int connect_localhost(const char *port) {
  struct addrinfo hints;
  struct addrinfo *addresses = NULL;
  memset(&hints, 0, sizeof(hints));
  hints.ai_family = AF_INET;
  hints.ai_socktype = SOCK_STREAM;

  if (getaddrinfo("127.0.0.1", port, &hints, &addresses) != 0) return -1;
  int fd = -1;
  for (struct addrinfo *address = addresses; address != NULL; address = address->ai_next) {
    fd = socket(address->ai_family, address->ai_socktype, address->ai_protocol);
    if (fd < 0) continue;
    if (connect(fd, address->ai_addr, address->ai_addrlen) == 0) break;
    close(fd);
    fd = -1;
  }
  freeaddrinfo(addresses);
  return fd;
}

static int send_all(int fd, const unsigned char *buffer, size_t length) {
  size_t sent = 0;
  while (sent < length) {
    const ssize_t result = send(fd, buffer + sent, length - sent, 0);
    if (result <= 0) return -1;
    sent += (size_t)result;
  }
  return 0;
}

static int read_exact(int fd, unsigned char *buffer, size_t length) {
  size_t received = 0;
  while (received < length) {
    const ssize_t result = recv(fd, buffer + received, length - received, 0);
    if (result <= 0) return -1;
    received += (size_t)result;
  }
  return 0;
}

static void base64_encode_16(const unsigned char input[16], char output[25]) {
  static const char alphabet[] =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  size_t in_index = 0;
  size_t out_index = 0;
  while (in_index + 3 <= 15) {
    const uint32_t value = ((uint32_t)input[in_index] << 16) |
                           ((uint32_t)input[in_index + 1] << 8) |
                           input[in_index + 2];
    output[out_index++] = alphabet[(value >> 18) & 0x3f];
    output[out_index++] = alphabet[(value >> 12) & 0x3f];
    output[out_index++] = alphabet[(value >> 6) & 0x3f];
    output[out_index++] = alphabet[value & 0x3f];
    in_index += 3;
  }
  const uint32_t value = ((uint32_t)input[15] << 16);
  output[out_index++] = alphabet[(value >> 18) & 0x3f];
  output[out_index++] = alphabet[(value >> 12) & 0x3f];
  output[out_index++] = '=';
  output[out_index++] = '=';
  output[out_index] = '\0';
}

static int websocket_handshake(int fd, const char *port, const char *extension_id,
                               const char *connect_token) {
  unsigned char nonce[16];
  char key[25];
  if (fill_random(nonce, sizeof(nonce)) != 0) return -1;
  base64_encode_16(nonce, key);

  char request[4096];
  const int request_length = snprintf(
      request, sizeof(request),
      "GET /?extensionId=%s&connectToken=%s HTTP/1.1\r\n"
      "Host: 127.0.0.1:%s\r\n"
      "Upgrade: websocket\r\n"
      "Connection: Upgrade\r\n"
      "Sec-WebSocket-Key: %s\r\n"
      "Sec-WebSocket-Version: 13\r\n\r\n",
      extension_id, connect_token, port, key);
  if (request_length <= 0 || (size_t)request_length >= sizeof(request)) return -1;
  if (send_all(fd, (const unsigned char *)request, (size_t)request_length) != 0) return -1;

  char response[8192];
  size_t used = 0;
  while (used + 1 < sizeof(response)) {
    unsigned char byte = 0;
    if (read_exact(fd, &byte, 1) != 0) return -1;
    response[used++] = (char)byte;
    response[used] = '\0';
    if (used >= 4 && memcmp(response + used - 4, "\r\n\r\n", 4) == 0) break;
  }
  if (used + 1 >= sizeof(response)) return -1;
  if (strncmp(response, "HTTP/1.1 101", 12) != 0 &&
      strncmp(response, "HTTP/1.0 101", 12) != 0) {
    return -1;
  }
  return 0;
}

static int websocket_send_frame(int fd, unsigned char opcode,
                                const unsigned char *payload, size_t length) {
  if (length > 125) return -1;
  unsigned char header[6];
  unsigned char mask[4];
  if (fill_random(mask, sizeof(mask)) != 0) return -1;
  header[0] = (unsigned char)(0x80 | (opcode & 0x0f));
  header[1] = (unsigned char)(0x80 | length);
  memcpy(header + 2, mask, sizeof(mask));
  if (send_all(fd, header, sizeof(header)) != 0) return -1;
  unsigned char encoded[125];
  for (size_t index = 0; index < length; index++) {
    encoded[index] = payload[index] ^ mask[index % 4];
  }
  return send_all(fd, encoded, length);
}

static int spawn_xdg_open(const char *url) {
  pid_t pid = fork();
  if (pid < 0) return -1;
  if (pid == 0) {
    execlp("xdg-open", "xdg-open", url, (char *)NULL);
    _exit(127);
  }
  int status = 0;
  if (waitpid(pid, &status, 0) < 0) return -1;
  return WIFEXITED(status) && WEXITSTATUS(status) == 0 ? 0 : -1;
}

static void handle_extension_message(const char *message) {
  char event_name[128];
  char candidate[MAX_URL_BYTES];
  char normalized[MAX_URL_BYTES];
  if (!json_extract_string(message, "event", event_name, sizeof(event_name))) return;
  if (strcmp(event_name, EXTENSION_EVENT) != 0) return;
  if (!json_extract_string(message, "url", candidate, sizeof(candidate))) return;
  if (!normalize_allowed_url(candidate, normalized, sizeof(normalized))) {
    fprintf(stderr, "PV_EXTERNAL_LINK rejected\n");
    return;
  }
  if (spawn_xdg_open(normalized) != 0) {
    fprintf(stderr, "PV_EXTERNAL_LINK open_failed\n");
    return;
  }
  fprintf(stderr, "PV_EXTERNAL_LINK opened %s\n", normalized);
}

static int websocket_loop(int fd) {
  unsigned char message[MAX_MESSAGE_BYTES + 1];
  size_t message_length = 0;
  int fragmented_text = 0;

  for (;;) {
    unsigned char initial[2];
    if (read_exact(fd, initial, sizeof(initial)) != 0) return 0;
    const int fin = (initial[0] & 0x80) != 0;
    const unsigned char opcode = initial[0] & 0x0f;
    const int masked = (initial[1] & 0x80) != 0;
    uint64_t length = initial[1] & 0x7f;
    if (masked) return -1;

    if (length == 126) {
      unsigned char extended[2];
      if (read_exact(fd, extended, sizeof(extended)) != 0) return -1;
      length = ((uint64_t)extended[0] << 8) | extended[1];
    } else if (length == 127) {
      unsigned char extended[8];
      if (read_exact(fd, extended, sizeof(extended)) != 0) return -1;
      length = 0;
      for (size_t index = 0; index < sizeof(extended); index++) {
        length = (length << 8) | extended[index];
      }
    }
    if (length > MAX_MESSAGE_BYTES) return -1;

    unsigned char payload[MAX_MESSAGE_BYTES];
    if (length > 0 && read_exact(fd, payload, (size_t)length) != 0) return -1;

    if (opcode == 0x8) {
      websocket_send_frame(fd, 0x8, payload, (size_t)(length > 125 ? 0 : length));
      return 0;
    }
    if (opcode == 0x9) {
      if (length > 125 || websocket_send_frame(fd, 0xA, payload, (size_t)length) != 0) return -1;
      continue;
    }
    if (opcode == 0xA) continue;

    if (opcode == 0x1) {
      message_length = 0;
      fragmented_text = !fin;
    } else if (opcode == 0x0) {
      if (!fragmented_text) return -1;
    } else {
      continue;
    }

    if (message_length + length > MAX_MESSAGE_BYTES) return -1;
    memcpy(message + message_length, payload, (size_t)length);
    message_length += (size_t)length;
    if (fin) {
      message[message_length] = '\0';
      handle_extension_message((const char *)message);
      message_length = 0;
      fragmented_text = 0;
    }
  }
}

static int run_extension(void) {
  char *bootstrap = read_stdin_json();
  if (bootstrap == NULL) return 1;

  char port[16];
  char connect_token[1024];
  char extension_id[256];
  const int valid =
      json_extract_string(bootstrap, "nlPort", port, sizeof(port)) &&
      json_extract_string(bootstrap, "nlConnectToken", connect_token, sizeof(connect_token)) &&
      json_extract_string(bootstrap, "nlExtensionId", extension_id, sizeof(extension_id));
  free(bootstrap);
  if (!valid) return 1;

  char *end = NULL;
  errno = 0;
  const long numeric_port = strtol(port, &end, 10);
  if (errno != 0 || end == port || *end != '\0' || numeric_port < 1 || numeric_port > 65535) return 1;

  const int fd = connect_localhost(port);
  if (fd < 0) return 1;
  if (websocket_handshake(fd, port, extension_id, connect_token) != 0) {
    close(fd);
    return 1;
  }
  const int result = websocket_loop(fd);
  close(fd);
  return result == 0 ? 0 : 1;
}

int main(int argc, char **argv) {
  if (argc == 3 && strcmp(argv[1], "--check-url") == 0) {
    char normalized[MAX_URL_BYTES];
    if (!normalize_allowed_url(argv[2], normalized, sizeof(normalized))) return 2;
    puts(normalized);
    return 0;
  }
  if (argc != 1) return 2;
  return run_extension();
}
