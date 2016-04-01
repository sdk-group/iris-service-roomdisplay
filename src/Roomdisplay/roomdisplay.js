'use strict'

let emitter = require("global-queue");
let ServiceApi = require('resource-management-framework')
	.ServiceApi;
let path = require('path');
let randomstring = require('randomstring');
let fs = Promise.promisifyAll(require("fs"));
let slugify = require('transliteration')
	.slugify;

class Roomdisplay {
	constructor() {
		this.emitter = emitter;
	}

	init({
		sound_theme,
		theme_params,
		data_server,
		number_speech_precision
	}) {
		let def_theme = {
			gong: "REMINDER",
			invitation: "номер",
			direction: "окно",
			extension: ".mp3"
		};
		this.number_speech_precision = number_speech_precision || 5;
		this.data_server = data_server;
		this.sound_theme = sound_theme;
		this.theme_params = _.reduce(def_theme, (acc, value, key) => {
			let val = _.isUndefined(theme_params[key]) ? value : theme_params[key];
			if (!!~_.indexOf(['gong', 'invitation', 'direction'], key)) {
				val = key + '/' + (val);
			}
			acc[key] = val;
			return acc;
		}, {});
		this.iris = new ServiceApi();
		this.iris.initContent();
	}

	launch() {
		this.emitter.on('roomdisplay.emit.ticket-call', ({
			ticket,
			workstation,
			org_addr,
			org_merged
		}) => {
			this.emitter.addTask('workstation', {
					_action: 'get-workstations-cache',
					device_type: 'roomdisplay',
					organization: org_merged.id
				})
				.then((res) => {
					res = res['roomdisplay'];
					let keys = _(res)
						.filter(v => (v.attached_to == org_merged.id))
						.map('id')
						.value();

					return this.emitter.addTask('workstation', {
							_action: 'by-id',
							workstation: keys
						})
						.then((res) => {
							return Promise.map(_.values(res), (rd) => {
								return this.actionCallTicket({
										ticket,
										workstation
									})
									.then((res) => {
										let to_join = ['roomdisplay.command', org_addr, rd.id];
										// console.log("EMITTING RD", res, _.join(to_join, "."));
										this.emitter.emit('broadcast', {
											event: _.join(to_join, "."),
											data: res
										});
									});
							});
						});
				});
		});

		return Promise.resolve(true);
	}


	//API
	getAudioLength(fpath, default_duration = 0) {
		return this.emitter.addTask('sound-conjunct', {
				_action: 'audio-metadata',
				fpath
			})
			.then((res) => {
				return res.audio ? res.audio.length * 1300 : 0;
			})
			.catch((err) => {
				return default_duration;
			});
	}

	actionReportPlayed({
		ticket,
		user_id,
		success
	}) {
		let status = success ? 'success' : 'fail';
		this.emitter.emit('history.log', {
			subject: {
				type: 'roomdisplay',
				id: user_id
			},
			object: ticket,
			event_name: `call-${status}`,
			reason: {}
		});
	}

	actionMakeTicketPhrase({
		ticket,
		workstation
	}) {
		// console.log("RD MAKE PHRASE", ticket, workstation);
		let parts = _.split(ticket.label, '-');
		let letters = '';
		let numbers;
		if (_.size(parts) == 1) {
			[numbers] = parts;
		} else {
			[letters, numbers] = parts;
		}
		let tick_letters = _.split(_.lowerCase(letters), '');
		let number = _.parseInt(numbers);
		let parse = (num, power, fin) => {
			// console.log("NUMPOW", num, power);
			if (num < 20) {
				fin.push(num);
				return fin;
			}

			let div = Math.pow(10, power);
			let rem = num % div;
			let base = num - rem;
			fin.push(base);

			return parse(rem, power - 1, fin);
		};

		let tick_numbers = _.uniq(_.filter(parse(number, this.number_speech_precision, [])));
		let dir = workstation.short_label || _.last(_.words(workstation.device_label));
		dir = _.uniq(_.filter(parse(_.parseInt(dir), this.number_speech_precision, [])));
		// console.log("DIR", dir, workstation.short_label);
		let fnames = _.flatten([this.theme_params.gong, this.theme_params.invitation, tick_letters, tick_numbers, this.theme_params.direction, dir]);
		let nm = _.join(_.map(fnames, (n) => _.last(_.split(n, "/"))), "_");
		fnames = _.map(fnames, (n) => (n + this.theme_params.extension));
		let outname = slugify(nm, {
			lowercase: true,
			separator: '_'
		}) + this.theme_params.extension;

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
				fpath = this.data_server ? this.data_server + fpath : fpath;
				return Promise.props({
					ticket: tick,
					workstation: ws,
					voice: fpath,
					voice_duration: this.getAudioLength(name, ws.default_voice_duration)
				});
			});
	}

	actionBootstrap({
		workstation,
		user_id,
		user_type = "SystemEntity"
	}) {
		return Promise.props({
				workstation: this.emitter.addTask('workstation', {
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
