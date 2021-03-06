var moment = require('./momenttz');
var Addon = require('./build/Release/addon');
var TradeController = Addon.TradeController;
var IbClient = Addon.IbClient;
var BUY = TradeController.BUY;
var SELL = TradeController.SELL;
var HOLD = TradeController.HOLD;
var OFFSET_POS = TradeController.OFFSET_POS;
var OFFSET_NEG = TradeController.OFFSET_NEG;
var Company = require('./company');
var max = Math.max;
var min = Math.min;
var round = Math.round;
var now = Date.now;
var log = console.log;

var cancelIds = {};
var symbols = {};
var entryOrderIds = {};
var cancelOrderIds = {};
var actions = {};

var hourOffset = moment.tz(moment.TIMEZONE).utcOffset() / 60;

var companies = [new Company('ES')];

// Interactive Broker requires that you use orderId for every new order
// inputted. The orderId is incremented everytime you submit an order.
// Make sure you keep track of this.
var orderId = -1;

var placeMyOrder = function(company, action, quantity, orderType, lmtPrice, entry, modify) {
  var oldId = -1;
  if (modify) {
    oldId = company.orderId;
  } else {
    oldId = company.orderId = orderId++;
    if (entry) {
      entryOrderIds[oldId] = company;
      actions[oldId] = action;
    }
  }
  ibClient.placeOrder(oldId, company.cancelId, action, quantity, orderType, lmtPrice, company.expiry);
  log((modify ? 'Modifying' : 'Placing'), 'order for', company.symbol, action, quantity, orderType, lmtPrice, company.expiry, company.tickTime);
};

var handleValidOrderId = function(oId) {
  var company;
  for (var i = companies.length; i--;) {
    company = companies[i];
    cancelIds[company.cancelId] = company;
    symbols[company.symbol] = company;
  }
  orderId = oId;
  log('next order Id is', oId);
  ibClient.reqAllOpenOrders();
  ibClient.reqAutoOpenOrders(true);
  for (i = companies.length; i--;) {
    company = companies[i];
    ibClient.reqRealTimeBars(company.cancelId, 'TRADES', false); // only regular trading ours == false
    ibClient.reqMktData(company.cancelId, '', false);
  }
};

var cancelPrevOrder = function(prevOrderId) {
  if (prevOrderId > 0) { // cannot cancel negative order id or zero
    ibClient.cancelOrder(prevOrderId); // avoid rate limitter
    log('canceling order:', prevOrderId);
  }
};

var modifyExpiry = function(company, oId, order) {
  cancelOrderIds[oId] = company;
  cancelPrevOrder(oId);
  company.expiry = company.newExpiry;
  placeMyOrder(company, order.action, order.totalQuantity, 'LMT', order.lmtPrice, false, false);
};

var handleServerError = function(id, errorCode, errorString) {
  if (errorCode === 2109) { // ignore
    return;
  }
  log(Date(), '[ServerError]', id, errorCode, errorString);
  if (errorCode === 1101 || errorCode === 1300) {
    process.exit(1);
  }
};

var handleConnectionClosed = function() {
  log(Date(), '[ConnectionClosed]');
  process.exit(1);
};

