# Android host

Reserved workspace for the proposed Capacitor host and Kotlin services. Native project generation, application identity and dependency selection belong to the Android feasibility spike. No APK is produced yet.

Bundle the shared app rather than duplicating its screens. Native services must own background session state; the UI reconnects and hydrates that state. Never commit signing material or local Android SDK paths.
