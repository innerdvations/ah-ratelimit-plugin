# ah-ratelimit-plugin

Allows limits to be set on the number of time actions can be called in a time period, based on some identifier.

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
        //_all: {day:1000,minute:100,second:5}, // '_all' (all_key value above) applies limits to every action performed
        //checkLimit: {day:10,minute:5,second:1}, // example of how to limit a specific action
      },
      errors: {
        blocked: "API limit exceeded",
      },
    };
  }
};

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


## TODO

* sample checkLimit action should list current counts instead of just the limits themselves