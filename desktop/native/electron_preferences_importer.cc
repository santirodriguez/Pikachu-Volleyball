#include <leveldb/db.h>
#include <leveldb/iterator.h>
#include <leveldb/options.h>

#include <cstdint>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <map>
#include <memory>
#include <set>
#include <sstream>
#include <string>
#include <utility>
#include <vector>

namespace fs = std::filesystem;

namespace {

const std::vector<std::string> kAcceptedKeys = {
    "pv-offline-graphic",
    "pv-offline-bgm",
    "pv-offline-sfx",
    "pv-offline-speed",
    "pv-offline-winningScore",
    "colorScheme",
    "pv-control-bindings-v1",
};

bool IsAcceptedKey(const std::string& key) {
  for (const std::string& candidate : kAcceptedKeys) {
    if (key == candidate) {
      return true;
    }
  }
  return false;
}

void AppendUtf8(std::string* output, uint32_t codepoint) {
  if (codepoint <= 0x7f) {
    output->push_back(static_cast<char>(codepoint));
  } else if (codepoint <= 0x7ff) {
    output->push_back(static_cast<char>(0xc0 | (codepoint >> 6)));
    output->push_back(static_cast<char>(0x80 | (codepoint & 0x3f)));
  } else if (codepoint <= 0xffff) {
    output->push_back(static_cast<char>(0xe0 | (codepoint >> 12)));
    output->push_back(static_cast<char>(0x80 | ((codepoint >> 6) & 0x3f)));
    output->push_back(static_cast<char>(0x80 | (codepoint & 0x3f)));
  } else {
    output->push_back(static_cast<char>(0xf0 | (codepoint >> 18)));
    output->push_back(static_cast<char>(0x80 | ((codepoint >> 12) & 0x3f)));
    output->push_back(static_cast<char>(0x80 | ((codepoint >> 6) & 0x3f)));
    output->push_back(static_cast<char>(0x80 | (codepoint & 0x3f)));
  }
}

bool DecodeChromiumString(const leveldb::Slice& input, std::string* output,
                          std::string* error) {
  if (input.empty()) {
    *error = "Chromium string is empty";
    return false;
  }

  const uint8_t encoding = static_cast<uint8_t>(input.data()[0]);
  output->clear();
  if (encoding == 1) {
    for (size_t index = 1; index < input.size(); ++index) {
      const uint8_t byte = static_cast<uint8_t>(input.data()[index]);
      AppendUtf8(output, byte);
    }
    return true;
  }

  if (encoding != 0) {
    std::ostringstream message;
    message << "Unsupported Chromium string encoding byte: "
            << static_cast<unsigned>(encoding);
    *error = message.str();
    return false;
  }

  if ((input.size() - 1) % 2 != 0) {
    *error = "Malformed UTF-16 Chromium string";
    return false;
  }

  size_t index = 1;
  while (index < input.size()) {
    uint16_t unit = static_cast<uint8_t>(input.data()[index]) |
                    (static_cast<uint16_t>(
                         static_cast<uint8_t>(input.data()[index + 1]))
                     << 8);
    index += 2;

    uint32_t codepoint = unit;
    if (unit >= 0xd800 && unit <= 0xdbff) {
      if (index + 1 >= input.size()) {
        *error = "Truncated UTF-16 surrogate pair";
        return false;
      }
      uint16_t low = static_cast<uint8_t>(input.data()[index]) |
                     (static_cast<uint16_t>(
                          static_cast<uint8_t>(input.data()[index + 1]))
                      << 8);
      if (low < 0xdc00 || low > 0xdfff) {
        *error = "Invalid UTF-16 surrogate pair";
        return false;
      }
      index += 2;
      codepoint = 0x10000 +
                  ((static_cast<uint32_t>(unit) - 0xd800) << 10) +
                  (static_cast<uint32_t>(low) - 0xdc00);
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      *error = "Unexpected UTF-16 low surrogate";
      return false;
    }
    AppendUtf8(output, codepoint);
  }
  return true;
}

std::string JsonEscape(const std::string& input) {
  std::ostringstream output;
  for (unsigned char ch : input) {
    switch (ch) {
      case '\\':
        output << "\\\\";
        break;
      case '"':
        output << "\\\"";
        break;
      case '\b':
        output << "\\b";
        break;
      case '\f':
        output << "\\f";
        break;
      case '\n':
        output << "\\n";
        break;
      case '\r':
        output << "\\r";
        break;
      case '\t':
        output << "\\t";
        break;
      default:
        if (ch < 0x20) {
          const char* hex = "0123456789abcdef";
          output << "\\u00" << hex[(ch >> 4) & 0xf] << hex[ch & 0xf];
        } else {
          output << static_cast<char>(ch);
        }
    }
  }
  return output.str();
}

struct ObservedValue {
  std::string origin;
  std::string value;
};

bool ParseDataEntry(const leveldb::Slice& raw_key, const leveldb::Slice& raw_value,
                    std::string* key, ObservedValue* observed,
                    std::string* error) {
  if (raw_key.size() < 3 || raw_key.data()[0] != '_') {
    return false;
  }

  size_t separator = 1;
  while (separator < raw_key.size() && raw_key.data()[separator] != '\0') {
    ++separator;
  }
  if (separator >= raw_key.size() || separator + 1 >= raw_key.size()) {
    return false;
  }

  observed->origin.assign(raw_key.data() + 1, separator - 1);
  leveldb::Slice encoded_key(raw_key.data() + separator + 1,
                             raw_key.size() - separator - 1);
  if (!DecodeChromiumString(encoded_key, key, error)) {
    return false;
  }
  if (!IsAcceptedKey(*key)) {
    return false;
  }
  if (!DecodeChromiumString(raw_value, &observed->value, error)) {
    return false;
  }
  return true;
}

}  // namespace

