#include "sdkconfig.h"
#include "gateway_ota_build.h"
#include "ota_build_meta.h"
/* IDF linker places this immediately after esp_app_desc_t in the first segment. */
const struct gateway_ota_build gateway_ota_build __attribute__((section(".rodata_custom_desc"),used))={
 .magic={'A','U','M','B','D','1',0,0},
#if CONFIG_AUMANET_NODE_B
 .role=2,
#else
 .role=1,
#endif
 .layout=1,.country={'A','U'},.power=24,.channel=GO_CHANNEL,.flags=GO_DIRTY,
#if CONFIG_AUMANET_PRIVATE_BOOTSTRAP
 .private_bootstrap=1,
#endif
 .version=GO_VERSION,.commit=GO_COMMIT_BYTES,.ref=GO_REF,.build=GO_BUILD,.profile=GO_PROFILE_BYTES
};
