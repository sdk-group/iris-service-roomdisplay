'use strict'

let path = require('path');
let config = require("./config/db_config.json");
let Couchbird = require('Couchbird')(config.couchbird); //singletone inits here
let IrisWorkflow = require("resource-management-framework");

IrisWorkflow.initializer(config.buckets.main);

global.expect = require('chai').expect;
global._ = require('lodash');
global.Promise = require('bluebird');

var gulp = require("gulp");
var mocha = require('gulp-mocha');

gulp.src('build/**/*.test.js', {
		read: false
	})
	.pipe(mocha());