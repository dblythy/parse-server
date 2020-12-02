import AdaptableController from './AdaptableController';
import { AnalyticsAdapter } from '../Adapters/Analytics/AnalyticsAdapter';
import Parse from 'parse/node';
const { performance } = require('perf_hooks');
export class AnalyticsController extends AdaptableController {
  appOpened(req) {
    return Promise.resolve()
      .then(() => {
        return this.adapter.appOpened(req.body, req);
      })
      .then(response => {
        return { response: response || {} };
      })
      .catch(() => {
        return { response: {} };
      });
  }

  trackEvent(req) {
    return Promise.resolve()
      .then(() => {
        return this.adapter.trackEvent(req.params.eventName, req.body, req);
      })
      .then(response => {
        return { response: response || {} };
      })
      .catch(() => {
        return { response: {} };
      });
  }
  async analyseEvent(req) {
    const { request, start, end, error, success, events, config } = req;
    let { trackData } = req;
    if (!config.slowTracking || !config.slowTracking.timeout) {
      return;
    }
    const timeout = config.slowTracking.timeout;
    const timeTaken = end - start;
    if (timeTaken < timeout) {
      return;
    }
    let lastEvent = null;
    const eventCopy = [];

    for (const evt of events) {
      const evtCopy = Object.assign({}, evt);
      const time = evt.time;
      if (lastEvent == null) {
        lastEvent = time;
      }
      evtCopy.time = Math.round(time - lastEvent);
      evtCopy.name = evt.name;
      eventCopy.push(evtCopy);
      lastEvent = time;
    }
    const { functionName, user, master, params, installationId, context } = request;
    if (!trackData) {
      trackData = new Parse.Object('_SlowTracking');
    }
    if (functionName) {
      trackData.set('functionName', functionName);
      trackData.set('params', params);
    }
    if (error) {
      trackData.set('error', error);
    } else if (trackData.get('result') == null && trackData.get('error') == null) {
      trackData.set('result', success ? true : false);
    }
    trackData.set('timeTaken', timeTaken);
    trackData.set('events', eventCopy);
    trackData.set('user', user);
    trackData.set('master', master);
    trackData.set('installationId', installationId);
    trackData.set('context', context);
    trackData.setACL(new Parse.ACL());
    return await trackData.save(null, { useMasterKey: true });
  }
  pushEvent(events, name) {
    events.push({ name, time: performance.now() });
  }

  expectedAdapterType() {
    return AnalyticsAdapter;
  }
}

export default AnalyticsController;