var handleRealTimeBar = function(reqId, barOpen, barHigh, barLow, barClose, volume, wap, count, second, minute, hour) {
  var company = cancelIds[reqId];
  if (!company) {
    log('[WARNING] Unknown realtimeBar', reqId, barOpen, barHigh, barLow, barClose, volume, wap, count, second, minute, hour);
    return;
  }
  var low = company.low = min(barLow, company.low);
  var high = company.high = max(barHigh, company.high);
  if (second <= 57 && second > 3) {
    if (second > 52 && company.lastOrderStatus !== 'Filled' && company.lastOrderStatus !== 'Cancelled') {
      cancelPrevOrder(company.orderId);
    }
    return; // skip if it is not the end of minutes
  }
  var bid = company.bid;
  var ask = company.ask;
  var mid = (bid + ask) / 2.0;
  var tradeController = company.tradeController;
  var noPosition = (hour < 9) || (hour >= 15) || (hour === 9 && minute < 21) || (hour === 14 && minute > 20); // starts earlier than regular trading hours
  var noSma = (hour < 11) || (hour === 11 && minute < 38);
  var action = tradeController.tradeLogic(mid, high, low, noPosition, noSma);
  company.resetLowHigh();
  var lLotsLength = company.lLotsLength;
  var sLotsLength = company.sLotsLength;
  var lengthDiff = lLotsLength - sLotsLength;
  var maxLot = company.maxLot;
  var hardLMaxPrices = company.hardLMaxPrices;
  var hardLMinPrices = company.hardLMinPrices;
  var hardSMinPrices = company.hardSMinPrices;
  var hardSMaxPrices = company.hardSMaxPrices;
  var symbol = company.symbol;
  var isBuy = action === BUY;
  var lmtPrice = isBuy ? bid : ask;
  if ((hour === 10 && minute === 21) || (hour === 12 && minute === 23) || (hour === 14 && minute === 0) || (hour === 15 && minute === 59)) {
    // force buy or sell
    if (lengthDiff < company.maxLotDiff) {
      if (lLotsLength > 13) {
        log(Date(), symbol, low, high, bid, ask, mid);
        return;
      }
      action = BUY;
      isBuy = true;
      lmtPrice = (hour < 11 || hour > 14) ? bid : ask;
    } else {
      if (sLotsLength > 13) {
        log(Date(), symbol, low, high, bid, ask, mid);
        return;
      }
      action = SELL;
      isBuy = false;
      lmtPrice = (hour < 11 || hour > 14) ? ask : bid;
    }
  } else if (action === HOLD || (isBuy && ((lLotsLength >= maxLot && lengthDiff > 1) || lLotsLength >= hardLMaxPrices.length)) || (action === SELL && ((sLotsLength >= maxLot && lengthDiff < 0) || sLotsLength >= hardSMinPrices.length))) {
    log(Date(), symbol, low, high, bid, ask, mid);
    return;
  } else if (isBuy ? (lmtPrice > hardLMaxPrices[lLotsLength] || lmtPrice < hardLMinPrices[lLotsLength]) : (lmtPrice < hardSMinPrices[sLotsLength] || lmtPrice > hardSMaxPrices[sLotsLength])) {
    log(Date(), symbol, low, high, bid, ask, mid);
    log('[WARNING]', action, 'order ignored since the limit price is', lmtPrice, ', which is less/more than the threshold', hardLMaxPrices[lLotsLength], hardLMinPrices[lLotsLength], hardSMinPrices[sLotsLength], hardSMaxPrices[sLotsLength]);
    return;
  }
  var oldExpiryPosition = company.oldExpiryPosition;
  var orderType = 'LMT';
  if (isBuy ? (oldExpiryPosition < 0) : (oldExpiryPosition > 0)) {
    company.expiry = company.oldExpiry;
    orderType = 'MKT';
  } else {
    company.expiry = company.newExpiry;
  }
  placeMyOrder(company, action, company.onePosition, orderType, lmtPrice, true, false);
  company.tickTime = now();
  log(Date(), symbol, low, high, bid, ask, mid);
};

