exports.action = {
  name: 'checkLimit',
  description: 'I list ratelimiter limits',
  inputs: {
    required: [],
    optional: []
  },
  blockedConnectionTypes: [],
  outputExample: {},
  matchExtensionMimeType: false,
  version: 1.0,
  toDocument: true,
  run: function(api, connection, next){
    connection.response = {periods:api.config.ratelimit.periods,actions:api.config.ratelimit.actions};
    next(connection, true);
  }
};