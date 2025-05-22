# TODO: KeyBard CLI - Planned Commands

This file lists planned command-line interface (CLI) commands for KeyBard CLI, based on the non-UI capabilities of the KeyBard core library.

*   [ ] `keybard-cli get keyboard-info`: Pull all available information from the connected keyboard (similar to current `dump` but perhaps with more formatting options or ability to save to a file).
*   [ ] `keybard-cli get keymap [--layer N] [--output <format>]`: View keymap, optionally for a specific layer, and specify output format (e.g., JSON, text).
*   [ ] `keybard-cli set keymap <key_definition> --position <pos> [--layer N]`: Set a specific key on the keymap.
*   [ ] `keybard-cli load keymap <filepath.json>`: Load a full keymap from a file and apply to the keyboard.
*   [ ] `keybard-cli save keymap <filepath.json>`: Save the current keyboard keymap to a file.
*   [ ] `keybard-cli list macros`: List all macros.
*   [ ] `keybard-cli get macro <id_or_name>`: View a specific macro.
*   [ ] `keybard-cli add macro "<sequence_definition>"`: Add a new macro (e.g., "CTRL+C").
*   [ ] `keybard-cli edit macro <id_or_name> "<new_sequence_definition>"`: Edit an existing macro.
*   [ ] `keybard-cli delete macro <id_or_name>`: Remove a macro.
*   [ ] `keybard-cli list tapdances`: List all tapdances.
*   [ ] `keybard-cli get tapdance <id_or_name>`: View a specific tapdance.
*   [ ] `keybard-cli add tapdance "<sequence_definition>"`: Add a new tapdance.
*   [ ] `keybard-cli edit tapdance <id_or_name> "<new_sequence_definition>"`: Edit an existing tapdance.
*   [ ] `keybard-cli delete tapdance <id_or_name>`: Remove a tapdance.
*   [ ] `keybard-cli list combos`: List all combos.
*   [ ] `keybard-cli get combo <id_or_name>`: View a specific combo.
*   [ ] `keybard-cli add combo "<key1>+<key2> <action_key>"`: Add a new combo.
*   [ ] `keybard-cli edit combo <id_or_name> "<new_key1>+<new_key2> <new_action_key>"`: Edit an existing combo.
*   [ ] `keybard-cli delete combo <id_or_name>`: Remove a combo.
*   [ ] `keybard-cli list key-overrides`: List all key overrides.
*   [ ] `keybard-cli get key-override <id_or_name>`: View a specific key override.
*   [ ] `keybard-cli add key-override "<trigger_key> <override_key>"`: Add a new key override.
*   [ ] `keybard-cli edit key-override <id_or_name> "<new_trigger_key> <new_override_key>"`: Edit an existing key override.
*   [ ] `keybard-cli delete key-override <id_or_name>`: Remove a key override.
*   [ ] `keybard-cli list qmk-settings`: List all available QMK settings and their current values.
*   [ ] `keybard-cli get qmk-setting <setting_name>`: View a specific QMK setting.
*   [ ] `keybard-cli set qmk-setting <setting_name> <value>`: Change a QMK setting.
*   [ ] `keybard-cli import file <filepath.vil | filepath.svl>`: Upload and apply a `.vil` (Vial keymap) or `.svl` (Svalboard/KeyBard keymap) file to the keyboard.
*   [ ] `keybard-cli export file <filepath.svl>`: Download the current keyboard configuration to an `.svl` file.
*   [ ] `keybard-cli set-mode <instant|queued>`: Set the change mode (instant application of changes or queued until explicit commit).
*   [ ] `keybard-cli commit-changes`: Apply all queued changes to the keyboard (if in 'queued' mode).
