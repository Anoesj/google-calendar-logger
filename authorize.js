// https://developers.google.com/calendar/quickstart/nodejs
// NOTE: Slightly modded by Anoesj Sadraee

'use strict';

const fs = require('fs').promises,
      readline = require('readline'),
      chalk = require('chalk'),
      { google } = require('googleapis');

// If modifying these scopes, delete token.json.
const SCOPES = ['https://www.googleapis.com/auth/calendar'];

/**
 * Create an OAuth2 client with the given credentials, and then resolve
 * with the OAuth2 object.
 * @param {String} credentialsPath Path where custom credentials.json is placed. Never commit this file!
 * @param {String} tokenPath Path where token.json should be placed. This file stores the user's access and refresh tokens, and is created automatically when the authorization flow completes for the first time. Never commit this file!
 */
async function authorize (credentialsPath, tokenPath) {
  // Load client secrets from a local file.
  let credentials;
  try {
    credentials = await fs.readFile(credentialsPath);
    credentials = JSON.parse(credentials);
  }

  catch (err) {
    console.log(chalk.red(`✗ Error loading client secret file, no credentials.json found at ${credentialsPath}`));
    throw err;
  }

  const { client_secret, client_id, redirect_uris } = credentials.installed;
  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

  // Check if we have previously stored a token.
  try {
    const token = await fs.readFile(tokenPath)
    oAuth2Client.setCredentials(JSON.parse(token));
    return oAuth2Client;
  }

  catch (err) {
    console.log(chalk.yellow('No token.json found, complete the following instructions to proceed.'));
    await getAccessToken(oAuth2Client, tokenPath);
  }
}

/**
 * Get and store new token after prompting for user authorization, and then
 * resolve with the OAuth2 object.
 * @param {google.auth.OAuth2} oAuth2Client The OAuth2 client to get token for.
 * @param {String} tokenPath Path where token.json should be placed. This file stores the user's access and refresh tokens, and is created automatically when the authorization flow completes for the first time. Never commit this file!
 */
async function getAccessToken (oAuth2Client, tokenPath) {
  const authURL = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
  });

  console.log(chalk.yellow('Authorize this app by visiting this URL:'), authURL);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve, reject) => {
    rl.question('Enter the code from that page here:', (code) => {
      rl.close();

      oAuth2Client.getToken(code, async (err, token) => {
        if (err) {
          console.log(chalk.red('✗ Error retrieving access token', err));
          return reject(err);
        }

        oAuth2Client.setCredentials(token);

        try {
          // Store the token to disk for later program executions
          await fs.writeFile(tokenPath, JSON.stringify(token));
          console.log(chalk.green('✔ Token stored to', tokenPath));
        }

        catch (err) {
          return reject(err);
        }

        return resolve(oAuth2Client);
      });
    });

    // This is commented for now, because it still rejects the Promise after the rl is filled in and closed.
    // rl.on('close', () => {
    //   console.log(chalk.red('\nStopped'));
    //   return reject();
    // });
  });
}

module.exports = authorize;