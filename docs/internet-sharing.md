# Internet sharing

Internet is optional and separate from local group communication. The recorded Android prototype supports explicit mobile-data donation and reception for other apps through a bounded IPv4 path. It is not a general compatibility or IPv6 claim.

## Offer your mobile data

Open **Internet sharing** from Network or Settings and choose **Share my internet**. Review the session data limit and duration. Use **Stop sharing my internet** to end the donor role. Permission to use the group does not itself offer your data.

## Use a donor

Choose **Use shared internet**, select an available donor and review Android's VPN permission prompt. Use **Stop using shared internet** to end the receiving role. The app does not silently select a replacement donor when one disappears.

Donor availability, selecting a donor and actual internet reachability are separate states. A VPN indicator alone does not prove a working end-to-end path. Existing VPNs and OEM routing/background behavior need testing on each phone combination.

## During tests and maintenance

Stop sharing/using internet before connection benchmarking, radio changes or firmware maintenance. Limits and expiry bound a session; after Stop or expiry, inspect the actual role state before starting again. Android's default-network selection can also affect the result.

## Scope and remaining documentation

The 12 November application-polish notes record physical two-phone checks, Stop/expiry and recovery for the bounded prototype. The documentation still needs a verified supported-device matrix, routing diagram, data-accounting semantics, VPN coexistence outcomes and troubleshooting per Android build. Automatic donor handover is not implemented by this workflow.

See [Network overview](overview.md), [Troubleshooting](troubleshooting.md) and the dated [connectivity investigation](../design/android-connectivity-investigation.md) for the distinction between product goals and accepted behavior.
