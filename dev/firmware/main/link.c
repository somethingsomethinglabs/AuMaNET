#include "sdkconfig.h"
#include "link.h"
#include "messages.h"
#include "gateway_main.h"
#include <stdio.h>

static bool started;
static bool touched;
bool bench_link_started(void) { return started; }
bool bench_link_touched(void) { return touched; }

#if CONFIG_AUMANET_RF_ENABLED
#include <string.h>
#include <errno.h>
#include <unistd.h>
#include <sys/socket.h>
#include <arpa/inet.h>
#include "esp_event.h"
#include "esp_netif.h"
#include "esp_random.h"
#include "esp_timer.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/semphr.h"
#include "mmhalow.h"
#include "mmregdb.h"
#include "mmwlan_stats.h"
#include "driver/gpio.h"
#if CONFIG_AUMANET_GATEWAY
#include "aumanet_radio_trial.h"
#include "gateway_boot_crypto.h"
#include "link_credentials.h"
#define LINK_SSID link_credentials_ssid()
#define LINK_PSK link_credentials_password()
#include "nvs.h"
#include <stdatomic.h>
#else
#define LINK_SSID CONFIG_AUMANET_SSID
#define LINK_PSK CONFIG_AUMANET_PSK
#endif

static SemaphoreHandle_t wlan_api_mutex;
static esp_netif_t *radio_netif;
static struct mmwlan_s1g_channel bench_channel;
static struct mmwlan_s1g_channel_list bench_channels = {.country_code="AU", .num_channels=1, .channels=&bench_channel};
static bool profile_applied;
static volatile int peer_state;
static volatile bool radio_vif_up;
#if CONFIG_AUMANET_GATEWAY
/* Callback observations only. No API calls, logging, radio or policy mutations. */
static _Atomic uint32_t diag_events[8],diag_states[3],diag_last_event,diag_event_at,diag_last_state,diag_state_at;
static _Atomic uint32_t diag_ap_events,diag_ap_at,diag_ap_match,diag_tx_errors,diag_tx_error,diag_tx_at;
static void diagnostic_sta_event(const struct mmwlan_sta_event_cb_args *event,void *ignored){(void)ignored;if(!event||(unsigned)event->event>=8)return;atomic_store(&diag_last_event,(uint32_t)event->event);atomic_store(&diag_event_at,(uint32_t)(esp_timer_get_time()/1000));atomic_fetch_add(&diag_events[event->event],1);}
static void diagnostic_sta_state(enum mmwlan_sta_state state){if((unsigned)state>=3)return;atomic_store(&diag_last_state,(uint32_t)state);atomic_store(&diag_state_at,(uint32_t)(esp_timer_get_time()/1000));atomic_fetch_add(&diag_states[state],1);}
static void diagnostic_tx_error(enum mmwlan_status result){if(result==MMWLAN_SUCCESS)return;atomic_store(&diag_tx_error,(uint32_t)result);atomic_store(&diag_tx_at,(uint32_t)(esp_timer_get_time()/1000));atomic_fetch_add(&diag_tx_errors,1);}
static void diagnostic_status_json(const struct mmwlan_stats_umac_data *stats,bool available,uint32_t now){
    uint32_t events[8],states[3];uint64_t event_total=0,state_total=0;for(unsigned i=0;i<8;i++){events[i]=atomic_load(&diag_events[i]);event_total+=events[i];}for(unsigned i=0;i<3;i++){states[i]=atomic_load(&diag_states[i]);state_total+=states[i];}
    uint32_t ap=atomic_load(&diag_ap_events),tx=atomic_load(&diag_tx_errors);
    printf(",\"diagnostics\":{\"counter_modulo32\":true,\"last_connection_reason_supported\":false,\"ap_auth_failure_reason_supported\":false,\"sta_events_available\":%s,\"sta_event_counts\":[%lu,%lu,%lu,%lu,%lu,%lu,%lu,%lu],\"last_sta_event\":%d,\"sta_event_age_ms\":%lld,\"sta_state_counts\":[%lu,%lu,%lu],\"last_sta_state\":%d,\"sta_state_age_ms\":%lld,\"ap_sta_event_count\":%lu,\"ap_sta_event_age_ms\":%lld,\"ap_sta_matches_checked_peer\":%s,\"host_tx_submit_error_count\":%lu,\"last_host_tx_submit_error\":%d,\"host_tx_submit_error_age_ms\":%lld,\"umac_stats_available\":%s,\"connect_timestamps_ms\":",
#if CONFIG_AUMANET_NODE_B
      "true",
#else
      "false",
#endif
      (unsigned long)events[0],(unsigned long)events[1],(unsigned long)events[2],(unsigned long)events[3],(unsigned long)events[4],(unsigned long)events[5],(unsigned long)events[6],(unsigned long)events[7],event_total?(int)atomic_load(&diag_last_event):-1,event_total?(long long)(uint32_t)(now-atomic_load(&diag_event_at)):-1LL,
      (unsigned long)states[0],(unsigned long)states[1],(unsigned long)states[2],state_total?(int)atomic_load(&diag_last_state):-1,state_total?(long long)(uint32_t)(now-atomic_load(&diag_state_at)):-1LL,(unsigned long)ap,ap?(long long)(uint32_t)(now-atomic_load(&diag_ap_at)):-1LL,ap&&atomic_load(&diag_ap_match)?"true":"false",(unsigned long)tx,tx?(int)atomic_load(&diag_tx_error):-1,tx?(long long)(uint32_t)(now-atomic_load(&diag_tx_at)):-1LL,available?"true":"false");
    if(available){printf("{\"start\":%lu,\"scan_requested\":%lu,\"scan_complete\":%lu,\"send_auth_1\":%lu,\"recv_auth_1\":%lu,\"send_auth_2\":%lu,\"recv_auth_2\":%lu,\"send_assoc\":%lu,\"recv_assoc\":%lu,\"link_up\":%lu}",
      (unsigned long)stats->connect_timestamp[MMWLAN_STATS_CONNECT_TIMESTAMP_START],(unsigned long)stats->connect_timestamp[MMWLAN_STATS_CONNECT_TIMESTAMP_SCAN_REQUESTED],(unsigned long)stats->connect_timestamp[MMWLAN_STATS_CONNECT_TIMESTAMP_SCAN_COMPLETE],(unsigned long)stats->connect_timestamp[MMWLAN_STATS_CONNECT_TIMESTAMP_SEND_AUTH_1],(unsigned long)stats->connect_timestamp[MMWLAN_STATS_CONNECT_TIMESTAMP_RECV_AUTH_1],(unsigned long)stats->connect_timestamp[MMWLAN_STATS_CONNECT_TIMESTAMP_SEND_AUTH_2],(unsigned long)stats->connect_timestamp[MMWLAN_STATS_CONNECT_TIMESTAMP_RECV_AUTH_2],(unsigned long)stats->connect_timestamp[MMWLAN_STATS_CONNECT_TIMESTAMP_SEND_ASSOC],(unsigned long)stats->connect_timestamp[MMWLAN_STATS_CONNECT_TIMESTAMP_RECV_ASSOC],(unsigned long)stats->connect_timestamp[MMWLAN_STATS_CONNECT_TIMESTAMP_LINK_UP]);
      printf(",\"rx_queue_dropped\":%lu,\"tx_queue_dropped\":%lu,\"rx_management_queue_high_water\":%u,\"driver_rx_alloc_failures\":%lu,\"driver_rx_read_failures\":%lu,\"driver_tx_queue_timeouts\":%lu,\"driver_tx_status_timeouts\":%lu,\"hardware_restarts\":%u,\"scans_complete\":%u",(unsigned long)stats->datapath_rxq_frames_dropped,(unsigned long)stats->datapath_txq_frames_dropped,stats->datapath_rx_mgmt_q_high_water_mark,(unsigned long)stats->datapath_driver_rx_alloc_failures,(unsigned long)stats->datapath_driver_rx_read_failures,(unsigned long)stats->datapath_driver_tx_skbq_timeout,(unsigned long)stats->datapath_driver_tx_pending_status_timeout,stats->hw_restart_counter,stats->num_scans_complete);
    }else printf("null");
    printf("}");
}
static struct mmwlan_s1g_channel validated_channels[AR_OPTION_COUNT];
static struct ar_trial radio_trial;
static mmhalow_wifi_config_t active_ap_config;
static uint8_t radio_scope[32],radio_link_scope[32],radio_bssid[6];
static bool radio_scope_ready,radio_storage_failed,radio_worker_ready;
static atomic_bool radio_permitted,radio_cancel_requested;
struct radio_record {uint32_t version;uint8_t scope[32],link_scope[32],transaction[16];uint64_t generation;uint8_t option,reserved[7];};
static struct radio_record radio_saved;
static unsigned selected_option;
static int radio_apply(void *ignored,unsigned option);
static int radio_persist(void *ignored,unsigned option,uint64_t generation,const uint8_t transaction[16]);
static void radio_worker(void *ignored);
void bench_link_radio_setup(const uint8_t scope[32],const uint8_t bssid[6]){radio_scope_ready=scope&&bssid;if(!radio_scope_ready)return;memcpy(radio_scope,scope,32);memcpy(radio_bssid,bssid,6);radio_scope_ready=link_credentials_scope(radio_link_scope)==1;}
void bench_link_radio_permit(int enabled){if(enabled!=1)atomic_store(&radio_cancel_requested,true);atomic_store(&radio_permitted,enabled==1);}
#endif

