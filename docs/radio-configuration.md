# Radio channel & width

Use **Tools → Radio settings** on the current group owner's phone. A member may inspect reports but cannot change the group's radio. The field node follows the base node's HaLow channel. Both nodes need compatible firmware.

## Read before changing

Refresh status and inspect the reported operating channel, frequency and width. These settings describe the node-to-node HaLow link, not phone Wi-Fi or a voice channel. Unavailable values remain unknown; a configured TX ceiling is not measured radiated output.

Catalog version 1 contains 23 permitted AU operating tuples: twelve at 1 MHz, six at 2 MHz, three at 4 MHz and two at 8 MHz. The available channel list depends on width. The control does not expose arbitrary frequencies, country changes or TX-power changes.

## Apply a change

1. Stop shared internet and finish any connection test or maintenance operation.
2. On the owner phone, choose a width, then a permitted channel.
3. Review the proposed frequency and width, then select **Save proposal**.
4. Select **Begin bounded trial**. Connected supported phones pause managed calls and transfers and acknowledge readiness.
5. The base tries the tuple and the station follows. Choose **Commit verified setting** when fresh signed reports from both original node boots confirm the intended state.

Voice returns muted; interrupted image progress is retained. An uncommitted trial has a 30-second deadline. An unknown persistent-write outcome must be reconciled; rollback in RAM does not prove which persistent record a reboot will load.

## Baseline and checked scope

Local radio notes record the original baseline as AU channel 36, 920 MHz, 1 MHz width, configured ceiling 24 dBm. Owner-side app changes at 1/2/4/8 MHz and persistence/rollback checks were recorded, but not every tuple or field path was tested. The second phone was away for the final increment, so complete two-phone coordination/throughput acceptance remains open. These values document a prototype configuration, not regulatory approval or a recommended universal setting.

## Compare instead of guessing

Wider channels do not guarantee better penetration or range. Hold positions, antennas and power consistent and run repeated [connection tests](connection-tests.md). Preserve failed runs and unknown signal ages.

The checked [radio protocol reference](../dev/firmware/gateway/RADIO-CONFIGURATION.md) specifies authorization, trial and reconciliation. Local source: `design/radio-settings.md`, reviewed for this handbook on 15 November 2026. Regional certification and actual RF measurements remain open.
