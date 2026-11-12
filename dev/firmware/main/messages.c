#include "sdkconfig.h"
#include "messages.h"
#include "link.h"
#include <stdio.h>
#include <string.h>
#include <unistd.h>
#include <arpa/inet.h>
#include "esp_timer.h"
#include "esp_log.h"
#include "nvs.h"
#include "freertos/FreeRTOS.h"
#include "freertos/semphr.h"

#if CONFIG_AUMANET_NODE_B
#define OWN_ROLE 'B'
#define PEER_ROLE 'A'
#define OWN_IP "10.78.0.2"
#define PEER_IP "10.78.0.1"
#else
#define OWN_ROLE 'A'
#define PEER_ROLE 'B'
#define OWN_IP "10.78.0.1"
#define PEER_IP "10.78.0.2"
#endif
#define HISTORY_SIZE 8
#define BENCH_PORT 17777
enum delivery_state {UNCONFIRMED, DELIVERED, RECEIVED};
struct message { char id[17], from, text[BENCH_MESSAGE_BYTES+1]; enum delivery_state state; int64_t uptime_ms; };
static struct message history[HISTORY_SIZE];
static unsigned count;
static SemaphoreHandle_t history_lock;
static nvs_handle_t storage;
static bool storage_ready;
/* Versioned fixed-capacity record, local to this bench firmware. NVS commits
 * precede peer ACKs. Never silently erase an unreadable/unknown schema. */
struct stored_history { uint32_t version, role, count; struct message rows[HISTORY_SIZE]; };
static struct stored_history disk;
static struct message rollback[HISTORY_SIZE];
static unsigned rollback_count;
static bool valid_id(const char *id);
static bool valid_text(const uint8_t *text, size_t size);
bool bench_messages_ready(void) { return storage_ready; }

static void checkpoint_locked(void)
{
    memcpy(rollback,history,sizeof(history)); rollback_count=count;
}
static bool persist_locked(void)
{
    memset(&disk,0,sizeof(disk)); disk.version=1; disk.role=OWN_ROLE; disk.count=count;
    memcpy(disk.rows,history,sizeof(history));
    esp_err_t error=nvs_set_blob(storage,"messages_v1",&disk,sizeof(disk));
    if (error==ESP_OK) error=nvs_commit(storage);
    if (error==ESP_OK) return true;
    memcpy(history,rollback,sizeof(history)); count=rollback_count;
    /* A commit failure may leave an uncertain pending value. Stop accepting
     * writes until reboot/recovery instead of acknowledging uncommitted data. */
    storage_ready=false;
    ESP_LOGE("messages","Persistent history commit failed: %s",esp_err_to_name(error));
    return false;
}

