#pragma once
#include <stdbool.h>
bool bench_link_started(void);
bool bench_link_touched(void);
int bench_link_status(int argc, char **argv);
int bench_link_scan(int argc, char **argv);
int bench_link_start(int argc, char **argv);
int bench_link_probe(int argc, char **argv);

#include <stdint.h>
/* Last-known associated AP RSSI only; no scan, RF sample age unknown. */
int bench_link_signal(const uint8_t expected_bssid[6],int32_t *rssi);
struct ar_snapshot;
void bench_link_radio_setup(const uint8_t scope[32],const uint8_t expected_bssid[6]);
void bench_link_radio_permit(int);
int bench_link_radio_read(struct ar_snapshot *);
int bench_link_radio_command(unsigned,unsigned,const uint8_t[16],uint64_t);
int bench_link_radio_default(void); /* USB recovery only, requires radio stopped */
