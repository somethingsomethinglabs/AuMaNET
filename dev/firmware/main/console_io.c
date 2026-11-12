#include "driver/usb_serial_jtag.h"

/* The IDF REPL installs a 256-byte RX buffer even for a longer command line.
 * A 240-byte UTF-8 payload becomes a 512-byte hex console command and can
 * overflow while linenoise echoes characters. Size the driver for a complete
 * bounded command; keep the pinned IDF source unchanged. */
esp_err_t __real_usb_serial_jtag_driver_install(const usb_serial_jtag_driver_config_t *config);
esp_err_t __wrap_usb_serial_jtag_driver_install(const usb_serial_jtag_driver_config_t *config)
{
    if (!config) return ESP_ERR_INVALID_ARG;
    usb_serial_jtag_driver_config_t buffered = *config;
    if (buffered.rx_buffer_size < 2048) buffered.rx_buffer_size = 2048;
    if (buffered.tx_buffer_size < 1024) buffered.tx_buffer_size = 1024;
    return __real_usb_serial_jtag_driver_install(&buffered);
}
