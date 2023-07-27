const { MQTT_URI, MQTT_USER, MQTT_PASS } = process.env;
const Debugger = require('homie-sdk/lib/utils/debugger');
const Heartbeat = require('./lib/Heartbeat');

const debug = new Debugger(process.env.DEBUG || '*');

debug.initEvents();

const heartbeat = new Heartbeat({ env: { MQTT_URI, MQTT_USER, MQTT_PASS }, debug });

heartbeat.init();
