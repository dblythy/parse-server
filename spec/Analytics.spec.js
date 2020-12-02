const analyticsAdapter = {
  appOpened: function () {},
  trackEvent: function () {},
};

describe('AnalyticsController', () => {
  it('should track a simple event', done => {
    spyOn(analyticsAdapter, 'trackEvent').and.callThrough();
    reconfigureServer({
      analyticsAdapter,
    })
      .then(() => {
        return Parse.Analytics.track('MyEvent', {
          key: 'value',
          count: '0',
        });
      })
      .then(
        () => {
          expect(analyticsAdapter.trackEvent).toHaveBeenCalled();
          const lastCall = analyticsAdapter.trackEvent.calls.first();
          const args = lastCall.args;
          expect(args[0]).toEqual('MyEvent');
          expect(args[1]).toEqual({
            dimensions: {
              key: 'value',
              count: '0',
            },
          });
          done();
        },
        err => {
          fail(JSON.stringify(err));
          done();
        }
      );
  });

  it('should track a app opened event', done => {
    spyOn(analyticsAdapter, 'appOpened').and.callThrough();
    reconfigureServer({
      analyticsAdapter,
    })
      .then(() => {
        return Parse.Analytics.track('AppOpened', {
          key: 'value',
          count: '0',
        });
      })
      .then(
        () => {
          expect(analyticsAdapter.appOpened).toHaveBeenCalled();
          const lastCall = analyticsAdapter.appOpened.calls.first();
          const args = lastCall.args;
          expect(args[0]).toEqual({
            dimensions: {
              key: 'value',
              count: '0',
            },
          });
          done();
        },
        err => {
          fail(JSON.stringify(err));
          done();
        }
      );
  });
  const hold = new Promise(resolve => {
    setTimeout(() => {
      resolve();
    }, 1000);
  });
  it('should record a slow function', async done => {
    await reconfigureServer({
      slowTracking: {
        timeout: 100,
      },
    });
    Parse.Cloud.define('cloudFunction', async () => {
      await hold;
      return true;
    });
    try {
      await Parse.Cloud.run('cloudFunction');
    } catch (e) {
      expect(e.code).toBe(141);
      expect(e.message).toBe('Script timed out.');
    }
    await hold;
    const query = new Parse.Query('_SlowTracking');
    let slowQuery = await query.first();
    expect(slowQuery).toBeUndefined();
    slowQuery = await query.first({ useMasterKey: true });
    expect(slowQuery.get('functionName')).toBe('cloudFunction');
    expect(slowQuery.get('params')).toEqual({});
    expect(slowQuery.get('error')).toEqual({ message: 'Script timed out.', code: 141 });
    expect(slowQuery.get('events').length).toBe(5);
    expect(slowQuery.get('context')).toEqual({});
    expect(slowQuery.get('timeTaken')).toBeGreaterThan(500);
    expect(slowQuery.get('master')).toBe(false);
    expect(slowQuery.get('installationId')).toBeDefined();
    done();
  });
});
