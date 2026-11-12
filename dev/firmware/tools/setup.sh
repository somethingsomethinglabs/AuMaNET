#!/usr/bin/env bash
set -euo pipefail
tools_root=${AUMANET_TOOLS_ROOT:-"$HOME/aumanet-tools"}
mkdir -p "$tools_root"
if [[ ! -d "$tools_root/esp-idf-v5.4.4/.git" ]]; then
    git clone --depth 1 --branch v5.4.4 --recursive --shallow-submodules \
        https://github.com/espressif/esp-idf.git "$tools_root/esp-idf-v5.4.4"
fi
if [[ ! -d "$tools_root/esp-halow/.git" ]]; then
    git clone --depth 1 --branch 2.11.2-esp32-2 \
        https://github.com/MorseMicro/esp-halow.git "$tools_root/esp-halow"
fi
git -C "$tools_root/esp-halow" submodule update --init --depth 1
"$tools_root/esp-idf-v5.4.4/install.sh" esp32s3
