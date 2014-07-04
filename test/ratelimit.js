process.env.NODE_ENV = 'test';
// IMPORTANT NOTES
// redis db is flushed frequently, so make sure that won't interfere with any of your other test scripts
// Some sections do a dump/reset on "beforeEach" while others only run on "before" in order to carry results between tests, so keep that in mind if new tests are behaving oddly
// Tests could theoretically fail if a server hits some serious lag and "second" increment tests that expect an error get delayed.

// TODO:
// - check all results work instead of just second to last (in most cases)

var should = require('should');
var actionheroPrototype = require('actionhero').actionheroPrototype;
var actionhero = new actionheroPrototype();
var api;

var async = require('async');
var error_blocked = "API limit exceeded";

var all;
var testAction = "checkLimit";
var params = {}; // params sent to our testAction

// reset everything back to expected default test state
var do_reset = function(done){
    api.env.should.equal('test');
    process.env.NODE_ENV.should.equal('test');
    should.exist(api.id);
    api.redis.client.flushdb(done);
    
    api.config.ratelimit.enabled = true; // if you're running this test file, ratelimit should be enabled.
    
    // apply limits to specific actions
    api.config.ratelimit.actions = {};
    api.config.ratelimit.actions[testAction] = {day:15,minute:7,second:3};
    api.ratelimit.init();
    
    api.ratelimit.removeOnLimit();
      
    api.ratelimit.getKey = function(api, connection, actionTemplate, cb) {
      return cb(null, connection.remoteIP);
    };
      
  };
  
