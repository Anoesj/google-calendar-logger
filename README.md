# Google Calendar Logger

***Work in progress, package will not work properly at this time.***
***Known problems: can't create token.***

## Installation
- `pnpm i google-calendar-logger -D`
- or `npm i google-calendar-logger -D`
- or `yarn add google-calendar-logger -D`

## Usage
To start using the logger, you'll need to:
1. generate a credentials.json at https://developers.google.com/calendar/quickstart/nodejs
2. create an instance of the logger
3. then, the first time, you'll be asked to visit a URL to generate a token.json

## Creating an instance of the logger
For each calendar you want to log to, you'll need to create a new instance of Google Calendar Logger:
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

// Logging start
bs.init({
  server: 'src',
  open: false,
}, () => { logger.logStart(); });

// Logging activity
bs.watch('src/index.html').on('change', handleChange);
bs.watch('src/**/*.js').on('change', handleChange);

function handleChange (...args) {
  bs.reload(...args);

  const fileNames = args.map(file => path.posix.basename(file));
  logger.logActivity('Changes in ' + fileNames.join(', '));
}
```

Then, use something like `node-cleanup` to call `logger.logEnd()` when you're ending the Browsersync process. **Disclaimer**: I'm not entirely sure this is the correct way of using `node-cleanup`. I'm open to suggestions!

```javascript
const nodeCleanup = require('node-cleanup');

// Logging end
nodeCleanup((exitCode, signal) => {
  if (signal) {
    // Stop Browsersync
    bs.exit();

    logger.logEnd().then(() => {
      // calling process.exit() won't inform parent process of signal
      process.kill(process.pid, signal);
    });

    // don't call cleanup handler again
    nodeCleanup.uninstall();

    // tell node-cleanup not to exit yet
    return false;
  }
}, {
  ctrl_C: '\n^C\n',
});
```

## Optional
Set `minutesUntilInactivity` to change how soon a log will be interrupted because of inactivity. By default, a log will be split on the next `logActivity()` or trimmed when calling `logEnd()` if there hasn't been any activity for 10 minutes or longer.

Set `showLinks` to `true` to print URLs to the created/updated events in the CLI.

You can also override strings in the `strings` object to customize how events are called in your calendar. You can either enter a string or a function, where the only parameter is a string equal to the calendar name (this may change later on, because it's kind of pointless).
Strings you can override are:
```javascript
{
  activityStarted:              projectName => `Started working on ${projectName}`,
  activityInProgress:           projectName => `Working on ${projectName}`,
  activityConcluded:            projectName => `Worked on ${projectName}`,
  activityLogged:               projectName => `Activity in ${projectName}`,
  closedDueToInactivity:        projectName => `(closed due to inactivity)`,
}
```