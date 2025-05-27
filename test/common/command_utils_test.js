const { expect } = require('chai');
const {
    createBasicSandbox,
    createTestState,
    loadScriptInContext,
    createMockUSBNoDevices
} = require('../test-helpers');

describe('command-utils.js tests', () => {
    let sandbox;
    let mockUSB, mockVial, mockDeviceSelection;
    let testState;

    function setupTestEnvironment() {
        testState = createTestState();

        mockUSB = createMockUSBNoDevices();

        mockVial = {
            init: async () => {},
            load: async () => {}
        };

        mockDeviceSelection = {
            getAndSelectDevice: () => ({ success: false, device: null, devices: [], error: 'No devices' }),
            openDeviceConnection: async () => false
        };

        sandbox = createBasicSandbox({
            USB: mockUSB,
            Vial: mockVial,
            runInitializers: () => {},
            ...testState
        }, ['lib/common/command-utils.js']);

        // Add device selection to global after sandbox creation
        sandbox.global.deviceSelection = mockDeviceSelection;
    }

    beforeEach(() => {
        setupTestEnvironment();
    });

    describe('withDeviceConnection', () => {
        it('should successfully connect and run operation', async () => {
            // Setup successful device selection and connection
            const mockDevice = { manufacturer: 'TestManu', product: 'TestProduct' };
            let getAndSelectDeviceCalled = false;
            let openDeviceConnectionCalled = false;
            let openDeviceConnectionCalledWith = null;
            let vialInitCalled = false;
            let vialLoadCalled = false;
            let operationCalled = false;

            mockDeviceSelection.getAndSelectDevice = () => {
                getAndSelectDeviceCalled = true;
                return {
                    success: true,
                    device: mockDevice,
                    devices: [mockDevice],
                    error: null
                };
            };
            mockDeviceSelection.openDeviceConnection = async (usb, device) => {
                openDeviceConnectionCalled = true;
                openDeviceConnectionCalledWith = { usb, device };
                return true;
            };
            mockVial.init = async () => { vialInitCalled = true; };
            mockVial.load = async () => { vialLoadCalled = true; };

            const mockOperation = async () => {
                operationCalled = true;
                return { success: true, result: 'test result' };
            };

            const result = await sandbox.global.withDeviceConnection({
                USB: mockUSB,
                Vial: mockVial,
                runInitializers: () => {},
                requiredObjects: { USB: mockUSB, Vial: mockVial },
                operation: mockOperation
            });

            expect(result.success).to.be.true;
            expect(result.result.result).to.equal('test result');
            expect(getAndSelectDeviceCalled).to.be.true;
            expect(openDeviceConnectionCalled).to.be.true;
            expect(openDeviceConnectionCalledWith.usb).to.equal(mockUSB);
            expect(openDeviceConnectionCalledWith.device).to.equal(mockDevice);
            expect(vialInitCalled).to.be.true;
            expect(vialLoadCalled).to.be.true;
            expect(operationCalled).to.be.true;
        });

        it('should fail if required objects are missing', async () => {
            const result = await sandbox.global.withDeviceConnection({
                USB: null,
                Vial: mockVial,
                runInitializers: () => {},
                requiredObjects: { USB: null, Vial: mockVial },
                operation: async () => {}
            });

            expect(result.success).to.be.false;
            expect(result.error).to.include('Required objects (USB) not found in sandbox.');
        });

        it('should fail if device selection fails', async () => {
            mockDeviceSelection.getAndSelectDevice = () => ({
                success: false,
                device: null,
                devices: [],
                error: 'No compatible keyboard found.'
            });

            const result = await sandbox.global.withDeviceConnection({
                USB: mockUSB,
                Vial: mockVial,
                runInitializers: () => {},
                requiredObjects: { USB: mockUSB, Vial: mockVial },
                operation: async () => {}
            });

            expect(result.success).to.be.false;
            expect(result.error).to.equal('No compatible keyboard found.');
        });

        it('should fail if device connection fails', async () => {
            const mockDevice = { manufacturer: 'TestManu', product: 'TestProduct' };
            mockDeviceSelection.getAndSelectDevice = () => ({
                success: true,
                device: mockDevice,
                devices: [mockDevice],
                error: null
            });
            mockDeviceSelection.openDeviceConnection = async () => false;

            const result = await sandbox.global.withDeviceConnection({
                USB: mockUSB,
                Vial: mockVial,
                runInitializers: () => {},
                requiredObjects: { USB: mockUSB, Vial: mockVial },
                operation: async () => {}
            });

            expect(result.success).to.be.false;
            expect(result.error).to.equal('Could not open USB device.');
        });

        it('should skip data loading when loadData is false', async () => {
            const mockDevice = { manufacturer: 'TestManu', product: 'TestProduct' };
            let vialInitCalled = false;
            let vialLoadCalled = false;

            mockDeviceSelection.getAndSelectDevice = () => ({
                success: true,
                device: mockDevice,
                devices: [mockDevice],
                error: null
            });
            mockDeviceSelection.openDeviceConnection = async () => true;
            mockVial.init = async () => { vialInitCalled = true; };
            mockVial.load = async () => { vialLoadCalled = true; };

            const mockOperation = async () => ({ success: true });

            const result = await sandbox.global.withDeviceConnection({
                USB: mockUSB,
                Vial: mockVial,
                runInitializers: () => {},
                requiredObjects: { USB: mockUSB, Vial: mockVial },
                loadData: false,
                operation: mockOperation
            });

            expect(result.success).to.be.true;
            expect(vialInitCalled).to.be.false;
            expect(vialLoadCalled).to.be.false;
        });

        it('should handle Vial.init failure', async () => {
            const mockDevice = { manufacturer: 'TestManu', product: 'TestProduct' };
            mockDeviceSelection.getAndSelectDevice = () => ({
                success: true,
                device: mockDevice,
                devices: [mockDevice],
                error: null
            });
            mockDeviceSelection.openDeviceConnection = async () => true;
            mockVial.init = async () => { throw new Error('Vial init failed'); };

            const result = await sandbox.global.withDeviceConnection({
                USB: mockUSB,
                Vial: mockVial,
                runInitializers: () => {},
                requiredObjects: { USB: mockUSB, Vial: mockVial },
                operation: async () => {}
            });

            expect(result.success).to.be.false;
            expect(result.error).to.include('Vial init failed');
        });

        it('should handle operation failure', async () => {
            const mockDevice = { manufacturer: 'TestManu', product: 'TestProduct' };
            mockDeviceSelection.getAndSelectDevice = () => ({
                success: true,
                device: mockDevice,
                devices: [mockDevice],
                error: null
            });
            mockDeviceSelection.openDeviceConnection = async () => true;
            mockVial.init = async () => {};
            mockVial.load = async () => {};

            const mockOperation = async () => { throw new Error('Operation failed'); };

            const result = await sandbox.global.withDeviceConnection({
                USB: mockUSB,
                Vial: mockVial,
                runInitializers: () => {},
                requiredObjects: { USB: mockUSB, Vial: mockVial },
                operation: mockOperation
            });

            expect(result.success).to.be.false;
            expect(result.error).to.include('Operation failed');
        });

        it('should pass device options to device selection', async () => {
            const mockDevice = { manufacturer: 'TestManu', product: 'TestProduct' };
            let getAndSelectDeviceCalledWith = null;

            mockDeviceSelection.getAndSelectDevice = (usb, options) => {
                getAndSelectDeviceCalledWith = { usb, options };
                return {
                    success: true,
                    device: mockDevice,
                    devices: [mockDevice],
                    error: null
                };
            };
            mockDeviceSelection.openDeviceConnection = async () => true;
            mockVial.init = async () => {};
            mockVial.load = async () => {};

            const deviceOptions = { showDevices: false };
            const mockOperation = async () => ({ success: true });

            await sandbox.global.withDeviceConnection({
                USB: mockUSB,
                Vial: mockVial,
                runInitializers: () => {},
                requiredObjects: { USB: mockUSB, Vial: mockVial },
                deviceOptions,
                operation: mockOperation
            });

            expect(getAndSelectDeviceCalledWith.usb).to.equal(mockUSB);
            expect(getAndSelectDeviceCalledWith.options).to.deep.equal(deviceOptions);
        });
    });
});
