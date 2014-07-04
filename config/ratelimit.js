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

exports.test = {
  ratelimit: function(api){
    return {
      enabled: false, // you may not want to run your tests while ratelimited unless you're actually testing ratelimit itself
    };
  }
};