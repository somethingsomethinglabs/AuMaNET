#pragma once
#include <stddef.h>
#include <stdint.h>
#include <stdbool.h>
#include <sys/socket.h>
#include "cJSON.h"
#define BENCH_MESSAGE_BYTES 240
#define BENCH_MESSAGE_WIRE_MAX (23 + BENCH_MESSAGE_BYTES)
void bench_messages_init(void);
bool bench_messages_ready(void);
cJSON *bench_messages_json(void);
int bench_messages_list(int argc, char **argv);
int bench_messages_send(int argc, char **argv);
void bench_messages_receive(int socket, const uint8_t *data, size_t size,
                            const struct sockaddr *source, socklen_t source_len);
