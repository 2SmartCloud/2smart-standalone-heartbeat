/* eslint-disable no-require-lodash/no-require-lodash,func-style */
const MQTTTransport = require('homie-sdk/lib/Broker/mqtt');
const Homie = require('homie-sdk/lib/homie/Homie');
const HomieServer = require('homie-sdk/lib/homie/HomieServer');

class Heartbeat {
    constructor({ env, debug }) {
        // handlers~
        this.handleOnline = this.handleOnline.bind(this);
        this.handleOffline = this.handleOffline.bind(this);
        this.handleNewDeviceAdded = this.handleNewDeviceAdded.bind(this);

        this.handleDelete = this.handleDelete.bind(this);
        // ~handlers

        this.debug = debug;

        const transport = new MQTTTransport({
            uri      : env.MQTT_URI || 'mqtt://localhost:1883',
            username : env.MQTT_USER || '',
            password : env.MQTT_PASS || ''
        });

        this.homie = new Homie({ transport });
        this.homieServer = new HomieServer({ homie: this.homie });

        this.homie.on('error', (e) => {
            debug.error(e);
        });
        this.heartbeatAttribute = this.homie.heartbeatAttribute;

        this.deviceHearbeats = {};

        this.timeout = +env.HEARTBEAT_TIMEOUT || 30000;
        this.pingInterval = Math.round(this.timeout / 3);
    }
    startDeviceHeartbeat(id) {
        if (this.deviceHearbeats[id]) {
            this.deviceHearbeats[id].doHearbeatRevision();

            return;
        }
        this.debug.info(`startDeviceHeartbeat ${id}`);
        let device;

        try {
            device = this.homieServer.getDeviceById(id);
        } catch (e) {
            this.debug.error(e);

            return;
        }
        const deviceHearbeat = this.deviceHearbeats[id] = {};
        const publishEventName = device._getPublishEventName();
        const publishHeartbeatEventName = device._getPublishHeartbeatEventName();

        const handlePublish = (data) => {
            const key = Object.keys(data)[0];

            this.debug.info(`startDeviceHeartbeat ${id} handlePublish 1, ${JSON.stringify(data)}`);
            this.debug.info(`startDeviceHeartbeat ${id} handlePublish 2, ${Object.keys(data)[0]}=${data[key]}`);

            if (key === 'state') {
                doHearbeatRevision(data[key]);
            }
        };

        let started = false;
        let timeout;
        const resetTimeout = () => {
            clearTimeout(timeout);
            if (!started ||  (lastState !== 'ready' && lastState !== 'init')) return;
            timeout = setTimeout(() => {
                this.debug.info(`startDeviceHeartbeat ${id} timeout`);
                this.homie.publishToBroker(`${this.homie.deviceTopic}/${id}/$state`, 'disconnected');
            }, this.timeout);
        };
        let pingInterval;
        const ping = () => {
            this.debug.info(`startDeviceHeartbeat ${id} ping`);
            this.homie.publishToBroker(`${this.homie.deviceTopic}/${id}/${this.heartbeatAttribute}/set`, '', { retain: false });
        };
        const start = () => {
            if (started) return;
            started = true;
            this.debug.info(`startDeviceHeartbeat ${id} start`);
            ping();
            pingInterval = setInterval(ping, this.pingInterval);
            resetTimeout();
        };
        const stop = () => {
            if (!started) return;
            started = false;
            this.debug.info(`startDeviceHeartbeat ${id} stop`);
            clearInterval(pingInterval);
            clearTimeout(timeout);
        };
        let lastState = device.getState();
        const doHearbeatRevision = (state) => {
            lastState = state;
            // eslint-disable-next-line no-param-reassign
            if (this.homie.online && (state === 'ready' || state === 'init' || state === 'disconnected')) {
                if (started) resetTimeout();
                else start();
            } else stop();
        };
        const handleHeartbeat = () => {
            this.debug.info(`startDeviceHeartbeat ${id} handleHeartbeat`);
            resetTimeout();
            this.homie.publishToBroker(`${this.homie.deviceSettingsTopic}/${id}/$last-heartbeat-at`, `${Date.now()}`);
            if (lastState === 'disconnected') this.homie.publishToBroker(`${this.homie.deviceTopic}/${id}/$state`, 'ready');
        };

        deviceHearbeat.remove = () => {
            this.debug.info(`startDeviceHeartbeat ${id} remove`);
            stop();
            this.homie.off(publishEventName, handlePublish);
            this.homie.off(publishHeartbeatEventName, handleHeartbeat);
            delete this.deviceHearbeats[id];
        };
        deviceHearbeat.doHearbeatRevision = () => {
            doHearbeatRevision(device.getState());
        };
        this.homie.on(publishEventName, handlePublish);
        this.homie.on(publishHeartbeatEventName, handleHeartbeat);
        deviceHearbeat.doHearbeatRevision();
    }

    async init() {
        this.homie.on('online', this.handleOnline);
        this.homie.on('offline', this.handleOffline);
        this.homie.on('new_device', this.handleNewDeviceAdded);
        this.homie.on('events.delete.success', this.handleDelete);
        await this.homieServer.initWorld();
    }

    // handlers~
    async handleOnline() {
        this.debug.info('handleOnline');
        for (const id of Object.keys(this.homie.getDevices())) this.startDeviceHeartbeat(id);
    }
    async handleOffline() {
        this.debug.info('handleOffline');
        for (const id of Object.keys(this.deviceHearbeats)) this.deviceHearbeats[id].doHearbeatRevision();
    }
    async handleNewDeviceAdded({ deviceId }) {
        this.debug.info(`handleNewDeviceAdded ${deviceId}`);
        this.startDeviceHeartbeat(deviceId);
    }
    async handleDelete({ type, deviceId }) {
        if (type === 'DEVICE' && this.deviceHearbeats[deviceId]) {
            this.debug.info(`handleDelete ${deviceId}`);
            this.deviceHearbeats[deviceId].remove();
        }
    }
    // ~handlers
}

module.exports = Heartbeat;
