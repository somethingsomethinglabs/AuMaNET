# Radio channel & width

Use **Tools → Radio settings** from any connected, approved group phone. The group host checks the nodes and coordinates the change over the authenticated group connection. The field node follows the base node’s HaLow channel. Both nodes need compatible firmware.

## Read before changing

Tap **Refresh radio status** for a fresh reading from both nodes. When reports age, the screen labels the channel as last verified and shows how old the reports are. These settings describe the node-to-node HaLow link. A configured transmit-power ceiling is different from measured radiated power.

Catalog version 1 contains 23 permitted AU operating tuples: twelve at 1 MHz, six at 2 MHz, three at 4 MHz and two at 8 MHz. The available channel list depends on width. The control does not expose arbitrary frequencies, country changes or TX-power changes.

## Apply a change

1. Stop shared internet and finish any connection test or maintenance operation.
2. Choose a permitted channel and check its frequency and width.
3. On the host phone, tap **Save proposal**, then **Begin bounded trial**. Tap **Commit verified setting** once both nodes verify the trial.
4. On an approved member phone, **Apply selected channel** requests a trial and authorizes the host to save the channel after both nodes verify it.

Connected phones pause managed calls and transfers for the trial. The base tries the setting and the field node follows. The screen reports the outcome after checking both nodes again.

Voice returns muted; interrupted image progress is retained. An uncommitted trial has a 30-second deadline. An unknown persistent-write outcome must be reconciled; rollback in RAM does not prove which persistent record a reboot will load.

## Baseline and checked scope

Local radio notes record the original baseline as AU channel 36, 920 MHz, 1 MHz width, configured ceiling 24 dBm. Owner-side app changes at 1/2/4/8 MHz and persistence/rollback checks were recorded, but not every tuple or field path was tested. The second phone was away for the final increment, so complete two-phone coordination/throughput acceptance remains open. These values document a prototype configuration, not regulatory approval or a recommended universal setting.

## Compare instead of guessing

Wider channels do not guarantee better penetration or range. Hold positions, antennas and power consistent and run repeated [connection tests](connection-tests.md). Preserve failed runs and unknown signal ages.

The checked [radio protocol reference](../dev/firmware/gateway/RADIO-CONFIGURATION.md) specifies authorization, trial and reconciliation. Local source: `design/radio-settings.md`, reviewed for this handbook on 15 November 2026. Regional certification and actual RF measurements remain open.