void bench_messages_init(void)
{
    history_lock = xSemaphoreCreateMutex();
    configASSERT(history_lock);
    esp_err_t error=nvs_open("amn_messages",NVS_READWRITE,&storage);
    if (error!=ESP_OK) { ESP_LOGE("messages","Open failed: %s",esp_err_to_name(error)); return; }
    size_t size=sizeof(disk);
    error=nvs_get_blob(storage,"messages_v1",&disk,&size);
    if (error==ESP_ERR_NVS_NOT_FOUND) { storage_ready=true; return; }
    if (error!=ESP_OK || size!=sizeof(disk) || disk.version!=1 || disk.role!=OWN_ROLE || disk.count>HISTORY_SIZE) {
        ESP_LOGE("messages","Stored history unreadable or incompatible; preserving it"); return;
    }
    for (unsigned i=0; i<disk.count; i++) {
        const struct message *row=&disk.rows[i];
        size_t length=strnlen(row->text,sizeof(row->text));
        if (row->id[16] || !valid_id(row->id) || !valid_text((const uint8_t *)row->text,length) ||
            row->uptime_ms<0 || !((row->from==OWN_ROLE && (row->state==UNCONFIRMED || row->state==DELIVERED)) ||
                                 (row->from==PEER_ROLE && row->state==RECEIVED))) {
            ESP_LOGE("messages","Invalid stored message; preserving history"); return;
        }
        for (unsigned j=0; j<i; j++) if (disk.rows[j].from==row->from && memcmp(disk.rows[j].id,row->id,16)==0) {
            ESP_LOGE("messages","Duplicate stored message; preserving history"); return;
        }
    }
    count=disk.count; memcpy(history,disk.rows,sizeof(history)); storage_ready=true;
    ESP_LOGI("messages","Restored %u persistent messages",count);
}
#if CONFIG_AUMANET_RF_ENABLED
static int nibble(char c)
{
    if (c >= '0' && c <= '9') return c-'0';
    if (c >= 'a' && c <= 'f') return c-'a'+10;
    if (c >= 'A' && c <= 'F') return c-'A'+10;
    return -1;
}
#endif
static bool valid_id(const char *id)
{
    for (unsigned i=0; i<16; i++)
        if (!((id[i]>='0' && id[i]<='9') || (id[i]>='a' && id[i]<='f'))) return false;
    return true;
}
static bool valid_text(const uint8_t *text, size_t size)
{
    if (!size || size > BENCH_MESSAGE_BYTES) return false;
    bool visible = false;
    for (size_t i=0; i<size;) {
        uint32_t c=text[i++], minimum=0; unsigned continuation=0;
        if (!c) return false;
        if (c>32) visible=true;
        if (c<128) continue;
        if (c>=0xc2 && c<=0xdf) { c&=31; continuation=1; minimum=0x80; }
        else if (c>=0xe0 && c<=0xef) { c&=15; continuation=2; minimum=0x800; }
        else if (c>=0xf0 && c<=0xf4) { c&=7; continuation=3; minimum=0x10000; }
        else return false;
        if (i+continuation>size) return false;
        while (continuation--) {
            uint8_t next=text[i++]; if ((next&0xc0)!=0x80) return false;
            c=(c<<6)|(next&63);
        }
        if (c<minimum || c>0x10ffff || (c>=0xd800 && c<=0xdfff)) return false;
    }
    return visible;
}
static int find_message(const char *id, char from)
{
    for (unsigned i=0; i<count; i++) if (history[i].from==from && memcmp(history[i].id,id,16)==0) return (int)i;
    return -1;
}
static unsigned insert_message(const char *id, char from, const uint8_t *text, size_t size, enum delivery_state state)
{
    if (count==HISTORY_SIZE) { memmove(history,history+1,(HISTORY_SIZE-1)*sizeof(*history)); count--; }
    unsigned index=count++;
    history[index]=(struct message){.from=from,.state=state,.uptime_ms=esp_timer_get_time()/1000};
    memcpy(history[index].id,id,16); memcpy(history[index].text,text,size);
    return index;
}
static void print_string(const char *text)
{
    putchar('"');
    for (const unsigned char *p=(const unsigned char *)text; *p; p++) {
        if (*p=='"' || *p=='\\') { putchar('\\'); putchar(*p); }
        else if (*p<32) printf("\\u%04x",*p);
        else putchar(*p);
    }
    putchar('"');
}
static void print_message(const struct message *message)
{
    printf("{\"id\":\"%s\",\"from\":\"%c\",\"text\":",message->id,message->from);
    print_string(message->text);
    printf(",\"state\":\"%s\",\"uptime_ms\":%lld}",
           message->state==DELIVERED?"delivered_to_peer":message->state==RECEIVED?"received":"unconfirmed",
           (long long)message->uptime_ms);
}
cJSON *bench_messages_json(void)
{
    if (!storage_ready) return NULL;
    cJSON *rows=cJSON_CreateArray();
    if (!rows) return NULL;
    xSemaphoreTake(history_lock,portMAX_DELAY);
    for (unsigned i=0; i<count; i++) {
        const struct message *m=&history[i];
        cJSON *row=cJSON_CreateObject();
        char from[2]={m->from,0};
        cJSON_AddStringToObject(row,"id",m->id);
        cJSON_AddStringToObject(row,"from",from);
        cJSON_AddStringToObject(row,"text",m->text);
        cJSON_AddStringToObject(row,"state",m->state==DELIVERED?"delivered_to_peer":m->state==RECEIVED?"received":"unconfirmed");
        cJSON_AddNumberToObject(row,"uptime_ms",m->uptime_ms);
        cJSON_AddItemToArray(rows,row);
    }
    xSemaphoreGive(history_lock);
    return rows;
}
int bench_messages_list(int argc, char **argv)
{
    if (!storage_ready) { puts("Persistent message storage unavailable; history preserved for recovery."); return 1; }
    struct message snapshot[HISTORY_SIZE]; unsigned size;
    xSemaphoreTake(history_lock,portMAX_DELAY); size=count; memcpy(snapshot,history,size*sizeof(*snapshot)); xSemaphoreGive(history_lock);
    printf("\n{\"schema\":\"aumanet.bench.v1\",\"type\":\"messages\",\"messages\":[");
    for (unsigned i=0; i<size; i++) { if (i) putchar(','); print_message(&snapshot[i]); }
    puts("]}"); return 0;
}
void bench_messages_receive(int socket, const uint8_t *data, size_t size,
                            const struct sockaddr *source, socklen_t source_len)
{
    if (size<24 || size>BENCH_MESSAGE_WIRE_MAX || memcmp(data,"AMT1",4)!=0 ||
        !valid_id((const char *)data+4) || data[20]!=PEER_ROLE) return;
    size_t length=((size_t)data[21]<<8)|data[22];
    if (length+23!=size || !valid_text(data+23,length)) return;
    uint8_t ack[21]; memcpy(ack,"AMA1",4); memcpy(ack+4,data+4,16); ack[20]=0;
    xSemaphoreTake(history_lock,portMAX_DELAY);
    if (!storage_ready) { xSemaphoreGive(history_lock); return; }
    int found=find_message((const char *)data+4,PEER_ROLE);
    if (found<0) {
        checkpoint_locked();
        insert_message((const char *)data+4,PEER_ROLE,data+23,length,RECEIVED);
        if (!persist_locked()) { xSemaphoreGive(history_lock); return; }
    }
    else if (strlen(history[found].text)!=length || memcmp(history[found].text,data+23,length)!=0) ack[20]=2;
    xSemaphoreGive(history_lock);
    sendto(socket,ack,sizeof(ack),0,source,source_len);
}
int bench_messages_send(int argc, char **argv)
{
#if CONFIG_AUMANET_RF_ENABLED
    if (!storage_ready) { puts("Persistent message storage unavailable."); return 1; }
    if (!bench_link_started() || argc!=3 || strlen(argv[1])!=16 || !valid_id(argv[1])) {
        puts("Usage: message-send <16 lowercase hex ID> <UTF-8 text as hex>; start radio first."); return 1;
    }
    size_t hex_size=strlen(argv[2]);
    if (!hex_size || hex_size>BENCH_MESSAGE_BYTES*2 || hex_size%2) return 1;
    uint8_t packet[BENCH_MESSAGE_WIRE_MAX]={0}; size_t length=hex_size/2;
    memcpy(packet,"AMT1",4); memcpy(packet+4,argv[1],16); packet[20]=OWN_ROLE;
    packet[21]=length>>8; packet[22]=length&255;
    for (size_t i=0; i<length; i++) {
        int a=nibble(argv[2][i*2]), b=nibble(argv[2][i*2+1]);
        if (a<0 || b<0) return 1;
        packet[23+i]=(a<<4)|b;
    }
    if (!valid_text(packet+23,length)) return 1;
    struct message result;
    xSemaphoreTake(history_lock,portMAX_DELAY);
    int existing=find_message(argv[1],OWN_ROLE);
    if (existing>=0 && (strlen(history[existing].text)!=length || memcmp(history[existing].text,packet+23,length)!=0)) {
        xSemaphoreGive(history_lock); puts("Message ID already used with different text."); return 1;
    }
    unsigned index;
    if (existing>=0) index=(unsigned)existing;
    else {
        checkpoint_locked(); index=insert_message(argv[1],OWN_ROLE,packet+23,length,UNCONFIRMED);
        if (!persist_locked()) { xSemaphoreGive(history_lock); return 1; }
    }
    result=history[index]; xSemaphoreGive(history_lock);
    int peer_code=-1; unsigned attempts=0;
    if (result.state!=DELIVERED) {
        int sock=socket(AF_INET,SOCK_DGRAM,IPPROTO_UDP);
        struct sockaddr_in local={.sin_family=AF_INET}, peer={.sin_family=AF_INET,.sin_port=htons(BENCH_PORT)};
        inet_pton(AF_INET,OWN_IP,&local.sin_addr); inet_pton(AF_INET,PEER_IP,&peer.sin_addr);
        if (sock>=0 && bind(sock,(struct sockaddr *)&local,sizeof(local))==0 && connect(sock,(struct sockaddr *)&peer,sizeof(peer))==0) {
            for (attempts=1; attempts<=3; attempts++) {
                int64_t deadline=esp_timer_get_time()+2000000;
                if (send(sock,packet,length+23,0)!=(int)(length+23)) continue;
                while (esp_timer_get_time()<deadline) {
                    int64_t remaining=deadline-esp_timer_get_time(); if (remaining<=0) break;
                    struct timeval timeout={.tv_sec=remaining/1000000,.tv_usec=remaining%1000000};
                    setsockopt(sock,SOL_SOCKET,SO_RCVTIMEO,&timeout,sizeof(timeout));
                    uint8_t ack[22]; int size=recv(sock,ack,sizeof(ack),0);
                    if (size<0) break;
                    if (size==21 && memcmp(ack,"AMA1",4)==0 && memcmp(ack+4,argv[1],16)==0) { peer_code=ack[20]; break; }
                }
                if (peer_code>=0) break;
            }
        }
        if (sock>=0) close(sock);
        if (attempts>3) attempts=3;
        xSemaphoreTake(history_lock,portMAX_DELAY); existing=find_message(argv[1],OWN_ROLE);
        if (existing>=0) {
            checkpoint_locked();
            history[existing].state=peer_code==0?DELIVERED:UNCONFIRMED;
            if (history[existing].state!=result.state && !persist_locked()) {
                xSemaphoreGive(history_lock); return 1;
            }
            result=history[existing];
        } else result.state=peer_code==0?DELIVERED:UNCONFIRMED;
        xSemaphoreGive(history_lock);
    }
    printf("\n{\"schema\":\"aumanet.bench.v1\",\"type\":\"message_result\",\"attempts\":%u,\"peer_code\":%d,\"message\":",attempts,peer_code);
    print_message(&result); puts("}"); return 0;
#else
    puts("RF disabled in this build."); return 1;
#endif
}
