# ADR-0006: Board-served web configuration and shared API

Status: **accepted design direction; implementation pending**, 7 November 2026. Authority: Rowan explicitly requested a board-served web interface in the design and delivery plan, with Android using the same configuration API. This accepts scope and the responsibility split, not an SDK, security mechanism or tested board implementation.

## Context and decision

Setup, diagnostics and recovery must be possible from a local browser without installing the Android app or accessing the internet. Each node serves a compact management interface and all required assets directly from the board. Firmware hosts one versioned configuration API consumed by both that browser interface and Android's node adapter, and owns validation, authorization, persistence and effective settings.

Keep changes consistent across clients, including revision conflicts, retries, disruptive network changes and reboot recovery. Authentication and a protected administration channel are required; HTTP serving alone is not secure provisioning. The [node management design](../node-management.md) defines scope and acceptance. Production security and exact-board resource feasibility remain open.

## Alternatives and limits

App-only setup would prevent browser-based recovery. Separate browser and Android configuration protocols would duplicate validation and drift. A hosted-only page would add an internet dependency. These are not the selected direction.

The board serves a compact management build, reusing UI elements where practical; it need not host the full companion app or maps. Initially configure only the connected node. Captive portal discovery is optional, with direct local-address access required. Existing decisions still govern native phone functions. This decision does not select the production phone data transport or authorize remote mesh administration.

## Evidence and consequences

SW-16 and W16 track offline browser setup, shared API parity, authenticated access, persistence/recovery and measured board resources. W01/W04/W06 supply SDK, local connectivity and security foundations; W10/W11 repeat management under combined load and endurance; W13 verifies provisioning and signed maintenance/recovery. EV-CONFIG is pending; no implementation or physical result is claimed.

If SDK compatibility, browser trust establishment, resource limits or recovery cannot meet the requirement, record failed evidence and return the choice to the owner through a successor decision. Preserve accepted scope until explicitly changed.