/* The pinned ESP adapter omits metadata.vif. Its boot creates a STA VIF even
 * for AP-only operation, so inference then rejects AP IP packets (VIF_ERROR).
 * Explicitly select our single intended data interface at this boundary. */
enum mmwlan_status __real_mmwlan_tx_pkt(struct mmpkt *packet, const struct mmwlan_tx_metadata *metadata);
enum mmwlan_status __wrap_mmwlan_tx_pkt(struct mmpkt *packet, const struct mmwlan_tx_metadata *metadata)
{
    struct mmwlan_tx_metadata selected = {0};
    if (metadata) selected = *metadata;
#if CONFIG_AUMANET_NODE_B
    selected.vif = MMWLAN_VIF_STA;
#else
    selected.vif = MMWLAN_VIF_AP;
#endif
    enum mmwlan_status result=__real_mmwlan_tx_pkt(packet, &selected);
#if CONFIG_AUMANET_GATEWAY
    diagnostic_tx_error(result);
#endif
    return result;
}

/* The pinned adapter boots inside mmhalow_init(), after which changing the
 * regulatory table is rejected. Intercept its public set-channel call so our
 * validated single-channel profile and power limit apply before that boot.
 * Keep the pinned external SDK checkout unchanged. */
enum mmwlan_status __real_mmwlan_set_channel_list(const struct mmwlan_s1g_channel_list *channels);
enum mmwlan_status __wrap_mmwlan_set_channel_list(const struct mmwlan_s1g_channel_list *channels)
{
    if (!bench_channel.centre_freq_hz || !channels ||
        memcmp(channels->country_code, CONFIG_HALOW_COUNTRY_CODE, 2) != 0) return MMWLAN_INVALID_ARGUMENT;
    enum mmwlan_status result = __real_mmwlan_set_channel_list(&bench_channels);
    if (result == MMWLAN_SUCCESS) result = mmwlan_override_max_tx_power(CONFIG_AUMANET_TX_DBM);
    profile_applied = result == MMWLAN_SUCCESS;
    return result;
}

