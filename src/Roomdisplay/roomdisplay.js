'use strict'

let emitter = require("global-queue");
let ServiceApi = require('resource-management-framework').ServiceApi;
let path = require('path');
let randomstring = require('randomstring');

class Roomdisplay {
	constructor() {
		this.emitter = emitter;

		this.emitter.on('roomdisplay.emit.ticket-call', ({
			ticket,
			workstation,
			org_addr
		}) => {
			this.emitter.addTask('agent', {
					_action: 'active-agents',
					agent_type: 'SystemEntity'
				})
				.then((res) => {
					return Promise.props(_.mapValues(res, (val, user_id) => {
						return this.actionCallTicket({
								ticket, workstation
							})
							.then((res) => {
								console.log("EMITTING RD", res, user_id, org_addr);
								let addr = _.defaults(org_addr, {
									office: 'null',
									department: 'null'
								});
								this.emitter.emit('broadcast', {
									event: _.join(['call.ticket', addr.office, addr.department, _.last(user_id.split("#"))], "."),
									data: res
								});
							});
					}))
				});
		});
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
		this.theme_params = _.reduce(def_theme, (acc, value, key) => {
			let val = _.isUndefined(theme_params[key]) ? value : theme_params[key];
			if(!!~_.indexOf(['gong', 'invitation', 'direction'], key)) {
				val = key + '/' + (val);
			}
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
		let tick_letters = _.split(_.lowerCase(letters), '');
		let number = _.parseInt(numbers);
		let tick_numbers = [];
		let parse = (num, power) => {
			let div = Math.pow(10, power);
			let rem = num % div;
			let base = num - rem;
			tick_numbers.push(base);
			if(num < 20) {
				tick_numbers.push(num);
				return tick_numbers;
			}
			return parse(rem, power - 1);
		};

		tick_numbers = _.uniq(_.filter(parse(number, 5)));
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
						.then((name) => {
							return path.relative('/var/www/html/', name);
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
		return Promise.resolve({
			success: true
		});
	}

}

module.exports = Roomdisplay;