/* Actual boot/radio transport C with explicitly fake crypto/clock boundaries.
 * This tests admission/relay policy, not cryptographic implementation or RF. */
#include <assert.h>
#include <stdio.h>
#include <string.h>
#include "aumanet_boot_transport.h"
#include "aumanet_radio_control.h"
struct fixture {uint64_t now;int authorize,commands;unsigned station;};
static const uint8_t der[8]={0x30,6,2,1,1,2,1,1};
static int clock_now(void *v,uint64_t *n){*n=((struct fixture*)v)->now;return 1;}
static int random_bytes(void*v,uint8_t*p,size_t n){(void)v;memset(p,7,n);return 1;}
static int hash_bytes(void*v,const uint8_t*p,size_t n,uint8_t out[32]){(void)v;(void)p;(void)n;memset(out,9,32);return 1;}
static int owner_signature(void*v,const uint8_t*p,size_t n,const uint8_t*s,size_t z){(void)p;(void)n;return ((struct fixture*)v)->authorize&&z==sizeof der&&!memcmp(s,der,z);}
static int node_signature(void*v,const uint8_t*p,size_t n,uint8_t s[72],size_t*z){(void)v;(void)p;(void)n;memcpy(s,der,sizeof der);*z=sizeof der;return 1;}
static int read_clock(void*v,enum ab_clock*o,uint64_t*n){(void)v;*o=AB_CLOCK_USB;*n=100000;return 1;}
static int install_clock(void*v,uint64_t n){(void)v;(void)n;return 1;}
static int read_radio(void*v,struct ar_snapshot*r){memset(r,0,sizeof*r);r->current=r->persisted=r->actual=5;r->associated=1;r->station=(uint8_t)((struct fixture*)v)->station;r->power=24;return 1;}
static int command_radio(void*v,unsigned op,unsigned option,const uint8_t*t,uint64_t gen){(void)op;(void)option;(void)t;(void)gen;((struct fixture*)v)->commands++;return 1;}
static struct ab_transport_config config(struct fixture*f,int local_entry){
 struct ab_transport_config c={0};memset(c.local.group,1,16);memset(c.local.node,local_entry?0x11:0x22,16);memset(c.peer,local_entry?0x22:0x11,16);memset(c.local.relay,0x11,16);memset(c.local.run,local_entry?3:4,16);memset(c.local.owner_pin,5,32);memset(c.local.node_pin,6,32);c.local.epoch=1;c.local.context=f;c.local.now=clock_now;c.local.random=random_bytes;c.local.hash=hash_bytes;c.local.verify_owner=owner_signature;c.local.sign_node=node_signature;c.local.read_clock=read_clock;c.local.install_clock=install_clock;c.local.field_permitted=1;c.is_node_b=(uint8_t)f->station;c.peer_ip=f->station?0x0a4e0001:0x0a4e0002;c.owner_ip=local_entry?0x0a4d0064:0x0a4d0028;return c;
}
static size_t query(uint8_t out[321],const char magic[8],const struct ab_transport_config*c,uint8_t target){
 uint8_t body[136]={0};memcpy(body,magic,8);body[8]=1;memset(body+16,target,16);memcpy(body+32,c->local.group,16);body[55]=1;memcpy(body+56,c->local.owner_pin,32);memcpy(body+88,c->local.relay,16);memset(body+104,0x77,32);size_t n=0;
 if(magic[4]=='C')assert(ar_frame_write(body,sizeof body,der,sizeof der,out,&n));else assert(ab_frame_write(body,sizeof body,der,sizeof der,out,&n));return n;
}
static struct ar_config radio_config(struct ab_transport_config*c){struct ar_config r={.trust=c->local,.station=c->is_node_b,.owner_ip=c->owner_ip,.peer_ip=c->peer_ip,.read=read_radio,.command=command_radio};memcpy(r.peer,c->peer,16);return r;}
static void boot_roundtrip(unsigned entry_station){
 struct fixture ef={100,1,0,entry_station},rf={100,1,0,!entry_station};struct ab_transport_config ec=config(&ef,1),rc=config(&rf,0);struct ab_transport entry,remote;assert(ab_transport_initialize(&entry,&ec)==AB_OK);assert(ab_transport_initialize(&remote,&rc)==AB_OK);
 uint8_t q[321],forward[321],reply[321],out[321];size_t qn=query(q,"AUGWBQ1",&ec,0x22),fn=0,rn=0,on=0;uint32_t ip;uint16_t port;
 assert(ab_transport_receive(&entry,q,qn,ec.owner_ip,50000,forward,&fn,&ip,&port)&&ip==ec.peer_ip&&port==17778);
 assert(!ab_transport_receive(&entry,q,qn,ec.owner_ip,50001,out,&on,&ip,&port));assert(entry.deadline==5100);
 assert(!ab_transport_receive(&remote,forward,fn,rc.owner_ip,50000,out,&on,&ip,&port));
 assert(ab_transport_receive(&remote,forward,fn,rc.peer_ip,17778,reply,&rn,&ip,&port)&&ip==rc.peer_ip&&port==17778);
 assert(ab_transport_receive(&entry,reply,rn,ec.peer_ip,17778,out,&on,&ip,&port)&&ip==ec.owner_ip&&port==50000&&on==rn&&!memcmp(out,reply,rn));
 ef.now=5100;assert(!ab_transport_receive(&entry,reply,rn,ec.peer_ip,17778,out,&on,&ip,&port));
 struct ab_transport_config bad=ec;memset(bad.local.relay,0x33,16);assert(ab_transport_initialize(&entry,&bad)==AB_SCOPE);
 ef.now=100;ef.authorize=0;assert(ab_transport_initialize(&entry,&ec)==AB_OK);assert(!ab_transport_receive(&entry,q,qn,ec.owner_ip,50000,out,&on,&ip,&port));
}
static void radio_roundtrip(unsigned entry_station){
 struct fixture ef={100,1,0,entry_station},rf={100,1,0,!entry_station};struct ab_transport_config ec=config(&ef,1),rc=config(&rf,0);struct ar_config er=radio_config(&ec),rr=radio_config(&rc);struct ar_context entry,remote;assert(ar_initialize(&entry,&er)==AB_OK);assert(ar_initialize(&remote,&rr)==AB_OK);
 uint8_t q[321],forward[321],reply[321],out[321],command[321],body[224]={0};size_t qn=query(q,"AUGWCQ1",&ec,0x22),fn=0,rn=0,on=0,cn=0;uint32_t ip;uint16_t port;
 assert(ar_transport_receive(&entry,q,qn,ec.owner_ip,50000,forward,&fn,&ip,&port));
 assert(!ar_transport_receive(&remote,forward,fn,rc.owner_ip,50000,out,&on,&ip,&port));
 assert(ar_transport_receive(&remote,forward,fn,rc.peer_ip,17778,reply,&rn,&ip,&port));assert(ar_transport_receive(&entry,reply,rn,ec.peer_ip,17778,out,&on,&ip,&port)&&port==50000);
 memcpy(body,q+16,136);memcpy(body,"AUGWCC1",8);memcpy(body+136,reply+16+136,48);memset(body+184,0x44,16);body[207]=1;body[208]=1;body[209]=5;assert(ar_frame_write(body,sizeof body,der,sizeof der,command,&cn));
 assert(!ar_transport_receive(&entry,command,cn,ec.owner_ip,50001,out,&on,&ip,&port));
 assert(ar_transport_receive(&entry,command,cn,ec.owner_ip,50000,forward,&fn,&ip,&port));assert(ar_transport_receive(&remote,forward,fn,rc.peer_ip,17778,reply,&rn,&ip,&port));assert(rf.commands==1);
 assert(ar_transport_receive(&remote,forward,fn,rc.peer_ip,17778,reply,&rn,&ip,&port));assert(rf.commands==1);
 ef.now=5100;assert(!ar_transport_receive(&entry,command,cn,ec.owner_ip,50000,out,&on,&ip,&port));
 struct ar_config bad=er;memset(bad.trust.relay,0x33,16);assert(ar_initialize(&entry,&bad)==AB_SCOPE);
}
int main(void){boot_roundtrip(0);boot_roundtrip(1);radio_roundtrip(0);radio_roundtrip(1);puts("owner ingress transport: 4 topology suites passed");return 0;}
