#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>
#define MMLOG_VRB(...) ((void)0)
#define MMLOG_DBG(...) ((void)0)
#define is_root(d) ((d)->depth == 0)
enum { MMWLAN_VIF_STA=1, MMWLAN_VIF_AP=2 };
struct mmwlan_tx_metadata { unsigned vif; const uint8_t *ra; };
struct umac_relay_data { unsigned depth; };
struct umac_data { struct umac_relay_data *relay; };
struct umac_8023_hdr { uint8_t dest_addr[6],src_addr[6]; };
struct mmpkt { struct umac_8023_hdr header; };
struct mmpktview { struct mmpkt *packet; };
struct umac_relay_table_entry { uint8_t next_hop[6]; };
static struct mmpktview view;
static bool direct,subtree;
static struct umac_relay_table_entry entry={{2,3,4,5,6,7}};
static struct umac_relay_data *umac_data_get_relay(struct umac_data *u){return u->relay;}
static struct mmpktview *mmpkt_open(struct mmpkt *p){view.packet=p;return &view;}
static void *mmpkt_get_data_start(struct mmpktview *v){return &v->packet->header;}
static void mmpkt_close(struct mmpktview **v){*v=NULL;}
static bool mm_mac_addr_is_multicast(const uint8_t *a){return (a[0]&1)!=0;}
static void *umac_ap_lookup_sta_by_addr(struct umac_data *u,const uint8_t *a){(void)u;(void)a;return direct?(void*)&entry:NULL;}
static struct umac_relay_table_entry *umac_relay_table_lookup_by_da(struct umac_relay_data *d,const uint8_t *a){(void)d;return subtree&&!mm_mac_addr_is_multicast(a)?&entry:NULL;}
/* The runner inserts the exact production function here. */
PRODUCTION_FUNCTION
int main(void){
 unsigned failures=0,cases=0;
 for(unsigned root=0;root<2;root++)for(unsigned kind=0;kind<4;kind++){
  struct umac_relay_data data={.depth=root?0:1};struct umac_data u={&data};
  struct mmpkt p={0};p.header.dest_addr[0]=kind==0?0xff:2;
  direct=kind==1;subtree=kind==2;
  struct mmwlan_tx_metadata meta={.vif=root?MMWLAN_VIF_AP:MMWLAN_VIF_STA};
  umac_relay_update_tx_metadata(&u,&p,&meta);
  unsigned expected=(root||direct||subtree)?MMWLAN_VIF_AP:MMWLAN_VIF_STA;
  bool ok=meta.vif==expected&&(subtree?meta.ra==entry.next_hop:meta.ra==NULL);
  cases++;if(!ok){failures++;printf("FAIL root=%u kind=%u vif=%u expected=%u\n",root,kind,meta.vif,expected);}
 }
 struct umac_relay_data data={0};struct umac_data u={&data};struct mmpkt p={0};uint8_t ra[6]={2};
 struct mmwlan_tx_metadata meta={.vif=MMWLAN_VIF_STA,.ra=ra};
 umac_relay_update_tx_metadata(&u,&p,&meta);cases++;if(meta.vif!=MMWLAN_VIF_STA||meta.ra!=ra)failures++;
 u.relay=NULL;meta.ra=NULL;meta.vif=MMWLAN_VIF_AP;
 umac_relay_update_tx_metadata(&u,&p,&meta);cases++;if(meta.vif!=MMWLAN_VIF_AP||meta.ra!=NULL)failures++;
 printf("cases=%u failures=%u\n",cases,failures);return failures?1:0;
}
