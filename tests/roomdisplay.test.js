'use strict'

let Roomdisplay = require("./Roomdisplay/roomdisplay");
let config = require("./config/db_config.json");

describe("Roomdisplay service", () => {
	let service = null;
	let bucket = null;
	before(() => {
		service = new Roomdisplay();
		service.init();
	});
	describe("Roomdisplay service", () => {
		it("should mark ticket called", (done) => {
			return service.actionTicketCalled()
				.then((res) => {
					console.log(res);
					done();
				})
				.catch((err) => {
					done(err);
				});
		})
	})

});