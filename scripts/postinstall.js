#!/usr/bin/env node

var fs = require('fs');
var path = require('path');

var localFile   = path.normalize(__dirname + '/../config/ratelimit.js');
var projectFile = path.normalize(process.cwd() + '/../../config/plugins/ah-ratelimit-plugin.js');

if(!fs.existsSync(projectFile)){
  console.log("copying " + localFile + " to " + projectFile);
  fs.createReadStream(localFile).pipe(fs.createWriteStream(projectFile));
}