#if !CONFIG_AUMANET_NODE_B
static void ap_station_state(const struct mmwlan_ap_sta_status *state, void *arg)
{
    peer_state = state->state;
#if CONFIG_AUMANET_GATEWAY
    atomic_store(&diag_ap_at,(uint32_t)(esp_timer_get_time()/1000));atomic_store(&diag_ap_match,radio_scope_ready&&!memcmp(state->mac_addr,radio_bssid,6));atomic_fetch_add(&diag_ap_events,1);
#endif
}
static void ap_vif_state(const struct mmwlan_vif_state *state, void *arg)
{
    radio_vif_up=state->link_state==MMWLAN_LINK_UP;
    /* The upstream compatibility callback handles STA only, never AP. */
    if (state->link_state == MMWLAN_LINK_UP) esp_netif_action_connected(arg, NULL, 0, NULL);
    else esp_netif_action_disconnected(arg, NULL, 0, NULL);
}
#endif

static int signal_locked(const uint8_t expected_bssid[6],int32_t *rssi){
#if CONFIG_AUMANET_NODE_B
    uint8_t bssid[6];if(!started||!rssi||mmwlan_get_sta_state()!=MMWLAN_STA_CONNECTED||mmwlan_get_bssid(bssid)!=MMWLAN_SUCCESS||memcmp(bssid,expected_bssid,6))return 2;
    int32_t value=mmwlan_get_rssi();if(value < -127||value >= 0||mmwlan_get_sta_state()!=MMWLAN_STA_CONNECTED||mmwlan_get_bssid(bssid)!=MMWLAN_SUCCESS||memcmp(bssid,expected_bssid,6))return 2;*rssi=value;return 0;
#else
    (void)expected_bssid;(void)rssi;return 1;
#endif
}
static int link_status_locked(int argc, char **argv)
{
    struct mmwlan_version version = {0};
    struct mmwlan_bcf_metadata bcf = {0};
    struct mmwlan_vif_channel_info channel = {0};
#if CONFIG_AUMANET_GATEWAY
    struct mmwlan_stats_umac_data stats={0};bool have_stats=false;
#endif
    if (touched) {
        mmwlan_get_version(&version);
        mmwlan_get_bcf_metadata(&bcf);
        mmwlan_get_vif_channel_info(
#if CONFIG_AUMANET_NODE_B
            MMWLAN_VIF_STA,
#else
            MMWLAN_VIF_AP,
#endif
            &channel);
#if CONFIG_AUMANET_GATEWAY
        have_stats=mmwlan_get_umac_stats(&stats)==MMWLAN_SUCCESS;
#endif
    }
    int station_state=touched?(int)mmwlan_get_sta_state():-1;
    flockfile(stdout);
    printf("\n{\"schema\":\"aumanet.bench.v1\",\"type\":\"radio_status\",\"started\":%s,"
           "\"interface_up\":%s,\"station_state\":%d,\"country\":\"%s\",\"channel\":%d,"
           "\"opclass\":%d,\"max_tx_dbm\":%d,\"centre_hz\":%lu,\"bandwidth_mhz\":%u,\"chip_id\":%lu,\"firmware_loaded\":%s,"
           "\"actual_opclass\":%u,\"actual_channel\":%u,\"actual_primary_bw_mhz\":%u,\"actual_primary_1mhz_index\":%u,\"ap_peer_state\":%d",
           started ? "true" : "false", radio_netif && esp_netif_is_netif_up(radio_netif) ? "true" : "false",
           station_state, CONFIG_HALOW_COUNTRY_CODE,
           bench_channel.s1g_chan_num, bench_channel.s1g_operating_class, CONFIG_AUMANET_TX_DBM,
           (unsigned long)bench_channel.centre_freq_hz, bench_channel.bw_mhz,
           (unsigned long)version.morse_chip_id, version.morse_fw_version[0] ? "true" : "false",
           channel.op_class, channel.s1g_chan_num, channel.pri_bw_mhz,channel.pri_1mhz_chan_idx, peer_state);
#if CONFIG_AUMANET_GATEWAY
    diagnostic_status_json(&stats,have_stats,(uint32_t)(esp_timer_get_time()/1000));
#endif
    puts("}");
    funlockfile(stdout);
    return 0;
}

