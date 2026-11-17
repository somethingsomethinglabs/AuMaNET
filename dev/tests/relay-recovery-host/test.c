#include "aumanet_relay_recovery.h"
#include <assert.h>
#include <stdio.h>
#include <string.h>
static unsigned checks;
#define CHECK(x) do { ++checks; assert(x); } while(0)
static arr_id id(unsigned v) { arr_id a={{0}}; a.bytes[15]=(uint8_t)v; return a; }
static arr_policy policy(void) {
    return (arr_policy){.scope=id(100),.self=id(5),.session=id(101),.valid_until_ms=100000,
        .freshness_ms=1000,.loss_ms=100,.debounce_ms=50,.retry_ms=200,
        .self_root_generation=1,.operation_timeout_ms=500,.max_attempts=8,
        .self_priority=10,.authorized=true,.regional_ok=true,.self_may_root=true};
}
static arr_controller init(void) {
    arr_controller c; arr_policy p=policy(); CHECK(arr_init(&c,&p,true,0)); return c;
}
static arr_observation obs(unsigned node,unsigned root,unsigned priority,uint64_t seq) {
    arr_observation o={.scope=id(100),.node=id(node),.root=id(root),.sequence=seq,
        .priority=(uint16_t)priority,.root_priority=(uint16_t)priority,
        .authenticated=true,.eligible_root=true,.has_root=root!=0,.root_session=id(200),.root_generation=1};
    if(root) { o.path[0]=id(root); o.path_length=1;
        if(node!=root) { o.path[1]=id(node); o.path_length=2; } }
    return o;
}
static arr_intent choose(arr_controller *c,uint64_t now) {
    CHECK(arr_step(c,now).action==ARR_NONE); return arr_step(c,now+150);
}
static void bootstrap_and_gates(void) {
    arr_controller c=init(); arr_intent i=choose(&c,0);
    CHECK(i.action==ARR_ROOT&&i.revoke_forwarding&&!c.forwarding);
    CHECK(arr_ack(&c,&i,true,true,true,150));
    CHECK(c.forwarding&&c.status==ARR_STABLE);
    CHECK(arr_step(&c,200).action==ARR_NONE&&c.forwarding);
    CHECK(arr_step(&c,100000).revoke_forwarding&&c.status==ARR_BLOCKED);
    CHECK(!arr_ack(&c,&i,true,true,true,100001));
    arr_policy p=policy(); CHECK(!arr_init(&c,&p,false,0));
    CHECK(arr_step(&c,1).revoke_forwarding&&c.status==ARR_UNSUPPORTED);
    p.regional_ok=false; CHECK(!arr_init(&c,&p,true,0)); CHECK(c.status==ARR_BLOCKED);
    p=policy(); p.authorized=false; CHECK(!arr_init(&c,&p,true,0));
    c=init(); arr_step(&c,50); CHECK(arr_step(&c,49).revoke_forwarding);
    CHECK(c.status==ARR_BLOCKED); arr_step(&c,500); CHECK(c.status==ARR_BLOCKED);
}
static void validation_replay(void) {
    arr_controller c=init(); arr_observation o=obs(1,1,1,1);
    o.authenticated=false; CHECK(!arr_observe(&c,&o,0)); o.authenticated=true;
    o.scope=id(99); CHECK(!arr_observe(&c,&o,0)); o.scope=id(100);
    o.path[0]=id(5); CHECK(!arr_observe(&c,&o,0)); o.path[0]=id(1);
    CHECK(arr_observe(&c,&o,0)); CHECK(!arr_observe(&c,&o,1));
    CHECK(!arr_observe(&c,&o,2000)); /* expiry never erases replay fence */
    o.sequence=2; CHECK(arr_observe(&c,&o,2000));
    o=obs(2,1,1,1); o.path[1]=id(5); CHECK(!arr_observe(&c,&o,2000));
    o=obs(2,1,1,1); o.path_length=3; o.path[2]=id(2); CHECK(!arr_observe(&c,&o,2000));
    for(unsigned n=10;n<=15;n++) { o=obs(n,1,1,1); CHECK(arr_observe(&c,&o,2000)); }
    o=obs(8,1,1,1); CHECK(!arr_observe(&c,&o,2000));
}
static void parent_recovery_merge(void) {
    arr_controller c=init(); arr_observation a=obs(2,1,5,1),b=obs(3,1,5,1);
    CHECK(arr_observe(&c,&a,0)); CHECK(arr_observe(&c,&b,0));
    arr_intent i=choose(&c,0); CHECK(i.action==ARR_PARENT&&i.parent.bytes[15]==2);
    CHECK(arr_ack(&c,&i,true,true,true,150));
    /* A shorter path to the same root never dislodges a healthy parent. */
    b=obs(1,1,5,1); CHECK(arr_observe(&c,&b,300));
    CHECK(arr_step(&c,300).action==ARR_NONE&&c.parent.bytes[15]==2);
    /* Refresh alternative; current expires, forwarding stops immediately. */
    b.sequence=2; CHECK(arr_observe(&c,&b,900));
    CHECK(arr_step(&c,1000).revoke_forwarding&&!c.forwarding);
    CHECK(arr_step(&c,1149).action==ARR_NONE);
    i=arr_step(&c,1150); CHECK(i.action==ARR_PARENT&&i.parent.bytes[15]==1);
    CHECK(arr_ack(&c,&i,true,true,true,1150));
    /* Better root wins deterministic merge after debounce/fence. */
    b=obs(4,4,1,1); CHECK(arr_observe(&c,&b,1200));
    CHECK(arr_step(&c,1200).revoke_forwarding&&!c.forwarding);
    i=arr_step(&c,1350); CHECK(i.root.bytes[15]==4);
    CHECK(arr_ack(&c,&i,true,true,true,1350)); CHECK(c.root.bytes[15]==4);
    /* All root observations lost: partition-local bootstrap is authorized. */
    CHECK(arr_step(&c,2200).revoke_forwarding);
    i=arr_step(&c,2350); CHECK(i.action==ARR_ROOT);
    CHECK(arr_ack(&c,&i,true,true,true,2350));
}
static void failure_and_election(void) {
    arr_controller c=init(); arr_intent i=choose(&c,0),bad=i;
    bad.generation++; CHECK(!arr_ack(&c,&bad,true,true,true,150)); CHECK(!c.forwarding);
    bad=i; bad.root=id(9); CHECK(!arr_ack(&c,&bad,true,true,true,150));
    bad=i; bad.session=id(102); CHECK(!arr_ack(&c,&bad,true,true,true,150));
    bad=i; bad.scope=id(102); CHECK(!arr_ack(&c,&bad,true,true,true,150));
    CHECK(!arr_ack(&c,&i,false,true,false,150)); CHECK(!c.forwarding);
    CHECK(arr_step(&c,349).action==ARR_NONE);
    i=arr_step(&c,350); CHECK(i.action==ARR_ROOT);
    CHECK(!arr_ack(&c,&i,false,true,true,350));
    CHECK(arr_step(&c,549).action==ARR_NONE); i=arr_step(&c,550);
    CHECK(!arr_ack(&c,&i,true,true,false,550)); CHECK(!c.forwarding);
    CHECK(arr_step(&c,750).action==ARR_NONE&&c.status==ARR_BLOCKED);
    c=init(); arr_observation o=obs(1,0,10,1); CHECK(arr_observe(&c,&o,0));
    i=choose(&c,0); CHECK(i.action==ARR_NONE); /* equal priority smaller ID wins */
    i=arr_step(&c,1000); CHECK(i.action==ARR_ROOT); /* candidate vanished */
    o.sequence=2; CHECK(arr_observe(&c,&o,1001));
    CHECK(arr_step(&c,1001).action==ARR_NONE&&c.status==ARR_BLOCKED); CHECK(!arr_ack(&c,&i,true,true,true,1001));
    c=init(); c.policy.self_may_root=false; i=choose(&c,0); CHECK(i.action==ARR_NONE);
    c=init(); c.policy.jitter_ms=50;
    CHECK(arr_step(&c,0).action==ARR_NONE); CHECK(arr_step(&c,149).action==ARR_NONE);
    CHECK(arr_step(&c,200).action==ARR_ROOT);
}
static void bounded_unknown_and_root_reboot(void) {
    arr_controller c=init(); arr_intent i=choose(&c,0);
    CHECK(arr_step(&c,649).generation==i.generation);
    CHECK(arr_step(&c,650).action==ARR_NONE&&c.status==ARR_BLOCKED);
    CHECK(!arr_ack(&c,&i,true,true,true,650));
    CHECK(arr_step(&c,5000).action==ARR_NONE&&c.attempts==1); /* no replay */
    c=init(); c.policy.max_attempts=1; i=choose(&c,0);
    CHECK(!arr_ack(&c,&i,false,true,true,150));
    CHECK(arr_step(&c,350).action==ARR_NONE&&c.status==ARR_BLOCKED);
    c=init(); arr_observation o=obs(1,1,1,1); CHECK(arr_observe(&c,&o,0));
    i=choose(&c,0); CHECK(i.action==ARR_PARENT);
    /* Authenticated newer root instance, same parent and logical root. */
    o.sequence=2; o.root_generation=2; o.root_session=id(201);
    CHECK(arr_observe(&c,&o,151));
    CHECK(!arr_ack(&c,&i,true,true,true,151)); CHECK(!c.forwarding);
    CHECK(c.status==ARR_BLOCKED); CHECK(arr_step(&c,152).action==ARR_NONE);
    /* Separate reconciled session, initially proven root instance2. */
    c=init(); CHECK(arr_observe(&c,&o,0));
    arr_intent newer=choose(&c,0); CHECK(arr_ack(&c,&newer,true,true,true,150));
    o.sequence=3; o.root_generation=1; o.root_session=id(200);
    CHECK(!arr_observe(&c,&o,152)); /* old instance cannot supersede */
    o.root_generation=2; CHECK(!arr_observe(&c,&o,152)); /* conflicting session */
    o.root_session=id(201); o.root_priority=0;
    CHECK(!arr_observe(&c,&o,152)); /* rank immutable under same policy */
    o.root_priority=1; CHECK(arr_observe(&c,&o,152));
    o.sequence=4; o.root_generation=3; o.root_session=id(202);
    CHECK(arr_observe(&c,&o,200));
    CHECK(arr_step(&c,200).revoke_forwarding&&!c.forwarding);
    CHECK(arr_step(&c,349).action==ARR_NONE);
    newer=arr_step(&c,350); CHECK(newer.root_generation==3);
    CHECK(arr_ack(&c,&newer,true,true,true,350));
    c=init(); i=choose(&c,0);
    CHECK(!arr_ack(&c,&i,true,false,true,150));
    CHECK(c.status==ARR_BLOCKED&&!c.forwarding);
}
int main(void) {
    bootstrap_and_gates(); validation_replay(); parent_recovery_merge(); failure_and_election();
    bounded_unknown_and_root_reboot();
    printf("relay recovery: %u assertions passed\n",checks); return 0;
}
