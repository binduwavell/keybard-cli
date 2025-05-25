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

        it('should format single device', () => {
            const devices = [{ manufacturer: 'TestManu', product: 'TestProduct' }];
            const result = deviceSelection.formatDeviceList(devices);
            expect(result).to.equal('Device(s):\n  - TestManu TestProduct');
        });

        it('should format multiple devices', () => {
            const devices = [
                { manufacturer: 'TestManu1', product: 'TestProduct1' },
                { manufacturer: 'TestManu2', product: 'TestProduct2' }
            ];
            const result = deviceSelection.formatDeviceList(devices);
            expect(result).to.equal('Device(s):\n  - TestManu1 TestProduct1\n  - TestManu2 TestProduct2');
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

        it('should auto-select first device when multiple available and warn', () => {
            const devices = [
                { manufacturer: 'TestManu1', product: 'TestProduct1' },
                { manufacturer: 'TestManu2', product: 'TestProduct2' }
            ];
            const result = deviceSelection.selectDevice(devices);
            expect(result).to.equal(devices[0]);
            expect(consoleWarnStub.calledWith('Multiple devices found (2 total). Auto-selecting: TestManu1 TestProduct1')).to.be.true;
            expect(consoleWarnStub.calledWith('Future versions will allow interactive device selection.')).to.be.true;
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
            expect(consoleLogStub.calledWith('Device(s):\n  - TestManu TestProduct')).to.be.true;
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

        it('should not show devices when showDevices is false', () => {
            const devices = [{ manufacturer: 'TestManu', product: 'TestProduct' }];
            mockUSB.list.returns(devices);

            const result = deviceSelection.getAndSelectDevice(mockUSB, { showDevices: false });

            expect(result.success).to.be.true;
            expect(consoleLogStub.called).to.be.false;
        });

        it('should be silent when silent option is true', () => {
            mockUSB.list.returns([]);

            const result = deviceSelection.getAndSelectDevice(mockUSB, { silent: true });

            expect(result.success).to.be.false;
            expect(consoleErrorStub.called).to.be.false;
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
