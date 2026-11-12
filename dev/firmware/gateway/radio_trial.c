/* SPDX-License-Identifier: Apache-2.0. No keys, clock changes or data-plane grants. */
#include "aumanet_radio_trial.h"
#include <string.h>
static int zero(const uint8_t *p){uint8_t v=0;for(unsigned i=0;i<16;i++)v|=p[i];return !v;}
static int advance(struct ar_trial *s,uint64_t now){if(s->have_now&&now<s->now){s->poisoned=1;return 0;}s->have_now=1;s->now=now;return !s->poisoned;}
int ar_trial_initialize(struct ar_trial *s,unsigned initial,uint64_t generation,const uint8_t tx[16],void *context,int (*apply)(void *,unsigned),int (*persist)(void *,unsigned,uint64_t,const uint8_t[16])){
    if(!s||!ar_option(initial)||generation>AB_MAX_SAFE||!tx||!apply||!persist)return 0;
    memset(s,0,sizeof *s);s->view.current=(uint8_t)initial;s->view.persisted=generation?(uint8_t)initial:0;s->view.generation=generation;s->view.flags=3;s->view.power=24;memcpy(s->view.transaction,tx,16);memcpy(s->committed_transaction,tx,16);s->context=context;s->apply=apply;s->persist=persist;return 1;
}
int ar_trial_command(struct ar_trial *s,unsigned op,unsigned option,const uint8_t tx[16],uint64_t generation,uint64_t now){
    if(!s||!tx||zero(tx)||!ar_option(option)||!advance(s,now)||generation!=s->view.generation||!(s->view.flags&1)||op<1||op>3)return 0;
    if(op==2&&s->view.state==0&&s->view.persisted==option&&!memcmp(tx,s->view.transaction,16))return 1;
    if(op==1){if(s->view.state!=0&&s->view.state!=5)return 0;if(option==s->view.current)return 0;s->original=s->view.current;s->view.target=(uint8_t)option;memcpy(s->view.transaction,tx,16);s->view.state=1;s->view.error=0;s->action=1;s->deadline=now>UINT64_MAX-AR_TRIAL_MS?UINT64_MAX:now+AR_TRIAL_MS;return 1;}
    if((s->view.state!=1&&s->view.state!=3)||s->view.target!=option||memcmp(tx,s->view.transaction,16))return 0;
    if(op==2&&(s->view.state!=3||now>=s->deadline||s->view.actual!=option||!s->view.associated||s->view.generation==AB_MAX_SAFE))return 0;
    s->action=(uint8_t)op;if(op==3)s->view.state=4;return 1;
}
static void rollback(struct ar_trial *s){s->view.state=4;if(s->apply(s->context,s->original)==1){s->view.current=s->original;s->view.actual=0;s->view.state=0;}else{s->view.state=5;s->view.actual=0;s->view.error=2;}memcpy(s->view.transaction,s->committed_transaction,16);s->view.target=0;s->action=0;s->deadline=0;s->view.remaining=0;}
void ar_trial_tick(struct ar_trial *s,uint64_t now,int permitted){
    if(!s)return;
    if(!advance(s,now)||permitted!=1){if(s->view.state>=1&&s->view.state<=4&&s->original)rollback(s);if(s->poisoned){s->view.state=5;s->view.error=4;}return;}
    if((s->view.state==1||s->view.state==3)&&now>=s->deadline){rollback(s);return;}
    if(s->action==3){rollback(s);return;}
    if(s->action==1){s->action=0;s->view.state=2;if(s->apply(s->context,s->view.target)!=1){s->view.error=1;rollback(s);if(s->view.state==0)s->view.state=5;return;}s->view.current=s->view.target;s->view.actual=0;s->view.state=3;}
    else if(s->action==2){s->action=0;if(s->view.actual!=s->view.target||!s->view.associated){s->view.error=5;rollback(s);s->view.state=5;return;}uint64_t next=s->view.generation+1;if(s->persist(s->context,s->view.target,next,s->view.transaction)!=1){s->view.flags&=(uint8_t)~1u;s->view.error=3;rollback(s);s->view.state=5;return;}s->view.persisted=s->view.current=s->view.target;memcpy(s->committed_transaction,s->view.transaction,16);s->view.generation=next;s->view.target=0;s->view.state=0;s->deadline=0;}
    s->view.remaining=s->view.state==3&&s->deadline>now?(uint32_t)(s->deadline-now):0;
}
