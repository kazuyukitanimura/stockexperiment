var moment = require('./momenttz');
var Addon = require('./build/Release/addon');
var IbClient = Addon.IbClient;
var log = console.log;


/**
 * argument parsing
 */
var clientId = (process.argv[2] === undefined) ? 1 : parseInt(process.argv[5], 10);

var hourOffset = moment.tz(moment.TIMEZONE).utcOffset() / 60;

var companies = [];

var handleValidOrderId = function(oId) {};

var handleServerError = function(id, errorCode, errorString) {
  if (errorCode === 2109) { // ignore
    return;
  }
  log(Date(), '[ServerError]', id, errorCode, errorString);
  if (errorCode === 1100 || errorCode === 1101 || errorCode === 1300 || errorCode === 509) {
    process.exit(1);
  }
};

var handleConnectionClosed = function() {
  log(Date(), '[ConnectionClosed]');
  process.exit(1);
};

var handleRealTimeBar = function() {};

var handleTickPrice = function(tickerId, field, price, canAutoExecute) {};

var handleOrderStatus = function(oId, orderStatus, filled, avgFillPrice, permId, parentId, lastFillPrice, clientId, whyHeld) {};

var handleOpenOrder = function(oId, symbol, expiry, action, totalQuantity, orderType, lmtPrice, orderStatus) {};

var ibClient = new IbClient(companies, hourOffset, handleOrderStatus, handleValidOrderId, handleServerError, handleTickPrice, handleOpenOrder, handleRealTimeBar, handleConnectionClosed);

// Connect to the TWS client or IB Gateway
var connected = ibClient.connect('127.0.0.1', 7496, clientId);

// Once connected, start processing incoming and outgoing messages
if (connected) {
  var processMessage = function() {
    ibClient.processMessages();
    //setImmediate(processMessage); // faster but 100% cpu
    setTimeout(processMessage, 0); // slower but less cpu intensive
  };
  setImmediate(processMessage);
  setTimeout(process.exit, 20 * 1000);
} else {
  throw new Error('Failed connecting to localhost TWS/IB Gateway');
}