#if CONFIG_AUMANET_NODE_B
static SemaphoreHandle_t scan_done;
static unsigned scan_count, scan_matches;
static int scan_rssi;
static uint32_t scan_frequency;
static enum mmwlan_scan_state scan_state;
static void scan_rx(const struct mmwlan_scan_result *result, void *arg)
{
    if (scan_count < 255) scan_count++;
    if (result->ssid_len == strlen(LINK_SSID) &&
        memcmp(result->ssid, LINK_SSID, result->ssid_len) == 0) {
        scan_matches++;
        scan_rssi = result->rssi;
        scan_frequency = result->channel_freq_hz;
    }
}
static void scan_complete(enum mmwlan_scan_state state, void *arg)
{
    scan_state = state;
    xSemaphoreGive(scan_done);
}
#endif
static int link_scan_locked(int argc, char **argv)
{
#if CONFIG_AUMANET_NODE_B
    if (!started) { puts("Start the radio first."); return 1; }
    if (!scan_done) scan_done = xSemaphoreCreateBinary();
    if (!scan_done) return 1;
    if (mmhalow_disconnect() != MMWLAN_SUCCESS) return 1;
    while (xSemaphoreTake(scan_done, 0) == pdTRUE) {}
    scan_count = scan_matches = 0;
    scan_rssi = 0; scan_frequency = 0;
    static struct mmwlan_scan_req request;
    request = (struct mmwlan_scan_req)MMWLAN_SCAN_REQ_INIT;
    request.scan_rx_cb = scan_rx; request.scan_complete_cb = scan_complete;
    request.args.dwell_time_ms = 250;
    memcpy(request.args.ssid, LINK_SSID, strlen(LINK_SSID));
    request.args.ssid_len = strlen(LINK_SSID);
    enum mmwlan_status result = mmwlan_scan_request(&request);
    bool completed = result == MMWLAN_SUCCESS && xSemaphoreTake(scan_done, pdMS_TO_TICKS(8000)) == pdTRUE;
    if (!completed) mmwlan_scan_abort();
    printf("\n{\"schema\":\"aumanet.bench.v1\",\"type\":\"scan_result\",\"completed\":%s,"
           "\"status\":%d,\"results\":%u,\"matching_results\":%u,\"matching_rssi_dbm\":%d,\"matching_centre_hz\":%lu}\n",
           completed ? "true" : "false", completed ? (int)scan_state : (int)result,
           scan_count, scan_matches, scan_rssi, (unsigned long)scan_frequency);
    mmhalow_connect(
#if CONFIG_AUMANET_GATEWAY
      diagnostic_sta_state
#else
      NULL
#endif
    );
    return completed ? 0 : 1;
#else
    puts("Scan command is for the station role only."); return 1;
#endif
}

#define BENCH_PORT 17777
#define PACKET_SIZE 64
#if CONFIG_AUMANET_NODE_B
#define LOCAL_IP "10.78.0.2"
#define PEER_IP "10.78.0.1"
#else
#define LOCAL_IP "10.78.0.1"
#define PEER_IP "10.78.0.2"
#endif

static struct sockaddr_in peer_address(void)
{
    struct sockaddr_in address = {.sin_family=AF_INET, .sin_port=htons(BENCH_PORT)};
    inet_pton(AF_INET, PEER_IP, &address.sin_addr);
    return address;
}

static void echo_task(void *arg)
{
    int sock = (int)(intptr_t)arg;
    uint8_t data[BENCH_MESSAGE_WIRE_MAX+1];
    const struct sockaddr_in peer = peer_address();
    while (true) {
        struct sockaddr_in source;
        socklen_t len = sizeof(source);
        int size = recvfrom(sock, data, sizeof(data), 0, (struct sockaddr *)&source, &len);
        if (size < 0) break;
        if (source.sin_addr.s_addr != peer.sin_addr.s_addr) continue;
        if (size>=4 && memcmp(data,"AMT1",4)==0) {
            bench_messages_receive(sock,data,size,(struct sockaddr *)&source,len);
            vTaskDelay(pdMS_TO_TICKS(20));
            continue;
        }
        if (size != PACKET_SIZE ||
            memcmp(data, "AMN1", 4) != 0) continue;
        memcpy(data, "AMR1", 4);
        sendto(sock, data, PACKET_SIZE, 0, (struct sockaddr *)&source, len);
        vTaskDelay(pdMS_TO_TICKS(20)); /* Bound responder rate to 50 replies/s. */
    }
    close(sock);
    vTaskDelete(NULL);
}

