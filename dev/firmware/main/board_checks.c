#include "sdkconfig.h"
#include "porting_assistant.h"

extern const struct test_step test_step_verify_busy_pin;

/* The stock Seeed board leaves WAKE/BUSY unconnected. With PS disabled the
 * upstream shim deliberately implements busy_is_asserted() as constant false.
 * Report this unsupported check as skipped, preserving every other SDK test. */
TEST_STEP(test_step_bench_busy, "Verify BUSY pin (capability dependent)")
{
#if CONFIG_HALOW_PS_MODE
    return test_step_verify_busy_pin.exec(log_buf, log_buf_len);
#else
    TEST_LOG_APPEND("Unsupported with CONFIG_HALOW_PS_MODE=n; WAKE/BUSY are not\n"
                    "connected on the stock Seeed carrier. Power save remains disabled.\n");
    return TEST_SKIPPED;
#endif
}