var handleTickPrice = function(tickerId, field, price, canAutoExecute) {
  var company = cancelIds[tickerId];
  if (company && price) {
    if (field === 4) { // last price
      company.low = min(price, company.low);
      company.high = max(price, company.high);
    } else if (field === 9) { // last day close
      if (company.lastDayLock) {
        // last day close might happen multiple times in a day in case of connection errors
        return;
      }
      company.lastDayLock = true;
      company.setCaps(price);
      log(company.symbol, 'last day close', price);
      var tickInverse = company.oneTickInverse;
      var lLots = company.lLots;
      var sLots = company.sLots;
      var lLotsLength = company.lLotsLength;
      var sLotsLength = company.sLotsLength;
      var lLotKeys = Object.keys(lLots);
      var sLotKeys = Object.keys(sLots);
      var i = 0;
      var lLift = 0.0;
      var sLift = 0.0;
      var oId = 0;
      var order;
      var lmtPrice = 0.0;
      var threshold = 1.15;
      var pad = round(price * 0.02);
      if (sLotsLength > 0) {
        for (i = lLotKeys.length; i--;) {
          oId = lLotKeys[i];
          order = lLots[oId];
          if (order) {
            lmtPrice = order.lmtPrice;
            if (lmtPrice / price > threshold) { // lmtPrice is too far from last close
              lLift += lmtPrice - price - pad;
              company.orderId = parseInt(oId, 10);
              placeMyOrder(company, order.action, order.totalQuantity, 'LMT', price + pad, false, true); // modify order
              order.lmtPrice = price + pad;
            }
          }
        }
      }
      if (lLotsLength > 0) {
        lLift = Math.ceil(lLift / sLotsLength * tickInverse) / tickInverse; // averaged lift amount
        for (i = sLotKeys.length; i--;) {
          oId = sLotKeys[i];
          order = sLots[oId];
          if (order) {
            lmtPrice = order.lmtPrice - lLift; // after lift of lLots
            company.orderId = parseInt(oId, 10);
            if (price / lmtPrice> threshold) { // lmtPrice is too far from last close
              sLift += price - lmtPrice - pad;
              placeMyOrder(company, order.action, order.totalQuantity, 'LMT', price - pad, false, true); // modify order
              order.lmtPrice = price - pad;
            } else if (lmtPrice < 0.0) {
              sLift += lLift;
            } else if (lLift) {
              placeMyOrder(company, order.action, order.totalQuantity, 'LMT', lmtPrice, false, true); // modify order
              order.lmtPrice = lmtPrice;
            }
          }
        }
      }
      if (sLift) {
        sLift = Math.ceil(sLift / lLotsLength * tickInverse) / tickInverse; // averaged lift amount
        for (i = lLotKeys.length; i--;) {
          oId = lLotKeys[i];
          order = lLots[oId];
          if (order) {
            lmtPrice = order.lmtPrice + sLift; // after lift of sLots
            company.orderId = parseInt(oId, 10);
            placeMyOrder(company, order.action, order.totalQuantity, 'LMT', lmtPrice, false, true); // modify order
            order.lmtPrice = lmtPrice;
          }
        }
      }
      log('after baseup', company);
    } else if (canAutoExecute) {
      var action = actions[company.orderId];
      var prevTickTime = company.tickTime + 1699;
      var tickTime = 1478840331260; // some init time in msec
      if (field === 1) { // bid price
        var bid = company.bid;
        company.bid = price;
        if (company.lastOrderStatus === 'Submitted' && action === BUY && bid < price && bid) {
          tickTime = now();
          if (tickTime > prevTickTime) { // wait more than 2 sec
            placeMyOrder(company, action, company.onePosition, 'LMT', price, false, true); // modify order
            company.tickTime = tickTime;
          }
        }
      } else if (field === 2) { // ask price
        var ask = company.ask;
        company.ask = price;
        if (company.lastOrderStatus === 'Submitted' && action === SELL && ask > price && ask) {
          tickTime = now();
          if (tickTime > prevTickTime) { // wait more than 2 sec
            placeMyOrder(company, action, company.onePosition, 'LMT', price, false, true); // modify order
            company.tickTime = tickTime;
          }
        }
      }
    }
  }
};

var handleOrderStatus = function(oId, orderStatus, filled, avgFillPrice, permId, parentId, lastFillPrice, clientId, whyHeld) {
  var company = entryOrderIds[oId];
  if (company) {
    company.lastOrderStatus = orderStatus;
    if (orderStatus === 'Inactive') {
      cancelPrevOrder(oId);
    } else if (orderStatus === 'Filled') {
      entryOrderIds[oId] = null;
      var isSell = actions[oId] === BUY;
      var action = isSell ? SELL : BUY;
      var lmtPrice = avgFillPrice * (isSell ? OFFSET_POS : OFFSET_NEG);
      var tickInverse = company.oneTickInverse;
      lmtPrice = round(lmtPrice * tickInverse) / tickInverse; // required to place a correct order
      var oldExpiry = company.oldExpiry;
      var newExpiry = company.newExpiry;
      var oldExpiryPosition = company.oldExpiryPosition;
      if (oldExpiry !== newExpiry) {
        var exLot = company.popExLot();
        if (exLot) {
          modifyExpiry(company, exLot.oId, exLot.order);
        }
      }
      if (isSell ? (oldExpiryPosition > 0) : (oldExpiryPosition < 0)) {
        company.expiry = oldExpiry;
      } else {
        company.expiry = newExpiry;
      }
      if (isSell) {
        if (company.ask > lmtPrice) { // this condition becomes true usually for rolling
          lmtPrice = company.ask; // cannot sell at too low lmtPrice, the order gets rejected otherwise
        }
      } else {
        if (company.bid < lmtPrice) { // this condition becomes true usually for rolling
          lmtPrice = company.bid; // cannot buy at too high lmtPrice, the order gets rejected otherwise
        }
      }
      placeMyOrder(company, action, (filled | 0), 'LMT', lmtPrice, false, false);
    }
  } else {
    company = cancelOrderIds[oId];
  }
  if (company) {
    if (orderStatus === 'Cancelled') {
      entryOrderIds[oId] = null;
      cancelOrderIds[oId] = null;
      // since handleOpenOrder is not called for canceling, cleanup is needed here
      if (company.sLots[oId]) {
        company.sLots[oId] = null;
        company.sLotsLength -= 1;
      } else if (company.lLots[oId]) {
        company.lLots[oId] = null;
        company.lLotsLength -= 1;
      }
      if (company.sExLots[oId]) {
        company.oldExpiryPosition += 1;
        company.sExLots[oId] = null;
      } else if (company.lExLots[oId]) {
        company.oldExpiryPosition -= 1;
        company.lExLots[oId] = null;
      }
      log('[Cancel lots]', company.symbol, company.oldExpiryPosition, company.lLotsLength, company.sLotsLength);
    }
  }
  log('OrderStatus:', oId, orderStatus, filled, avgFillPrice, lastFillPrice, clientId, whyHeld);
};

