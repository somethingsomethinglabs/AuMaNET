/* SPDX-License-Identifier: Apache-2.0. Exact subset of pinned mmregdb.c AU2024.
 * Every tuple is also matched against the actual linked SDK list before RF boot.
 * Neither this catalog nor an app command changes the 24dBm conducted ceiling. */
#include "aumanet_radio_profile.h"
static const struct ar_option options[AR_OPTION_COUNT]={
 {1,28,22,50,1,916000000},
 {2,30,22,50,1,917000000},
 {3,32,22,50,1,918000000},
 {4,34,22,50,1,919000000},
 {5,36,22,50,1,920000000},
 {6,38,22,50,1,921000000},
 {7,40,22,50,1,922000000},
 {8,42,22,50,1,923000000},
 {9,44,22,50,1,924000000},
 {10,46,22,50,1,925000000},
 {11,48,22,50,1,926000000},
 {12,50,22,50,1,927000000},
 {13,29,23,51,2,916500000},
 {14,33,23,51,2,918500000},
 {15,37,23,51,2,920500000},
 {16,41,23,51,2,922500000},
 {17,45,23,51,2,924500000},
 {18,49,23,51,2,926500000},
 {19,31,24,52,4,917500000},
 {20,39,24,52,4,921500000},
 {21,47,24,52,4,925500000},
 {22,35,25,53,8,919500000},
 {23,43,25,53,8,923500000},
};
const struct ar_option *ar_option(unsigned id){return id>=1&&id<=AR_OPTION_COUNT?&options[id-1]:NULL;}
unsigned ar_option_match(unsigned channel,unsigned opclass){for(unsigned i=0;i<AR_OPTION_COUNT;i++)if(options[i].channel==channel&&(options[i].opclass==opclass||options[i].global_opclass==opclass))return i+1;return 0;}