static int link_start_locked(int argc, char **argv)
{
#if CONFIG_AUMANET_GATEWAY
    if(!link_credentials_load()){puts("Retained link credentials unavailable; USB provisioning required.");return 1;}
#endif
    if (touched) { puts("Radio initialization already attempted; reboot before retrying."); return 1; }
    if (strlen(LINK_PSK) < 8 || strlen(LINK_PSK) > 63 ||
        strlen(LINK_SSID) == 0 || strlen(LINK_SSID) > 32 ||
        strlen(CONFIG_HALOW_COUNTRY_CODE) != 2 || strcmp(CONFIG_HALOW_COUNTRY_CODE, "??") == 0 ||
        CONFIG_AUMANET_CHANNEL <= 0 || CONFIG_AUMANET_OPCLASS <= 0) {
        puts("Missing approved country/channel/operating class or private WPA3 passphrase.");
        return 1;
    }
    const struct mmwlan_s1g_channel_list *channels =
        mmwlan_lookup_regulatory_domain(get_regulatory_db(), CONFIG_HALOW_COUNTRY_CODE);
    bool valid_channel = false;
    if (channels) for (unsigned i=0; i<channels->num_channels; i++) {
        const struct mmwlan_s1g_channel *channel = &channels->channels[i];
        if (channel->s1g_chan_num == CONFIG_AUMANET_CHANNEL &&
            (channel->s1g_operating_class == CONFIG_AUMANET_OPCLASS ||
             channel->global_operating_class == CONFIG_AUMANET_OPCLASS)) {
            bench_channel = *channel;
            valid_channel = true;
        }
    }
    if (!valid_channel) { puts("Country/channel/operating class not in the pinned SDK database."); return 1; }
#if CONFIG_AUMANET_GATEWAY
    /* Accept only exact SDK-derived AU2024 tuples, excluding REVMF extras. */
    if(memcmp(CONFIG_HALOW_COUNTRY_CODE,"AU",2))return 1;
    for(unsigned i=0;i<AR_OPTION_COUNT;i++){
        const struct ar_option *option=ar_option(i+1);bool found=false;
        for(unsigned j=0;channels&&j<channels->num_channels;j++){const struct mmwlan_s1g_channel *c=&channels->channels[j];if(c->s1g_chan_num==option->channel&&c->s1g_operating_class==option->opclass&&c->global_operating_class==option->global_opclass&&c->bw_mhz==option->bandwidth_mhz&&c->centre_freq_hz==option->centre_hz){validated_channels[i]=*c;found=true;break;}}
        if(!found){puts("Pinned AU channel catalog differs from linked SDK; RF denied.");return 1;}
    }
    bench_channels.channels=validated_channels;bench_channels.num_channels=AR_OPTION_COUNT;
    selected_option=ar_option_match(CONFIG_AUMANET_CHANNEL,CONFIG_AUMANET_OPCLASS);if(!selected_option)return 1;
    memset(&radio_saved,0,sizeof radio_saved);
#if !CONFIG_AUMANET_NODE_B
    nvs_handle_t profile;esp_err_t profile_error=nvs_open("amn_radio1",NVS_READONLY,&profile);
    if(profile_error==ESP_OK){size_t n=sizeof radio_saved;profile_error=nvs_get_blob(profile,"profile",&radio_saved,&n);nvs_close(profile);if(profile_error==ESP_OK){
      uint8_t reserved=0;for(unsigned i=0;i<sizeof radio_saved.reserved;i++)reserved|=radio_saved.reserved[i];
      if(n!=sizeof radio_saved||radio_saved.version!=1||reserved||!ar_option(radio_saved.option)||!radio_saved.generation||radio_saved.generation>AB_MAX_SAFE){puts("Radio profile storage invalid; RF denied until USB repair.");return 1;}
      if(radio_scope_ready&&!memcmp(radio_saved.scope,radio_scope,32)&&!memcmp(radio_saved.link_scope,radio_link_scope,32))selected_option=radio_saved.option;else memset(&radio_saved,0,sizeof radio_saved);
    }}if(profile_error!=ESP_OK&&profile_error!=ESP_ERR_NVS_NOT_FOUND){puts("Radio profile read unconfirmed; RF denied.");return 1;}
#endif
    bench_channel=validated_channels[selected_option-1];
    if(!ar_trial_initialize(&radio_trial,selected_option,radio_saved.generation,radio_saved.transaction,NULL,radio_apply,radio_persist))return 1;
    radio_trial.view.power=CONFIG_AUMANET_TX_DBM;
#if CONFIG_AUMANET_NODE_B
    radio_trial.view.station=1;radio_trial.view.current=radio_trial.view.persisted=radio_trial.view.actual=0;radio_trial.view.flags=1;
#endif
#endif
    touched = true;
    /* A CPU-only restart can retain a level-triggered radio IRQ from the old
     * driver. Disable it before mmhal_init installs the new ISR service;
     * otherwise the unhandled level can storm inside interrupt allocation. */
    ESP_ERROR_CHECK(gpio_intr_disable(CONFIG_MM_SPI_IRQ));
    ESP_ERROR_CHECK(gpio_set_intr_type(CONFIG_MM_SPI_IRQ, GPIO_INTR_DISABLE));
    memcpy(bench_channels.country_code, CONFIG_HALOW_COUNTRY_CODE, 2);
    ESP_ERROR_CHECK(esp_netif_init());
    ESP_ERROR_CHECK(esp_event_loop_create_default());
    ESP_ERROR_CHECK(mmhalow_init(NULL));
    struct mmwlan_version version = {0};
    if (mmwlan_get_version(&version) != MMWLAN_SUCCESS || !version.morse_fw_version[0]) {
        puts("HaLow firmware did not boot; reboot required."); return 1;
    }
    if (!profile_applied) {
        puts("Single-channel or low-power profile rejected; reboot required."); return 1;
    }
    esp_netif_t *netif = esp_netif_get_handle_from_ifkey("WIFI_STA_DEF");
    if (!netif) { puts("HaLow netif unavailable; reboot required."); return 1; }
    radio_netif = netif;
#if CONFIG_AUMANET_GATEWAY
    aumanet_gateway_mesh_ready(netif);
#endif
#if !CONFIG_AUMANET_NODE_B
    enum mmwlan_status callback_result = mmwlan_register_vif_state_cb(MMWLAN_VIF_AP, ap_vif_state, netif);
    if (callback_result != MMWLAN_SUCCESS) {
        printf("AP callback registration failed: %d\n", callback_result); return 1;
    }
#endif
    esp_err_t result = esp_netif_dhcpc_stop(netif);
    if (result != ESP_OK && result != ESP_ERR_ESP_NETIF_DHCP_ALREADY_STOPPED) {
        printf("DHCP stop failed: %s\n", esp_err_to_name(result)); return 1;
    }
    esp_netif_ip_info_t ip = {0};
    inet_pton(AF_INET, LOCAL_IP, &ip.ip.addr);
    inet_pton(AF_INET, "255.255.255.252", &ip.netmask.addr);
    ESP_ERROR_CHECK(esp_netif_set_ip_info(netif, &ip));
#if CONFIG_AUMANET_NODE_B
    mmhalow_wifi_config_t config = {.sta=MMWLAN_STA_ARGS_INIT};
    memcpy(config.sta.ssid, LINK_SSID, strlen(LINK_SSID));
    config.sta.ssid_len = strlen(LINK_SSID);
    memcpy(config.sta.passphrase, LINK_PSK, strlen(LINK_PSK));
    config.sta.passphrase_len = strlen(LINK_PSK);
    config.sta.security_type = MMWLAN_SAE;
    config.sta.pmf_mode = MMWLAN_PMF_REQUIRED;
#if CONFIG_AUMANET_GATEWAY
    config.sta.sta_evt_cb=diagnostic_sta_event;
#endif
    ESP_ERROR_CHECK(mmhalow_set_config(WIFI_IF_STA, &config));
    ESP_ERROR_CHECK(mmhalow_connect(
#if CONFIG_AUMANET_GATEWAY
      diagnostic_sta_state
#else
      NULL
#endif
    ));
#else
    mmhalow_wifi_config_t config = {.ap=MMWLAN_AP_ARGS_INIT};
    memcpy(config.ap.ssid, LINK_SSID, strlen(LINK_SSID));
    config.ap.ssid_len = strlen(LINK_SSID);
    memcpy(config.ap.passphrase, LINK_PSK, strlen(LINK_PSK));
    config.ap.security_type = MMWLAN_SAE;
    config.ap.pmf_mode = MMWLAN_PMF_REQUIRED;
    config.ap.max_stas = 1;
    config.ap.sta_status_cb = ap_station_state;
    config.ap.passphrase_len = strlen(LINK_PSK);
    config.ap.s1g_chan_num = bench_channel.s1g_chan_num;
    config.ap.op_class = bench_channel.s1g_operating_class;
#if CONFIG_AUMANET_GATEWAY
    active_ap_config=config;
#endif
    ESP_ERROR_CHECK(mmhalow_set_config(WIFI_IF_AP, &config));
    enum mmwlan_status ap_result = mmwlan_ap_enable(&config.ap);
    if (ap_result != MMWLAN_SUCCESS) {
        printf("AP start failed: %d; reboot required.\n", ap_result); return 1;
    }
    uint8_t ap_mac[6];
    enum mmwlan_status mac_result = mmwlan_get_vif_mac_addr(MMWLAN_VIF_AP, ap_mac);
    if (mac_result != MMWLAN_SUCCESS) {
        printf("AP MAC query failed after start: %d\n", mac_result); return 1;
    }
    ESP_ERROR_CHECK(esp_netif_set_mac(netif, ap_mac));
#endif
    int sock = socket(AF_INET, SOCK_DGRAM, IPPROTO_UDP);
    struct sockaddr_in local = {.sin_family=AF_INET, .sin_port=htons(BENCH_PORT)};
    inet_pton(AF_INET, LOCAL_IP, &local.sin_addr);
    if (sock < 0 || bind(sock, (struct sockaddr *)&local, sizeof(local)) < 0) {
        printf("Echo bind failed: %d; reboot required.\n", errno);
        if (sock >= 0) close(sock);
        return 1;
    }
    if (xTaskCreate(echo_task, "bench_echo", 4096, (void *)(intptr_t)sock, 4, NULL) != pdPASS) {
        close(sock);
        puts("Echo task creation failed; reboot required."); return 1;
    }
    started = true;
#if CONFIG_AUMANET_GATEWAY
    radio_worker_ready=xTaskCreate(radio_worker,"radio_profile",6144,NULL,4,NULL)==pdPASS;
    if(!radio_worker_ready){puts("Radio profile worker unavailable; configuration disabled.");radio_storage_failed=true;}
#endif
    printf("\n{\"schema\":\"aumanet.bench.v1\",\"type\":\"radio_started\",\"local_ip\":\"%s\",\"peer_ip\":\"%s\"}\n", LOCAL_IP, PEER_IP);
    return 0;
}

