// FunctionsRouter.js

var Parse = require('parse/node').Parse,
  triggers = require('../triggers');
const { performance } = require('perf_hooks');

import PromiseRouter from '../PromiseRouter';
import { promiseEnforceMasterKeyAccess, promiseEnsureIdempotency } from '../middlewares';
import { jobStatusHandler } from '../StatusHandler';
import _ from 'lodash';
import { logger } from '../logger';

function parseObject(obj) {
  if (Array.isArray(obj)) {
    return obj.map(item => {
      return parseObject(item);
    });
  } else if (obj && obj.__type == 'Date') {
    return Object.assign(new Date(obj.iso), obj);
  } else if (obj && obj.__type == 'File') {
    return Parse.File.fromJSON(obj);
  } else if (obj && typeof obj === 'object') {
    return parseParams(obj);
  } else {
    return obj;
  }
}

function parseParams(params) {
  return _.mapValues(params, parseObject);
}

export class FunctionsRouter extends PromiseRouter {
  mountRoutes() {
    this.route(
      'POST',
      '/functions/:functionName',
      promiseEnsureIdempotency,
      FunctionsRouter.handleCloudFunction
    );
    this.route(
      'POST',
      '/jobs/:jobName',
      promiseEnsureIdempotency,
      promiseEnforceMasterKeyAccess,
      function (req) {
        return FunctionsRouter.handleCloudJob(req);
      }
    );
    this.route('POST', '/jobs', promiseEnforceMasterKeyAccess, function (req) {
      return FunctionsRouter.handleCloudJob(req);
    });
  }

  static handleCloudJob(req) {
    const jobName = req.params.jobName || req.body.jobName;
    const applicationId = req.config.applicationId;
    const jobHandler = jobStatusHandler(req.config);
    const jobFunction = triggers.getJob(jobName, applicationId);
    if (!jobFunction) {
      throw new Parse.Error(Parse.Error.SCRIPT_FAILED, 'Invalid job.');
    }
    let params = Object.assign({}, req.body, req.query);
    params = parseParams(params);
    const request = {
      params: params,
      log: req.config.loggerController,
      headers: req.config.headers,
      ip: req.config.ip,
      jobName,
      message: jobHandler.setMessage.bind(jobHandler),
    };

    return jobHandler.setRunning(jobName, params).then(jobStatus => {
      request.jobId = jobStatus.objectId;
      // run the function async
      process.nextTick(() => {
        Promise.resolve()
          .then(() => {
            return jobFunction(request);
          })
          .then(
            result => {
              jobHandler.setSucceeded(result);
            },
            error => {
              jobHandler.setFailed(error);
            }
          );
      });
      return {
        headers: {
          'X-Parse-Job-Status-Id': jobStatus.objectId,
        },
        response: {},
      };
    });
  }

  static createResponseObject(resolve, reject) {
    return {
      success: function (result) {
        resolve({
          response: {
            result: Parse._encode(result),
          },
        });
      },
      error: function (message) {
        const error = triggers.resolveError(message);
        reject(error);
      },
    };
  }

  static async handleCloudFunction(req) {
    let functionName, userString, cleanInput, params, request, trackData;
    const start = performance.now();
    const events = [];
    req.config.analyticsController.pushEvent(events, '(Parse) function called');
    const promise = async () => {
      functionName = req.params.functionName;
      const applicationId = req.config.applicationId;
      const theFunction = triggers.getFunction(functionName, applicationId);

      if (!theFunction) {
        throw new Parse.Error(Parse.Error.SCRIPT_FAILED, `Invalid function: "${functionName}"`);
      }
      params = Object.assign({}, req.body, req.query);
      params = parseParams(params);
      request = {
        params: params,
        master: req.auth && req.auth.isMaster,
        user: req.auth && req.auth.user,
        installationId: req.info.installationId,
        log: req.config.loggerController,
        headers: req.config.headers,
        ip: req.config.ip,
        functionName,
        context: req.info.context,
      };
      req.config.analyticsController.pushEvent(events, '(Parse) function decoding');
      userString = req.auth && req.auth.user ? req.auth.user.id : undefined;
      cleanInput = logger.truncateLogMessage(JSON.stringify(params));
      await triggers.maybeRunValidator(request, functionName);
      req.config.analyticsController.pushEvent(events, 'cloud validator');
      const functionResult = await theFunction(request);
      req.config.analyticsController.pushEvent(events, 'cloud function');
      const result = {
        response: {
          result: Parse._encode(functionResult),
        },
      };
      req.config.analyticsController.pushEvent(events, '(Parse) response encoding');
      const cleanResult = logger.truncateLogMessage(JSON.stringify(result.response.result));
      logger.info(
        `Ran cloud function ${functionName} for user ${userString} with:\n  Input: ${cleanInput}\n  Result: ${cleanResult}`,
        {
          functionName,
          params,
          user: userString,
        }
      );
      const end = performance.now();
      req.config.analyticsController
        .analyseEvent({
          config: req.config,
          request,
          success: true,
          start,
          end,
          events,
          trackData,
        })
        .then(obj => {
          trackData = obj;
        });
      return result;
    };
    try {
      return await triggers.timeoutFunction(promise(), req.config);
    } catch (e) {
      const error = triggers.resolveError(e);
      logger.error(
        `Failed running cloud function ${functionName} for user ${userString} with:\n  Input: ${cleanInput}\n  Error: ` +
          JSON.stringify(error),
        {
          functionName,
          error,
          params,
          user: userString,
        }
      );
      const end = performance.now();
      req.config.analyticsController
        .analyseEvent({
          config: req.config,
          request,
          error,
          start,
          end,
          events,
          trackData,
        })
        .then(obj => {
          trackData = obj;
        });
      throw error;
    }
  }
}
