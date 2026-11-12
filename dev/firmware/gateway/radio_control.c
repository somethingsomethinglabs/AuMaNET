/* SPDX-License-Identifier: Apache-2.0. No sockets, SDK, persistence or route authority. */
#include "aumanet_radio_control.h"
#include <string.h>
static const uint8_t magic[3][8]={"AUGWCQ1","AUGWCR1","AUGWCC1"};
static const size_t sizes[3]={136,232,224};
static int zero(const uint8_t *p,size_t n){while(n--)if(*p++)return 0;return 1;}
static uint64_t r64(const uint8_t *p){uint64_t v=0;for(unsigned i=0;i<8;i++)v=(v<<8)|p[i];return v;}
static uint32_t r32(const uint8_t *p){return (uint32_t)p[0]<<24|(uint32_t)p[1]<<16|(uint32_t)p[2]<<8|p[3];}
static void w64(uint8_t *p,uint64_t v){for(int i=7;i>=0;i--){p[i]=(uint8_t)v;v>>=8;}}
static void w32(uint8_t *p,uint32_t v){for(int i=3;i>=0;i--){p[i]=(uint8_t)v;v>>=8;}}
static int body(const uint8_t *p,size_t n,unsigned *kind){
    if(!p||n<136)return 0;
    unsigned k;for(k=0;k<3;k++)if(!memcmp(p,magic[k],8))break;
    if(k==3||n!=sizes[k]||p[8]!=1||!zero(p+9,7)||zero(p+16,16)||zero(p+32,16)||!r64(p+48)||r64(p+48)>AB_MAX_SAFE||zero(p+56,32)||zero(p+88,16)||zero(p+104,32))return 0;
    if(k){if(zero(p+136,16)||zero(p+152,32))return 0;
      if(k==1){if(r64(p+200)>AB_MAX_SAFE||p[208]>23||p[209]>23||p[210]>23||p[211]>6||r32(p+212)>AR_TRIAL_MS||p[216]>23||p[217]>1||p[218]>1||(p[219]&~3)||p[222]||p[223]!=AR_CATALOG_VERSION||!p[224]||p[224]>24||!zero(p+225,7))return 0;}
      else if(zero(p+184,16)||r64(p+200)>AB_MAX_SAFE||p[208]<1||p[208]>3||!ar_option(p[209])||!zero(p+210,14))return 0;
    }
    *kind=k;return 1;
}
int ar_frame_read(const uint8_t *p,size_t n,struct ab_view *v){
    if(!p||!v||n<161||n>321)return 0;
    unsigned k;for(k=0;k<3;k++)if(!memcmp(p+16,magic[k],8))break;if(k==3)return 0;
    size_t size=sizes[k],at=16+size;unsigned parsed;
    if(at>=n||n!=at+1+p[at]||memcmp(p,p+32,16)||!ab_signature_der(p+at+1,p[at])||!body(p+16,size,&parsed))return 0;
    v->kind=(enum ab_kind)(AR_QUERY+k);v->body=p+16;v->body_bytes=size;v->signature=p+at+1;v->signature_bytes=p[at];return 1;
}
int ar_frame_write(const uint8_t *p,size_t n,const uint8_t *sig,size_t bytes,uint8_t out[321],size_t *written){
    unsigned kind;if(written)*written=0;if(!written||!out||!body(p,n,&kind)||!ab_signature_der(sig,bytes)||17+n+bytes>321)return 0;
    memcpy(out,p+16,16);memcpy(out+16,p,n);out[16+n]=(uint8_t)bytes;memcpy(out+17+n,sig,bytes);*written=17+n+bytes;return 1;
}
static int now(struct ar_context *s,uint64_t *value){uint64_t n=0;if(s->poisoned||s->config.trust.now(s->config.trust.context,&n)!=1||(s->have_now&&n<s->last_now)){s->poisoned=1;s->pending=s->reserved=0;return 0;}s->have_now=1;s->last_now=n;*value=n;return 1;}
enum ab_result ar_initialize(struct ar_context *s,const struct ar_config *cfg){
    if(!s)return AB_UNAVAILABLE;
    memset(s,0,sizeof *s);
    if(!cfg||!cfg->trust.now||!cfg->trust.random||!cfg->trust.verify_owner||!cfg->trust.sign_node||!cfg->trust.read_clock||!cfg->read||!cfg->command||zero(cfg->trust.node,16)||zero(cfg->trust.group,16)||zero(cfg->trust.run,16)||zero(cfg->trust.owner_pin,32)||zero(cfg->trust.node_pin,32)||zero(cfg->peer,16)||!memcmp(cfg->trust.node,cfg->peer,16)||!cfg->trust.epoch||cfg->trust.epoch>AB_MAX_SAFE||cfg->station>1||cfg->peer_ip!=(cfg->station?0x0a4e0001UL:0x0a4e0002UL)||(cfg->owner_ip&0xffffff00UL)!=0x0a4d0000UL||(cfg->owner_ip&255)<2||(cfg->owner_ip&255)>254||memcmp(cfg->trust.relay,cfg->station?cfg->peer:cfg->trust.node,16))return AB_SCOPE;
    s->config=*cfg;s->ready=1;s->enabled=cfg->trust.field_permitted==1;return AB_OK;
}
void ar_permit(struct ar_context *s,int enabled){if(s&&s->ready){s->enabled=enabled==1;s->pending=s->consumed=s->reserved=0;}}
static enum ab_result report(struct ar_context *s,uint8_t out[321],size_t *written){
    struct ar_snapshot r={0};if(s->config.read(s->config.trust.context,&r)!=1)return AB_UNAVAILABLE;
    uint8_t b[232]={0},signature[72];size_t n=72;memcpy(b,s->query,136);memcpy(b,magic[1],8);memcpy(b+136,s->config.trust.run,16);memcpy(b+152,s->nonce,32);memcpy(b+184,r.transaction,16);w64(b+200,r.generation);b[208]=r.current;b[209]=r.persisted;b[210]=r.target;b[211]=r.state;w32(b+212,r.remaining);b[216]=r.actual;b[217]=r.associated;b[218]=r.station;b[219]=r.flags;b[220]=(uint8_t)(r.error>>8);b[221]=(uint8_t)r.error;b[223]=AR_CATALOG_VERSION;b[224]=r.power;
    uint64_t after=0;if(s->config.trust.sign_node(s->config.trust.context,b,sizeof b,signature,&n)!=1||!now(s,&after)||after>=s->deadline||!ar_frame_write(b,sizeof b,signature,n,s->reply,&s->reply_bytes))return AB_UNAVAILABLE;
    memcpy(out,s->reply,s->reply_bytes);*written=s->reply_bytes;return AB_OK;
}
enum ab_result ar_handle(struct ar_context *s,const uint8_t *frame,size_t bytes,uint8_t out[321],size_t *written){
    struct ab_view v;uint64_t at=0,after=0;if(written)*written=0;if(!s||!written||!out||!s->ready||!s->enabled||!ar_frame_read(frame,bytes,&v)||v.kind==(enum ab_kind)AR_REPORT)return AB_UNAVAILABLE;
    const uint8_t *p=v.body;struct ab_config *c=&s->config.trust;
    if(memcmp(p+16,c->node,16)||memcmp(p+32,c->group,16)||r64(p+48)!=c->epoch||memcmp(p+56,c->owner_pin,32)||memcmp(p+88,c->relay,16))return AB_SCOPE;
    if(!now(s,&at)||c->verify_owner(c->context,p,v.body_bytes,v.signature,v.signature_bytes)!=1||!now(s,&after))return AB_SIGNATURE;
    if(after-at>=AB_WINDOW_MS)return AB_EXPIRED;
    if(v.kind==(enum ab_kind)AR_QUERY){
      if(s->pending&&!memcmp(s->query,p,136)){if(after>=s->deadline)return AB_EXPIRED;if(!s->reply_bytes)return report(s,out,written);memcpy(out,s->reply,s->reply_bytes);*written=s->reply_bytes;return AB_OK;}
      s->pending=s->consumed=0;s->reply_bytes=0;if(at>UINT64_MAX-AB_WINDOW_MS||after>=at+AB_WINDOW_MS||c->random(c->context,s->nonce,32)!=1||zero(s->nonce,32)||!now(s,&after)||after>=at+AB_WINDOW_MS)return AB_UNAVAILABLE;
      memcpy(s->query,p,136);s->deadline=at+AB_WINDOW_MS;s->pending=1;return report(s,out,written);
    }
    if(!s->pending||after>=s->deadline||memcmp(p+104,s->query+104,32)||memcmp(p+136,c->run,16)||memcmp(p+152,s->nonce,32))return AB_EXPIRED;
    if(s->consumed){if(memcmp(p,s->command,224))return AB_EXPIRED;if(!s->reply_bytes)return AB_UNAVAILABLE;memcpy(out,s->reply,s->reply_bytes);*written=s->reply_bytes;return AB_OK;}
    enum ab_clock origin;uint64_t clock;if(c->read_clock(c->context,&origin,&clock)!=1||(origin!=AB_CLOCK_SIGNED&&origin!=AB_CLOCK_USB)||!clock||clock>AB_MAX_SAFE||!now(s,&after)||after>=s->deadline)return AB_UNAVAILABLE;
    /* Consume before handing off: an unknown outcome can never repeat an RF mutation. */
    s->consumed=1;memcpy(s->command,p,224);s->reply_bytes=0;
    if(s->config.command(c->context,p[208],p[209],p+184,r64(p+200))!=1)return AB_UNAVAILABLE;
    return report(s,out,written);
}
int ar_transport_receive(struct ar_context *s,const uint8_t *frame,size_t bytes,uint32_t source,uint16_t port,uint8_t out[321],size_t *written,uint32_t *destination,uint16_t *destination_port){
    struct ab_view v;uint64_t at=0,after=0;if(written)*written=0;if(!s||!written||!destination||!destination_port||!s->ready||!s->enabled||!port||!ar_frame_read(frame,bytes,&v)||!now(s,&at))return 0;
    const uint8_t *p=v.body;struct ab_config *c=&s->config.trust;if(memcmp(p+32,c->group,16)||r64(p+48)!=c->epoch||memcmp(p+56,c->owner_pin,32)||memcmp(p+88,c->relay,16))return 0;
    if(s->config.station){if(source!=s->config.peer_ip||port!=17778||memcmp(p+16,c->node,16)||ar_handle(s,frame,bytes,out,written)!=AB_OK)return 0;*destination=source;*destination_port=port;return 1;}
    if(source==s->config.peer_ip&&port==17778&&v.kind==(enum ab_kind)AR_REPORT){if(!s->reserved||at>=s->relay_deadline||memcmp(p+16,s->config.peer,16)||memcmp(p+104,s->relay_challenge,32))return 0;memcpy(out,frame,bytes);*written=bytes;*destination=s->config.owner_ip;*destination_port=s->relay_port;return 1;}
    if(source!=s->config.owner_ip||v.kind==(enum ab_kind)AR_REPORT)return 0;
    if(!memcmp(p+16,c->node,16)){if(ar_handle(s,frame,bytes,out,written)!=AB_OK)return 0;*destination=source;*destination_port=port;return 1;}
    if(memcmp(p+16,s->config.peer,16)||v.kind!=(enum ab_kind)AR_QUERY||c->verify_owner(c->context,p,v.body_bytes,v.signature,v.signature_bytes)!=1||!now(s,&after))return 0;
    if(s->reserved&&after<s->relay_deadline&&!memcmp(p+104,s->relay_challenge,32)){if(port!=s->relay_port)return 0;}else{if(at>UINT64_MAX-AB_WINDOW_MS||after>=at+AB_WINDOW_MS)return 0;s->reserved=1;s->relay_deadline=at+AB_WINDOW_MS;s->relay_port=port;memcpy(s->relay_challenge,p+104,32);}
    memcpy(out,frame,bytes);*written=bytes;*destination=s->config.peer_ip;*destination_port=17778;return 1;
}
