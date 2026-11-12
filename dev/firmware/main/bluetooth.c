/* Development BLE transport. Browser grants are not authenticated membership.
 * No credentials, firmware writes or arbitrary console commands are exposed. */
#include <stdio.h>
#include <string.h>
#include <stdlib.h>
#include <stdatomic.h>
#include "bluetooth.h"
#include "messages.h"
#include "link.h"
#include "esp_app_desc.h"
#include "esp_mac.h"
#include "esp_timer.h"
#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/queue.h"
#include "nimble/nimble_port.h"
#include "nimble/nimble_port_freertos.h"
#include "host/ble_hs.h"
#include "services/gap/ble_svc_gap.h"
#include "services/gatt/ble_svc_gatt.h"

/* 6ba10001/2/3-15a8-461f-9fa8-5dcae273eafd; NimBLE UUID bytes are LE. */
#define UUID(n) BLE_UUID128_INIT(0xfd,0xea,0x73,0xe2,0xca,0x5d,0xa8,0x9f,0x1f,0x46,0xa8,0x15,n,0x00,0xa1,0x6b)
static const ble_uuid128_t service_uuid=UUID(1), request_uuid=UUID(2), response_uuid=UUID(3);
static uint16_t response_handle;
static uint8_t address_type;
static char device_name[24];
static atomic_uint connection=BLE_HS_CONN_HANDLE_NONE, generation;
static atomic_bool subscribed, busy;
static char incoming[2048];
static size_t incoming_size;
struct request { unsigned connection, generation; char json[2048]; };
static QueueHandle_t requests;

static cJSON *snapshot(void)
{
    uint8_t mac[6]; esp_read_mac(mac,ESP_MAC_WIFI_STA);
    char node[13]; snprintf(node,sizeof(node),"%02x%02x%02x%02x%02x%02x",mac[0],mac[1],mac[2],mac[3],mac[4],mac[5]);
    cJSON *s=cJSON_CreateObject();
    cJSON_AddStringToObject(s,"schema","aumanet.ble.v1");
    cJSON_AddStringToObject(s,"node",node);
    cJSON_AddStringToObject(s,"name",device_name);
    cJSON_AddStringToObject(s,"firmware",esp_app_get_description()->version);
#if CONFIG_AUMANET_NODE_B
    cJSON_AddStringToObject(s,"role","B");
#else
    cJSON_AddStringToObject(s,"role","A");
#endif
    cJSON_AddNumberToObject(s,"uptime_ms",esp_timer_get_time()/1000);
    cJSON_AddBoolToObject(s,"radio_started",bench_link_started());
    cJSON_AddBoolToObject(s,"storage_ready",bench_messages_ready());
    cJSON *rows=bench_messages_json();
    cJSON_AddItemToObject(s,"messages",rows?rows:cJSON_CreateArray());
    return s;
}

static void respond(const struct request *request, cJSON *reply)
{
    char *json=cJSON_PrintUnformatted(reply);
    if (!json) return;
    size_t length=strlen(json);
    /* One newline-delimited JSON frame. Small chunks work at minimum ATT MTU.
     * Congestion retries never repeat application operations. */
    for (size_t offset=0; offset<=length;) {
        if (atomic_load(&generation)!=request->generation || atomic_load(&connection)!=request->connection || !atomic_load(&subscribed)) break;
        const char *data=offset==length?"\n":json+offset;
        size_t size=offset==length?1:(length-offset>20?20:length-offset);
        int rc=BLE_HS_ENOMEM;
        for (unsigned retry=0; retry<50 && rc==BLE_HS_ENOMEM; retry++) {
            struct os_mbuf *buffer=ble_hs_mbuf_from_flat(data,size);
            rc=buffer?ble_gatts_notify_custom(request->connection,response_handle,buffer):BLE_HS_ENOMEM;
            if (rc==BLE_HS_ENOMEM) vTaskDelay(pdMS_TO_TICKS(20));
        }
        if (rc) { ESP_LOGW("ble","Response interrupted: %d",rc); break; }
        offset+=size; if (offset<=length) vTaskDelay(pdMS_TO_TICKS(10));
    }
    free(json);
}

static void worker(void *unused)
{
    struct request *request=calloc(1,sizeof(*request)); configASSERT(request);
    for (;;) {
        xQueueReceive(requests,request,portMAX_DELAY);
        if (request->generation!=atomic_load(&generation)) { atomic_store(&busy,false); continue; }
        cJSON *input=cJSON_ParseWithOpts(request->json,NULL,true), *reply=cJSON_CreateObject();
        const cJSON *id=cJSON_GetObjectItemCaseSensitive(input,"requestId"), *op=cJSON_GetObjectItemCaseSensitive(input,"op");
        bool valid=cJSON_IsString(id) && strlen(id->valuestring)==16 && cJSON_IsString(op);
        int result=1;
        if (valid) {
            cJSON_AddStringToObject(reply,"requestId",id->valuestring);
            if (!strcmp(op->valuestring,"snapshot")) result=0;
            else if (!strcmp(op->valuestring,"radio-start")) result=bench_radio_start();
            else if (!strcmp(op->valuestring,"send")) {
                const cJSON *message_id=cJSON_GetObjectItemCaseSensitive(input,"id"), *text=cJSON_GetObjectItemCaseSensitive(input,"text");
                if (cJSON_IsString(message_id) && strlen(message_id->valuestring)==16 && cJSON_IsString(text)) {
                    size_t length=strlen(text->valuestring);
                    if (length && length<=BENCH_MESSAGE_BYTES) {
                        char hex[BENCH_MESSAGE_BYTES*2+1];
                        for (size_t i=0; i<length; i++) snprintf(hex+i*2,3,"%02x",(unsigned char)text->valuestring[i]);
                        char *argv[]={"message-send",message_id->valuestring,hex};
                        result=bench_messages_send(3,argv);
                    }
                }
            }
        }
        cJSON_AddBoolToObject(reply,"ok",result==0);
        if (result) cJSON_AddStringToObject(reply,"error","Node rejected the request. Check radio and persistent storage.");
        cJSON_AddItemToObject(reply,"snapshot",snapshot());
        respond(request,reply); cJSON_Delete(reply); cJSON_Delete(input);
        atomic_store(&busy,false);
    }
}

