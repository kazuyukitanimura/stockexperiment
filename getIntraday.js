var fs = require('fs');
var request = require('request');
var ByLineStream = require('./byLineStream');
var GoogleCSVReader = require('./googleCSVReader');
var CLOSE_COLUMN = GoogleCSVReader.CLOSE_COLUMN;
var HIGH_COLUMN = GoogleCSVReader.HIGH_COLUMN;
var LOW_COLUMN = GoogleCSVReader.LOW_COLUMN;
var OPEN_COLUMN = GoogleCSVReader.OPEN_COLUMN;
var DATE_COLUMN = GoogleCSVReader.DATE_COLUMN;
var TradeController = require('./build/Release/addon').TradeController;
var MIN_INT = require('./utils').MIN_INT;

var INTERVAL = 60; // sec
var PERIOD = 20; // days
var MINUTES_DAY = 390; // 390 minutes per day (9:30AM - 4:00PM ET)

var BUY = TradeController.BUY;
var SELL = TradeController.SELL;
var HOLD = TradeController.HOLD;
var OFFSET = TradeController.OFFSET;
var OFFSET_POS = TradeController.OFFSET_POS;
var OFFSET_NEG = TradeController.OFFSET_NEG;

/**
 * argument parsing
 */
var tickerId = process.argv[2] || 'SPY';
var readNewData = process.argv[3];

var googleCSVReader = new GoogleCSVReader(tickerId);
var url = ['http://finance.google.com/finance/getprices?i=', INTERVAL, '&p=', PERIOD, 'd&f=d,o,h,l,c,v&df=cpct&q=', tickerId.toUpperCase()].join('');

