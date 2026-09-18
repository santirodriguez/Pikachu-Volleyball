#include <leveldb/db.h>

#include <filesystem>
#include <fstream>
#include <iostream>
#include <memory>
#include <string>

namespace fs = std::filesystem;

namespace {

std::string EncodeChromiumLatin1(const std::string& value) {
  std::string encoded;
  encoded.reserve(value.size() + 1);
  encoded.push_back(static_cast<char>(1));
  encoded.append(value);
  return encoded;
}

bool WriteFixture(leveldb::DB* database, const std::string& origin,
                  const std::string& key, const std::string& value) {
  std::string storage_key = "_";
  storage_key += origin;
  storage_key.push_back('\0');
  storage_key += EncodeChromiumLatin1(key);
  const std::string encoded_value = EncodeChromiumLatin1(value);
  const leveldb::Status status =
      database->Put(leveldb::WriteOptions(), storage_key, encoded_value);
  if (!status.ok()) {
    std::cerr << "Unable to write fixture key " << key << ": "
              << status.ToString() << "\n";
    return false;
  }
  return true;
}

}  // namespace

int main(int argc, char** argv) {
  if (argc != 3) {
    std::cerr
        << "usage: electron-preferences-fixture <fixture.tsv> <leveldb-dir>\n";
    return 2;
  }

  const fs::path fixture_path = argv[1];
  const fs::path database_path = argv[2];

  std::ifstream input(fixture_path);
  if (!input) {
    std::cerr << "Unable to open fixture TSV: " << fixture_path << "\n";
    return 1;
  }

  std::error_code error;
  fs::remove_all(database_path, error);
  error.clear();
  fs::create_directories(database_path, error);
  if (error) {
    std::cerr << "Unable to create fixture LevelDB directory: "
              << error.message() << "\n";
    return 1;
  }

  leveldb::Options options;
  options.create_if_missing = true;
  leveldb::DB* raw_database = nullptr;
  const leveldb::Status open_status =
      leveldb::DB::Open(options, database_path.string(), &raw_database);
  if (!open_status.ok()) {
    std::cerr << "Unable to create fixture LevelDB: "
              << open_status.ToString() << "\n";
    return 1;
  }
  std::unique_ptr<leveldb::DB> database(raw_database);

  const std::string origin = "file://";
  std::string line;
  size_t count = 0;
  while (std::getline(input, line)) {
    const size_t separator = line.find('\t');
    if (separator == std::string::npos || separator == 0) {
      std::cerr << "Malformed fixture TSV line\n";
      return 1;
    }
    const std::string key = line.substr(0, separator);
    const std::string value = line.substr(separator + 1);
    if (!WriteFixture(database.get(), origin, key, value)) return 1;
    ++count;
  }

  if (count != 7) {
    std::cerr << "Expected exactly 7 fixture entries, wrote " << count << "\n";
    return 1;
  }

  std::cout << "electron_preferences_fixture=PASS\n";
  std::cout << "origin=" << origin << "\n";
  std::cout << "entry_count=" << count << "\n";
  return 0;
}
