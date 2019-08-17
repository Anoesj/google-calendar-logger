'use strict';

// See: https://michaelheap.com/working-with-the-google-calendar-api-in-node-js/

const { google } = require('googleapis'),
      googleAPIGetAuth = require('./authorize.js'),
      chalk = require('chalk'),
      moment = require('moment-timezone');

// REVIEW: or export default?
module.exports = class GoogleCalendarLogger {

  /**
   * TODO: documentation
   *
   * @param {Object} options
   * @param {String} options.credentialsPath Path to credentials.json (generate here: https://developers.google.com/calendar/quickstart/nodejs)
   * @param {String} options.tokenPath Path to where token.json should be placed (including filename + .json)
   * @param {String} options.calendar How much time can exist between logged activities, before the log gets interrupted.
   * @param {Number} [options.minutesUntilInactivity=30] How much time can exist between logged activities, before the log gets interrupted.
   * @param {Object} [options.strings={}] Strings overrides.
   */
  constructor (options) {
    this.setDefaults();

    let credentialsPath,
        tokenPath,
        calendarSummary,
        minutesUntilInactivity,
        stringsOverrides;

    // e.g. new GoogleCalendarLogger('Some calendar name');
    // TODO: deprecated as of 14-08-2019, because credentials and token should be mandatory parameters (also, do check if they're set too)
    if (typeof options === 'string') {
      calendarSummary = options;
    }

    // e.g. new GoogleCalendarLogger({ calendar: 'Some calendar name', minutesUntilInactivity: 10 });
    else {
      ({
        credentialsPath,
        tokenPath,
        calendar: calendarSummary,
        minutesUntilInactivity,
        strings: stringsOverrides = {},
      } = options);
    }

    this.setCredentialsPath(credentialsPath);
    this.setTokenPath(tokenPath);
    this.setCalendarSummary(calendarSummary);
    this.setMinutesUntilInactivity(minutesUntilInactivity);
    this.setStringsOverrides(stringsOverrides);

    // Init Google Calendar connection
    this.initCalendarConnection();

    // TODO: Warn no calendar summary
  }

  setDefaults () {
    this.calendarSummary = undefined;
    this.minutesUntilInactivity = 30;
    this.strings = this.getStrings();
  }

  initCalendarConnection () {
    this.calendarConnection = new Promise(async (resolve, reject) => {
      try {
        const auth = await googleAPIGetAuth(this.credentialsPath, this.tokenPath);

        resolve(google.calendar({
          version: 'v3',
          auth
        }));
      }

      catch (err) {
        // TODO: console.log with human-readable error msg here
        reject(err);
      }
    });
  }

  getCurrentTime () {
    return {
      currentTime: new Date(),
      timeZone: moment.tz.guess(),
    };
  }

  async getCalendarId (googleCalendar, calendarSummary) {
    const timelogCalendar = await this.getOrCreateCalendar(googleCalendar, calendarSummary);
    return timelogCalendar.id;
  }

  /**
   * Create a start event in calendar 'calendarSummary'.
   * @param {String} calendarSummary Title of the calendar.
   * @param {String} logName Desired title of the start event.
   */
  async logStart (calendarSummary = this.calendarSummary, logName = this.strings.activityStarted) {
    if (typeof logName === 'function') logName = logName(calendarSummary);

    // Create starting event
    const {
      currentTime: startTime,
      timeZone,
    } = this.getCurrentTime();

    const googleCalendar = await this.calendarConnection,
          calendarId = await this.getCalendarId(googleCalendar, calendarySummary);

    await new Promise((resolve, reject) => {
      const event = {
        calendarId,
        resource: {
          summary: logName,
          description: 'incomplete work (leave this here)',
          start: {
            dateTime: startTime.toISOString(),
            timeZone,
          },
          end: {
            dateTime: new Date(+startTime + 1000).toISOString(), // duration of 1 second
            timeZone,
          },
        },
      };

      googleCalendar.events.insert(event, (err, response) => {
        if (err) {
          console.log(chalk.red(`There was an error creating a start event`));
          return reject(err);
        }

        console.log(chalk.green(`Start event created: ${response.data.htmlLink}`));
        resolve();
      });
    });
  }

  /**
   * Create an activity event in calendar 'calendarSummary'.
   * @param {String} calendarSummary Title of the calendar.
   * @param {String} logName Desired title of the work in progress event.
   */
  // FIXME: This is turning into spaghetti and it's broken. Refactor and finish.
  async logActivity (calendarSummary = this.calendarSummary, logName = this.strings.activityInProgress) {
    if (typeof logName === 'function') logName = logName(calendarSummary);

    const {
      currentTime: activityTime,
      timeZone,
    } = this.getCurrentTime();

    const googleCalendar = await this.calendarConnection,
          calendarId = await this.getCalendarId(googleCalendar, calendarySummary);

    // Get the latest incomplete work log
    const latestIncompleteWork = await new Promise((resolve, reject) => {
      const listParams = {
        calendarId,
        // Google Calendar API doesn't support listing in descending order,
        // we have to specify timeMin and timeMax instead and reverse order later.
        // Assuming you didn't start working more than 1 month ago, this should work:
        timeMin: new Date(+activityTime - 1000 * 60 * 60 * 24 * 31).toISOString(),
        timeMax: activityTime.toISOString(),
        timeZone,
        singleEvents: true,
        orderBy: 'startTime',
      };

      googleCalendar.events.list(listParams, (err, response) => {
        if (err) {
          console.log(chalk.red('An error occured during listing events:'));
          return reject(err);
        }

        const events = response.data.items;
        if (events.length) {
          // Get the latest log with 'incomplete work' in the description
          const latestIncompleteWork = events.reverse().find(event => event.description.startsWith('incomplete work'));

          if (latestIncompleteWork) {
            resolve(latestIncompleteWork);
          }

          else {
            reject(new Error(`Couldn't create log: no latest incomplete event found in the past 31 days.`));
          }
        }
        else {
          reject(new Error(`Couldn't create log: found no events in the past 31 days.`));
        }
      });
    });

    console.log(latestIncompleteWork);

    // Check for inactivity
    const lastActivity = +new Date(latestIncompleteWork.updated || latestIncompleteWork.created),
          inactivity = (+activityTime - lastActivity) > msUntilInactivity;

    if (inactivity) {
      console.log(`Possible inactivity detected, closing previous log and creating new one.`);

      const closePreviousLogPromise = new Promise((resolve, reject) => {
        const patchParams = {
          calendarId,
          eventId: latestIncompleteWork.id,
          resource: {
            summary: `Worked on ${calendarSummary}`, // TODO: how do we keep this the same as in logEnd
            description: `Completed work (closed due to inactivity)`, // TODO: okay, we need a 'strings' object
          }
        };

        googleCalendar.events.patch(patchParams, (err, response) => {
          if (err) {
            console.log(chalk.red('An error occured during creating the completed work log:'));
            return reject(err);
          }

          console.log(chalk.green(`Work logged: ${response.data.htmlLink}`));
          resolve();
        });
      });c

      const inactivityLogPromise = new Promise((resolve, reject) => {
        // const patchParams = {
        //   calendarId,
        //   eventId: latestIncompleteWork.id,
        //   resource: {
        //     summary: `Worked on ${calendarSummary}`, // TODO: how do we keep this the same as in logEnd
        //     description: `Completed work (closed due to inactivity)`, // TODO: okay, we need a 'strings' object
        //   }
        // };

        // googleCalendar.events.patch(patchParams, (err, response) => {
        //   if (err) {
        //     console.log(chalk.red('An error occured during creating the completed work log:'));
        //     return reject(err);
        //   }

        //   console.log(chalk.green(`Work logged: ${response.data.htmlLink}`));
        //   resolve();
        // });
      });

      // Create new event
      await Promise.all([closePreviousLogPromise, logStart(calendarSummary)]);
    }

    else {
      await new Promise((resolve, reject) => {
        const patchParams = {
          calendarId,
          eventId: latestIncompleteWork.id,
          resource: {
            summary: logName,
            end: {
              dateTime: activityTime.toISOString(),
              timeZone,
            }
          },
        };

        googleCalendar.events.patch(patchParams, (err, response) => {
          if (err) {
            console.log(chalk.red('An error occured during updating the work log:'));
            return reject(err);
          }

          console.log(chalk.green(`Work logged: ${response.data.htmlLink}`));
          resolve();
        });
      });
    }
  }

  /**
   * Create a start event in calendar 'calendarSummary'.
   * @param {String} calendarSummary Title of the calendar.
   * @param {String} logName Desired title of the previous start event after calling logEnd.
   */
  async logEnd (calendarSummary = this.calendarSummary, logName = this.strings.activityConcluded) {
    if (typeof logName === 'function') logName = logName(calendarSummary);

    const {
      currentTime: endTime,
      timeZone,
    } = this.getCurrentTime();

    const googleCalendar = await this.calendarConnection,
          calendarId = await this.getCalendarId(googleCalendar, calendarySummary);

    // Get the latest incomplete work log
    const latestIncompleteWork = await new Promise((resolve, reject) => {
      const listParams = {
        calendarId,
        // Google Calendar API doesn't support listing in descending order,
        // we have to specify timeMin and timeMax instead and reverse order later.
        // Assuming you didn't start working more than 1 month ago, this should work:
        timeMin: new Date(+endTime - 1000 * 60 * 60 * 24 * 31).toISOString(),
        timeMax: endTime.toISOString(),
        timeZone,
        singleEvents: true,
        orderBy: 'startTime',
      };

      googleCalendar.events.list(listParams, (err, response) => {
        if (err) {
          console.log(chalk.red('An error occured during listing events:'));
          return reject(err);
        }

        const events = response.data.items;
        if (events.length) {
          // Get the latest log with 'incomplete work' in the description
          const latestIncompleteWork = events.reverse().find(event => event.description.startsWith('incomplete work'));

          if (latestIncompleteWork) {
            resolve(latestIncompleteWork);
          }

          else {
            reject(new Error(`Couldn't create log: no latest incomplete event found in the past 31 days.`));
          }
        }
        else {
          reject(new Error(`Couldn't create log: found no events in the past 31 days.`));
        }
      });
    });

    await new Promise((resolve, reject) => {
      const patchParams = {
        calendarId,
        eventId: latestIncompleteWork.id,
        resource: {
          summary: logName,
          description: `Completed work`,
          end: {
            dateTime: endTime.toISOString(),
            timeZone,
          },
        }
      };

      googleCalendar.events.patch(patchParams, (err, response) => {
        if (err) {
          console.log(chalk.red('An error occured during creating the completed work log:'));
          return reject(err);
        }

        console.log(chalk.green(`Work logged: ${response.data.htmlLink}`));
        resolve();
      });
    });
  }

  async getOrCreateCalendar (googleCalendar, calenderSummary) {
    return await new Promise((resolve, reject) => {
      googleCalendar.calendarList.list({}, (err, response) => {
        if (err) reject(err);
        if (typeof calenderSummary === 'undefined') {
          // TODO: Throw or console error
        }

        const cal = response.data.items.find(item => item.summary === calenderSummary);

        // If Espressivo cal exists, return it
        if (cal) {
          console.log(chalk.green(`Found calendar “${calenderSummary}”`));
          return resolve(cal);
        }

        // If Espressivo cal doesn't exist, create it
        else {
          console.log(chalk.blue(`Creating calendar “${calenderSummary}”`));

          const newCal = {
            resource: {
              summary: calenderSummary,
            },
          };

          googleCalendar.calendars.insert(newCal, (err, response) => {
            if (err) throw err;
            console.log(chalk.green(`Created calendar “${calenderSummary}”`));
            return resolve(response.data);
          });
        }
      });
    });
  }

  get msUntilInactivity () {
    return this.minutesUntilInactivity * 1000 * 60;
  }

  setCredentialsPath (credentialsPath) {
    if (credentialsPath && typeof credentialsPath === 'string') {
      this.credentialsPath = credentialsPath;
    }
  }

  setTokenPath (tokenPath) {
    if (tokenPath && typeof tokenPath === 'string') {
      this.tokenPath = tokenPath;
    }
  }

  setCalendarSummary (calendarSummary) {
    if (calendarSummary && typeof calendarSummary === 'string') {
      this.calendarSummary = calendarSummary;
    }
  }

  setMinutesUntilInactivity (minutes) {
    if (minutes && typeof minutes === 'Number') {
      this.minutesUntilInactivity = minutes;
    }
  }

  setStringsOverrides (stringsOverrides) {
    if (stringsOverrides !== null && typeof stringsOverrides === 'object' && !Array.isArray(stringsOverrides)) {
      this.strings = Object.assign(this.strings, stringsOverrides);
    }
  }

  getStrings () {
    return {
      activityStarted:     projectName => `Started working on ${projectName}`,
      activityInProgress:  projectName => `Working on ${projectName}`,
      activityConcluded:       projectName => `Worked on ${projectName}`,
      changedFile:      fileName => `Changed file ${fileName}`,
      possibleInactivity: (startTime, endTime) => `Possible inactivity detected from ${startTime} to ${endTime}`,
    }
  }

}