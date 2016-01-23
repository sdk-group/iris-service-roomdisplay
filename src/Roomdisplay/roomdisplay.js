'use strict'

let emitter = require("global-queue");

class Roomdisplay {
	constructor() {
		this.emitter = emitter;
	}

	init() {}

	//API
	actionTicketCalled({
		query
	}) {
		console.log("TODO: GET ENTRIES", query);
		return Promise.resolve(true);
	}

}

module.exports = Roomdisplay;