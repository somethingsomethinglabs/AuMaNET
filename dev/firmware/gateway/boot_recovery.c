/* SPDX-License-Identifier: Apache-2.0. See frozen BOOT-RECOVERY.md contract. */
#include "aumanet_boot_recovery.h"
#include <string.h>

static const uint8_t magic[6][8]={{'A','U','G','W','B','Q','1',0},{'A','U','G','W','B','R','1',0},{'A','U','G','W','B','T','1',0},{'A','U','G','W','B','A','1',0},{'A','U','G','W','B','G','1',0},{'A','U','G','W','B','H','1',0}};
static const size_t sizes[6]={136,232,224,224,136,224};
static int zero(const uint8_t *p,size_t n){while(n--)if(*p++)return 0;return 1;}
static uint64_t read64(const uint8_t *p){uint64_t n=0;for(unsigned i=0;i<8;i++)n=(n<<8)|p[i];return n;}
static void write64(uint8_t *p,uint64_t n){for(int i=7;i>=0;i--){p[i]=(uint8_t)n;n>>=8;}}
static int scalar(const uint8_t *p,size_t n){
    static const uint8_t order[32]={0xff,0xff,0xff,0xff,0,0,0,0,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xbc,0xe6,0xfa,0xad,0xa7,0x17,0x9e,0x84,0xf3,0xb9,0xca,0xc2,0xfc,0x63,0x25,0x51};
    if(!n||n>33||(p[0]&0x80)||(n>1&&p[0]==0&&!(p[1]&0x80)))return 0;
    if(p[0]==0){p++;n--;}
    if(!n||n>32||zero(p,n))return 0;
    return n<32||memcmp(p,order,32)<0;
}
int ab_signature_der(const uint8_t *p,size_t n){
    if(!p||n<8||n>72||p[0]!=0x30||p[1]!=n-2||p[2]!=2)return 0;
    size_t r=p[3],next=4+r;
    if(next+2>n||!scalar(p+4,r)||p[next]!=2)return 0;
    size_t s=p[next+1];return next+2+s==n&&scalar(p+next+2,s);
}
static int body(const uint8_t *p,size_t n,enum ab_kind *kind){
    if(!p||n<136)return 0;
    unsigned k;for(k=0;k<6;k++)if(!memcmp(p,magic[k],8))break;
    if(k==6||n!=sizes[k]||p[8]!=1||!zero(p+9,7)||zero(p+16,16)||zero(p+32,16)||!read64(p+48)||read64(p+48)>AB_MAX_SAFE||zero(p+56,32)||zero(p+88,16)||zero(p+104,32))return 0;
    if(k==5){
      int32_t rssi=(int32_t)((uint32_t)p[176]<<24|(uint32_t)p[177]<<16|(uint32_t)p[178]<<8|p[179]);
      if(zero(p+136,16)||zero(p+152,16)||p[168]>2||p[169]>1||!zero(p+170,6)||!zero(p+180,4)||read64(p+184)>AB_MAX_SAFE||!zero(p+192,32))return 0;
      if(p[168]==0){if(p[169]!=1||rssi < -127||rssi >= 0)return 0;}else if(rssi)return 0;
    }else if(k&&k!=4){
      if(zero(p+136,16)||zero(p+152,32))return 0;
      if(k==1){
        uint64_t time=read64(p+192);
        if(p[184]>2||!zero(p+185,7)||time>AB_MAX_SAFE)return 0;
        if(p[184]==0){if(time||!zero(p+200,32))return 0;}
        else if(!time||(p[184]==1?zero(p+200,32):!zero(p+200,32)))return 0;
      }else{
        uint64_t time=read64(p+216);
        if(zero(p+184,32)||!time||time>(k==2?AB_OWNER_TIME_MAX:AB_MAX_SAFE)||(k==3&&time%1000))return 0;
      }
    }
    *kind=(enum ab_kind)(k+1);return 1;
}
int ab_frame_read(const uint8_t *p,size_t n,struct ab_view *view){
    if(!p||!view||n>321||n<16+136+1+8)return 0;
    unsigned k;for(k=0;k<6;k++)if(!memcmp(p+16,magic[k],8))break;
    if(k==6)return 0;
    size_t bytes=sizes[k],position=16+bytes;
    if(position>=n||n!=position+1+p[position]||!ab_signature_der(p+position+1,p[position])||memcmp(p,p+32,16)||!body(p+16,bytes,&view->kind))return 0;
    view->body=p+16;view->body_bytes=bytes;view->signature=p+position+1;view->signature_bytes=p[position];return 1;
}
int ab_frame_write(const uint8_t *p,size_t n,const uint8_t *signature,size_t bytes,uint8_t out[321],size_t *written){
    enum ab_kind kind;if(written)*written=0;
    if(!written||!out||!body(p,n,&kind)||!ab_signature_der(signature,bytes)||16+n+1+bytes>321)return 0;
    memcpy(out,p+16,16);memcpy(out+16,p,n);out[16+n]=(uint8_t)bytes;memcpy(out+17+n,signature,bytes);*written=17+n+bytes;return 1;
}
static int now(struct ab_context *s,uint64_t *value){
    uint64_t n=0;
    if(s->poisoned||s->config.now(s->config.context,&n)!=1||(s->have_now&&n<s->last_now)){s->poisoned=1;return 0;}
    s->have_now=1;s->last_now=n;*value=n;return 1;
}
static int clock_read(struct ab_context *s,enum ab_clock *origin,uint64_t *milliseconds){
    if(s->config.read_clock(s->config.context,origin,milliseconds)!=1||*origin>AB_CLOCK_USB||*milliseconds>AB_MAX_SAFE)return 0;
    if(*origin==AB_CLOCK_UNSET){if(*milliseconds||s->accepted||s->have_clock){s->poisoned=1;return 0;}return 1;}
    if(!*milliseconds||(s->have_clock&&*milliseconds<s->last_clock)||
       (*origin==AB_CLOCK_SIGNED&&(!s->accepted||*milliseconds<s->applied_upper))||(*origin==AB_CLOCK_USB&&s->accepted)){
      s->poisoned=1;return 0;
    }
    s->have_clock=1;s->last_clock=*milliseconds;return 1;
}
enum ab_result ab_initialize(struct ab_context *s,const struct ab_config *config){
    if(!s)return AB_UNAVAILABLE;
    memset(s,0,sizeof *s);
    if(!config||zero(config->group,16)||zero(config->node,16)||zero(config->relay,16)||zero(config->run,16)||zero(config->owner_pin,32)||zero(config->node_pin,32)||!config->epoch||config->epoch>AB_MAX_SAFE||
       !config->now||!config->random||!config->hash||!config->verify_owner||!config->sign_node||!config->read_clock||!config->install_clock)return AB_UNAVAILABLE;
    s->config=*config;s->ready=1;s->enabled=config->field_permitted==1;return AB_OK;
}
void ab_permit(struct ab_context *s,int enabled){if(s&&s->ready){s->enabled=enabled==1;s->pending=0;}}
static enum ab_result ack(struct ab_context *s,uint8_t out[321],size_t *written){
    if(!s->ack_signature_bytes){
      size_t bytes=72;
      if(s->config.sign_node(s->config.context,s->ack,224,s->ack_signature,&bytes)!=1||!ab_signature_der(s->ack_signature,bytes))return AB_UNAVAILABLE;
      s->ack_signature_bytes=bytes;
    }
    return ab_frame_write(s->ack,224,s->ack_signature,s->ack_signature_bytes,out,written)?AB_OK:AB_UNAVAILABLE;
}
static enum ab_result signal_report(struct ab_context *s,const uint8_t *p,uint64_t began,uint8_t out[321],size_t *written){
    uint64_t current=0;if(!s->config.read_signal||!now(s,&current)||current<began||current-began>=5000)return AB_UNAVAILABLE;
    if(!s->have_signal||current-s->signal_at>=5000){struct ab_signal value={0};if(s->config.read_signal(s->config.context,&value)!=1)return AB_UNAVAILABLE;s->signal=value;s->signal_at=current;s->have_signal=1;}
    uint8_t report[224]={0},signature[72];size_t bytes=72;memcpy(report,p,136);memcpy(report,magic[5],8);memcpy(report+136,s->config.run,16);memcpy(report+152,s->signal.peer,16);report[168]=s->signal.status;report[169]=s->signal.role;
    uint32_t rssi=(uint32_t)s->signal.rssi;for(unsigned i=0;i<4;i++)report[176+i]=(uint8_t)(rssi>>(24-8*i));write64(report+184,current-s->signal_at);
    if(s->config.sign_node(s->config.context,report,sizeof report,signature,&bytes)!=1||!now(s,&current)||current<began||current-began>=5000)return AB_UNAVAILABLE;
    return ab_frame_write(report,sizeof report,signature,bytes,out,written)?AB_OK:AB_UNAVAILABLE;
}
enum ab_result ab_handle(struct ab_context *s,const uint8_t *packet,size_t bytes,uint8_t out[321],size_t *written){
    struct ab_view view;uint64_t timestamp=0;enum ab_clock origin;uint64_t wall=0;
    if(written)*written=0;
    if(!s||!written||!out||!s->ready||!s->enabled||s->poisoned)return AB_UNAVAILABLE;
    if(!ab_frame_read(packet,bytes,&view)||(view.kind!=AB_QUERY&&view.kind!=AB_TIME&&view.kind!=AB_SIGNAL_QUERY))return AB_FORMAT;
    const uint8_t *p=view.body;
    if(memcmp(p+16,s->config.node,16)||memcmp(p+32,s->config.group,16)||read64(p+48)!=s->config.epoch||memcmp(p+56,s->config.owner_pin,32)||memcmp(p+88,s->config.relay,16))return AB_SCOPE;
    if(!now(s,&timestamp))return AB_UNAVAILABLE;
    uint64_t began=timestamp;
    if(s->config.verify_owner(s->config.context,p,view.body_bytes,view.signature,view.signature_bytes)!=1)return AB_SIGNATURE;
    if(!now(s,&timestamp))return AB_UNAVAILABLE;
    if(view.kind==AB_SIGNAL_QUERY)return signal_report(s,p,began,out,written);
    if(view.kind==AB_QUERY){
      if(s->pending&&timestamp<s->pending_deadline&&!memcmp(p,s->query,136))
        return ab_frame_write(s->proof,232,s->proof_signature,s->proof_signature_bytes,out,written)?AB_OK:AB_UNAVAILABLE;
      /* A new authenticated query retires the old unused nonce before issuing R. */
      s->pending=0;
      if(!clock_read(s,&origin,&wall))return AB_UNAVAILABLE;
      memset(s->proof,0,232);memcpy(s->query,p,136);memcpy(s->proof,p,136);memcpy(s->proof,magic[1],8);memcpy(s->proof+136,s->config.run,16);
      if(s->config.random(s->config.context,s->proof+152,32)!=1||zero(s->proof+152,32)||!now(s,&timestamp)||timestamp>UINT64_MAX-5000)return AB_UNAVAILABLE;
      s->pending_deadline=timestamp+5000;s->proof[184]=(uint8_t)origin;write64(s->proof+192,wall);
      if(origin==AB_CLOCK_SIGNED)memcpy(s->proof+200,s->accepted_digest,32);
      s->proof_signature_bytes=72;
      if(s->config.sign_node(s->config.context,s->proof,232,s->proof_signature,&s->proof_signature_bytes)!=1||!ab_signature_der(s->proof_signature,s->proof_signature_bytes))return AB_UNAVAILABLE;
      if(!now(s,&timestamp))return AB_UNAVAILABLE;
      if(timestamp>=s->pending_deadline)return AB_EXPIRED;
      s->pending=1;return ab_frame_write(s->proof,232,s->proof_signature,s->proof_signature_bytes,out,written)?AB_OK:AB_UNAVAILABLE;
    }
    if(s->accepted&&!memcmp(p,s->accepted_time,224)){
      if(!clock_read(s,&origin,&wall)||origin!=AB_CLOCK_SIGNED)return AB_UNAVAILABLE;
      return ack(s,out,written);
    }
    if(!clock_read(s,&origin,&wall))return AB_UNAVAILABLE;
    if(origin!=AB_CLOCK_UNSET)return AB_INITIALIZED;
    if(!s->pending||timestamp>=s->pending_deadline)return AB_EXPIRED;
    uint8_t digest[32];
    if(memcmp(p+8,s->query+8,128)||memcmp(p+136,s->config.run,16)||memcmp(p+152,s->proof+152,32))return AB_SCOPE;
    if(s->config.hash(s->config.context,s->proof,232,digest)!=1)return AB_UNAVAILABLE;
    if(memcmp(p+184,digest,32))return AB_SCOPE;
    uint64_t owner_time=read64(p+216),upper=((owner_time+10000+999)/1000)*1000;
    if(upper>AB_MAX_SAFE)return AB_FORMAT;
    if(s->config.hash(s->config.context,p,224,digest)!=1||!now(s,&timestamp))return AB_UNAVAILABLE;
    if(timestamp>=s->pending_deadline)return AB_EXPIRED;
    /* Install result is an atomic local-owner contract. Unknown outcome cannot
     * be repaired by replaying TIME or inventing an unset-clock proof. */
    s->pending=0;
    if(s->config.install_clock(s->config.context,upper)!=1){s->poisoned=1;return AB_UNAVAILABLE;}
    s->accepted=1;s->applied_upper=upper;memcpy(s->accepted_time,p,224);memcpy(s->accepted_digest,digest,32);
    memcpy(s->ack,p,224);memcpy(s->ack,magic[3],8);memcpy(s->ack+184,digest,32);write64(s->ack+216,upper);s->ack_signature_bytes=0;
    if(!clock_read(s,&origin,&wall)||origin!=AB_CLOCK_SIGNED||wall<upper){s->poisoned=1;return AB_UNAVAILABLE;}
    return ack(s,out,written);
}
