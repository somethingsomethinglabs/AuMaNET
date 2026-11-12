#!/usr/bin/env bash
set -euo pipefail
project_root=$(cd "$(dirname "$0")/.." && pwd)
tools_root=${AUMANET_TOOLS_ROOT:-"$HOME/aumanet-tools"}
idf_root="$tools_root/esp-idf-v5.4.4"
halow_root="$tools_root/esp-halow"
role=${1:-usb}
profile=${2:-}
mode=${3:-bench}
variant=${AUMANET_BUILD_VARIANT:-}
if [[ -n "$variant" && ! "$variant" =~ ^[A-Za-z0-9_-]{1,32}$ ]]; then echo "Invalid build variant" >&2; exit 2; fi
flavor=${4:-generic}
case "$flavor" in generic|private-bootstrap) ;; *) echo "Unknown firmware flavor" >&2; exit 2;; esac
case "$role" in usb|A|B) ;; *) echo 'Usage: build.sh [usb|A|B] [approved-profile] [bench|gateway]' >&2; exit 2;; esac
case "$mode" in bench|gateway) ;; *) echo 'Unknown build mode' >&2; exit 2;; esac
if [[ $(git -C "$idf_root" rev-parse HEAD) != 296b6eab9445fd720e71aecab961e2d3fbca9944 ]]; then
    echo 'ESP-IDF must be pinned to v5.4.4' >&2; exit 1
fi
if [[ $(git -C "$halow_root" rev-parse HEAD) != a402ea973090423a1a3ca413abf18c6ea782347a ]]; then
    echo 'esp-halow must be pinned to 2.11.2-esp32-2 / a402ea9' >&2; exit 1
fi
export AUMANET_HALOW_ROOT="$halow_root"
python3 "$project_root/tools/sdk_inventory.py" "$idf_root" "$halow_root"
if [[ -d "$tools_root/usb-libs/usr/lib/x86_64-linux-gnu" ]]; then
    export LD_LIBRARY_PATH="$tools_root/usb-libs/usr/lib/x86_64-linux-gnu:${LD_LIBRARY_PATH:-}"
fi
source "$idf_root/export.sh" >/dev/null
# Build on the Linux filesystem for reliable symlinks and faster I/O under WSL.
build_suffix="$role"
if [[ "$mode" == gateway ]]; then build_suffix="$role-gateway-v15-$flavor"; fi
if [[ -n "$variant" ]]; then build_suffix="$build_suffix-$variant"; fi
build_dir="$tools_root/build-aumanet-$build_suffix"
mkdir -p "$build_dir"
defaults="$project_root/sdkconfig.defaults"
if [[ "$mode" == gateway ]]; then
    export AUMANET_GATEWAY_COMPONENTS="$build_dir/gateway-components"
    python3 "$project_root/gateway/prepare_lwip.py" --idf "$idf_root" --output "$AUMANET_GATEWAY_COMPONENTS" --component
    defaults="$defaults;$project_root/gateway/sdkconfig.defaults"
else
    unset AUMANET_GATEWAY_COMPONENTS
