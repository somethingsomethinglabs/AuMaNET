# Native group-message host tests

Run from the repository root:

```powershell
node dev/tests/native-group-messages-store.mjs --output dev/artifacts/group-messages-store
```

The runner compiles the real production SQL repository, canonical signature wire
format and authority/expiry helpers with JDK 21. It uses real SQLite through the
pinned JDBC driver and generated, disposable P-256 test certificates. No Android
stubs, application databases, phone connections, TLS sockets, or microphones are used.
The generated PKCS12 fixtures contain only ephemeral host-test identities and a
public test password; they are never application credentials.

`dependencies.json` pins both dependency bytes and SHA-256 values. Existing ignored
artifacts are reused only after verification; missing jars are fetched from their
fixed Maven Central URLs and verified before use. These are host-only dependencies
and must not be added to the Android app.

Each execution creates an isolated `run-*` directory below `--output`. Both that
directory and `--output/result.json` retain result metadata, dependency hashes and
the exact production/test source hashes. Compilation uses separate class files;
it does not run Gradle, sync web assets or alter an APK. A source change during a
run invalidates the result.

These checks establish host SQL/signature behavior only. They do not establish
Android SQLite lifecycle/Keystore behavior, authenticated physical transport,
device delivery, or production security acceptance.
