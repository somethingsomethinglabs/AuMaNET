#include <stdio.h>
#include <string.h>
#include "esp_app_desc.h"
#include "esp_chip_info.h"
#include "esp_console.h"
#include "esp_mac.h"
#include "esp_system.h"
#include "esp_timer.h"
#include "nvs_flash.h"
#include "nvs.h"
#include "link.h"
#include "messages.h"
#include "bluetooth.h"
#include "gateway_main.h"
#if CONFIG_AUMANET_GATEWAY
#include "gateway_ota.h"
#endif

void aumanet_radio_selftest(void);
static bool selftest_ran;
static nvs_handle_t settings;
static bool radio_autostart;

static int save_autostart(bool enabled)
{
    esp_err_t error=nvs_set_u8(settings,"run_radio",enabled?1:0);
    if (error==ESP_OK) error=nvs_commit(settings);
    if (error!=ESP_OK) { printf("Cannot save radio startup setting: %s\n",esp_err_to_name(error)); return 1; }
    radio_autostart=enabled; return 0;
}

static int autostart_cmd(int argc, char **argv)
{
    if (argc!=2 || (strcmp(argv[1],"on") && strcmp(argv[1],"off"))) {
        puts("Usage: radio-autostart on|off (takes effect on next boot)"); return 1;
    }
#if !CONFIG_AUMANET_RF_ENABLED
    if (!strcmp(argv[1],"on")) { puts("RF disabled in this build."); return 1; }
#endif
    if (save_autostart(!strcmp(argv[1],"on"))) return 1;
    printf("\n{\"schema\":\"aumanet.bench.v1\",\"type\":\"radio_autostart\",\"enabled\":%s}\n",radio_autostart?"true":"false");
    return 0;
}

static int status_cmd(int argc, char **argv)
{
    uint8_t mac[6];
    ESP_ERROR_CHECK(esp_read_mac(mac, ESP_MAC_WIFI_STA));
    printf("\n{\"schema\":\"aumanet.bench.v1\",\"type\":\"status\","
           "\"firmware\":\"%s\",\"idf\":\"%s\",\"node\":\"%02x%02x%02x%02x%02x%02x\","
           "\"uptime_ms\":%lld,\"free_heap\":%lu,\"minimum_free_heap\":%lu,"
           "\"reset_reason\":%d,\"rf_enabled\":%s,\"radio_started\":%s,"
           "\"role\":\"%s\",\"selftest_ran\":%s,\"radio_autostart\":%s,\"message_storage_ready\":%s"
#if CONFIG_AUMANET_GATEWAY
           ",\"experimental_gateway\":true,\"legacy_ble_enabled\":false"
#endif
           "}\n",
           esp_app_get_description()->version, esp_get_idf_version(),
           mac[0], mac[1], mac[2], mac[3], mac[4], mac[5],
           (long long)(esp_timer_get_time()/1000),
           (unsigned long)esp_get_free_heap_size(),
           (unsigned long)esp_get_minimum_free_heap_size(), esp_reset_reason(),
#if CONFIG_AUMANET_RF_ENABLED
           "true",
#else
           "false",
#endif
           bench_link_started() ? "true" : "false",
#if CONFIG_AUMANET_NODE_B
           "B",
#else
           "A",
#endif
           selftest_ran ? "true" : "false",radio_autostart?"true":"false",bench_messages_ready()?"true":"false");
    return 0;
}

static int ping_cmd(int argc, char **argv)
{
    puts("\n{\"schema\":\"aumanet.bench.v1\",\"type\":\"pong\"}");
    return 0;
}

static int selftest_cmd(int argc, char **argv)
{
    if (selftest_ran || bench_link_touched()) {
        puts("Reboot before another hardware self-test or after starting RF.");
        return 1;
    }
    selftest_ran = true;
    puts("\nRunning upstream SPI/OS/firmware/BCF tests; no wireless network is started.");
    aumanet_radio_selftest();
    puts("\n{\"schema\":\"aumanet.bench.v1\",\"type\":\"selftest_complete\"}");
    return 0;
}