static int access_request(uint16_t conn, uint16_t attr, struct ble_gatt_access_ctxt *context, void *arg)
{
    if (context->op!=BLE_GATT_ACCESS_OP_WRITE_CHR) return BLE_ATT_ERR_WRITE_NOT_PERMITTED;
    if (atomic_load(&busy) || !atomic_load(&subscribed)) return BLE_ATT_ERR_INSUFFICIENT_RES;
    uint16_t size=OS_MBUF_PKTLEN(context->om);
    if (!size || incoming_size+size>=sizeof(incoming)) { incoming_size=0; return BLE_ATT_ERR_INVALID_ATTR_VALUE_LEN; }
    if (os_mbuf_copydata(context->om,0,size,incoming+incoming_size)) return BLE_ATT_ERR_UNLIKELY;
    incoming_size+=size;
    if (incoming[incoming_size-1]!='\n') return 0;
    incoming[incoming_size-1]=0;
    struct request request={.connection=conn,.generation=atomic_load(&generation)};
    memcpy(request.json,incoming,incoming_size); incoming_size=0;
    atomic_store(&busy,true);
    if (xQueueSend(requests,&request,0)!=pdTRUE) { atomic_store(&busy,false); return BLE_ATT_ERR_INSUFFICIENT_RES; }
    return 0;
}

static const struct ble_gatt_svc_def services[]={
    {.type=BLE_GATT_SVC_TYPE_PRIMARY,.uuid=&service_uuid.u,.characteristics=(struct ble_gatt_chr_def[]){
        {.uuid=&request_uuid.u,.access_cb=access_request,.flags=BLE_GATT_CHR_F_WRITE},
        {.uuid=&response_uuid.u,.access_cb=access_request,.val_handle=&response_handle,.flags=BLE_GATT_CHR_F_NOTIFY}, {0}}}, {0}};
static void advertise(void);
static int gap_event(struct ble_gap_event *event, void *arg)
{
    switch (event->type) {
    case BLE_GAP_EVENT_CONNECT:
        if (!event->connect.status) { atomic_store(&connection,event->connect.conn_handle); atomic_fetch_add(&generation,1); }
        else advertise();
        break;
    case BLE_GAP_EVENT_DISCONNECT:
        atomic_store(&connection,BLE_HS_CONN_HANDLE_NONE); atomic_store(&subscribed,false);
        atomic_fetch_add(&generation,1); incoming_size=0; advertise(); break;
    case BLE_GAP_EVENT_SUBSCRIBE:
        if (event->subscribe.attr_handle==response_handle) atomic_store(&subscribed,event->subscribe.cur_notify);
        break;
    case BLE_GAP_EVENT_ADV_COMPLETE: advertise(); break;
    default: break;
    }
    return 0;
}
static void advertise(void)
{
    struct ble_hs_adv_fields fields={.flags=BLE_HS_ADV_F_DISC_GEN|BLE_HS_ADV_F_BREDR_UNSUP,
        .uuids128=(ble_uuid128_t *)&service_uuid,.num_uuids128=1,.uuids128_is_complete=1};
    int rc=ble_gap_adv_set_fields(&fields);
    struct ble_hs_adv_fields scan={.name=(uint8_t *)device_name,.name_len=strlen(device_name),.name_is_complete=1};
    if (!rc) rc=ble_gap_adv_rsp_set_fields(&scan);
    struct ble_gap_adv_params params={.conn_mode=BLE_GAP_CONN_MODE_UND,.disc_mode=BLE_GAP_DISC_MODE_GEN};
    if (!rc) rc=ble_gap_adv_start(address_type,NULL,BLE_HS_FOREVER,&params,gap_event,NULL);
    ESP_LOGI("ble","%s advertising (%d)",device_name,rc);
}
static void sync_host(void)
{
    if (!ble_hs_id_infer_auto(0,&address_type)) advertise();
}
static void host_task(void *unused) { nimble_port_run(); nimble_port_freertos_deinit(); }
void bench_bluetooth_init(void)
{
    uint8_t mac[6]; esp_read_mac(mac,ESP_MAC_WIFI_STA);
    snprintf(device_name,sizeof(device_name),"AuMaNET-%02X%02X",mac[4],mac[5]);
    requests=xQueueCreate(1,sizeof(struct request)); configASSERT(requests);
    ESP_ERROR_CHECK(nimble_port_init());
    ble_svc_gap_init(); ble_svc_gatt_init();
    ble_svc_gap_device_name_set(device_name); ble_hs_cfg.sync_cb=sync_host;
    ESP_ERROR_CHECK(ble_gatts_count_cfg(services)); ESP_ERROR_CHECK(ble_gatts_add_svcs(services));
    configASSERT(xTaskCreate(worker,"ble_requests",12288,NULL,5,NULL)==pdPASS);
    nimble_port_freertos_init(host_task);
}
