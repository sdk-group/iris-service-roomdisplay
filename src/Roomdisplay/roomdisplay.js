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
			extension: ".wav"
		};
		this.sound_theme = sound_theme;
		this.theme_params = _.reduce(def_theme, (acc, value, key) => {
			let val = _.isUndefined(theme_params[key]) ? value : _.lowerCase(theme_params[key]);
			if(!!~_.indexOf(['gong', 'invitation', 'direction'], key))
				val = key + '/' + val;
			acc[key] = val;
			return acc;
		}, {});
		this.iris = new ServiceApi();
		this.iris.initContent();
	}

	//API
	actionTicketCalled({
		ticket, user_id, reason
	}) {
		let data = {
			event_name: "call.ticket",
			subject: user_id,
			object: ticket,
			time: _.now(),
			reason
		};
		return this.emitter.addTask('history', {
			_action: "set-entries",
			data
		});
	}

	actionMakeTicketPhrase({
		ticket, workstation
	}) {
		let [letters, numbers] = _.split(ticket.label, '-');
		let tick_letters = _.split(letters, '');
		let number = _.parseInt(numbers);
		let tick_numbers = [];
		let parse = (num, power) => {
			console.log("PARSE", num, power);
			let div = Math.pow(10, power);
			console.log("LOG", div);
			let rem = num % div;
			if(rem < 20) {
				tick_numbers.push(rem);
				return tick_numbers;
			}
			let base = num - rem;
			tick_numbers.push(base);
			return parse(rem, power + 1);
		};
		tick_numbers = parse(number, 1);
		console.log("NUM", tick_numbers);
		let dir = workstation.short_label || _.last(_.words(workstation.device_label));
		let fnames = [this.theme_params.gong, this.theme_params.invitation, tick_letters, tick_numbers, this.theme_params.direction, dir];
		fnames = _.map(_.flatten(fnames), (n) => (n + this.theme_params.extension));
		let outname = randomstring.generate(20) + this.theme_params.extension;

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
		return Promise.props({
				ticket: this.emitter.addTask('ticket', {
					_action: 'ticket',
					keys: ticket
				}),
				workstation: this.emitter.addTask('workstation', {
					_action: 'by-id',
					workstation
				})
			})
			.then((res) => {
				let tick = _.find(res.ticket, (t) => (
					t.id == ticket || t.key == ticket
				));
				let ws = _.find(res.workstation, (t) => (
					t.id == workstation || t.key == workstation
				));
				return Promise.props({
					ticket: tick,
					workstation: ws,
					voice: this.actionMakeTicketPhrase({
						ticket: tick,
						workstation: ws
					})
				});
			})
	}

	actionBootstrap({
		workstation,
		user_id,
		user_type = "SystemEntity"
	}) {
		let cp;
		return this.emitter.addTask('workstation', {
				_action: 'by-id',
				user_id,
				user_type,
				workstation
			})
			.then((res) => {
				cp = _.find(res, (val) => (val.device_type === 'roomdisplay'));
				return this.iris.getOrganizationChain({
					keys: cp.attached_to
				});
			})
			.then((res) => {
				let org_data = _.reduce(_.orderBy(_.keys(res), _.parseInt, 'desc'), (acc, val) => {
					acc = _.merge(acc, res[val]);
					return acc;
				}, {});

				return Promise.props({
					office: res,
					timezone: org_data.org_timezone,
					current_time: this.emitter.addTask('queue', {
						_action: 'current-time'
					}),
					services: this.iris.getService({
						query: {}
					}),
					ws: this.emitter.addTask('workstation', {
							_action: 'occupy',
							user_id,
							user_type,
							workstation
						})
						.then((res) => {
							return res.workstation;
						})
				});
			});
	}

	actionReady({
		user_id, office, workstation
	}) {
		console.log("READY FOR ACTION - RD", user_id, office);

		return Promise.resolve({
			success: true
		});
	}

}

module.exports = Roomdisplay;