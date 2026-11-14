# Contributing

The best contribution makes a documented behavior reproducible: a clearer setup step, a recorded failure, a tested improvement or a decision with its tradeoffs written down.

## Start with the right context

Read [Project status](capabilities.md) and the [documentation roadmap](documentation-roadmap.md). Discuss implementation scope through the repository's [issues](https://github.com/somethingsomethinglabs/AuMaNET/issues) or a pull request. No project chat server or support response time is promised.

For code, use [Development](development-guide.md). For documentation, edit the Markdown source named in each page's footer and follow [Maintain this site](maintaining-docs.md). Existing design references are dated records; avoid changing an old experiment to imply a new result.

## Report useful results

Record the board revision, firmware/image hash, app build, phone/OS, test method, expected behavior, observed outcome and limitations. Keep failed attempts. Distinguish a browser fixture, an emulator check, a bench result and a field result. Use the [experiment template](../discovery/experiment-template.md) where appropriate.

Review exports before sharing. Remove keys, invitations, private device identifiers, coordinates, tracks and unrelated messages. Never publish private bootstrap firmware or raw flash backups.

## Before submitting

Run the checks for the changed area. Documentation changes need generation, link checks and the Pages build; geometry changes also follow the repository's print workflow. A successful software check does not certify a radio, antenna, enclosure or battery.

## Contribution policy still needed

The original project's licence remains undecided. A formal contribution/licensing policy, release support policy and security-reporting contact still need owner decisions. Do not assume the repository grants an open-source licence; see [Licensing & privacy](project-legal.md).
