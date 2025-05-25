const { expect } = require('chai');
const sinon = require('sinon');
const vm = require('vm');
const fs = require('fs');
const path = require('path');

// Helper to load script into a new context
function loadScriptInContext(scriptPath, context) {
    const absoluteScriptPath = path.resolve(__dirname, '..', scriptPath);
    const scriptCode = fs.readFileSync(absoluteScriptPath, 'utf8');
    vm.runInContext(scriptCode, context);
}

describe('command-utils.js tests', () => {
    let sandbox;
    let mockUSB, mockVial, mockDeviceSelection;
    let consoleLogOutput, consoleErrorOutput;

    function setupTestEnvironment() {
        mockUSB = {
            list: sinon.stub(),
            open: sinon.stub(),
            close: sinon.stub(),
            device: null
        };

        mockVial = {
            init: sinon.stub(),
            load: sinon.stub()
        };

        mockDeviceSelection = {
            getAndSelectDevice: sinon.stub(),
            openDeviceConnection: sinon.stub()
        };

        consoleLogOutput = [];
        consoleErrorOutput = [];

        sandbox = vm.createContext({
            USB: mockUSB,
            Vial: mockVial,
            runInitializers: sinon.stub(),
            console: {
                log: (...args) => consoleLogOutput.push(args.join(' ')),
                error: (...args) => consoleErrorOutput.push(args.join(' ')),
            },
            global: {
                deviceSelection: mockDeviceSelection
            },
            debug: () => () => {}
        });

        // Load command utils only (we're mocking device selection)
        loadScriptInContext('lib/common/command-utils.js', sandbox);
    }

    beforeEach(() => {
        setupTestEnvironment();
    });

    describe('withDeviceConnection', () => {
        it('should successfully connect and run operation', async () => {
            // Setup successful device selection and connection
            const mockDevice = { manufacturer: 'TestManu', product: 'TestProduct' };
            mockDeviceSelection.getAndSelectDevice.returns({
                success: true,
                device: mockDevice,
                devices: [mockDevice],
                error: null
            });
            mockDeviceSelection.openDeviceConnection.resolves(true);
            mockVial.init.resolves();
            mockVial.load.resolves();

            const mockOperation = sinon.stub().resolves({ success: true, result: 'test result' });

            const result = await sandbox.global.withDeviceConnection({
                USB: mockUSB,
                Vial: mockVial,
                runInitializers: sandbox.runInitializers,
                requiredObjects: { USB: mockUSB, Vial: mockVial },
                operation: mockOperation
            });

            expect(result.success).to.be.true;
            expect(result.result.result).to.equal('test result');
            expect(mockDeviceSelection.getAndSelectDevice.called).to.be.true;
            expect(mockDeviceSelection.openDeviceConnection.calledWith(mockUSB, mockDevice)).to.be.true;
            expect(mockVial.init.called).to.be.true;
            expect(mockVial.load.called).to.be.true;
            expect(mockOperation.called).to.be.true;
        });

        it('should fail if required objects are missing', async () => {
            const result = await sandbox.global.withDeviceConnection({
                USB: null,
                Vial: mockVial,
                runInitializers: sandbox.runInitializers,
                requiredObjects: { USB: null, Vial: mockVial },
                operation: sinon.stub()
            });

            expect(result.success).to.be.false;
            expect(result.error).to.include('Required objects (USB) not found in sandbox.');
        });

        it('should fail if device selection fails', async () => {
            mockDeviceSelection.getAndSelectDevice.returns({
                success: false,
                device: null,
                devices: [],
                error: 'No compatible keyboard found.'
            });

            const result = await sandbox.global.withDeviceConnection({
                USB: mockUSB,
                Vial: mockVial,
                runInitializers: sandbox.runInitializers,
                requiredObjects: { USB: mockUSB, Vial: mockVial },
                operation: sinon.stub()
            });

            expect(result.success).to.be.false;
            expect(result.error).to.equal('No compatible keyboard found.');
        });

        it('should fail if device connection fails', async () => {
            const mockDevice = { manufacturer: 'TestManu', product: 'TestProduct' };
            mockDeviceSelection.getAndSelectDevice.returns({
                success: true,
                device: mockDevice,
                devices: [mockDevice],
                error: null
            });
            mockDeviceSelection.openDeviceConnection.resolves(false);

            const result = await sandbox.global.withDeviceConnection({
                USB: mockUSB,
                Vial: mockVial,
                runInitializers: sandbox.runInitializers,
                requiredObjects: { USB: mockUSB, Vial: mockVial },
                operation: sinon.stub()
            });

            expect(result.success).to.be.false;
            expect(result.error).to.equal('Could not open USB device.');
        });

        it('should skip data loading when loadData is false', async () => {
            const mockDevice = { manufacturer: 'TestManu', product: 'TestProduct' };
            mockDeviceSelection.getAndSelectDevice.returns({
                success: true,
                device: mockDevice,
                devices: [mockDevice],
                error: null
            });
            mockDeviceSelection.openDeviceConnection.resolves(true);

            const mockOperation = sinon.stub().resolves({ success: true });

            const result = await sandbox.global.withDeviceConnection({
                USB: mockUSB,
                Vial: mockVial,
                runInitializers: sandbox.runInitializers,
                requiredObjects: { USB: mockUSB, Vial: mockVial },
                loadData: false,
                operation: mockOperation
            });

            expect(result.success).to.be.true;
            expect(mockVial.init.called).to.be.false;
            expect(mockVial.load.called).to.be.false;
        });

        it('should handle Vial.init failure', async () => {
            const mockDevice = { manufacturer: 'TestManu', product: 'TestProduct' };
            mockDeviceSelection.getAndSelectDevice.returns({
                success: true,
                device: mockDevice,
                devices: [mockDevice],
                error: null
            });
            mockDeviceSelection.openDeviceConnection.resolves(true);
            mockVial.init.rejects(new Error('Vial init failed'));

            const result = await sandbox.global.withDeviceConnection({
                USB: mockUSB,
                Vial: mockVial,
                runInitializers: sandbox.runInitializers,
                requiredObjects: { USB: mockUSB, Vial: mockVial },
                operation: sinon.stub()
            });

            expect(result.success).to.be.false;
            expect(result.error).to.include('Vial init failed');
        });

        it('should handle operation failure', async () => {
            const mockDevice = { manufacturer: 'TestManu', product: 'TestProduct' };
            mockDeviceSelection.getAndSelectDevice.returns({
                success: true,
                device: mockDevice,
                devices: [mockDevice],
                error: null
            });
            mockDeviceSelection.openDeviceConnection.resolves(true);
            mockVial.init.resolves();
            mockVial.load.resolves();

            const mockOperation = sinon.stub().rejects(new Error('Operation failed'));

            const result = await sandbox.global.withDeviceConnection({
                USB: mockUSB,
                Vial: mockVial,
                runInitializers: sandbox.runInitializers,
                requiredObjects: { USB: mockUSB, Vial: mockVial },
                operation: mockOperation
            });

            expect(result.success).to.be.false;
            expect(result.error).to.include('Operation failed');
        });

        it('should pass device options to device selection', async () => {
            const mockDevice = { manufacturer: 'TestManu', product: 'TestProduct' };
            mockDeviceSelection.getAndSelectDevice.returns({
                success: true,
                device: mockDevice,
                devices: [mockDevice],
                error: null
            });
            mockDeviceSelection.openDeviceConnection.resolves(true);
            mockVial.init.resolves();
            mockVial.load.resolves();

            const deviceOptions = { showDevices: false };
            const mockOperation = sinon.stub().resolves({ success: true });

            await sandbox.global.withDeviceConnection({
                USB: mockUSB,
                Vial: mockVial,
                runInitializers: sandbox.runInitializers,
                requiredObjects: { USB: mockUSB, Vial: mockVial },
                deviceOptions,
                operation: mockOperation
            });

            expect(mockDeviceSelection.getAndSelectDevice.calledWith(mockUSB, deviceOptions)).to.be.true;
        });
    });
});
