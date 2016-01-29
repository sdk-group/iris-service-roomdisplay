'use strict'

let emitter = require("global-queue");
let ServiceApi = require('resource-management-framework').ServiceApi;

class Roomdisplay {
	constructor() {
		this.emitter = emitter;
	}

	init() {
		this.iris = new ServiceApi();
		this.iris.initContent();
	}

	//API
	actionTicketCalled({
		query
	}) {
		console.log("TODO: GET ENTRIES", query);
		return Promise.resolve(true);
	}



}

module.exports = Roomdisplay;