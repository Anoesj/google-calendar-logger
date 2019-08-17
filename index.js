'use strict';

const { google } = require('googleapis'),
      googleAPIGetAuth = require('./authorize.js'),
      chalk = require('chalk'),
      moment = require('moment-timezone');

/** Google Calendar Logger */
module.exports = class GoogleCalendarLogger {

  /**
   * Create a Google Calendar Logger instance
   * @param {Object} options
   * @param {String} options.credentialsPath Path to credentials.json (generate here: https://developers.google.com/calendar/quickstart/nodejs)
   * @param {String} options.tokenPath Path to where token.json should be placed (including filename + .json)
   * @param {String} options.calendar How much time can exist between logged activities, before the log gets interrupted.
   * @param {Number} [options.minutesUntilInactivity=30] How much time can exist between logged activities, before the log gets interrupted.
   * @param {Object} [options.strings={}] Strings overrides.
   */
  constructor (options) {
    this.setDefaults();

    const {
      // Required
      credentialsPath,
      tokenPath,
      calendar: calendarSummary,

      // Optional
      minutesUntilInactivity,
      strings: stringsOverrides = {},
    } = options;

    this.setCredentialsPath(credentialsPath);
    this.setTokenPath(tokenPath);
    this.setCalendarSummary(calendarSummary);
    this.setMinutesUntilInactivity(minutesUntilInactivity);
    this.setStringsOverrides(stringsOverrides);

    // Init Google Calendar connection
    this.initCalendarConnection();
  }

  /***********************************************
   * Default setters
   **********************************************/

  setDefaults () {
    this.minutesUntilInactivity = 30;
    this.strings = this.getDefaultStrings();
  }

  getDefaultStrings () {
    return {
      activityStarted:      projectName => `Started working on ${projectName}`,
      activityInProgress:   projectName => `Working on ${projectName}`,
      activityConcluded:    projectName => `Worked on ${projectName}`,
      changedFile:          fileName => `Changed file ${fileName}`,
      possibleInactivity:   (startTime, endTime) => `Possible inactivity detected from ${startTime} to ${endTime}`,
    }
  }

  /***********************************************
   * Option setters
   **********************************************/

  setCredentialsPath (value) {
    if (typeof value === 'string' && value !== '') {
      this.credentialsPath = value;
    }
    else {
      throw new Error(`Missing or incorrect value for required option 'credentialsPath'`);
    }
  }

  setTokenPath (value) {
    if (typeof value === 'string' && value !== '') {
      this.tokenPath = value;
    }
    else {
      throw new Error(`Missing or incorrect value for required option 'tokenPath'`);
    }
  }

  setCalendarSummary (value) {
    if (typeof value === 'string' && value !== '') {
      this.calendarSummary = value;
    }
    else {
      throw new Error(`Missing or incorrect value for required option 'calendar'`);
    }
  }

  setMinutesUntilInactivity (minutes) {
    if (typeof minutes === 'number' && minutes > 0) {
      this.minutesUntilInactivity = minutes;
    }
  }

  setStringsOverrides (stringsOverrides) {
    if (stringsOverrides !== null && typeof stringsOverrides === 'object' && !Array.isArray(stringsOverrides)) {
      this.strings = Object.assign(this.strings, stringsOverrides);
    }
  }

  /***********************************************
   * Authorization & Google Calendar connection
   **********************************************/

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

  async getOrCreateCalendar (googleCalendar, calenderSummary) {
    return await new Promise((resolve, reject) => {
      googleCalendar.calendarList.list({}, (err, response) => {
        if (err) reject(err);
        if (calenderSummary === null || calenderSummary === '' || typeof calenderSummary === 'undefined') {
          // TODO: Throw or console error
        }

        const cal = response.data.items.find(item => item.summary === calenderSummary);

        // If cal exists, return it
        if (cal) {
          console.log(chalk.green(`Found calendar “${calenderSummary}”`));
          return resolve(cal);
        }

        // If cal doesn't exist, create it
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

  async getCalendarId (googleCalendar, calendarSummary) {
    const timelogCalendar = await this.getOrCreateCalendar(googleCalendar, calendarSummary);
    return timelogCalendar.id;
  }

  /***********************************************
   *  Helpers
   **********************************************/

  get msUntilInactivity () {
    return this.minutesUntilInactivity * 1000 * 60;
  }

  getCurrentTime () {
    return {
      currentTime: new Date(),
      timeZone: moment.tz.guess(),
    };
  }

  /***********************************************
   * Log methods
   *
   * These are the methods by people who
   * install this module will actually use.
   **********************************************/

  /**
   * Create a start event in calendar 'calendarSummary'.
   * @param {String} calendarSummary Title of the calendar.
   * @param {String} logName Desired title of the start event.
   */
  async logStart (calendarSummary = this.calendarSummary, logName = this.strings.activityStarted) {
    if (typeof logName === 'function') logName = logName(calendarSummary);

    const googleCalendar = await this.calendarConnection,
          calendarId = await this.getCalendarId(googleCalendar, calendarySummary);

    const {
      timeZone,
      currentTime: startTime,
    } = this.getCurrentTime();

    // Create starting event
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

    const googleCalendar = await this.calendarConnection,
          calendarId = await this.getCalendarId(googleCalendar, calendarySummary);

    const {
      currentTime: activityTime,
      timeZone,
    } = this.getCurrentTime();

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

    const googleCalendar = await this.calendarConnection,
          calendarId = await this.getCalendarId(googleCalendar, calendarySummary);

    const {
      currentTime: endTime,
      timeZone,
    } = this.getCurrentTime();

    // Get the latest incomplete work log
    const latestIncompleteWork = await new Promise((resolve, reject) => {
      googleCalendar.events.list(
        {
          calendarId,
          // Google Calendar API doesn't support listing in descending order,
          // we have to specify timeMin and timeMax instead and reverse order later.
          // Assuming you didn't start working more than 1 month ago, this should work:
          timeMin: new Date(+endTime - 1000 * 60 * 60 * 24 * 31).toISOString(),
          timeMax: endTime.toISOString(),
          timeZone,
          singleEvents: true,
          orderBy: 'startTime',
        },
        (err, response) => {
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
        }
      );
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

}