var backtest = function() {
  var data = googleCSVReader.data;
  var dataLen = data.length;
  var tradeController = new TradeController();
  var columns = googleCSVReader.columns;
  var closeColumnIndex = columns[CLOSE_COLUMN];
  var highColumnIndex = columns[HIGH_COLUMN];
  var lowColumnIndex = columns[LOW_COLUMN];
  var openColumnIndex = columns[OPEN_COLUMN];
  var dateColumnIndex = columns[DATE_COLUMN];

  var gain = 0;
  var gains = [];
  var pGain = 0;
  var nGain = 0;
  var lTargets = [];
  var sTargets = [];
  var hardLMinPrices = [0.0, 0.0, 0.0, 0.0, 0.0, 0.0];
  var hardLMaxPrices = [999999.9, 999999.9, 999999.9, 999999.9, 999999.9];
  var hardSMinPrices = [0.0, 0.0, 0.0];
  var hardSMaxPrices = [999999.9, 999999.9, 999999.9];
  for (var i = 0; i < dataLen; i++) {
    var datum = data[i];
    var i_MINUTES_DAY = i % MINUTES_DAY;
    var newClose = datum[closeColumnIndex];
    var newHigh = datum[highColumnIndex];
    var newLow = datum[lowColumnIndex];
    var newOpen = datum[openColumnIndex];
    var noPosition = (i_MINUTES_DAY >= MINUTES_DAY - 99);
    var displayTime = new Date(0, 0, 0, 9, 30 + i % MINUTES_DAY, 0, 0).toLocaleTimeString();
    var result = tradeController.trade(newClose, newHigh, newLow, newOpen, noPosition);
    var j = 0;
    var target = 0;
    var diff = 0;
    for (j = lTargets.length; j--;) {
      target = lTargets[j];
      diff = 0;
      if (target <= newHigh) {
        diff = Math.round(target * OFFSET / OFFSET_POS);
        gains.push(diff - 2); // take 2 cents off for round trip commission
        gain += diff - 2;
        if (gains[gains.length - 1] > 0) {
          pGain += 1;
        } else {
          nGain += 1;
        }
        console.log(' ', SELL, displayTime, newClose, diff, gain, pGain / (pGain + nGain));
        lTargets.splice(j, 1);
      }
    }
    for (j = sTargets.length; j--;) {
      target = sTargets[j];
      diff = 0;
      if (target >= newLow) {
        diff = Math.round(target * OFFSET / OFFSET_NEG);
        gains.push(diff - 2); // take 2 cents off for round trip commission
        gain += diff - 2;
        if (gains[gains.length - 1] > 0) {
          pGain += 1;
        } else {
          nGain += 1;
        }
        console.log('  ', BUY, displayTime, newClose, diff, gain, pGain / (pGain + nGain));
        sTargets.splice(j, 1);
      }
    }
    if (i_MINUTES_DAY === MINUTES_DAY - 1) {
      var lLift = 0;
      var sLift = 0;
      var threshold = 1.15;
      var pad = Math.round(newClose * 0.02);
      if (sTargets.length > 0) {
        for (j = lTargets.length; j--;) {
          target = lTargets[j];
          if (target / newClose > threshold) {
            lLift += target - newClose - pad;
            lTargets[j] = newClose + pad;
          }
        }
      }
      if (lTargets.length > 0) {
        lLift = Math.ceil(lLift / sTargets.length / 25) * 25;
        for (j = sTargets.length; j--;) {
          target = sTargets[j] - lLift;
          if (newClose / target > threshold) {
            sLift += newClose - target - pad;
            sTargets[j] = newClose - pad;
          } else if (target < 0) {
            sLift += lLift;
          } else if (lLift) {
            sTargets[j] = target;
          }
        }
      }
      if (sLift) {
        sLift = Math.ceil(sLift / lTargets.length / 25) * 25;
        for (j = lTargets.length; j--;) {
          target = lTargets[j] + sLift;
          lTargets[j] = target;
        }
      }
    }
    if ((result === BUY && (newClose * OFFSET_POS > hardLMaxPrices[lTargets.length] || newClose * OFFSET_POS < hardLMinPrices[lTargets.length])) || (result === SELL && (newClose * OFFSET_NEG < hardSMinPrices[sTargets.length] || newClose * OFFSET_NEG > hardSMaxPrices[sTargets.length]))) {
      // pass
    } else if (result === BUY && (lTargets.length < 2 || (lTargets.length - sTargets.length < 2 && lTargets.length < 5))) {
      lTargets.push(Math.round(newClose * OFFSET_POS));
      console.log('bought', displayTime, newClose);
    } else if (result === SELL && (sTargets.length < 2 || (sTargets.length - lTargets.length < 1 && sTargets.length < 3))) {
      sTargets.push(Math.round(newClose * OFFSET_NEG));
      console.log(' ', 'sold', displayTime, newClose);
    }
    if (i_MINUTES_DAY === MINUTES_DAY - 1) {
      hardLMinPrices = [0.9 * newClose, 0.9 * newClose, 0.9 * newClose, 0.9 * newClose, 0.9 * newClose];
      hardLMaxPrices = [1.019 * newClose, 1.015 * newClose, 1.011 * newClose, 1.007 * newClose, 1.003  * newClose];
      hardSMinPrices = [0.961 * newClose, 0.971 * newClose, 0.981 * newClose];
      hardSMaxPrices = [1.1 * newClose, 1.1 * newClose, 1.1 * newClose];
      console.log(new Date((datum[dateColumnIndex] + 60 * 60 * 3) * 1000).toLocaleDateString(), lTargets, sTargets);
      console.log('=====');
      //console.log(gain);
    }
  }
  var aveGain = 0;
  var variance = 0;
  var pg = 0;
  var ng = 0;
  var maxGain = MIN_INT;
  var maxDd = 0;
  for (i = 0; i < gains.length; i++) {
    aveGain += gains[i];
    if (gains[i] > 0) {
      pg += gains[i];
    } else if (gains[i] < 0) {
      ng += -gains[i];
    }
    maxGain = Math.max(aveGain, maxGain);
    maxDd = Math.min(aveGain - maxGain, maxDd);
    //console.log(i, aveGain, maxGain, maxDd);
  }
  aveGain /= gains.length;
  for (i = gains.length; i--;) {
    variance += Math.pow(aveGain - gains[i], 2);
  }
  variance /= gains.length;
  console.log('size:', dataLen);
  console.log(tickerId);
  console.log('elapsed:', dataLen / MINUTES_DAY | 0, 'days', dataLen % MINUTES_DAY, 'minutes');
  console.log('gain:', gain, 'per day =', 100.0 * gain / data[0][closeColumnIndex] / dataLen * MINUTES_DAY, '%');
  console.log('pGain/(pGain+nGain):', pGain / (pGain + nGain), 'kelly criterion:', pGain / (pGain + nGain) - nGain / (pGain + nGain) / ((pg / pGain) / (ng / nGain)));
  console.log('sigma:', Math.sqrt(variance), 'ave gain:', aveGain, 'ratio:', aveGain/Math.sqrt(variance), '# trades: ', gains.length);
  console.log('max draw down: ', maxDd);
  console.log('buy and hold:', data[dataLen - 1][closeColumnIndex] - data[0][closeColumnIndex], 'profit factor:', pg / ng, 'payoff ratio: ', (pg / pGain) / (ng / nGain));
  console.log('pGain*ave/sigma/days:', pGain * aveGain / Math.sqrt(variance) / (dataLen / MINUTES_DAY));

  googleCSVReader.shutdown();
};

var loadAndBacktest = function() {
  googleCSVReader.load(backtest);
};

if (readNewData) {
  request(url)
  .pipe(new ByLineStream()).on('readable', function() {
    googleCSVReader.parseLine(this.read());
  }).on('end', function() {
    googleCSVReader.save();
    loadAndBacktest();
  }).on('error', function(data) {
    googleCSVReader.shutdown();
    console.error(data);
  });
} else {
  loadAndBacktest();
}