int bench_link_probe(int argc, char **argv)
{
    if (!started) { puts("Start the provisioned radio first."); return 1; }
    int sock = socket(AF_INET, SOCK_DGRAM, IPPROTO_UDP);
    if (sock < 0) { puts("Cannot create probe socket."); return 1; }
    const struct sockaddr_in peer = peer_address();
    if (connect(sock, (const struct sockaddr *)&peer, sizeof(peer)) < 0) {
        close(sock); return 1;
    }
    unsigned received = 0;
    int64_t total_us = 0;
    uint8_t packet[PACKET_SIZE] = {0}, reply[PACKET_SIZE+1];
    uint32_t session = esp_random();
    memcpy(packet, "AMN1", 4);
    memcpy(packet+4, &session, sizeof(session));
    for (uint32_t seq=0; seq<10; seq++) {
        memcpy(packet+8, &seq, sizeof(seq));
        const int64_t begin = esp_timer_get_time();
        const int64_t deadline = begin + 2000000;
        bool matched = false;
        if (send(sock, packet, sizeof(packet), 0) == sizeof(packet)) {
            while (esp_timer_get_time() < deadline) {
                int64_t remaining = deadline - esp_timer_get_time();
                if (remaining <= 0) break;
                struct timeval timeout = {.tv_sec=remaining/1000000, .tv_usec=remaining%1000000};
                setsockopt(sock, SOL_SOCKET, SO_RCVTIMEO, &timeout, sizeof(timeout));
                int n = recv(sock, reply, sizeof(reply), 0);
                if (n < 0) break;
                if (n == PACKET_SIZE && memcmp(reply, "AMR1", 4) == 0 &&
                    memcmp(reply+4, packet+4, PACKET_SIZE-4) == 0) {
                    matched = true; break;
                }
            }
        }
        int64_t elapsed = esp_timer_get_time() - begin;
        if (matched) { received++; total_us += elapsed; }
        printf("\n{\"type\":\"probe\",\"sequence\":%lu,\"received\":%s,\"elapsed_us\":%lld}\n",
               (unsigned long)seq, matched ? "true" : "false", (long long)elapsed);
        vTaskDelay(pdMS_TO_TICKS(100));
    }
    close(sock);
    printf("\n{\"schema\":\"aumanet.bench.v1\",\"type\":\"link_result\",\"sent\":10,\"received\":%u,\"payload_bytes\":64,\"mean_rtt_us\":", received);
    if (received) printf("%lld", (long long)(total_us/received)); else printf("null");
    puts("}");
    return received == 10 ? 0 : 1;
}
#if CONFIG_AUMANET_GATEWAY
static int radio_apply(void *ignored,unsigned option){
    (void)ignored;
#if CONFIG_AUMANET_NODE_B
    (void)option;return 0;
#else
    const struct ar_option *target=ar_option(option);if(!target||!started)return 0;
    enum mmwlan_status disabled=mmwlan_ap_disable();if(disabled!=MMWLAN_SUCCESS&&disabled!=MMWLAN_SHUTDOWN_BLOCKED)return 0;
    radio_vif_up=false;peer_state=MMWLAN_AP_STA_UNKNOWN;
    mmhalow_wifi_config_t next=active_ap_config;next.ap.s1g_chan_num=target->channel;next.ap.op_class=target->opclass;
    if(mmhalow_set_config(WIFI_IF_AP,&next)!=ESP_OK||mmwlan_ap_enable(&next.ap)!=MMWLAN_SUCCESS)return 0;
    active_ap_config=next;bench_channel=validated_channels[option-1];return 1;
#endif
}
static int radio_persist(void *ignored,unsigned option,uint64_t generation,const uint8_t transaction[16]){
    (void)ignored;
#if CONFIG_AUMANET_NODE_B
    (void)option;(void)generation;(void)transaction;return 0;
#else
    if(!radio_scope_ready||!atomic_load(&radio_permitted)||radio_storage_failed)return 0;
    struct radio_record next={.version=1,.generation=generation,.option=(uint8_t)option};memcpy(next.scope,radio_scope,32);memcpy(next.link_scope,radio_link_scope,32);memcpy(next.transaction,transaction,16);
    nvs_handle_t profile;esp_err_t error=nvs_open("amn_radio1",NVS_READWRITE,&profile);
    if(error==ESP_OK){error=nvs_set_blob(profile,"profile",&next,sizeof next);if(error==ESP_OK)error=nvs_commit(profile);if(error==ESP_OK){struct radio_record back;size_t n=sizeof back;if(nvs_get_blob(profile,"profile",&back,&n)!=ESP_OK||n!=sizeof back||memcmp(&back,&next,sizeof back))error=ESP_FAIL;}nvs_close(profile);}
    if(error!=ESP_OK){radio_storage_failed=true;return 0;}radio_saved=next;return 1;
#endif
}
static void radio_observe(void){
    struct mmwlan_vif_channel_info info={0};bool associated=false;
#if CONFIG_AUMANET_NODE_B
    uint8_t bssid[6];associated=mmwlan_get_sta_state()==MMWLAN_STA_CONNECTED&&mmwlan_get_bssid(bssid)==MMWLAN_SUCCESS&&!memcmp(bssid,radio_bssid,6);
    enum mmwlan_vif vif=MMWLAN_VIF_STA;
#else
    associated=radio_vif_up;enum mmwlan_vif vif=MMWLAN_VIF_AP;
#endif
    unsigned actual=associated&&mmwlan_get_vif_channel_info(vif,&info)==MMWLAN_SUCCESS?ar_option_match(info.s1g_chan_num,info.op_class):0;
#if CONFIG_AUMANET_NODE_B
    uint8_t after[6];if(mmwlan_get_sta_state()!=MMWLAN_STA_CONNECTED||mmwlan_get_bssid(after)!=MMWLAN_SUCCESS||memcmp(after,radio_bssid,6))actual=0;
    radio_trial.view.station=1;radio_trial.view.current=(uint8_t)actual;radio_trial.view.persisted=0;radio_trial.view.flags=1;
#endif
    radio_trial.view.actual=(uint8_t)actual;radio_trial.view.associated=actual!=0;
    if(radio_storage_failed){radio_trial.view.flags&=(uint8_t)~3u;radio_trial.view.state=5;radio_trial.view.error=3;}
}
static void radio_worker(void *ignored){(void)ignored;uint64_t observed=0;for(;;){if(xSemaphoreTake(wlan_api_mutex,0)==pdTRUE){
      uint64_t now=(uint64_t)(esp_timer_get_time()/1000);if(radio_trial.action==2||now-observed>=500){radio_observe();observed=now;}
#if !CONFIG_AUMANET_NODE_B
      ar_trial_tick(&radio_trial,now,atomic_load(&radio_permitted)&&!atomic_exchange(&radio_cancel_requested,false)?1:0);
#endif
      xSemaphoreGive(wlan_api_mutex);}vTaskDelay(pdMS_TO_TICKS(100));}}
