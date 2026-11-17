#pragma once
#include "nvs.h"
#include <assert.h>
typedef int (*esp_console_cmd_func_t)(int,char **);
typedef struct {const char *command,*help;esp_console_cmd_func_t func;} esp_console_cmd_t;
esp_err_t esp_console_cmd_register(const esp_console_cmd_t *);
#define ESP_ERROR_CHECK(e) assert((e)==ESP_OK)
