cmake_minimum_required(VERSION 3.20)
project(pikachu_volleyball_accessibility_probe C)

set(CMAKE_C_STANDARD 11)
set(CMAKE_C_STANDARD_REQUIRED ON)

if(NOT DEFINED ACCESSKIT_ROOT)
  message(FATAL_ERROR "ACCESSKIT_ROOT is required")
endif()

find_package(SDL3 CONFIG REQUIRED)
find_package(accesskit CONFIG REQUIRED PATHS "${ACCESSKIT_ROOT}" NO_DEFAULT_PATH)

add_executable(
  pikachu-volleyball-accessibility-probe
  ../accessibility_probe.c
)

target_link_libraries(
  pikachu-volleyball-accessibility-probe
  PRIVATE
    SDL3::SDL3
    accesskit-static
)

target_compile_options(
  pikachu-volleyball-accessibility-probe
  PRIVATE
    -Wall
    -Wextra
    -Wpedantic
)