int bench_link_radio_read(struct ar_snapshot *out){if(!out||!wlan_api_mutex||xSemaphoreTake(wlan_api_mutex,0)!=pdTRUE)return 0;radio_observe();*out=radio_trial.view;uint64_t now=(uint64_t)(esp_timer_get_time()/1000);out->remaining=out->state==3&&radio_trial.deadline>now?(uint32_t)(radio_trial.deadline-now):0;if(!radio_worker_ready||!radio_scope_ready)out->flags&=(uint8_t)~2u;xSemaphoreGive(wlan_api_mutex);return 1;}
int bench_link_radio_command(unsigned operation,unsigned option,const uint8_t transaction[16],uint64_t generation){
#if CONFIG_AUMANET_NODE_B
    (void)operation;(void)option;(void)transaction;(void)generation;return 0;
#else
    if(!radio_worker_ready||!radio_scope_ready||!atomic_load(&radio_permitted)||atomic_load(&radio_cancel_requested)||!wlan_api_mutex||xSemaphoreTake(wlan_api_mutex,0)!=pdTRUE)return 0;
    if(operation==2)radio_observe();
    int result=atomic_load(&radio_permitted)&&ar_trial_command(&radio_trial,operation,option,transaction,generation,(uint64_t)(esp_timer_get_time()/1000));xSemaphoreGive(wlan_api_mutex);return result;
#endif
}
int bench_link_radio_default(void){
    if(started)return 0;
    nvs_handle_t profile;esp_err_t error=nvs_open("amn_radio1",NVS_READWRITE,&profile);
    if(error==ESP_OK){error=nvs_erase_key(profile,"profile");if(error==ESP_ERR_NVS_NOT_FOUND)error=ESP_OK;if(error==ESP_OK)error=nvs_commit(profile);if(error==ESP_OK){size_t n=0;if(nvs_get_blob(profile,"profile",NULL,&n)!=ESP_ERR_NVS_NOT_FOUND)error=ESP_FAIL;}nvs_close(profile);}
    return error==ESP_OK;
}
#else
void bench_link_radio_setup(const uint8_t scope[32],const uint8_t bssid[6]){(void)scope;(void)bssid;}
void bench_link_radio_permit(int enabled){(void)enabled;}
int bench_link_radio_read(struct ar_snapshot *out){(void)out;return 0;}
int bench_link_radio_command(unsigned op,unsigned option,const uint8_t tx[16],uint64_t generation){(void)op;(void)option;(void)tx;(void)generation;return 0;}
int bench_link_radio_default(void){return 0;}
#endif
/* All non-TX mmwlan API calls made by this app share this owner. Telemetry
 * never waits behind a USB scan/start/status operation and never initiates one. */
