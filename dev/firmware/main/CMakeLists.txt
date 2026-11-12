set(assistant "$ENV{AUMANET_HALOW_ROOT}/halow/examples/porting_assistant/main")
idf_component_register(
    SRCS "bench.c" "link.c" "messages.c" "bluetooth.c" "board_checks.c" "console_io.c"
         "${assistant}/porting_assistant.c" "${assistant}/sdio_spi.c"
         "${assistant}/test_os.c" "${assistant}/test_wlan_fw_bcf.c"
         "${assistant}/test_wlan_io.c" "${assistant}/chip_cfg.c"
    INCLUDE_DIRS "." "${assistant}"
    REQUIRES console halow nvs_flash esp_timer esp_system esp_hw_support esp_app_format esp_driver_usb_serial_jtag bt json)
target_link_options(${COMPONENT_LIB} INTERFACE "-Wl,--wrap=usb_serial_jtag_driver_install" "-Wl,--undefined=__wrap_usb_serial_jtag_driver_install")
if(CONFIG_AUMANET_RF_ENABLED)
    target_link_options(${COMPONENT_LIB} INTERFACE "-Wl,--wrap=mmwlan_set_channel_list" "-Wl,--wrap=mmwlan_tx_pkt")
endif()
if(CONFIG_AUMANET_GATEWAY)
    target_sources(${COMPONENT_LIB} PRIVATE "gateway_main.c" "gateway_boot_crypto.c" "link_credentials.c" "gateway_ota.c" "gateway_ota_build.c")
    target_include_directories(${COMPONENT_LIB} PRIVATE "$ENV{AUMANET_BUILD_META_DIR}")
    target_link_options(${COMPONENT_LIB} INTERFACE "-Wl,--undefined=gateway_ota_build")
    idf_component_optional_requires(PRIVATE gateway esp_wifi esp_netif bootloader_support app_update esp_partition)
endif()
# Keep the upstream test source unchanged; expose its entry point as a command.
set_source_files_properties("${assistant}/porting_assistant.c"
    PROPERTIES COMPILE_DEFINITIONS "app_main=aumanet_radio_selftest;test_step_verify_busy_pin=test_step_bench_busy")