fi
if [[ "$role" != usb ]]; then
    if [[ ! -f "$profile" ]]; then
        echo 'RF builds require an approved private sdkconfig profile; see README.md.' >&2; exit 2
    fi
    # This input is an SDK config file, never a shell script.
    for setting in HALOW_COUNTRY_CODE AUMANET_CHANNEL AUMANET_OPCLASS; do
        grep -q "^CONFIG_${setting}=" "$profile" || { echo "Missing CONFIG_$setting" >&2; exit 2; }
    done
    if [[ "$mode" == gateway && "$flavor" == generic ]]; then
        grep -vE '^CONFIG_AUMANET_(SSID|PSK|PRIVATE_BOOTSTRAP)=' "$profile" > "$build_dir/regional.defaults"
        printf '\nCONFIG_AUMANET_SSID=""\nCONFIG_AUMANET_PSK=""\nCONFIG_AUMANET_PRIVATE_BOOTSTRAP=n\n' >> "$build_dir/regional.defaults"
    else
        cp "$profile" "$build_dir/regional.defaults"
        if [[ "$mode" == gateway ]]; then printf '\nCONFIG_AUMANET_PRIVATE_BOOTSTRAP=y\n' >> "$build_dir/regional.defaults"; fi
    fi
    printf '\nCONFIG_AUMANET_RF_ENABLED=y\nCONFIG_HALOW_AP_MODE=y\n' >> "$build_dir/regional.defaults"
    if [[ "$role" == B ]]; then
        printf 'CONFIG_AUMANET_NODE_B=y\n' >> "$build_dir/regional.defaults"
    else
        printf 'CONFIG_AUMANET_NODE_B=n\n' >> "$build_dir/regional.defaults"
    fi
    defaults="$defaults;$build_dir/regional.defaults"
fi
cat "$project_root/sdkconfig.defaults" > "$build_dir/sdkconfig"
if [[ "$mode" == gateway ]]; then
    cat "$project_root/gateway/sdkconfig.defaults" >> "$build_dir/sdkconfig"
fi
if [[ "$role" != usb ]]; then
    cat "$build_dir/regional.defaults" >> "$build_dir/sdkconfig"
fi
if [[ "$mode" == gateway ]]; then python "$project_root/tools/ota_build_meta.py" "$build_dir/ota_build_meta.h" "$role"; export AUMANET_BUILD_META_DIR="$build_dir"; fi
python "$project_root/tools/sdk_inventory.py" "$idf_root" "$halow_root" --snapshot "$build_dir/source-before.json"
python "$idf_root/tools/idf.py" -C "$project_root" -B "$build_dir" \
    -D "SDKCONFIG=$build_dir/sdkconfig" -D "SDKCONFIG_DEFAULTS=$defaults" reconfigure build
if [[ "$mode" == gateway ]] && (( $(stat -c %s "$build_dir/aumanet_bench.bin") > 0x240000 )); then echo "Image exceeds OTA slot" >&2; exit 1; fi
if [[ "$mode" == gateway ]]; then python "$project_root/tools/ota_check_image.py" "$build_dir/aumanet_bench.bin" "$role" "$flavor" "$profile" "$build_dir/sdkconfig"; fi
destination="$project_root/../artifacts/firmware-$build_suffix"
mkdir -p "$destination/bootloader" "$destination/partition_table"
python "$project_root/tools/sdk_inventory.py" "$idf_root" "$halow_root" "$build_dir" "$destination"
cp "$build_dir/aumanet_bench.bin" "$destination/"
cp "$build_dir/bootloader/bootloader.bin" "$destination/bootloader/"
cp "$build_dir/partition_table/partition-table.bin" "$destination/partition_table/"
cp "$build_dir/flasher_args.json" "$destination/"
if [[ "$mode" == gateway ]]; then cp "$build_dir/ota_data_initial.bin" "$destination/"; fi
python -m esptool --chip esp32s3 \
    merge_bin -o "$destination/aumanet-bench-$role.bin" --flash_mode dio --flash_size 8MB \
    0x0 "$build_dir/bootloader/bootloader.bin" \
    0x8000 "$build_dir/partition_table/partition-table.bin" \
    0x10000 "$build_dir/aumanet_bench.bin"
(cd "$destination" && sha256sum aumanet-bench-"$role".bin aumanet_bench.bin bootloader/bootloader.bin partition_table/partition-table.bin > SHA256SUMS)
if [[ "$mode" == gateway ]]; then cp "$build_dir/ota_build_meta.h" "$destination/"; (cd "$destination" && sha256sum ota_data_initial.bin ota_build_meta.h >> SHA256SUMS); fi
echo "Deployment artifact: $destination/aumanet-bench-$role.bin"
