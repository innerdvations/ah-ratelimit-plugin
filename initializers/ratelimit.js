var ratelimit = function(api, next){
  if(!api.config.ratelimit) return next();
  
  api.ratelimit = {};
  api.ratelimit.on_limit = [];
  api.ratelimit.limiters = {};
  api.ratelimit.incr_expire = "local v = redis.call('INCR', KEYS[1]) if v == 1 then redis.call('PEXPIRE', KEYS[1], KEYS[2]) end return v";
  api.ratelimit.async = require('async');
  
  // each function must perform callback(err, bypass_limit) when complete
  // if err, error will be logged but no other action will be taken
  // if bypass_limit is any true value, the limit will be bypassed and the action will be allowed
  // example handler for logging all exceeded limits:
  //  function(info, callback) {
  //    api.log({info:info});
  //    callback(null, false); // callback(error, bypass_limit)
  //  }
  api.ratelimit.addOnLimit = function(func, priority) {
    if(!priority) priority = api.config.ratelimit.onLimitDefaultPriority;
    if(!api.ratelimit.on_limit[priority]) api.ratelimit.on_limit[priority] = [];
    api.ratelimit.on_limit[priority].push(func);
  };
  api.ratelimit.removeOnLimit = function() {
    api.ratelimit.on_limit = [];
  };
  api.ratelimit.addLimit = function(action, options) {
    for(var opt in options) {
      if(options.hasOwnProperty(opt)) api.config.ratelimit.actions[action][opt] = options[opt];
    }
    api.ratelimit.init();
  };
  api.ratelimit.removeLimit = function(action, options, no_obj_compare) {
    var opt;
    if(options instanceof Array) {
      for(opt in options) {
        if(options.hasOwnProperty(opt)) delete api.config.ratelimit.actions[action][options[opt]];
      }
    }
    else if(typeof options === 'string' || options instanceof String) {
      delete api.config.ratelimit.actions[action][options];
    }
    else {
      for(opt in options) {
        if(options.hasOwnProperty(opt))
          if(api.config.ratelimit.actions[action][opt] === options[opt] || no_obj_compare)
            delete api.config.ratelimit.actions[action][opt];
      }
    }
    api.ratelimit.init();
  };
  
  // determines who this action belongs to. This function may be overwritten.
  api.ratelimit.getKey = function(api, connection, actionTemplate, cb) {
    return process.nextTick(function() { cb(null, connection.remoteIP) });
  };

  // pre-build the limits array so we can do less looping and string concatenation on each action call
  api.ratelimit.init = function() {
    api.ratelimit.limiters = {};
    var action, period;
    for(action in api.config.ratelimit.actions) {
      if(api.config.ratelimit.actions[action]) {
        api.ratelimit.limiters[action] = [];
        for(period in api.config.ratelimit.actions[action]) {
          if(api.config.ratelimit.actions[action].hasOwnProperty(period))
            api.ratelimit.limiters[action].push({key:action + ":" + period, period:period, period_value:api.config.ratelimit.periods[period], limit:api.config.ratelimit.actions[action][period]});
        }
      }
    }
  };
  api.ratelimit.init();
  
  // ratelimit preprocessor middleware
  api.ratelimit._on_action = function(connection, actionTemplate, _on_action_cb) {
    if( !(actionTemplate.limit || api.config.ratelimit.actions[api.config.ratelimit.all_key] || api.config.ratelimit.actions[actionTemplate.name]) ) return _on_action_cb(connection, true);
    
    // get the key
    api.ratelimit.getKey(api, connection, actionTemplate, function(err, key) {
      var i, j, handlers, info,
      // grab just the limits we have to loop through
      limits = api.ratelimit.limiters[actionTemplate.name] ? api.ratelimit.limiters[actionTemplate.name] : [];
      if(api.ratelimit.limiters[api.config.ratelimit.all_key]) limits = limits.concat(api.ratelimit.limiters[api.config.ratelimit.all_key]);
      
      // for each of our limiters (for this action and for _all), we need to increment redis, compare against limit, and if exceeded, call the handlers and see if we should bypass the action block.
      api.ratelimit.async.each(limits, function(param, async_each_cb) {
        api.redis.client.eval(api.ratelimit.incr_expire, 2, api.config.ratelimit.prefix + key + param.key, param.period_value, function(err, current) {
          // if we haven't hit the limit or don't have any handlers, we can simply stop here
          if(current <= param.limit) return async_each_cb();
          if(!api.ratelimit.on_limit.length) {
            connection.error = api.config.ratelimit.errors.blocked;
            return async_each_cb(true);
          }
          
          // otherwise, we have to call all the handlers and check for blocking
          info = {action:actionTemplate.name, key:key, period:param.period, attempts: current, limit:param.limit, api:api, connection:connection, actionTemplate:actionTemplate};
          handlers = [];
          for(i in api.ratelimit.on_limit) {
            for(j in api.ratelimit.on_limit[i]) {
              handlers.push(api.ratelimit.async.apply(api.ratelimit.on_limit[i][j], info));
            }
          }
          
          // two possible improvements here. 
          // 1) could be a series of parallel calls for each priority level
          // 2) let successive calls see prior results in case they can skip work (ie, if one handler bypasses, next handler sees that and doesn't have to do its own lookups to check again)
          api.ratelimit.async.series(handlers, function(err, results) {
            if(results && !err) {
              for(i in results) {
                if(results[i]) return async_each_cb(); // if bypass, we continue without setting an error
              }
            }
            // otherwise set error to stop action from being called
            if(err) api.log("ratelimit:onLimit:"+JSON.stringify(err), "err");
            connection.error = api.config.ratelimit.errors.blocked;
            return async_each_cb();
          });
        });
      },
      // after async.each is done, we can finally move on to the next step
      function(results) {
        _on_action_cb(connection, !connection.error);
      });
    });
  };
  
  if(require('semver').lt(require('../../../package').version, '9.0.0')) api.actions.preProcessors.push(api.ratelimit._on_action);
  else api.actions.addPreProcessor(api.ratelimit._on_action, 3);
  
  next();
};
exports.ratelimit = ratelimit;