int bench_link_signal(const uint8_t bssid[6],int32_t *rssi){if(!wlan_api_mutex||xSemaphoreTake(wlan_api_mutex,0)!=pdTRUE)return 2;int result=signal_locked(bssid,rssi);xSemaphoreGive(wlan_api_mutex);return result;}
int bench_link_start(int argc,char **argv){if(!wlan_api_mutex)wlan_api_mutex=xSemaphoreCreateMutex();if(!wlan_api_mutex)return 1;xSemaphoreTake(wlan_api_mutex,portMAX_DELAY);int result=link_start_locked(argc,argv);xSemaphoreGive(wlan_api_mutex);return result;}
int bench_link_status(int argc,char **argv){if(wlan_api_mutex)xSemaphoreTake(wlan_api_mutex,portMAX_DELAY);int result=link_status_locked(argc,argv);if(wlan_api_mutex)xSemaphoreGive(wlan_api_mutex);return result;}
int bench_link_scan(int argc,char **argv){if(!wlan_api_mutex)return 1;xSemaphoreTake(wlan_api_mutex,portMAX_DELAY);int result=link_scan_locked(argc,argv);xSemaphoreGive(wlan_api_mutex);return result;}
#else
void bench_link_radio_setup(const uint8_t scope[32],const uint8_t bssid[6]){(void)scope;(void)bssid;}
void bench_link_radio_permit(int enabled){(void)enabled;}
int bench_link_radio_read(struct ar_snapshot *out){(void)out;return 0;}
int bench_link_radio_command(unsigned op,unsigned option,const uint8_t tx[16],uint64_t generation){(void)op;(void)option;(void)tx;(void)generation;return 0;}
int bench_link_radio_default(void){return 0;}
int bench_link_signal(const uint8_t bssid[6],int32_t *rssi){(void)bssid;(void)rssi;return 2;}
int bench_link_scan(int argc, char **argv) { puts("RF disabled."); return 1; }
int bench_link_status(int argc, char **argv)
{
    puts("\n{\"schema\":\"aumanet.bench.v1\",\"type\":\"radio_status\",\"started\":false,\"rf_enabled\":false}");
    return 0;
}
int bench_link_start(int argc, char **argv)
{
    puts("RF disabled in this build. Supply an approved regional profile and build node A/B.");
    return 1;
}
int bench_link_probe(int argc, char **argv)
{
    puts("RF disabled in this build; no peer measurement exists.");
    return 1;
}
#endif