describe('ratelimit', function(){

  before(function(done){
    actionhero.start(function(err, a){
      api = a;
      done();
      all = api.config.ratelimit.all_key;
      // dump function for quickly debugging tests
      api.logob = function(label, obj, level) {
        var cache = [];
        var str = JSON.stringify(obj, function(key, value) {
            if (typeof value === 'object' && value !== null) {
                if (cache.indexOf(value) !== -1) {
                    // Circular reference found, discard key
                    return;
                }
                // Store value in our collection
                cache.push(value);
            }
            return value;
        }, 2);
        cache = null;

        api.log(label + ":\r\n"+str, level);
      }
    })
  });

  after(function(done){
    actionhero.stop(function(err){
      done();
    });
  });
  
  describe("second period", function() {
    before(do_reset);
    
    it('should work until limit exceeded', function(done){
      api.config.ratelimit.actions = {};
      api.config.ratelimit.actions[testAction] = {minute:100, second:3};
      api.ratelimit.init();
      
      async.times(api.config.ratelimit.actions[testAction].second+1, function(n, next) {
        api.specHelper.runAction(testAction, params, function(res, conn){
          next(null, res);
        });
      },
      function(err, results) {
        // last element should be an error
        var res = results[results.length - 1];
        res.should.have.property('error').equal(error_blocked);
        res.should.not.have.property('periods');
        res.should.not.have.property('actions');
        
        // second to last element should have been successful
        res = results[results.length - 2];
        res.should.not.have.property('error');
        res.should.have.property('periods').equal(api.config.ratelimit.periods);
        res.should.have.property('actions').equal(api.config.ratelimit.actions);

        done();
      });
    });
    
    it('should allow keys to expire even when called repeatedly under the limit', function(done){
      setTimeout(function() { // wait for reset
        // first calls should work
        async.times(api.config.ratelimit.actions[testAction].second-1, function(n, next) {
          api.specHelper.runAction(testAction, params, function(res, conn){
            res.should.not.have.property('error');
            res.should.have.property('periods').equal(api.config.ratelimit.periods);
            res.should.have.property('actions').equal(api.config.ratelimit.actions);
            next(null, res);
          });
        }),
        
        // last call under limit should work half a second
        setTimeout(function() {
          api.specHelper.runAction(testAction, params, function(res, conn){
            res.should.not.have.property('error');
            res.should.have.property('periods').equal(api.config.ratelimit.periods);
            res.should.have.property('actions').equal(api.config.ratelimit.actions);
          });
        }, 500);
        
        // next call half a second after that should still work because timer should have reset
        setTimeout(function() {
          api.specHelper.runAction(testAction, params, function(res, conn){
            res.should.not.have.property('error');
            res.should.have.property('periods').equal(api.config.ratelimit.periods);
            res.should.have.property('actions').equal(api.config.ratelimit.actions);
            done();
          });
        }, 1005);
        
      }, 1005); // wait for reset
    });
  });
  
  describe("minute period", function() {
    beforeEach(do_reset);
    
    it('should work until limit exceeded', function(done){
      api.config.ratelimit.actions = {};
      api.config.ratelimit.actions[testAction] = {minute:6, second:1000};
      api.ratelimit.init();
      
      async.times(api.config.ratelimit.actions[testAction].minute+1, function(n, next) {
        api.specHelper.runAction(testAction, params, function(res, conn){
          next(null, res);
        });
      },
      function(err, results) {
        // last element should be an error
        var res = results[results.length - 1];
        res.should.have.property('error').equal(error_blocked);
        res.should.not.have.property('periods');
        res.should.not.have.property('actions');
        
        // second to last element should have been successful
        var res = results[results.length - 2];
        res.should.not.have.property('error');
        res.should.have.property('periods').equal(api.config.ratelimit.periods);
        res.should.have.property('actions').equal(api.config.ratelimit.actions);

        done();
      });
    });
  });
  
  describe("(all) limits", function() {
    beforeEach(do_reset);
    
    it('should work until limit exceeded', function(done){
      api.config.ratelimit.actions = {};
      api.config.ratelimit.actions[testAction] = {minute:40, second:20};
      api.config.ratelimit.actions[all] = {minute:10, second:4};
      api.ratelimit.init();
      
      async.times(api.config.ratelimit.actions[all].second+1, function(n, next) {
        api.specHelper.runAction(testAction, params, function(res, conn){
          next(null, res);
        });
      },
      function(err, results) {
        // last element should be an error
        var res = results[results.length - 1];
        res.should.have.property('error').equal(error_blocked);
        res.should.not.have.property('periods');
        res.should.not.have.property('actions');
        
        // second to last element should have been successful
        var res = results[results.length - 2];
        res.should.not.have.property('error');
        res.should.have.property('periods').equal(api.config.ratelimit.periods);
        res.should.have.property('actions').equal(api.config.ratelimit.actions);

        done();
      });
    });
    
    it('should not override specific action limits', function(done){
      api.config.ratelimit.actions = {};
      api.config.ratelimit.actions[all] = {minute:40, second:20};
      api.config.ratelimit.actions[testAction] = {minute:10, second:4};
      api.ratelimit.init();
      
      async.times(api.config.ratelimit.actions[testAction].second+1, function(n, next) {
        api.specHelper.runAction(testAction, params, function(res, conn){
          next(null, res);
        });
      },
      function(err, results) {
        // last element should be an error
        var res = results[results.length - 1];
        res.should.have.property('error').equal(error_blocked);
        res.should.not.have.property('periods');
        res.should.not.have.property('actions');
        
        // second to last element should have been successful
        var res = results[results.length - 2];
        res.should.not.have.property('error');
        res.should.have.property('periods').equal(api.config.ratelimit.periods);
        res.should.have.property('actions').equal(api.config.ratelimit.actions);

        done();
      });
    });
  });
  
  describe("onLimit handlers", function() {
    before(do_reset);
    
    it('can be added', function(done){
      // early priority
      api.ratelimit.addOnLimit(function(data, callback) {
        // here we'll also check that we got valid data from the caller
        // Expecting data to be: {action:actionTemplate.name, key:key, period:param.period, attempts: current, limit:param.limit, api:api, connection:connection, actionTemplate:actionTemplate}
        data.api.should.have.property('config');
        data.connection.should.have.property('remoteIP');
        data.actionTemplate.should.have.property('name');
        
        data.action.should.equal(testAction);
        data.should.have.property("key").equal(data.connection.remoteIP);
        data.should.have.property("period");
        data.should.have.property("attempts");
        (data.attempts > data.limit).should.be.true;
        data.limit.should.equal(api.config.ratelimit.actions[testAction][data.period]);
        
        api._ratelimit_test_early = 'early';
        api._ratelimit_test_default = 'early';
        api._ratelimit_test_late = 'early';
        callback(null, false);
      }, 3);
      // default priority
      api.ratelimit.addOnLimit(function(data, callback) {
        api._ratelimit_test_default = 'default';
        api._ratelimit_test_late = 'default';
        callback(null, false);
      });
      // late priority
      api.ratelimit.addOnLimit(function(data, callback) {
        api._ratelimit_test_late = 'late';
        callback(null, false);
      }, 100);
      done();
    });
    
    it('onLimit handlers should not have been called unecessarily', function(done){
      api.specHelper.runAction(testAction, params, function(res, conn){
        api.should.not.have.property('_ratelimit_test_early');
        api.should.not.have.property('_ratelimit_test_default');
        api.should.not.have.property('_ratelimit_test_late');
        done();
      });
    });
    
    it('should be called in the right order after exceeding limit', function(done){
      async.times(api.config.ratelimit.actions[testAction].second, function(n, next) { // not second+1 because we already called it once above.
        api.specHelper.runAction(testAction, params, function(res, conn){
          next(null, res);
        });
      },
      function(err, results) {
        // last element should be an error
        var res = results[results.length - 1];
        res.should.have.property('error').equal(error_blocked);
        res.should.not.have.property('periods');
        res.should.not.have.property('actions');
        
        api.should.have.property('_ratelimit_test_early').equal('early');
        api.should.have.property('_ratelimit_test_default').equal('default');
        api.should.have.property('_ratelimit_test_late').equal('late');
        
        done();
      });
    });
    
    it('can bypass', function(done){
      api.ratelimit.addOnLimit(function(data, callback) {
        api._ratelimit_test_bypass = 'bypass';
        callback(null, true);
      });
      
      async.times(api.config.ratelimit.actions[testAction].second+5, function(n, next) {
        api.specHelper.runAction(testAction, params, function(res, conn){
          next(null, res);
        });
      },
      function(err, results) {
        // all calls should work because we always bypass
        for(var res in results) {
          results[res].should.not.have.property('error');
          results[res].should.have.property('periods').equal(api.config.ratelimit.periods);
          results[res].should.have.property('actions').equal(api.config.ratelimit.actions);
        }
        
        done();
      });
    });
    
    it('can remove handlers', function(done){
      api.ratelimit.removeOnLimit();
      
      async.times(2, function(n, next) {
        api.specHelper.runAction(testAction, params, function(res, conn){
          next(null, res);
        });
      },
      function(err, results) {
        // all calls should fail because we have already exceeded limit
        for(var res in results) {
          results[res].should.have.property('error').equal(error_blocked);
          results[res].should.not.have.property('periods');
          results[res].should.not.have.property('actions');
        }
        done();
      });
    });
    
  });
  
  //// addLimit
  describe("addLimit", function() { 
    before(do_reset);
    
    it('action should obey new values', function(done){
      var new_val = 2;

      // overwrite all actions so we know exactly what we're working with
      api.config.ratelimit.actions = {};
      api.config.ratelimit.actions[testAction] = {hour:100, minute:5};
      api.ratelimit.init();
      api.ratelimit.addLimit(testAction, {minute:new_val});
      api.config.ratelimit.actions[testAction].should.have.property('minute').equal(new_val); // new value is set
      api.config.ratelimit.actions[testAction].should.have.property('hour').equal(100); // other values didn't get overwritten
      async.times(api.config.ratelimit.actions[testAction].minute+1, function(n, next) {
        api.specHelper.runAction(testAction, params, function(res, conn){
          next(null, res);
        });
      },
      function(err, results) {
        // last element should be an error
        var res = results[results.length - 1];
        res.should.have.property('error').equal(error_blocked);
        res.should.not.have.property('periods');
        res.should.not.have.property('actions');
        
        // second to last element should have been successful
        res = results[results.length - 2];
        res.should.not.have.property('error');
        res.should.have.property('periods').equal(api.config.ratelimit.periods);
        res.should.have.property('actions').equal(api.config.ratelimit.actions);

        done();
      });
    });
  });
  
  // removeLimit
  describe("removeLimit", function() {
    beforeEach(do_reset);
    
    it('should work with string', function(done){
      api.config.ratelimit.actions = {};
      api.config.ratelimit.actions[testAction] = {hour:100, minute:10, second:5};
      api.ratelimit.init();
      
      api.ratelimit.removeLimit(testAction, 'second');
      
      api.config.ratelimit.actions[testAction].should.not.have.property('second');
      api.config.ratelimit.actions[testAction].should.have.property('minute').equal(10);
      api.config.ratelimit.actions[testAction].should.have.property('hour').equal(100);
      done();
    });
    
    it('should work with object', function(done){
      api.config.ratelimit.actions = {};
      api.config.ratelimit.actions[testAction] = {hour:100, minute:10, second:5};
      api.ratelimit.init();
      
      api.ratelimit.removeLimit(testAction, {second:5});
      
      api.config.ratelimit.actions[testAction].should.not.have.property('second');
      api.config.ratelimit.actions[testAction].should.have.property('minute').equal(10);
      api.config.ratelimit.actions[testAction].should.have.property('hour').equal(100);
      done();
    });
        
    it('requires valid compare on object value', function(done){
      api.config.ratelimit.actions = {};
      api.config.ratelimit.actions[testAction] = {hour:100, minute:10, second:5};
      api.ratelimit.init();
      
      api.ratelimit.removeLimit(testAction, {second:15});
      
      api.config.ratelimit.actions[testAction].should.have.property('second').equal(5);
      api.config.ratelimit.actions[testAction].should.have.property('minute').equal(10);
      api.config.ratelimit.actions[testAction].should.have.property('hour').equal(100);

      done();
    });
    
    it('allows object value override', function(done){
      api.config.ratelimit.actions = {};
      api.config.ratelimit.actions[testAction] = {hour:100, minute:10, second:5};
      api.ratelimit.init();
      
      api.ratelimit.removeLimit(testAction, {second:15}, true);
      
      api.config.ratelimit.actions[testAction].should.not.have.property('second');
      api.config.ratelimit.actions[testAction].should.have.property('minute').equal(10);
      api.config.ratelimit.actions[testAction].should.have.property('hour').equal(100);
      done();
    });
    
    it('should work with string array', function(done){
      api.config.ratelimit.actions = {};
      api.config.ratelimit.actions[testAction] = {hour:100, minute:10, second:5};
      api.ratelimit.init();
      
      api.ratelimit.removeLimit(testAction, ['second']);
      
      api.config.ratelimit.actions[testAction].should.not.have.property('second');
      api.config.ratelimit.actions[testAction].should.have.property('minute').equal(api.config.ratelimit.actions[testAction].minute);
      api.config.ratelimit.actions[testAction].should.have.property('hour').equal(api.config.ratelimit.actions[testAction].hour);
      done();
    });
    
    it('action should obey new values', function(done){
      api.config.ratelimit.actions = {};
      api.config.ratelimit.actions[testAction] = {hour:100, minute:10, second:5};
      api.ratelimit.init();
      
      api.ratelimit.removeLimit(testAction, ['second']);
      
      api.config.ratelimit.actions[testAction].should.not.have.property('second');
      api.config.ratelimit.actions[testAction].should.have.property('minute').equal(api.config.ratelimit.actions[testAction].minute);
      api.config.ratelimit.actions[testAction].should.have.property('hour').equal(api.config.ratelimit.actions[testAction].hour);
      
      async.times(api.config.ratelimit.actions[testAction].minute+1, function(n, next) {
        api.specHelper.runAction(testAction, params, function(res, conn){
          next(null, res);
        });
      },
      function(err, results) {
        // last element should be an error
        var res = results[results.length - 1];
        res.should.have.property('error').equal(error_blocked);
        res.should.not.have.property('periods');
        res.should.not.have.property('actions');
        
        // second to last element should have been successful
        res = results[results.length - 2];
        res.should.not.have.property('error');
        res.should.have.property('periods').equal(api.config.ratelimit.periods);
        res.should.have.property('actions').equal(api.config.ratelimit.actions);

        done();
      });
    });
  });
  
  describe("custom getKey", function() {
    beforeEach(do_reset);
    
    it('should generally work', function(done){
      api.config.ratelimit.actions = {};
      api.config.ratelimit.actions[testAction] = {minute:1};
      api.ratelimit.init();
      
      // make getKey return a random id so we should never block
      api.ratelimit.getKey = function(api, connection, actionTemplate, next) {
        // rough tests to make sure we actually get valid data to work with
        api.should.have.property('config');
        connection.should.have.property('remoteIP');
        actionTemplate.should.have.property('name');
        
        return next(null, Math.random().toString(36).substr(2, 5));
      }
      
      // make sure key changes every time
      var prev_key;
      api.ratelimit.addOnLimit(function(data, callback) {
        (data.key === prev_key).should.be.false;
        prev_key = data.key;
      });
      
      // so even if we call 10 times over the limit, we should never be blocked
      async.times(api.config.ratelimit.actions[testAction].minute+10, function(n, next) {
        api.specHelper.runAction(testAction, params, function(res, conn){
          next(null, res);
        });
      },
      function(err, results) {
        // all calls should work because our key should have been randomized each time
        for(var res in results) {
          results[res].should.not.have.property('error');
          results[res].should.have.property('periods').equal(api.config.ratelimit.periods);
          results[res].should.have.property('actions').equal(api.config.ratelimit.actions);
        }

        done();
      });
    });
  });
  
});