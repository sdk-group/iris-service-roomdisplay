'use strict'

let events = {
	roomdisplay: {}
};

let tasks = [];

module.exports = {
	module: require('./roomdisplay.js'),
	name: 'roomdisplay',
	permissions: [],
	exposed: true,
	tasks: tasks,
	events: {
		group: 'roomdisplay',
		shorthands: events.roomdisplay
	}
};