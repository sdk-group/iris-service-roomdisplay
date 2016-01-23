let events = {
	roomdisplay: {}
};

let tasks = [];

module.exports = {
	module: require('./roomdisplay.js'),
	permissions: [],
	exposed: true,
	tasks: tasks,
	events: {
		group: 'roomdisplay',
		shorthands: events.roomdisplay
	}
};