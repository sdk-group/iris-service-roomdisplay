'use strict'

let emitter = require("global-queue");
let ServiceApi = require('resource-management-framework').ServiceApi;
let path = require('path');
let randomstring = require('randomstring');

class Roomdisplay {
	constructor() {
		this.emitter = emitter;
	}

	init({
		sound_theme, theme_params
	}) {
		let def_theme = {
			gong: "REMINDER",
			invitation: "номер",
			direction: "окно",
			extension: ".mp3"
		};
		this.sound_theme = sound_theme;
		this.theme_params = _.assignWith(def_theme, theme_params, (objValue, srcValue, key) => {
			let val = _.isUndefined(objValue) ? srcValue : _.lowerCase(objValue);
			if(!!~_.indexOf(['gong', 'invitation', 'direction'], key))
				val = path.resolve(key, val);
			return val;
		});
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

	makeTicketPhrase({
		ticket, workstation
	}) {
		let cli = _.filter(_.split(ticket.label, ''), l => (l !== '-'));
		let dir = _.last(_.split(workstation.device_label), ' ');
		let fnames = [this.theme_params.gong, this.theme_params.invitation, cli, this.theme_params.direction, dir];
		fnames = _.map(_.flatten(fnames), (n) => (n + this.theme_params.extension));
		let outname = randomstring.generate(12);
		console.log("FNAMES", fnames, outname);

		return this.emitter.addTask('sound-conjunct', {
			_action: 'make-phrase',
			sound_theme: this.sound_theme,
			sound_names: fnames,
			outname
		});
	}

	actionCallTicket({
		ticket, workstation
	}) {
		return this.emitter.addTask('ticket', {
				_action: 'ticket',
				keys: ticket
			})
			.then((res) => {
				let tick = _.find(res, (t) => {
					t.id == ticket || t.key == ticket
				});
				return Promise.props({
					ticket: tick,
					workstation,
					voice: this.makeTicketPhrase({
						ticket, workstation
					})
				});
			})
	}


}

module.exports = Roomdisplay;