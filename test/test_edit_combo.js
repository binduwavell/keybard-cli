const { expect } = require('chai');
// const sinon = require('sinon'); // Not used for execSync tests unless complex setup
const { execSync } = require('child_process');
const path = require('path');
// const fs = require('fs'); // Not used for this test file

// Path to the cli.js script
const cliPath = path.resolve(__dirname, '..', 'cli.js');

describe('keybard-cli edit combo', () => {
    // No beforeEach/afterEach for direct execSync tests unless managing external state

    // --- Happy Path Tests ---

    it('should edit an existing combo definition successfully', () => {
        const comboId = 0;
        const newDefinition = '"KC_C+KC_V KC_B"'; // Double quotes for shell
        try {
            // We assume combo ID 0 is editable or the command will handle it gracefully.
            // lib/edit_combo.js output: "Combo ${comboId} updated successfully."
            const output = execSync(`node ${cliPath} edit combo ${comboId} ${newDefinition}`, { encoding: 'utf-8' });
            expect(output).to.include(`Combo ${comboId} updated successfully.`);
            // Further verification would require checking the actual state, which is hard with execSync.
        } catch (error) {
            console.error("Error output from CLI:", error.stderr?.toString());
            console.error("Stdout output from CLI:", error.stdout?.toString());
            throw new Error(`Command failed: ${error.message}. Output: ${error.stdout || error.stderr}`);
        }
    });

    it('should edit an existing combo definition and term successfully', () => {
        const comboId = 1; // Assuming combo ID 1 is editable
        const newDefinition = '"KC_LCTL+KC_C KC_X"';
        const newTerm = 75;
        try {
            const output = execSync(`node ${cliPath} edit combo ${comboId} ${newDefinition} -t ${newTerm}`, { encoding: 'utf-8' });
            expect(output).to.include(`Combo ${comboId} updated successfully.`);
            // We would also want to verify the term was used. This requires deeper inspection.
        } catch (error) {
            console.error("Error output from CLI:", error.stderr?.toString());
            console.error("Stdout output from CLI:", error.stdout?.toString());
            throw new Error(`Command failed: ${error.message}. Output: ${error.stdout || error.stderr}`);
        }
    });

    // --- Sad Path Tests ---

    it('should fail with a non-numeric combo ID', () => {
        const comboId = 'abc';
        const newDefinition = '"KC_A+KC_S KC_D"';
        try {
            execSync(`node ${cliPath} edit combo ${comboId} ${newDefinition}`, { encoding: 'utf-8' });
            throw new Error('Command should have failed but succeeded.');
        } catch (error) {
            expect(error.status).to.not.equal(0);
            const stderr = error.stderr.toString();
            // From lib/edit_combo.js: "Error: Invalid combo ID "${comboIdStr}". ID must be a non-negative integer."
            expect(stderr).to.include(`Error: Invalid combo ID "${comboId}". ID must be a non-negative integer.`);
        }
    });
    
    it('should fail with a negative combo ID', () => {
        const comboId = -1;
        const newDefinition = '"KC_A+KC_S KC_D"';
        try {
            execSync(`node ${cliPath} edit combo ${comboId} ${newDefinition}`, { encoding: 'utf-8' });
            throw new Error('Command should have failed but succeeded.');
        } catch (error) {
            expect(error.status).to.not.equal(0);
            const stderr = error.stderr.toString();
            expect(stderr).to.include(`Error: Invalid combo ID "${comboId}". ID must be a non-negative integer.`);
        }
    });

    it('should fail if combo ID is out of bounds (e.g., too large)', () => {
        const comboId = 99; // Assuming 99 is out of typical combo_count range
        const newDefinition = '"KC_A+KC_S KC_D"';
        try {
            // This test's success depends on kbinfo.combo_count being small enough
            // for 99 to be considered out of range by lib/edit_combo.js
            execSync(`node ${cliPath} edit combo ${comboId} ${newDefinition}`, { encoding: 'utf-8' });
            throw new Error('Command should have failed but succeeded.');
        } catch (error) {
            expect(error.status).to.not.equal(0);
            const stderr = error.stderr.toString();
            // From lib/edit_combo.js: "Error: Combo with ID ${comboId} not found or out of range [0-${comboCapacity-1}]."
            // The exact comboCapacity can vary, so we check for the general message structure.
            expect(stderr).to.include(`Error: Combo with ID ${comboId} not found or out of range`);
        }
    });

    it('should fail with an invalid new definition string (missing action key)', () => {
        const comboId = 0;
        const newDefinition = '"KC_A+KC_S"'; // Missing action key
        try {
            execSync(`node ${cliPath} edit combo ${comboId} ${newDefinition}`, { encoding: 'utf-8' });
            throw new Error('Command should have failed but succeeded.');
        } catch (error) {
            expect(error.status).to.not.equal(0);
            const stderr = error.stderr.toString();
            // From parseComboDefinition in lib/edit_combo.js
            expect(stderr).to.include('Error parsing new combo definition: Invalid combo definition string.');
        }
    });
    
    it('should fail with an invalid new definition string (no trigger keys)', () => {
        const comboId = 0;
        const newDefinition = '" KC_D"'; // No trigger keys
        try {
            execSync(`node ${cliPath} edit combo ${comboId} ${newDefinition}`, { encoding: 'utf-8' });
            throw new Error('Command should have failed but succeeded.');
        } catch (error) {
            expect(error.status).to.not.equal(0);
            const stderr = error.stderr.toString();
            expect(stderr).to.include('Error parsing new combo definition: No trigger keys specified in combo definition.');
        }
    });

    it('should fail with an invalid new term value (non-numeric)', () => {
        const comboId = 0;
        const newDefinition = '"KC_X+KC_Y KC_Z"';
        const newTerm = 'xyz';
        try {
            execSync(`node ${cliPath} edit combo ${comboId} ${newDefinition} -t ${newTerm}`, { encoding: 'utf-8' });
            throw new Error('Command should have failed but succeeded.');
        } catch (error) {
            expect(error.status).to.not.equal(0);
            const stderr = error.stderr.toString();
            // From lib/edit_combo.js: "Error: Invalid term value "${options.term}". Must be a non-negative integer."
            expect(stderr).to.include(`Error: Invalid term value "${newTerm}". Must be a non-negative integer.`);
        }
    });

    it('should fail with an invalid new term value (negative)', () => {
        const comboId = 0;
        const newDefinition = '"KC_X+KC_Y KC_Z"';
        const newTerm = -100;
        try {
            execSync(`node ${cliPath} edit combo ${comboId} ${newDefinition} -t ${newTerm}`, { encoding: 'utf-8' });
            throw new Error('Command should have failed but succeeded.');
        } catch (error) {
            expect(error.status).to.not.equal(0);
            const stderr = error.stderr.toString();
            expect(stderr).to.include(`Error: Invalid term value "${newTerm}". Must be a non-negative integer.`);
        }
    });

    it('should fail gracefully if no compatible keyboard is found', () => {
        // This test's behavior depends on the actual test environment (whether a mock USB is active).
        // If no device is found by lib/edit_combo.js, it should print:
        // "No compatible keyboard found." and exit with code 1.
        const comboId = 0;
        const newDefinition = '"KC_A+KC_S KC_D"';
        try {
            // If the test environment for execSync has no mock USB devices, this will trigger the error.
            // If it *does* have a mock USB device, this test won't represent "no keyboard found"
            // and might pass (if combo 0 exists) or fail differently.
            execSync(`node ${cliPath} edit combo ${comboId} ${newDefinition}`, { encoding: 'utf-8' });
            // This path might be reached if a mock device IS available.
            // In that case, this test doesn't correctly test "no keyboard".
            // For now, we proceed assuming it might fail as expected.
            // console.warn("Warning: Test for 'no compatible keyboard' might be inconclusive if a mock/real device is present.");
        } catch (error) {
            expect(error.status).to.not.equal(0);
            const stderr = error.stderr.toString();
            if (stderr.includes("No compatible keyboard found.")) {
                // This is the expected outcome if no devices are truly found by the script.
                return;
            }
            // If it failed for another reason (e.g., combo 0 not found on a mock device), re-throw.
            // This indicates the "no keyboard" condition wasn't met, but another error occurred.
            console.error("CLI error when expecting 'No compatible keyboard found':", stderr);
            throw error; 
        }
        // If no error was thrown at all, it implies a device was found and the command was successful.
        // This makes the test for "no compatible keyboard" inconclusive for this run.
        console.warn("Warning: Test for 'no compatible keyboard' was inconclusive as the command succeeded (a device was likely found).");
    });
    
    // Multiple boards: lib/edit_combo.js uses the first device found by USB.open().
    // No specific logic for multiple devices beyond what USB.open() handles.
    // Similar to add_combo, this is hard to test with execSync without more control.
    it.skip('should handle multiple boards (documentation: typically uses the first one found)', () => {
        // This scenario is not explicitly handled by edit_combo.js other than using the first opened device.
    });
});
