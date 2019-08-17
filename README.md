# Google Calendar Logger

Work in progress, package will not work properly at this time. More information will follow.

## Installation
- `pnpm i google-calendar-logger -D`
- or `npm i google-calendar-logger -D`
- or `yarn add google-calendar-logger -D`

## Usage
To start using the logger, you'll need to:
1. generate a credentials.json at https://developers.google.com/calendar/quickstart/nodejscreate
2. create an instance of the logger
3. then, the first time, you'll be asked to visit a URL to generate a token.json

## Creating an instance of the logger
```javascript
const GoogleCalendarLogger = require('./google-calendar-logger'),
      path = require('path');

const logger = new GoogleCalendarLogger({
  credentialsPath: path.resolve(process.cwd(), './gcl/credentials.json'),
  tokenPath: path.resolve(process.cwd(), './gcl/token.json'),
  calendar: 'Some calendar name',
});
```

## How to actually log time?
Depending on the project, you'll need a way to tell the logger to start logging time and end logging time. You can do this by using the `logger.logStart()` and `logger.logEnd()` methods. To let the logger know that you're still working, use the `logger.logActivity()` method.

### Example: logging time with Browsersync
```javascript
const bs = require('browser-sync').create();

// Create GCL instance, like in the example above

bs.init({
  server: 'src',
  open: false,
}, () => { logger.logStart(); });
```

***TODO: Add `logger.logActivity()` example.***

Then, use node-cleanup to call `logger.logEnd()` when you're ending the Browsersync process.

***TODO: Add `logger.logEnd()` example.***