static int start_cmd(int argc, char **argv)
{
    if (selftest_ran) {
        puts("Reboot after the hardware self-test before starting RF.");
        return 1;
    }
#if CONFIG_AUMANET_RF_ENABLED
    if (save_autostart(true)) return 1;
    if (bench_link_started()) {
        puts("\n{\"schema\":\"aumanet.bench.v1\",\"type\":\"radio_started\",\"already_started\":true}"); return 0;
    }
#endif
    return bench_link_start(argc, argv);
}
int bench_radio_start(void) { return start_cmd(0,NULL); }

static int reboot_cmd(int argc, char **argv)
{
    fflush(stdout);
    esp_restart();
    return 0;
}

static void add_command(const char *name, const char *help, esp_console_cmd_func_t fn)
{
    const esp_console_cmd_t cmd = {.command=name, .help=help, .func=fn};
    ESP_ERROR_CHECK(esp_console_cmd_register(&cmd));
}

void app_main(void)
{
#if CONFIG_AUMANET_GATEWAY
    gateway_ota_boot();
#endif
    /* Do not erase NVS on initialization failure: preserve existing device data. */
    ESP_ERROR_CHECK(nvs_flash_init());
    ESP_ERROR_CHECK(nvs_open("amn_bench",NVS_READWRITE,&settings));
    uint8_t resume=0;
    esp_err_t setting_error=nvs_get_u8(settings,"run_radio",&resume);
    if (setting_error!=ESP_OK && setting_error!=ESP_ERR_NVS_NOT_FOUND) ESP_ERROR_CHECK(setting_error);
    radio_autostart=resume==1;
    esp_console_repl_t *repl = NULL;
    esp_console_repl_config_t config = ESP_CONSOLE_REPL_CONFIG_DEFAULT();
    config.prompt = "aumanet>";
    config.max_cmdline_length = 640;
    config.task_stack_size = 8192;
    esp_console_dev_usb_serial_jtag_config_t device = ESP_CONSOLE_DEV_USB_SERIAL_JTAG_CONFIG_DEFAULT();
    ESP_ERROR_CHECK(esp_console_new_repl_usb_serial_jtag(&device, &config, &repl));
    esp_console_register_help_command();
    bench_messages_init();
    aumanet_gateway_boot();
    aumanet_gateway_register_commands();
    add_command("status", "JSON device identity, build, heap and radio state", status_cmd);
    add_command("ping", "Check bidirectional USB communication", ping_cmd);
    add_command("radio-test", "Run hardware self-tests once per boot (no RF network)", selftest_cmd);
    add_command("radio-start", "Start provisioned isolated HaLow transport (RF builds only)", start_cmd);
    add_command("radio-autostart", "Persist on|off for starting the provisioned radio after reboot", autostart_cmd);
    add_command("radio-status", "Actual HaLow interface, firmware and channel state", bench_link_status);
    add_command("radio-scan", "Bounded scan on the configured bench channel (station only)", bench_link_scan);
    add_command("link-test", "Ten 64-byte peer echoes, bounded to two seconds each", bench_link_probe);
    add_command("messages", "Last eight real board messages (persistent)", bench_messages_list);
    add_command("message-send", "Send a bounded UTF-8 message over HaLow with peer acknowledgement", bench_messages_send);
    add_command("reboot", "Restart into the bench firmware", reboot_cmd);
#if CONFIG_AUMANET_RF_ENABLED
    if (radio_autostart && bench_link_start(0,NULL)) puts("Automatic radio start failed; USB console remains available.");
#endif
    aumanet_gateway_field_resume();
    status_cmd(0, NULL);
#if !CONFIG_AUMANET_GATEWAY
    bench_bluetooth_init();
#endif
    ESP_ERROR_CHECK(esp_console_start_repl(repl));
}