var handleOpenOrder = function(oId, symbol, expiry, action, totalQuantity, orderType, lmtPrice, orderStatus) {
  var company = entryOrderIds[oId];
  if (company === undefined) { // if exiting the position
    company = symbols[symbol];
    if (company) {
      var order = {
        action: action,
        totalQuantity: totalQuantity,
        orderType: orderType,
        lmtPrice: lmtPrice
      };
      var oldExpiry = company.oldExpiry;
      var newExpiry = company.newExpiry;
      expiry = expiry.substring(0, newExpiry.length);
      var sLots = company.sLots;
      var lLots = company.lLots;
      if (orderStatus === 'Filled' || orderStatus === 'Cancelled') { // in reality, Cancelled is never called
        if (action === BUY) {
          if (sLots[oId]) {
            sLots[oId] = null;
            company.sLotsLength -= 1;
            if (newExpiry !== expiry) {
              company.oldExpiryPosition += 1;
              company.sExLots[oId] = null;
            }
          }
        } else if (action === SELL) {
          if (lLots[oId]) {
            lLots[oId] = null;
            company.lLotsLength -= 1;
            if (newExpiry !== expiry) {
              company.oldExpiryPosition -= 1;
              company.lExLots[oId] = null;
            }
          }
        }
        log('[Delete lots]', symbol, company.oldExpiryPosition, company.lLotsLength, company.sLotsLength);
      } else if (orderStatus !== 'Inactive') {
        var oldExpiryPosition = company.oldExpiryPosition;
        var exLot = null;
        if (oldExpiry === newExpiry && newExpiry !== expiry) { // right before expiry, aggresively roll
          var aggresiveLock = company.aggresiveLock;
          if (!aggresiveLock[oId]) {
            aggresiveLock[oId] = true;
            modifyExpiry(company, oId, order);
            company.expiry = expiry;
            placeMyOrder(company, action, totalQuantity, 'MKT', 0.0, true, false);
            company.tickTime = now();
          }
        } else if (action === BUY) {
          if (!sLots[oId]) {
            sLots[oId] = order;
            company.sLotsLength += 1;
            if (newExpiry !== expiry) {
              if (oldExpiryPosition > 0) {
                exLot = company.popExLot();
                if (exLot) {
                  modifyExpiry(company, exLot.oId, exLot.order);
                  modifyExpiry(company, oId, order);
                }
              } else {
                company.oldExpiryPosition -= 1;
                company.sExLots[oId] = order;
              }
            }
          }
        } else if (action === SELL) {
          if (!lLots[oId]) {
            lLots[oId] = order;
            company.lLotsLength += 1;
            if (newExpiry !== expiry) {
              if (oldExpiryPosition < 0) {
                exLot = company.popExLot();
                if (exLot) {
                  modifyExpiry(company, exLot.oId, exLot.order);
                  modifyExpiry(company, oId, order);
                }
              } else {
                company.oldExpiryPosition += 1;
                company.lExLots[oId] = order;
              }
            }
          }
        }
        log('[Append lots]', symbol, company.oldExpiryPosition, company.lLotsLength, company.sLotsLength);
      }
    }
  }
  log('OpenOrder:', oId, symbol, expiry, action, totalQuantity, orderType, lmtPrice, orderStatus);
};

var ibClient = new IbClient(companies, hourOffset, handleOrderStatus, handleValidOrderId, handleServerError, handleTickPrice, handleOpenOrder, handleRealTimeBar, handleConnectionClosed);

// Connect to the TWS client or IB Gateway
var connected = ibClient.connect('127.0.0.1', 7496, 0);

// Once connected, start processing incoming and outgoing messages
if (connected) {
  var processMessage = function() {
    ibClient.processMessages();
    setImmediate(processMessage); // faster but 100% cpu
    //setTimeout(processMessage, 0); // slower but less cpu intensive
  };
  setImmediate(processMessage);
} else {
  throw new Error('Failed connecting to localhost TWS/IB Gateway');
}
