var moment = require('moment-timezone');
var ibapi = require('ibapi');
var messageIds = ibapi.messageIds;
var contract = ibapi.contract;
var GoogleCSVReader = require('./googleCSVReader');
var TIMEZONE = GoogleCSVReader.TIMEZONE;
var TradeController = require('./tradeController');
var BUY = TradeController.BUY;
var SELL = TradeController.SELL;
var HOLD = TradeController.HOLD;
var MINUTES_DAY = TradeController.MINUTES_DAY;

var REALTIME_INTERVAL = 5; // only 5 sec is supported, only regular trading ours == true
var MAX_POSITION = 300;

var MAX_INT = 0x7FFFFFFF; // max 31 bit
var MIN_INT = -0x7FFFFFFE; // negative max 31 bit

/**
 * argument parsing
 */
var symbol = process.argv[2] || 'NFLX';
var exchange = process.argv[3] || 'NASDAQ';
var googleCSVReader = new GoogleCSVReader(symbol);
var minSellPrice = process.argv[4] || 65.00; // for flash crash

var api = new ibapi.NodeIbapi();
var tradeController;
var position = 0;
var abs = Math.abs;
var max = Math.max;
var min = Math.min;
var low = MAX_INT;
var high = MIN_INT;

// Interactive Broker requires that you use orderId for every new order
//  inputted. The orderId is incremented everytime you submit an order.
//  Make sure you keep track of this.
var orderId = -1;

var lastOrderStatus = 'Filled';

var buildContract = function(symbl, exchange) {
  var _contract = contract.createContract();
  _contract.symbol = symbl;
  _contract.secType = 'STK';
  _contract.exchange = 'SMART';
  _contract.primaryExchange = exchange;
  _contract.currency = 'USD';
  return _contract;
};
var builtContract = buildContract(symbol, exchange);

var getRealtimeBars = function(_contract, cancelId) {
  api.reqRealtimeBars(cancelId, _contract, REALTIME_INTERVAL, 'TRADES', true);
};

var getPositions = function() {
  api.reqPositions();
};

var placeMyOrder = function(_contract, action, quantity, orderType, price) {
  if (price < minSellPrice) {
    console.log('order ignored since the limit price is', price, ', which is less than the threshold', minSellPrice);
    return;
  }
  var oldId = orderId++;
  setImmediate(api.placeSimpleOrder.bind(api, oldId, _contract, action, quantity, orderType, price, price)); // last parameter is auxPrice, should it be 0?
  console.log('Next valid order Id: %d', oldId);
  console.log('Placing order for', _contract.symbol);
  console.log(action, quantity);
};

// Here we specify the event handlers.
//  Please follow this guideline for event handlers:
//  1. Add handlers to listen to messages
//  2. Each handler must have be a function (message) signature
var handleValidOrderId = function(message) {
  orderId = message.orderId;
  console.log('next order Id is', orderId);
  getPositions();
  getRealtimeBars(builtContract, 1);
};

var cancelPrevOrder = function(prevOrderId) {
  setImmediate(api.cancelOrder.bind(api, prevOrderId));
  console.log('canceling order: %d', prevOrderId);
};

var handleServerError = function(message) {
  console.log('Error:', message.id.toString(), '-', message.errorCode.toString(), '-', message.errorString.toString());
};

var handleClientError = function(message) {
  console.log('clientError');
  console.log(JSON.stringify(message));
};

var handleDisconnected = function(message) {
  //console.log('disconnected');
};

var handleRealTimeBar = function(realtimeBar) {
  var date = moment.tz(realtimeBar.timeLong * 1000, TIMEZONE);
  low = realtimeBar.low = min(realtimeBar.low, low);
  high = realtimeBar.high = min(realtimeBar.high, high);
  var second = date.seconds();
  if (second <= 57 && second > 3) {
    if (second <= 57 && second > 52 && lastOrderStatus !== 'Filled') {
      cancelPrevOrder(orderId - 1);
    }
    return; // skip if it is not the end of minutes
  }
  var featureVector = tradeController.getFeatureVectorFromRaltimeBar(realtimeBar);
  low = MAX_INT;
  high = MIN_INT;
  var minute = date.minutes();
  var hour = date.hours();
  // always sell a the end of the day
  var noPosition = (hour < 9) || (hour >= 16) || (minute < 50 && hour === 9) || (minute > 56 && hour === 15);
  var result = tradeController.trade(featureVector, noPosition);

  // check if there are shares to sell / money to buy fisrt
  var qty = abs(position);
  if (result === HOLD && position < 0) {
    result = BUY;
  } else if (result === HOLD && position > 0) {
    result = SELL;
  } else if ((result === BUY && position < 0) || (result === SELL && position > 0)) {
    qty += MAX_POSITION;
  } else if ((result === BUY || result === SELL) && MAX_POSITION > qty) {
    qty = MAX_POSITION - qty;
  } else {
    return;
  }
  placeMyOrder(builtContract, result.toUpperCase(), qty, 'MKT', realtimeBar.close);
  console.log(result, noPosition, position, realtimeBar);
};

var handleOrderStatus = function(message) {
  console.log('OrderStatus: ');
  console.log(JSON.stringify(message));
  if (message.status === 'PreSubmitted' || message.status === 'Inactive') {
    cancelPrevOrder(message.orderId);
  }
  lastOrderStatus = message.status;
};

var handlePosition = function(message) {
  console.log('Position: ');
  console.log(JSON.stringify(message));
  if (message.contract && message.contract.symbol === symbol) {
    position = message.position;
  }
};

// After that, you must register the event handler with a messageId
// For list of valid messageIds, see messageIds.js file.
api.handlers[messageIds.nextValidId] = handleValidOrderId;
api.handlers[messageIds.svrError] = handleServerError;
api.handlers[messageIds.clientError] = handleClientError;
api.handlers[messageIds.disconnected] = handleDisconnected;
api.handlers[messageIds.realtimeBar] = handleRealTimeBar;
api.handlers[messageIds.orderStatus] = handleOrderStatus;
api.handlers[messageIds.position] = handlePosition;

// Connect to the TWS client or IB Gateway
var connected = api.connect('127.0.0.1', 7496, 0);

var warmupTrain = function () {
  var data = googleCSVReader.data;
  var dataLen = data.length;
  tradeController = new TradeController(googleCSVReader.columns);
  for (var i = 0; i < dataLen; i++) {
    tradeController.getFeatureVector(data[i]);
  }

  googleCSVReader.shutdown();
};

var setup = function() {
  warmupTrain();
  // Once connected, start processing incoming and outgoing messages
  if (connected) {
    api.beginProcessing();
  } else {
    throw new Error('Failed connecting to localhost TWS/IB Gateway');
 }
};

googleCSVReader.load(setup);