int main(int argc, char** argv) {
  const bool allow_partial =
      argc == 4 && std::string(argv[3]) == "--allow-partial";
  if (argc != 3 && !allow_partial) {
    std::cerr
        << "usage: electron-preferences-importer <leveldb-source> <output.json> [--allow-partial]\n";
    return 2;
  }

  const std::string database_path = argv[1];
  const std::string output_path = argv[2];
  const fs::path copy_path = fs::path(output_path + ".leveldb-copy");
  std::error_code filesystem_error;
  fs::remove_all(copy_path, filesystem_error);
  filesystem_error.clear();
  fs::create_directories(copy_path, filesystem_error);
  if (filesystem_error) {
    std::cerr << "Unable to create temporary LevelDB copy directory: "
              << filesystem_error.message() << "\n";
    return 1;
  }
  fs::copy(database_path, copy_path,
           fs::copy_options::recursive | fs::copy_options::overwrite_existing,
           filesystem_error);
  if (filesystem_error) {
    std::cerr << "Unable to copy Electron LevelDB without modifying source: "
              << filesystem_error.message() << "\n";
    fs::remove_all(copy_path, filesystem_error);
    return 1;
  }

  leveldb::Options options;
  options.create_if_missing = false;
  leveldb::DB* raw_database = nullptr;
  const leveldb::Status open_status =
      leveldb::DB::Open(options, copy_path.string(), &raw_database);
  if (!open_status.ok()) {
    std::cerr << "Unable to open copied Electron localStorage LevelDB: "
              << open_status.ToString() << "\n";
    return 1;
  }
  std::unique_ptr<leveldb::DB> database(raw_database);

  std::map<std::string, std::vector<ObservedValue>> observed;
  std::unique_ptr<leveldb::Iterator> iterator(
      database->NewIterator(leveldb::ReadOptions()));
  for (iterator->SeekToFirst(); iterator->Valid(); iterator->Next()) {
    std::string decoded_key;
    ObservedValue value;
    std::string error;
    if (ParseDataEntry(iterator->key(), iterator->value(), &decoded_key, &value,
                       &error)) {
      observed[decoded_key].push_back(std::move(value));
    } else if (!error.empty()) {
      std::cerr << "Failed to decode accepted-looking LevelDB entry: " << error
                << "\n";
      return 1;
    }
  }
  if (!iterator->status().ok()) {
    std::cerr << "LevelDB iteration failed: " << iterator->status().ToString()
              << "\n";
    return 1;
  }

  std::map<std::string, ObservedValue> selected;
  for (const std::string& key : kAcceptedKeys) {
    const auto found = observed.find(key);
    if (found == observed.end() || found->second.empty()) {
      if (allow_partial) continue;
      std::cerr << "Required preference was not found in Electron LevelDB: "
                << key << "\n";
      return 1;
    }

    const ObservedValue& first = found->second.front();
    for (const ObservedValue& candidate : found->second) {
      if (candidate.value != first.value) {
        std::cerr << "Conflicting Electron values for preference " << key
                  << "; refusing to guess between origins.\n";
        return 1;
      }
    }
    selected[key] = first;
  }

  if (selected.empty()) {
    std::cerr << "No accepted Pikachu Volleyball preferences were found in Electron LevelDB.\n";
    return 1;
  }

  std::ofstream output(output_path, std::ios::binary | std::ios::trunc);
  if (!output) {
    std::cerr << "Unable to create importer output: " << output_path << "\n";
    return 1;
  }

  output << "{\n  \"schema\": 1,\n  \"values\": {\n";
  size_t written_values = 0;
  for (const std::string& key : kAcceptedKeys) {
    const auto found = selected.find(key);
    if (found == selected.end()) continue;
    if (written_values++ > 0) output << ",\n";
    output << "    \"" << JsonEscape(key) << "\": \""
           << JsonEscape(found->second.value) << "\"";
  }
  output << "\n  },\n  \"origins\": {\n";
  size_t written_origins = 0;
  for (const std::string& key : kAcceptedKeys) {
    const auto found = selected.find(key);
    if (found == selected.end()) continue;
    if (written_origins++ > 0) output << ",\n";
    output << "    \"" << JsonEscape(key) << "\": \""
           << JsonEscape(found->second.origin) << "\"";
  }
  output << "\n";
  output << "  }\n}\n";
  output.close();
  fs::remove_all(copy_path, filesystem_error);

  std::cout << "electron_preferences_import=PASS\n";
  std::cout << "accepted_key_count=" << selected.size() << "\n";
  return 0;
}
