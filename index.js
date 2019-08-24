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
   * @param {Number} [options.minutesUntilInactivity=10] How much time can exist between logged activities, before the log gets interrupted.
   * @param {Object} [options.strings={}] Strings overrides.
   * @param {Boolean} [options.showLinks=false] Print links to events in the CLI?
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
      showLinks = false,
    } = options;

    this.setCredentialsPath(credentialsPath);
    this.setTokenPath(tokenPath);
    this.setCalendarSummary(calendarSummary);
    this.setMinutesUntilInactivity(minutesUntilInactivity);
    this.setStringsOverrides(stringsOverrides);
    this.setShowLinks(showLinks);

    // Init Google Calendar connection
    this.initCalendarConnection();
  }

  /***********************************************
   * Default setters
   **********************************************/

  setDefaults () {
    this.minutesUntilInactivity = 10;
    this.strings = this.getDefaultStrings();
  }

  getDefaultStrings () {
    return {
      activityStarted:              projectName => `Started working on ${projectName}`,
      activityInProgress:           projectName => `Working on ${projectName}`,
      activityConcluded:            projectName => `Worked on ${projectName}`,
      activityLogged:               projectName => `Activity in ${projectName}`,
      closedDueToInactivity:        projectName => `(closed due to inactivity)`,
    }
  }


  /***********************************************
   * Option setters
   **********************************************/

  setCredentialsPath (credentialsPath) {
    if (typeof credentialsPath === 'string' && credentialsPath !== '') {
      this.credentialsPath = credentialsPath;
    }
    else {
      throw new Error(`✗ Missing or incorrect value for required option 'credentialsPath'`);
    }
  }

  setTokenPath (tokenPath) {
    if (typeof tokenPath === 'string' && tokenPath !== '') {
      this.tokenPath = tokenPath;
    }
    else {
      throw new Error(`✗ Missing or incorrect value for required option 'tokenPath'`);
    }
  }

  setCalendarSummary (calendarSummary) {
    if (typeof calendarSummary === 'string' && calendarSummary !== '') {
      this.calendarSummary = calendarSummary;
    }
    else {
      throw new Error(`✗ Missing or incorrect value for required option 'calendar'`);
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

  setShowLinks (showLinks) {
    if (typeof showLinks === 'boolean') {
      this.showLinks = showLinks;
    }
  }


  /***********************************************
   * Authorization & Google Calendar connection
   **********************************************/

  initCalendarConnection () {
    this.calendarConnection = new Promise(async (resolve, reject) => {
      try {
        const auth = await googleAPIGetAuth(this.credentialsPath, this.tokenPath);

        const googleCalendar = google.calendar({
          version: 'v3',
          auth
        });

        const calendar = await this.getOrCreateCalendar(googleCalendar);
        this.calendarId = calendar.id;

        resolve(googleCalendar);
      }

      catch (err) {
        console.error(chalk.red(`✗ Could not establish connection with Google Calendar API.`));
        reject(err);
      }
    });
  }

  async getOrCreateCalendar (googleCalendar) {
    return new Promise((resolve, reject) => {
      googleCalendar.calendarList.list({}, (err, response) => {
        if (err) {
          return reject(err);
        }

        const { calendarSummary } = this,
              calendar = response.data.items.find(item => item.summary === calendarSummary);

        // If cal exists, return it
        if (calendar) {
          console.log(chalk.green(`Found calendar “${calendarSummary}”.`)); // TODO: too verbose?
          return resolve(calendar);
        }

        // If cal doesn't exist, create it
        else {
          console.log(chalk.blue(`Creating calendar “${calendarSummary}”.`));

          const newCal = {
            resource: {
              summary: calendarSummary,
            },
          };

          googleCalendar.calendars.insert(newCal, (err, response) => {
            if (err) {
              return reject(err);
            }

            console.log(chalk.green(`✔ Created calendar “${calenderSummary}”.`));
            return resolve(response.data);
          });
        }
      });
    });
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
   * Create a start event
   */
  async logStart () {
    const googleCalendar = await this.calendarConnection,
          logName = this.getLogName(this.strings.activityStarted);

    const {
      timeZone,
      currentTime: startTime,
    } = this.getCurrentTime();

    // Create starting event
    const eventParams = {
      calendarId: this.calendarId,
      resource: {
        summary: logName,
        description: this.addToDescription(startTime, logName),
        start: {
          dateTime: startTime.toISOString(),
          timeZone,
        },
        end: {
          // Set initial duration of 1 second
          dateTime: new Date(+startTime + 1000).toISOString(),
          timeZone,
        },
        extendedProperties: {
          private: {
            completed: 'false',
          },
        },
      },
    };

    return new Promise((resolve, reject) => {
      googleCalendar.events.insert(eventParams, (err, response) => {
        if (err) {
          console.log(chalk.red(`✗ There was an error creating a start event.`));
          return reject(err);
        }

        const linkOrDot = (this.showLinks === true) ? `: ${response.data.htmlLink}.` : '.';
        console.log(chalk.green(`✔ Start event created${linkOrDot}`));
        resolve();
      });
    });
  }

  /**
   * Log activity
   */
  async logActivity (activityDescription = this.strings.activityLogged) {
    const googleCalendar = await this.calendarConnection,
          logName = this.getLogName(this.strings.activityInProgress);

    const {
      currentTime: activityTime,
      timeZone,
    } = this.getCurrentTime();

    // Get the latest incomplete work log event
    const latestIncompleteLogEvent = await this.getLatestIncompleteLogEvent(activityTime, timeZone);

    // Check for inactivity
    const inactivityDetected = this.hasInactivity(latestIncompleteLogEvent, activityTime);

    if (inactivityDetected) {
      // End previous log first
      await this.logEndDueToInactivity(latestIncompleteLogEvent, activityTime);

      // Then start new, so we don't accidentally immediately end the newly started log
      await this.logStart();

      // Then log the activity after all
      await this.logActivity(activityDescription);
    }

    else {
      const patchParams = {
        calendarId: this.calendarId,
        eventId: latestIncompleteLogEvent.id,
        resource: {
          summary: logName,
          description: this.addToDescription(activityTime, activityDescription, latestIncompleteLogEvent.description),
          end: {
            dateTime: activityTime.toISOString(),
            timeZone,
          },
          extendedProperties: {
            private: {
              completed: 'false',
            },
          },
        },
      };

      return new Promise((resolve, reject) => {
        googleCalendar.events.patch(patchParams, (err, response) => {
          if (err) {
            console.log(chalk.red('✗ An error occured during updating the work log.'));
            return reject(err);
          }

          const linkOrDot = (this.showLinks === true) ? `: ${response.data.htmlLink}.` : '.';
          console.log(chalk.green(`✔ Work logged${linkOrDot}`));
          resolve();
        });
      });
    }
  }

  /**
   * Conclude timelog.
   */
  async logEnd () {
    const googleCalendar = await this.calendarConnection,
          logName = this.getLogName(this.strings.activityConcluded);;

    const {
      currentTime: endTime,
      timeZone,
    } = this.getCurrentTime();

    const concludedLogName = this.getLogName(this.strings.activityConcluded);

    // Get the latest incomplete work log event
    const latestIncompleteLogEvent = await this.getLatestIncompleteLogEvent(endTime, timeZone);

    // Check for inactivity
    const inactivityDetected = this.hasInactivity(latestIncompleteLogEvent, endTime);

    if (inactivityDetected) {
      // End the previous log
      await this.logEndDueToInactivity(latestIncompleteLogEvent, endTime);
    }

    else {
      const patchParams = {
        calendarId: this.calendarId,
        eventId: latestIncompleteLogEvent.id,
        resource: {
          summary: logName,
          description: this.addToDescription(endTime, concludedLogName, latestIncompleteLogEvent.description),
          end: {
            dateTime: endTime.toISOString(),
            timeZone,
          },
          extendedProperties: {
            private: {
              completed: 'true',
            },
          },
        }
      };

      return new Promise((resolve, reject) => {
        googleCalendar.events.patch(patchParams, (err, response) => {
          if (err) {
            console.log(chalk.red('✗ An error occured during creating the completed work log.'));
            return reject(err);
          }

          const linkOrDot = (this.showLinks === true) ? `: ${response.data.htmlLink}.` : '.';
          console.log(chalk.green(`✔ Work logged${linkOrDot}`));
          resolve();
        });
      });
    }
  }

  async logEndDueToInactivity (latestIncompleteLogEvent, activityTime) {
    console.log(chalk.blue(`Inactivity detected, ending previous log and creating a new one.`));

    const googleCalendar = await this.calendarConnection,
          concludedLogName = this.getLogName(this.strings.activityConcluded),
          closedDueToInactivity = this.getLogName(this.strings.closedDueToInactivity);

    const patchParams = {
      calendarId: this.calendarId,
      eventId: latestIncompleteLogEvent.id,
      resource: {
        summary: concludedLogName,
        description: this.addToDescription(activityTime, `${concludedLogName} ${closedDueToInactivity}`, latestIncompleteLogEvent.description),
        extendedProperties: {
          private: {
            completed: 'true',
          },
        },
      },
    };

    return new Promise((resolve, reject) => {
      googleCalendar.events.patch(patchParams, (err, response) => {
        if (err) {
          console.log(chalk.red('✗ An error occured during creating the completed work log.'));
          return reject(err);
        }

        const linkOrDot = (this.showLinks === true) ? `: ${response.data.htmlLink}.` : '.';
        console.log(chalk.green(`✔ Work logged${linkOrDot}`));
        resolve();
      });
    });
  }

  async getLatestIncompleteLogEvent (currentTime, timeZone) {
    const googleCalendar = await this.calendarConnection;

    const listParams = {
      calendarId: this.calendarId,
      // Google Calendar API doesn't support listing in descending order,
      // we have to specify timeMin and timeMax instead and reverse order later.
      // Assuming you didn't start working more than 1 month ago, this should work:
      timeMin: new Date(+currentTime - 1000 * 60 * 60 * 24 * 7).toISOString(),
      timeMax: currentTime.toISOString(),
      timeZone,
      singleEvents: true,
      orderBy: 'startTime',
    };

    // Get the latest incomplete work log
    return new Promise((resolve, reject) => {
      googleCalendar.events.list(listParams, (err, response) => {
        if (err) {
          console.log(chalk.red('✗ An error occured during listing events.'));
          return reject(err);
        }

        const events = response.data.items;
        if (events.length) {
          // Find the latest incomplete log
          const latestIncompleteLogEvent = events.reverse().find((event) => {
            try {
              const { completed } = event.extendedProperties.private;
              return completed === 'false';
            } catch (err) {}
          });

          if (latestIncompleteLogEvent) {
            resolve(latestIncompleteLogEvent);
          }
          else {
            console.log(chalk.red(`✗ Couldn't create log.`));
            reject(new Error(`No latest incomplete event found in the past 7 days.`));
          }
        }
        else {
          console.log(chalk.red(`✗ Couldn't create log.`));
          reject(new Error(`Found no events in the past 7 days.`));
        }
      });
    });
  }

  addToDescription (date, activity, description = '') {
    // If not empty description, add newline
    if (description !== '') description += `\n`;

    const hh = `0${date.getHours()}`.slice(-2),
          mm = `0${date.getMinutes()}`.slice(-2);

    // Add the new activity
    description += `${hh}:${mm} – ${activity}`;
    return description;
  }

  getLogName (logName) {
    return (typeof logName === 'function') ? logName(this.calendarSummary) : logName;
  }

  hasInactivity (latestIncompleteLogEvent, currentTime) {
    // Check for inactivity
    const lastActivity = +new Date(latestIncompleteLogEvent.updated || latestIncompleteLogEvent.created);
    return (+currentTime - lastActivity) > this.msUntilInactivity;
  }

}