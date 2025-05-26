const { expect } = require('chai');
const sinon = require('sinon');

// Mock debug function for testing
global.debug = () => () => {};

const deviceSelection = require('../lib/common/device-selection');

describe('device-selection.js tests', () => {
    let consoleLogStub, consoleWarnStub, consoleErrorStub;

    beforeEach(() => {
        consoleLogStub = sinon.stub(console, 'log');
        consoleWarnStub = sinon.stub(console, 'warn');
        consoleErrorStub = sinon.stub(console, 'error');
    });

    afterEach(() => {
        consoleLogStub.restore();
        consoleWarnStub.restore();
        consoleErrorStub.restore();
    });

    describe('formatDeviceList', () => {
        it('should format empty device list', () => {
            const result = deviceSelection.formatDeviceList([]);
            expect(result).to.equal('No compatible keyboards found.');
        });

        it('should format single device with default options', () => {
            const devices = [{
                manufacturer: 'TestManu',
                product: 'TestProduct',
                path: '/dev/hidraw0',
                serialNumber: 'test:serial'
            }];
            const result = deviceSelection.formatDeviceList(devices);
            expect(result).to.equal('Found 1 compatible device:\n  [0] TestManu TestProduct (path: /dev/hidraw0, serial: test:serial)');
        });

        it('should format multiple devices with indices', () => {
            const devices = [
                { manufacturer: 'TestManu1', product: 'TestProduct1', path: '/dev/hidraw0' },
                { manufacturer: 'TestManu2', product: 'TestProduct2', path: '/dev/hidraw1' }
            ];
            const result = deviceSelection.formatDeviceList(devices);
            expect(result).to.equal('Found 2 compatible devices:\n  [0] TestManu1 TestProduct1 (path: /dev/hidraw0)\n  [1] TestManu2 TestProduct2 (path: /dev/hidraw1)');
        });

        it('should handle missing manufacturer/product gracefully', () => {
            const devices = [{ path: '/dev/hidraw0' }];
            const result = deviceSelection.formatDeviceList(devices);
            expect(result).to.equal('Found 1 compatible device:\n  [0] Unknown Unknown (path: /dev/hidraw0)');
        });

        it('should respect showIndices option', () => {
            const devices = [{ manufacturer: 'TestManu', product: 'TestProduct' }];
            const result = deviceSelection.formatDeviceList(devices, { showIndices: false });
            expect(result).to.equal('Found 1 compatible device:\n  TestManu TestProduct');
        });

        it('should respect showPaths option', () => {
            const devices = [{ manufacturer: 'TestManu', product: 'TestProduct', path: '/dev/hidraw0' }];
            const result = deviceSelection.formatDeviceList(devices, { showPaths: false });
            expect(result).to.equal('Found 1 compatible device:\n  [0] TestManu TestProduct');
        });

        it('should respect showSerial option', () => {
            const devices = [{ manufacturer: 'TestManu', product: 'TestProduct', serialNumber: 'test:serial' }];
            const result = deviceSelection.formatDeviceList(devices, { showSerial: false });
            expect(result).to.equal('Found 1 compatible device:\n  [0] TestManu TestProduct');
        });
    });

    describe('formatSelectionInstructions', () => {
        it('should return empty string for single device', () => {
            const devices = [{ manufacturer: 'TestManu', product: 'TestProduct' }];
            const result = deviceSelection.formatSelectionInstructions(devices);
            expect(result).to.equal('');
        });

        it('should return empty string for no devices', () => {
            const devices = [];
            const result = deviceSelection.formatSelectionInstructions(devices);
            expect(result).to.equal('');
        });

        it('should return basic instructions for multiple devices without duplicates', () => {
            const devices = [
                { manufacturer: 'TestManu1', product: 'TestProduct1' },
                { manufacturer: 'TestManu2', product: 'TestProduct2' }
            ];
            const result = deviceSelection.formatSelectionInstructions(devices);
            const expected = '\nTo select a specific device, use one of these options:\n' +
                           '  --device <index>     Select by index (e.g., --device 0)\n' +
                           '  --device <path>      Select by device path (e.g., --device /dev/hidraw6)\n' +
                           '  --device "<name>"    Select by manufacturer and product name\n';
            expect(result).to.equal(expected);
        });

        it('should include duplicate name instructions when devices have same name', () => {
            const devices = [
                { manufacturer: 'TestManu', product: 'TestProduct' },
                { manufacturer: 'TestManu', product: 'TestProduct' }
            ];
            const result = deviceSelection.formatSelectionInstructions(devices);
            const expected = '\nTo select a specific device, use one of these options:\n' +
                           '  --device <index>     Select by index (e.g., --device 0)\n' +
                           '  --device <path>      Select by device path (e.g., --device /dev/hidraw6)\n' +
                           '  --device "<name>"    Select by manufacturer and product name\n' +
                           '  --device "<name>:<index>" Select by name with index for duplicates\n';
            expect(result).to.equal(expected);
        });
    });

    describe('parseDeviceSelector', () => {
        it('should parse selector without colon', () => {
            const result = deviceSelection.parseDeviceSelector('TestDevice');
            expect(result).to.deep.equal({ name: 'TestDevice', index: null });
        });

        it('should parse selector with valid index', () => {
            const result = deviceSelection.parseDeviceSelector('TestDevice:1');
            expect(result).to.deep.equal({ name: 'TestDevice', index: 1 });
        });

        it('should treat invalid index as part of name', () => {
            const result = deviceSelection.parseDeviceSelector('TestDevice:invalid');
            expect(result).to.deep.equal({ name: 'TestDevice:invalid', index: null });
        });

        it('should treat negative index as part of name', () => {
            const result = deviceSelection.parseDeviceSelector('TestDevice:-1');
            expect(result).to.deep.equal({ name: 'TestDevice:-1', index: null });
        });

        it('should handle multiple colons correctly', () => {
            const result = deviceSelection.parseDeviceSelector('Test:Device:1');
            expect(result).to.deep.equal({ name: 'Test:Device', index: 1 });
        });
    });

    describe('findDeviceBySelector', () => {
        const devices = [
            { manufacturer: 'TestManu1', product: 'TestProduct1', path: '/dev/hidraw0' },
            { manufacturer: 'TestManu2', product: 'TestProduct2', path: '/dev/hidraw1' },
            { manufacturer: 'TestManu1', product: 'TestProduct1', path: '/dev/hidraw2' }
        ];

        it('should return null for empty selector', () => {
            const result = deviceSelection.findDeviceBySelector(devices, '');
            expect(result).to.be.null;
        });

        it('should return null for null selector', () => {
            const result = deviceSelection.findDeviceBySelector(devices, null);
            expect(result).to.be.null;
        });

        it('should find device by valid index', () => {
            const result = deviceSelection.findDeviceBySelector(devices, '1');
            expect(result).to.equal(devices[1]);
        });

        it('should return null for out-of-range index', () => {
            const result = deviceSelection.findDeviceBySelector(devices, '5');
            expect(result).to.be.null;
        });

        it('should find device by path', () => {
            const result = deviceSelection.findDeviceBySelector(devices, '/dev/hidraw1');
            expect(result).to.equal(devices[1]);
        });

        it('should find device by exact name match (single match)', () => {
            const result = deviceSelection.findDeviceBySelector(devices, 'TestManu2 TestProduct2');
            expect(result).to.equal(devices[1]);
        });

        it('should return null for name with multiple matches but no index', () => {
            const result = deviceSelection.findDeviceBySelector(devices, 'TestManu1 TestProduct1');
            expect(result).to.be.null;
        });

        it('should find device by name with index for duplicates', () => {
            const result = deviceSelection.findDeviceBySelector(devices, 'TestManu1 TestProduct1:1');
            expect(result).to.equal(devices[2]);
        });

        it('should return null for name with out-of-range index', () => {
            const result = deviceSelection.findDeviceBySelector(devices, 'TestManu1 TestProduct1:5');
            expect(result).to.be.null;
        });

        it('should return null for non-existent name', () => {
            const result = deviceSelection.findDeviceBySelector(devices, 'NonExistent Device');
            expect(result).to.be.null;
        });
    });

    describe('selectDevice', () => {
        it('should return null for empty device list', () => {
            const result = deviceSelection.selectDevice([]);
            expect(result).to.be.null;
        });

        it('should auto-select single device', () => {
            const devices = [{ manufacturer: 'TestManu', product: 'TestProduct' }];
            const result = deviceSelection.selectDevice(devices);
            expect(result).to.equal(devices[0]);
        });

        it('should return null for multiple devices without selector', () => {
            const devices = [
                { manufacturer: 'TestManu1', product: 'TestProduct1' },
                { manufacturer: 'TestManu2', product: 'TestProduct2' }
            ];
            const result = deviceSelection.selectDevice(devices);
            expect(result).to.be.null;
        });

        it('should select device by selector', () => {
            const devices = [
                { manufacturer: 'TestManu1', product: 'TestProduct1' },
                { manufacturer: 'TestManu2', product: 'TestProduct2' }
            ];
            const result = deviceSelection.selectDevice(devices, { deviceSelector: '1' });
            expect(result).to.equal(devices[1]);
        });

        it('should return null for invalid selector', () => {
            const devices = [
                { manufacturer: 'TestManu1', product: 'TestProduct1' },
                { manufacturer: 'TestManu2', product: 'TestProduct2' }
            ];
            const result = deviceSelection.selectDevice(devices, { deviceSelector: 'NonExistent' });
            expect(result).to.be.null;
        });
    });

    describe('getAndSelectDevice', () => {
        let mockUSB;

        beforeEach(() => {
            mockUSB = {
                list: sinon.stub()
            };
        });

        it('should return success with single device', () => {
            const devices = [{ manufacturer: 'TestManu', product: 'TestProduct' }];
            mockUSB.list.returns(devices);

            const result = deviceSelection.getAndSelectDevice(mockUSB);

            expect(result.success).to.be.true;
            expect(result.device).to.equal(devices[0]);
            expect(result.devices).to.equal(devices);
            expect(result.error).to.be.null;
            expect(consoleLogStub.calledWith('Found 1 compatible device:\n  [0] TestManu TestProduct')).to.be.true;
        });

        it('should return failure with no devices', () => {
            mockUSB.list.returns([]);

            const result = deviceSelection.getAndSelectDevice(mockUSB);

            expect(result.success).to.be.false;
            expect(result.device).to.be.null;
            expect(result.devices).to.deep.equal([]);
            expect(result.error).to.equal('No compatible keyboard found.');
            expect(consoleErrorStub.calledWith('No compatible keyboard found.')).to.be.true;
        });

        it('should return failure with multiple devices but no selector', () => {
            const devices = [
                { manufacturer: 'TestManu1', product: 'TestProduct1' },
                { manufacturer: 'TestManu2', product: 'TestProduct2' }
            ];
            mockUSB.list.returns(devices);

            const result = deviceSelection.getAndSelectDevice(mockUSB);

            expect(result.success).to.be.false;
            expect(result.device).to.be.null;
            expect(result.devices).to.equal(devices);
            expect(result.error).to.equal('Multiple devices found (2 total). Please specify which device to use.');
            expect(consoleErrorStub.calledWith('Multiple devices found (2 total). Please specify which device to use.')).to.be.true;
        });

        it('should return success with device selector', () => {
            const devices = [
                { manufacturer: 'TestManu1', product: 'TestProduct1' },
                { manufacturer: 'TestManu2', product: 'TestProduct2' }
            ];
            mockUSB.list.returns(devices);

            const result = deviceSelection.getAndSelectDevice(mockUSB, { deviceSelector: '1' });

            expect(result.success).to.be.true;
            expect(result.device).to.equal(devices[1]);
            expect(result.devices).to.equal(devices);
            expect(result.error).to.be.null;
            expect(consoleLogStub.calledWith('Selected device: TestManu2 TestProduct2')).to.be.true;
        });

        it('should return failure with invalid device selector', () => {
            const devices = [
                { manufacturer: 'TestManu1', product: 'TestProduct1' },
                { manufacturer: 'TestManu2', product: 'TestProduct2' }
            ];
            mockUSB.list.returns(devices);

            const result = deviceSelection.getAndSelectDevice(mockUSB, { deviceSelector: 'NonExistent' });

            expect(result.success).to.be.false;
            expect(result.device).to.be.null;
            expect(result.devices).to.equal(devices);
            expect(result.error).to.equal('Device not found: "NonExistent". Use \'keyboard devices\' to see available devices.');
            expect(consoleErrorStub.calledWith('Device not found: "NonExistent". Use \'keyboard devices\' to see available devices.')).to.be.true;
        });

        it('should not show devices when showDevices is false', () => {
            const devices = [{ manufacturer: 'TestManu', product: 'TestProduct' }];
            mockUSB.list.returns(devices);

            const result = deviceSelection.getAndSelectDevice(mockUSB, { showDevices: false });

            expect(result.success).to.be.true;
            expect(consoleLogStub.called).to.be.false;
        });

        it('should show devices when multiple devices and no selector', () => {
            const devices = [
                { manufacturer: 'TestManu1', product: 'TestProduct1' },
                { manufacturer: 'TestManu2', product: 'TestProduct2' }
            ];
            mockUSB.list.returns(devices);

            const result = deviceSelection.getAndSelectDevice(mockUSB, { showDevices: false });

            expect(result.success).to.be.false;
            // Should still show devices because multiple devices require selection
            expect(consoleLogStub.called).to.be.true;
        });

        it('should be silent when silent option is true', () => {
            mockUSB.list.returns([]);

            const result = deviceSelection.getAndSelectDevice(mockUSB, { silent: true });

            expect(result.success).to.be.false;
            // Critical errors like "no devices found" are always printed even in silent mode
            expect(consoleErrorStub.called).to.be.true;
            expect(consoleErrorStub.calledWith('No compatible keyboard found.')).to.be.true;
            expect(consoleLogStub.called).to.be.false;
        });

        it('should handle USB.list() throwing error', () => {
            mockUSB.list.throws(new Error('USB error'));

            const result = deviceSelection.getAndSelectDevice(mockUSB);

            expect(result.success).to.be.false;
            expect(result.error).to.include('Device selection failed: USB error');
            expect(consoleErrorStub.called).to.be.true;
        });
    });

    describe('openDeviceConnection', () => {
        let mockUSB, mockDevice;

        beforeEach(() => {
            mockUSB = {
                open: sinon.stub()
            };
            mockDevice = { manufacturer: 'TestManu', product: 'TestProduct' };
        });

        it('should successfully open device connection', async () => {
            mockUSB.open.resolves(true);

            const result = await deviceSelection.openDeviceConnection(mockUSB, mockDevice);

            expect(result).to.be.true;
            expect(mockUSB.open.calledWith([mockDevice])).to.be.true;
        });

        it('should return false when USB.open fails', async () => {
            mockUSB.open.resolves(false);

            const result = await deviceSelection.openDeviceConnection(mockUSB, mockDevice);

            expect(result).to.be.false;
        });

        it('should handle USB.open throwing error', async () => {
            mockUSB.open.throws(new Error('Connection error'));

            const result = await deviceSelection.openDeviceConnection(mockUSB, mockDevice);

            expect(result).to.be.false;
        });
    });
});
