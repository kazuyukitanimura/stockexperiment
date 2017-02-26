var moment = require('./momenttz');
var momenttz = moment.tz;
var TIMEZONE = moment.TIMEZONE;
var TradeController = require('./build/Release/addon').TradeController;

var EXCHANGES = {
  ES: 'GLOBEX'
};

var DESTINATIONS = {
  ES: 'GLOBEX'
};

var SEC_TYPES = {
  ES: 'FOP'
};

var ONE_POSITIONS = {
  ES: 1
};

var ONE_TICKS = {
  ES: 0.25
};

var REDUCE_THRESHOLD = {
  ES: 5.0
};

var REDUCED_TICKS = {
  ES: 0.05
};

var STRIKE_INTERVALS = {
  ES: 5.0
};

var MIN_PRICES = {
  ES: 0.05
};

var ROLL_DAY_OF_WEEKS = {
  ES: 4 // Thursday
};

var cancelId = 1;

var Option = module.exports = function(symbol, right, strike, prev) {
  if (! (this instanceof Option)) { // enforcing new
    return new Option(symbol);
  }
  this.symbol = symbol;
  this.onePosition = ONE_POSITIONS[symbol] || 0;
  this.oneTickInverse = (1.0 / (ONE_TICKS[symbol] || 0.01));
  this.reduceThreshold = REDUCE_THRESHOLD[symbol] || 5.0;
  this.reducedTickInverse = (1.0 / (REDUCED_TICKS[symbol] || 0.01));
  this.strikeIntervalInverse = (1.0 / (STRIKE_INTERVALS[symbol] || 5.0));
  this.minPrice = MIN_PRICES[symbol] || 0.05;
  this.tradeController = new TradeController();
  this.bid = 0.0;
  this.ask = 0.0;
  this.secType = SEC_TYPES[symbol] || 'STK';
  this.exchange = DESTINATIONS[symbol] || 'SMART';
  this.primaryExchange = EXCHANGES[symbol];
  this.currency = 'USD';
  var date = momenttz(TIMEZONE);
  var dayOfWeek = date.day();
  var dayOfWeekToRoll = ROLL_DAY_OF_WEEKS[symbol] || 4; // default Thursday
  var diffToFriday = (5 - dayOfWeek + 7) % 7; // diff to next coming up Friday
  if (prev) {
    this.expiry = date.add(diffToFriday + 7 * (dayOfWeek > dayOfWeekToRoll), 'day').format('YYYYMMDD');
  } else {
    this.expiry = date.add(diffToFriday + 7 * (dayOfWeek >= dayOfWeekToRoll), 'day').format('YYYYMMDD');
  }
  this.cancelId = ++cancelId;
  this.lastOrderStatus = 'Filled';
  this.orderId = -1; // last order id
  this.tickTime = 1478840331260; // some init time in msec
  this.lastDayLock = false;
  this.right = right; // CALL or PUT
  this.strike = strike;
  this.done = false;
  this.pending = false;
};
