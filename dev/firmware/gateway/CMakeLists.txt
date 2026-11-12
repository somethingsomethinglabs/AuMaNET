idf_component_register(SRCS "gateway.c" "crypto_mbedtls.c" "boot_recovery.c" "boot_transport.c" "radio_profile.c" "radio_control.c" "radio_trial.c" "ota.c"
    INCLUDE_DIRS "include" REQUIRES lwip mbedtls)
