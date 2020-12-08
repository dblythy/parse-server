'use strict';
const Parse = require('parse/node');
const request = require('../lib/request');
const otplib = require('otplib');

function login(username, password, authData) {
  let req = `http://localhost:8378/1/login?username=${username}&password=${password}`;
  if (authData) {
    req += `&authData=${JSON.stringify(authData)}`;
  }
  return request({
    method: 'POST',
    url: req,
    headers: {
      'X-Parse-Application-Id': Parse.applicationId,
      'X-Parse-REST-API-Key': 'rest',
      'Content-Type': 'application/json',
    },
  });
}

describe('MFA', () => {
  it('can enable', async () => {
    await reconfigureServer({
      auth: { mfa: { encryptionKey: '89E4AFF1-DFE4-4603-9574-BFA16BB446FD' } },
    });
    const user = await Parse.User.signUp('username', 'password');
    const secret = otplib.authenticator.generateSecret();
    let token = otplib.authenticator.generate(secret); // this token would be generated from authenticator
    await user.linkWith('mfa', {
      authData: {
        recoveryKeys: ['014124010481042', '3214081840284'],
        token,
        id: secret,
      },
    });
    await user.fetch();

    await Parse.User.logOut();
    try {
      await Parse.User.logIn('username', 'password');
      fail('should not be able to login without mfa.');
    } catch (e) {
      expect(e.message).toBe('Please provide your MFA keys to login.');
    }
    token = otplib.authenticator.generate(secret); // this token would be generated from authenticator

    const userAfter = await login('username', 'password', {
      mfa: { token },
    });
    expect(user.id).toBe(userAfter.data.objectId);
  });
});
