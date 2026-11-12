/* SPDX-License-Identifier: Apache-2.0. No discovery, default route or trust updates. */
#include "aumanet_boot_transport.h"
#include <string.h>
static int zero(const uint8_t *p,size_t n){while(n--)if(*p++)return 0;return 1;}
static uint64_t read64(const uint8_t *p){uint64_t n=0;for(unsigned i=0;i<8;i++)n=(n<<8)|p[i];return n;}
int ab_budget_take(struct ab_budget *s,enum ab_lane lane,uint64_t now){
    static const unsigned limits[4]={4,4,8,4};
    if(!s||(unsigned)lane>3||s->poisoned)return 0;
    if(s->initialized&&now<s->last_now){s->poisoned=1;return 0;}
    if(!s->initialized||now-s->started>=1000){s->started=now;memset(s->used,0,sizeof s->used);s->initialized=1;}
    s->last_now=now;if(s->used[lane]>=limits[lane])return 0;s->used[lane]++;return 1;
}
static int now(struct ab_transport *s,uint64_t *value){
    uint64_t n=0;
    if(s->poisoned||s->config.local.now(s->config.local.context,&n)!=1||(s->have_now&&n<s->last_now)){
      s->poisoned=1;s->reserved=0;ab_permit(&s->local,0);return 0;
    }
    s->have_now=1;s->last_now=n;*value=n;return 1;
}
enum ab_result ab_transport_initialize(struct ab_transport *s,const struct ab_transport_config *config){
    if(!s)return AB_UNAVAILABLE;
    memset(s,0,sizeof *s);
    if(!config||config->is_node_b>1||zero(config->peer,16)||!memcmp(config->peer,config->local.node,16)||
       (config->owner_ip&0xffffff00UL)!=0x0a4d0000UL||(config->owner_ip&255)<2||(config->owner_ip&255)>254||
       config->peer_ip!=(config->is_node_b?0x0a4e0001UL:0x0a4e0002UL)||
       memcmp(config->local.relay,config->is_node_b?config->peer:config->local.node,16))return AB_SCOPE;
    s->config=*config;enum ab_result result=ab_initialize(&s->local,&config->local);if(result!=AB_OK)return result;s->ready=1;return AB_OK;
}
void ab_transport_permit(struct ab_transport *s,int enabled){if(s&&s->ready){ab_permit(&s->local,enabled);s->reserved=0;}}
int ab_transport_receive(struct ab_transport *s,const uint8_t *frame,size_t bytes,uint32_t source,uint16_t source_port,
                         uint8_t out[321],size_t *written,uint32_t *destination,uint16_t *destination_port){
    struct ab_view view;uint64_t timestamp=0;
    if(written)*written=0;
    if(!s||!written||!out||!destination||!destination_port||!s->ready||!s->local.enabled||s->poisoned||!source_port||!ab_frame_read(frame,bytes,&view))return 0;
    const uint8_t *p=view.body;
    if(memcmp(p+32,s->config.local.group,16)||read64(p+48)!=s->config.local.epoch||memcmp(p+56,s->config.local.owner_pin,32)||memcmp(p+88,s->config.local.relay,16)||!now(s,&timestamp))return 0;
    if(s->config.is_node_b){
      if(source!=s->config.peer_ip||source_port!=17778||(view.kind!=AB_QUERY&&view.kind!=AB_TIME&&view.kind!=AB_SIGNAL_QUERY)||memcmp(p+16,s->config.local.node,16))return 0;
      if(ab_handle(&s->local,frame,bytes,out,written)!=AB_OK)return 0;
      *destination=s->config.peer_ip;*destination_port=17778;return 1;
    }
    if(source==s->config.peer_ip&&source_port==17778&&(view.kind==AB_PROOF||view.kind==AB_ACK||view.kind==AB_SIGNAL_REPORT)){
      if(!s->reserved||timestamp>=s->deadline||memcmp(p+16,s->config.peer,16)||memcmp(p+104,s->owner_challenge,32))return 0;
      /* Opaque node proof. Android verifies its independently pinned node key;
       * neither relay source nor this reservation confers node authority. */
      memcpy(out,frame,bytes);*written=bytes;*destination=s->config.owner_ip;*destination_port=s->owner_port;return 1;
    }
    if(source!=s->config.owner_ip||(view.kind!=AB_QUERY&&view.kind!=AB_TIME&&view.kind!=AB_SIGNAL_QUERY))return 0;
    if(!memcmp(p+16,s->config.local.node,16)){
      if(ab_handle(&s->local,frame,bytes,out,written)!=AB_OK)return 0;
      *destination=source;*destination_port=source_port;return 1;
    }
    if(memcmp(p+16,s->config.peer,16))return 0;
    uint64_t began=timestamp;
    if(s->config.local.verify_owner(s->config.local.context,p,view.body_bytes,view.signature,view.signature_bytes)!=1||!now(s,&timestamp))return 0;
    if(view.kind==AB_QUERY||view.kind==AB_SIGNAL_QUERY){
      if(s->reserved&&timestamp<s->deadline&&!memcmp(p+104,s->owner_challenge,32)){
        if(source_port!=s->owner_port)return 0; /* never retarget/extend duplicate Q */
      }else{
        if(began>UINT64_MAX-5000||timestamp>=began+5000)return 0;
        s->reserved=1;s->deadline=began+5000;s->owner_port=source_port;memcpy(s->owner_challenge,p+104,32);
      }
    }else if(!s->reserved||timestamp>=s->deadline||source_port!=s->owner_port||memcmp(p+104,s->owner_challenge,32))return 0;
    memcpy(out,frame,bytes);*written=bytes;*destination=s->config.peer_ip;*destination_port=17778;return 1;
}
