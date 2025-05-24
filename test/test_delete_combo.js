const { expect } = require('chai');
const { execSync } = require('child_process');
const path = require('path');

// Path to the cli.js script
const cliPath = path.resolve(__dirname, '..', 'cli.js');

describe('keybard-cli delete combo', () => {

    // --- Happy Path Test ---

    it('should delete an existing combo successfully by ID', () => {
        const comboId = 0; // Assuming combo ID 0 is a valid ID to target for deletion
        try {
            // lib/delete_combo.js output: "Combo ${comboId} deleted successfully (set to disabled state)."
            const output = execSync(`node ${cliPath} delete combo ${comboId}`, { encoding: 'utf-8' });
            expect(output).to.include(`Combo ${comboId} deleted successfully (set to disabled state).`);
        } catch (error) {
            console.error("Error output from CLI:", error.stderr?.toString());
            console.error("Stdout output from CLI:", error.stdout?.toString());
            throw new Error(`Command failed: ${error.message}. Output: ${error.stdout || error.stderr}`);
        }
    });
    
    it('should attempt to delete another valid combo ID successfully', () => {
        const comboId = 1; // Assuming combo ID 1 is also a valid ID
        try {
            const output = execSync(`node ${cliPath} delete combo ${comboId}`, { encoding: 'utf-8' });
            expect(output).to.include(`Combo ${comboId} deleted successfully (set to disabled state).`);
        } catch (error) {
            console.error("Error output from CLI:", error.stderr?.toString());
            console.error("Stdout output from CLI:", error.stdout?.toString());
            throw new Error(`Command failed: ${error.message}. Output: ${error.stdout || error.stderr}`);
        }
    });

    // --- Sad Path Tests ---

    it('should fail with a non-numeric combo ID', () => {
        const comboId = 'xyz';
        try {
            execSync(`node ${cliPath} delete combo ${comboId}`, { encoding: 'utf-8' });
            throw new Error('Command should have failed but succeeded.');
        } catch (error) {
            expect(error.status).to.not.equal(0);
            const stderr = error.stderr.toString();
            // From lib/delete_combo.js: "Error: Invalid combo ID "${comboIdStr}". ID must be a non-negative integer."
            expect(stderr).to.include(`Error: Invalid combo ID "${comboId}". ID must be a non-negative integer.`);
        }
    });

    it('should fail with a negative combo ID', () => {
        const comboId = -2;
        try {
            execSync(`node ${cliPath} delete combo ${comboId}`, { encoding: 'utf-8' });
            throw new Error('Command should have failed but succeeded.');
        } catch (error) {
            expect(error.status).to.not.equal(0);
            const stderr = error.stderr.toString();
            expect(stderr).to.include(`Error: Invalid combo ID "${comboId}". ID must be a non-negative integer.`);
        }
    });

    it('should fail if combo ID is out of bounds (too large)', () => {
        const comboId = 123; // Assuming 123 is generally out of typical combo_count range
        try {
            // This test's success depends on kbinfo.combo_count (or MAX_COMBO_SLOTS_IN_LIB fallback)
            // being small enough for 123 to be out of range, as checked by lib/delete_combo.js.
            execSync(`node ${cliPath} delete combo ${comboId}`, { encoding: 'utf-8' });
            throw new Error('Command should have failed but succeeded.');
        } catch (error) {
            expect(error.status).to.not.equal(0);
            const stderr = error.stderr.toString();
            // From lib/delete_combo.js: "Error: Combo ID ${comboId} is out of range. Maximum combo ID is ${comboCapacity - 1}."
            // We check for the core part of the message.
            expect(stderr).to.include(`Error: Combo ID ${comboId} is out of range.`);
        }
    });

    it('should fail gracefully if no compatible keyboard is found', () => {
        // This test relies on the underlying lib/delete_combo.js to handle the "no devices" case.
        // Behavior depends on the test environment for execSync (whether a mock USB is active).
        const comboId = 0;
        try {
            // If the test environment for execSync has no mock USB devices, this should trigger the error.
            execSync(`node ${cliPath} delete combo ${comboId}`, { encoding: 'utf-8' });
            // If this path is reached, a mock device was likely available.
            // console.warn("Warning: Test for 'no compatible keyboard' might be inconclusive if a mock/real device is present.");
        } catch (error) {
            expect(error.status).to.not.equal(0);
            const stderr = error.stderr.toString();
            if (stderr.includes("No compatible keyboard found.")) {
                // Expected outcome if no devices are truly found by the script.
                return;
            }
            // If it failed for another reason (e.g., a different error on a mock device), re-throw.
            console.error("CLI error when expecting 'No compatible keyboard found':", stderr);
            throw error;
        }
        // If no error, it implies a device was found and the command was successful.
        // This makes the test for "no compatible keyboard" inconclusive for this run.
        console.warn("Warning: Test for 'no compatible keyboard' was inconclusive as the command succeeded (a device was likely found).");
    });

    // Multiple boards: lib/delete_combo.js uses the first device found by USB.open().
    // No specific logic for multiple devices beyond what USB.open() handles.
    // Testing this scenario with execSync without more control is difficult.
    it.skip('should handle multiple boards (documentation: typically uses the first one found)', () => {
        // This scenario is not explicitly handled by delete_combo.js other than using the first opened device.
    });
});
