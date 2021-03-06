Copyright (c) 2015-2017 Kazuyuki Tanimura. All rights reserved.

* IB API 9.72
* enable socket client
* turn off API precaution
* turn off the readonly mode

### NOTES
- Passive execution
  - Limit order at bid price for long and ask price for short
  - If the ask goes up for long or the bid goes down for short, fallback to aggressive execution
    - Modify the limit order at the new ask price for long and the new bid price for short
- Passive roll over
  - For long
    - If cumulative position is positive
      - Long *new* month and limit *old* month
    - If cumulative position is negative
      - Long *old* month and limit *new* month
  - For short
    - If cumulative position is positive
      - Short *old* month and limit *new* month
    - If cumulative position is negative
      - Short *new* month and limit *old* month
- Active roll over
  - Roll over pending order expiry date
  - Roll over existing position
- Automatic upper and lower limit
- Automatic base up

### TODO
- Bootstrapping
