'use strict';

import Parse from 'parse/node';
import { authenticator } from 'otplib';
import { encrypt, decrypt } from '../../cryptoUtils';
import { hash } from '../../password';

function validateAuthData(authData, { encryptionKey }, user) {
  if (!user || user.get('authData')) {
    throw new Parse.Error(
      Parse.Error.OBJECT_NOT_FOUND,
      'MFA auth is already enabled for this user.'
    );
  }
  const { token, id, recoveryKeys } = authData;
  const result = authenticator.verify({ token: token || '', secret: id });
  if (!token || !id || !result) {
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'MFA auth is invalid for this user.');
  }
  if (
    !recoveryKeys ||
    !Array.isArray(recoveryKeys) ||
    recoveryKeys.length != 2 ||
    recoveryKeys[0].length < 10 ||
    recoveryKeys[1].length < 10
  ) {
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Invalid MFA recovery keys.');
  }
  authData.id = encrypt(id, encryptionKey);
  authData.enabled = true;
  delete authData.token;
  return Promise.all([hash(recoveryKeys[0]), hash(recoveryKeys[1])]).then(keys => {
    authData.recoveryKeys = keys;
    return Promise.resolve();
  });
}
async function loginWithAuthData({ token, recoveryKeys }, { encryptionKey }, user) {
  const authData = (user.get('authData') || {}).mfa;
  if (!authData || !authData.enabled) {
    return;
  }
  if (!token && !recoveryKeys) {
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Please provide your MFA keys to login.');
  }
  const secret = await decrypt(authData.id, encryptionKey);
  if (!authenticator.verify({ token, secret })) {
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Invalid MFA token.');
  }
}

function validateAppId() {
  return Promise.resolve();
} // A promisey wrapper for api requests

module.exports = {
  validateAppId,
  validateAuthData,
  loginWithAuthData,
};
