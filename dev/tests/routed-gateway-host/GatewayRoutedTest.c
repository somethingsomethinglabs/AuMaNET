#include "aumanet_gateway.h"
#include "lwip/def.h"
#include "lwip/prot/ip4.h"
#include "lwip/prot/ethernet.h"
#include <assert.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
extern int host_sha(const uint8_t*,size_t,uint8_t[32]);
static uint64_t tick=1000;static int permit=1;static int now(uint64_t*n){*n=tick;return 1;}static int allowed(void){return permit;}
static size_t readfile(const char*dir,const char*name,uint8_t*out,size_t max){char path[2048];snprintf(path,sizeof path,"%s/%s",dir,name);FILE*f=fopen(path,"rb");assert(f);size_t n=fread(out,1,max,f);assert(!ferror(f)&&fgetc(f)==EOF);fclose(f);return n;}
static void packet(struct pbuf*p,uint8_t bytes[64],struct netif*input,uint32_t src,uint32_t dst,const uint8_t mac[6]){
 memset(bytes,0,64);memcpy(bytes+6,mac,6);bytes[12]=8;struct ip_hdr h={.vhl=0x45,.len=lwip_htons(40),.ttl=64,.proto=6,.src={lwip_htonl(src)},.dest={lwip_htonl(dst)}};memcpy(bytes+14,&h,sizeof h);
 memset(p,0,sizeof *p);p->payload=bytes;p->len=p->tot_len=54;assert(ag_ethernet_ingress(p,input));p->payload=bytes+14;p->len=p->tot_len=40;
}
int main(int argc,char**argv){
 assert(al_ap_start_permitted(1));assert(!al_ap_start_permitted(0));assert(!al_ap_start_permitted(2));
 assert(argc==2);uint8_t key[128],pin[32],envelopes[3][281];size_t sizes[3];size_t key_bytes=readfile(argv[1],"owner.der",key,sizeof key);assert(host_sha(key,key_bytes,pin));
 struct al_record r={.version=1,.revision=1,.epoch=1,.owner_ip=0x0a4d0110,.client_count=2};memset(r.group,0x11,16);memset(r.node,0xaa,16);memcpy(r.owner_pin,pin,32);
 assert(readfile(argv[1],"lan-local.bin",r.local.body,128)==128);assert(readfile(argv[1],"lan-peer.bin",r.peer.body,128)==128);r.local.signature_bytes=readfile(argv[1],"lan-local.sig",r.local.signature,72);r.peer.signature_bytes=readfile(argv[1],"lan-peer.sig",r.peer.signature,72);
 r.clients[0].ip=0x0a4d0110;r.clients[1].ip=0x0a4d0111;r.clients[0].mac[0]=r.clients[1].mac[0]=2;r.clients[0].mac[5]=1;r.clients[1].mac[5]=2;
 uint8_t peer[16];memset(peer,0xbb,16);assert(al_record_valid(&r,r.group,1,r.node,peer,pin,key,key_bytes));
 struct al_record corrupt=r;corrupt.local.body[97]=2;assert(!al_record_valid(&corrupt,r.group,1,r.node,peer,pin,key,key_bytes));corrupt=r;corrupt.clients[1]=corrupt.clients[0];assert(!al_record_valid(&corrupt,r.group,1,r.node,peer,pin,key,key_bytes));
 struct ag_trust t={.epoch=1,.public_key_der=key,.public_key_bytes=key_bytes,.monotonic_ms=now,.acquisition_permitted=allowed};memcpy(t.group,r.group,16);memcpy(t.node,r.node,16);memcpy(t.public_key_sha256,pin,32);memset(t.run,0x22,16);
 assert(ag_initialize(&t)==AG_OK);assert(ag_lan_set(&r)==AG_OK);ag_clock(tick,1800000000ULL);
 struct netif phone={.up=1,.link=1,.ip={lwip_htonl(0x0a4d0101)}},mesh={.up=1,.link=1,.ip={lwip_htonl(0x0a4e0001)}};
 struct ag_interface local={.netif=&phone,.role=AG_PHONE},remote={.netif=&mesh,.role=AG_MESH,.next_hop=0x0a4e0002,.peer_mac={2,0,0,0,0,0xb0}};memcpy(remote.peer,peer,16);assert(ag_interface_set(0,&local)==AG_OK);assert(ag_interface_set(1,&remote)==AG_OK);
 assert(ag_client_attachment(r.clients[0].mac,1)==AG_OK);assert(ag_client_attachment(r.clients[1].mac,1)==AG_OK);
 uint32_t ip;assert(ag_dhcp_address(r.clients[1].mac,&ip)==1&&ip==r.clients[1].ip);assert(ag_dhcp_address(r.clients[0].mac,&ip)==1&&ip==r.clients[0].ip);uint8_t unknown[6]={2,0,0,0,0,99};assert(ag_dhcp_address(unknown,&ip)==-1);
 for(unsigned i=0;i<3;i++){char name[30];snprintf(name,sizeof name,"packet-%u.bin",i);sizes[i]=readfile(argv[1],name,envelopes[i],281);assert(sizes[i]==209u+envelopes[i][208]);assert(ag_admit(envelopes[i]+16,192,envelopes[i]+209,envelopes[i][208])==AG_OK);}
 assert(ag_admit(envelopes[0]+16,192,envelopes[0]+209,envelopes[0][208])==AG_REPLAY);
 uint8_t bytes[64];struct pbuf p;packet(&p,bytes,&phone,0x0a4d0110,0x0a4d0111,r.clients[0].mac);assert(ag_ip4_ingress(&p,&phone));assert(ag_ethernet_egress(&p,&phone,ETHTYPE_IP));
 packet(&p,bytes,&phone,0x0a4d0110,0x0a4d0210,r.clients[0].mac);assert(ag_ip4_ingress(&p,&phone));assert(ag_ethernet_egress(&p,&mesh,ETHTYPE_IP));struct ip_hdr header;memcpy(&header,p.payload,sizeof header);assert(lwip_ntohl(header.src.addr)==0x0a4d0110&&lwip_ntohl(header.dest.addr)==0x0a4d0210);
 packet(&p,bytes,&phone,0x0a4d0110,0x0a4d0210,r.clients[1].mac);assert(!ag_ip4_ingress(&p,&phone));
 packet(&p,bytes,&mesh,0x0a4d0210,0x0a4d0111,remote.peer_mac);assert(ag_ip4_ingress(&p,&mesh));assert(ag_ethernet_egress(&p,&phone,ETHTYPE_IP));
 packet(&p,bytes,&phone,0x0a4d0110,0x0a4d0111,r.clients[0].mac);assert(ag_ip4_ingress(&p,&phone));assert(ag_client_attachment(r.clients[1].mac,0)==AG_OK);assert(!ag_ethernet_egress(&p,&phone,ETHTYPE_IP));assert(ag_dhcp_address(r.clients[1].mac,&ip)==-1);assert(ag_dhcp_address(r.clients[0].mac,&ip)==1);
 packet(&p,bytes,&phone,0x0a4d0110,0x0a4d0210,r.clients[0].mac);assert(ag_ip4_ingress(&p,&phone));assert(ag_ethernet_egress(&p,&mesh,ETHTYPE_IP));
 assert(ag_client_attachment(r.clients[1].mac,1)==AG_OK);packet(&p,bytes,&phone,0x0a4d0110,0x0a4d0111,r.clients[0].mac);assert(!ag_ip4_ingress(&p,&phone));
 for(unsigned i=0;i<3;i++){char name[30];uint8_t renewal[281];snprintf(name,sizeof name,"renewal-%u.bin",i);readfile(argv[1],name,renewal,sizeof renewal);assert(ag_admit(renewal+16,192,renewal+209,renewal[208])==AG_OK);}
 packet(&p,bytes,&phone,0x0a4d0110,0x0a4d0111,r.clients[0].mac);assert(ag_ip4_ingress(&p,&phone));assert(ag_ethernet_egress(&p,&phone,ETHTYPE_IP));
 mesh.link=0;packet(&p,bytes,&phone,0x0a4d0110,0x0a4d0111,r.clients[0].mac);assert(ag_ip4_ingress(&p,&phone));assert(ag_ethernet_egress(&p,&phone,ETHTYPE_IP));assert(ag_dhcp_address(r.clients[0].mac,&ip)==1);
 ip4_addr_t destination={lwip_htonl(0x0a4d0210)};struct netif*out=NULL;assert(ag_route(NULL,&destination,&out)&&out==NULL);mesh.link=1;
 packet(&p,bytes,&phone,0x0a4d0110,0x0a4d0210,r.clients[0].mac);assert(ag_ip4_ingress(&p,&phone));tick+=31000;assert(!ag_ethernet_egress(&p,&mesh,ETHTYPE_IP));assert(ag_dhcp_address(r.clients[0].mac,&ip)==1);
 puts("{\"status\":\"pass\",\"scope\":\"production C policy, real Windows P256/SHA256, explicit fake netif/pbuf/clock\",\"physical\":false}");return 0;
}
