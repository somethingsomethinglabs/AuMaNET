# Workshop filament defaults

`rigid.json` and `tpu.json` are flattened copies of Bambu PA6-GF @BBL X1C and Generic TPU from the installed Bambu Studio 2.8.2.61 profiles, including their inherited `fdm_filament_common` and material defaults. Source directory: `C:/Program Files/Bambu Studio/resources/profiles/BBL/filament/`.

These files are inputs to `scripts/build-bambu-workshop.py`, not user presets installed into Studio. The builder embeds their settings into the generated project, combined with the preserved P1S printer configuration. Filament 1 is PA6-GF; filament 2 is TPU. Multi-extruder source metadata is normalized to the two standard-flow filament entries so the desktop importer and CLI agree.

The defaults are starting points for fit prototypes. Select your actual spool's profile and calibrate as appropriate. The TPU gasket objects carry their own 0.12 mm layer height, no-support/no-brim, 100% infill and slow-wall overrides.

Bambu Studio source and profile licensing: https://github.com/bambulab/BambuStudio .

The rigid profile retains the original arranged project's standard-flow PA6-GF values (265 C nozzle, 100 C textured plate). The X1C profile name comes from that original project; the workshop printer remains P1S.
