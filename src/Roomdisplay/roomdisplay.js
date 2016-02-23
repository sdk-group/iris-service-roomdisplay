'use strict'

let emitter = require("global-queue");
let ServiceApi = require('resource-management-framework')
	.ServiceApi;
let path = require('path');
let randomstring = require('randomstring');
let fs = Promise.promisifyAll(require("fs"));

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
								ticket,
								workstation
							})
							.then((res) => {
								// console.log("EMITTING RD", res, user_id, org_addr);
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
		sound_theme,
		theme_params
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
	getAudioLength(fpath) {
		return this.emitter.addTask('sound-conjunct', {
				_action: 'audio-metadata',
				fpath
			})
			.then((res) => {
				return res.audio ? res.audio.length : 0;
			});
	}

	actionTicketCalled({
		ticket,
		user_id,
		reason
	}) {
		let data = {
			event_name: "call.ticket",
			subject: user_id,
			object: ticket,
			reason
		};

	}

	actionMakeTicketPhrase({
		ticket,
		workstation
	}) {

		let [letters, numbers] = _.split(ticket.label, '-');
		numbers = numbers || letters;
		let tick_letters = _.split(_.lowerCase(letters), '');
		let number = _.parseInt(numbers);
		let tick_numbers = [];
		let parse = (num, power) => {
			if(num < 20) {
				tick_numbers.push(num);
				return tick_numbers;
			}

			let div = Math.pow(10, power);
			let rem = num % div;
			let base = num - rem;
			tick_numbers.push(base);

			return parse(rem, power - 1);
		};

		tick_numbers = _.uniq(_.filter(parse(number, 5)));
		let dir = workstation.short_label || _.last(_.words(workstation.device_label));
		let fnames = _.flatten([this.theme_params.gong, this.theme_params.invitation, tick_letters, tick_numbers, this.theme_params.direction, dir]);
		let nm = _.join(_.map(fnames, (n) => _.last(_.split(n, "/"))), "_");
		fnames = _.map(fnames, (n) => (n + this.theme_params.extension));
		let outname = nm + this.theme_params.extension;


		return this.emitter.addTask('sound-conjunct', {
			_action: 'make-phrase',
			sound_theme: this.sound_theme,
			sound_names: fnames,
			outname
		});
	}

	actionCallTicket({
		ticket,
		workstation
	}) {
		let tick;
		let ws;
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
				tick = _.find(res.ticket, (t) => (
					t.id == ticket || t.key == ticket
				));
				ws = _.find(res.workstation, (t) => (
					t.id == workstation || t.key == workstation
				));
				return this.actionMakeTicketPhrase({
					ticket: tick,
					workstation: ws
				});
			})
			.then((name) => {
				let fpath = name ? path.relative('/var/www/html/', name) : name;
				return Promise.props({
					ticket: tick,
					workstation: ws,
					voice: fpath,
					voice_duration: this.getAudioLength(fpath)
				});
			});
	}

	actionBootstrap({
		workstation,
		user_id,
		user_type = "SystemEntity"
	}) {
		return Promise.props({
				ws: this.emitter.addTask('workstation', {
						_action: 'occupy',
						user_id,
						user_type,
						workstation
					})
					.then((res) => {
						return res.workstation;
					})
			})
			.catch(err => {
				console.log("RD BTSTRP ERR", err.stack);
			});
	}

	actionReady({
		user_id,
		workstation
	}) {
		return Promise.resolve({
			success: true
		});
	}

}

module.exports = Roomdisplay;