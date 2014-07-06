# ah-ratelimit-plugin

## overview

Allows limits to be set on the number of time actions can be called in a time period, based on some identifier.  Has been tested to work with both actionhero 8 and actionhero 9.


## getting started

Here's an example config file with an example of what happens.

    // Will be found at config/plugins/ah-ratelimit-plugin.js after install
    exports.default = {
      ratelimit: function(api){
        return {
          enabled: true,
          onLimitDefaultPriority: 10,
          prefix: 'ah:rl:',
          periods: { // whatever periods are used, in ms
            second: 1000,
            minute: 1000 * 60,
            hour: 1000 * 60 * 60,
            day: 1000 * 60 * 60 * 24,
          },
          all_key: "_all",
          actions: {
            _all: {day:1000,minute:100,second:5}, // '_all' (all_key value above) applies limits to every action performed
            checkLimit: {day:10,minute:5,second:1}, // example of how to limit a specific action
          },
          errors: {
            blocked: "API limit exceeded",
          },
        };
      }
    };

In that example, if someone attempts to access the checkLimit action more than 5 times in a minute, an error will be returned instead of processing the action.  Meanwhile, _all is only allowing 100 actions to be called, total, within a minute regardless of any other limits set.


## limit key/id

By default, actions are ratelimited against connection.remoteIP.  If you wish to override it, you can replace the api.ratelimit.getKey function in your own initializer like so:

    // limit against connection.id
    api.ratelimit.getKey = function(api, connection, actionTemplate, next) {
      return process.nextTick(function() { cb(null, connection.id) });
    }
    
    // look up a theoretical user id. In reality, you would probably have a user session stored in connection so you're not checking twice, and can just return it like the previous example.
    api.ratelimit.getKey = function(api, connection, actionTemplate, next) {
      return api.users.getID(connection, function(err, user_id) {
        if(err || !user_id) return next(null, connection.remoteIP); // use remoteIP for anonymous users
        return next(null, user_id); // use user id if this connection's session checks out
      });
    }

## add and remove limits dynamically

If you need to add or remove limits dynamically rather than just using the hardcoded config file, you can do so with addLimit and removeLimit.

    // addLimit
    api.ratelimit.addLimit("someAction", {minute:10});
    api.ratelimit.addLimit("someAction", {hour:50});
    api.ratelimit.addLimit("otherAction", {hour:8, minute:3});
    // removeLimit
    api.ratelimit.removeLimit("someAction", "minute"); // remove minute limit from someAction
    api.ratelimit.removeLimit("someAction", ["minute", "hour"]); // remove minute limit from someAction
    api.ratelimit.removeLimit("someAction", {minute:10}); // remove minute limit only if limit is currently 10
    api.ratelimit.removeLimit("someAction", {minute:5}); // ... so this will do nothing
    // removeLimits
    api.ratelimit.removeLimits("someAction"); // remove all limits on someAction (however _all still counts it)
    

## block event and bypassing

To be notified when an action is blocked, use api.ratelimit.addOnLimit(handler_function) like so:

    // data will be: {
    //  action:actionTemplate.name, // name of the action that triggered the block
    //  key:key, // the user's id from getKey
    //  period:period, // such as "minute"
    //  attempts: current, // how many attempts have been made in that period
    //  limit:param.limit, // what the actual limit on number of attempts is
    //  api:api, connection:connection, actionTemplate:actionTemplate } // as usual in actionhero
      
    api.ratelimit.addOnLimit(function(data, callback) {
      api.log("ratelimit blocked a call to "+data.action);
      callback(null, false);
    });
  
If there is some case where action limits should not block the action, such as for an admin, or specific classes of users with different or no limits, you can bypass by passing true to the callback instead of false.

    api.ratelimit.addOnLimit(function(data, callback) {
      // call our theoretical admin checking function
      api.User.isAdmin(data.key, function(err, isadmin) {
        callback(null, isadmin); // if admin, let them run the action anyway
      });
    });


## tests

Test cases have been created for most of the functionality.  If you would like to run them, copy test/ratelimit.js from the plugin directory into your actionhero test directory and then use npm test as normal.

Be aware that the tests flush the test environment redis database, so make sure that you actually have a test environment database configured in actionhero's config/redis.js

## TODO

* sample checkLimit action should list current counts instead of just the limits themselves