"use strict"


let ServiceApi = require("resource-management-framework")
	.ServiceApi;
let path = require("path");
let randomstring = require("randomstring");
let fs = Promise.promisifyAll(require("fs"));
let slugify = require("transliteration")
	.slugify;

class Roomdisplay {
	constructor() {
		this.emitter = message_bus;
	}

	init({
		sound_theme,
		theme_params,
		data_server,
		number_speech_precision,
		direction_types
	}) {
		let def_theme = {
			gong: "REMINDER",
			invitation: "номер",
			direction: "окно",
			extension: ".mp3"
		};
		this.direction_types = direction_types || {
			"okno": "окно",
			"kabinet": "кабинет",
			"kassa": "касса",
			"vokno": "пройдитевокно",
			"vkabinet": "пройдитевкабинет",
			"vkassu": "пройдитевкассу"
		};
		this.direction_types = _.mapValues(this.direction_types, (val) => `direction/${val}`);
		this.number_speech_precision = number_speech_precision || 5;
		this.data_server = data_server;
		this.sound_theme = sound_theme;
		this.theme_params = _.reduce(def_theme, (acc, value, key) => {
			let val = _.isUndefined(theme_params[key]) ? value : theme_params[key];
			if (!!~_.indexOf(["gong", "invitation", "direction"], key)) {
				val = key + "/" + (val);
			}
			acc[key] = val;
			return acc;
		}, {});
		this.iris = new ServiceApi();
		this.iris.initContent();
	}

	launch() {
		this.emitter.listenTask("roomdisplay.emit.ticket-call", ({
			ticket,
			workstation,
			org_addr,
			org_merged
		}) => {
			this.emitter.addTask("workstation", {
					_action: "get-workstations-cache",
					device_type: "roomdisplay",
					organization: org_merged.id
				})
				.then((res) => {
					res = res["roomdisplay"];
					let keys = _(res)
						.filter(v => (v.attached_to == org_merged.id))
						.map("id")
						.value();

					return this.emitter.addTask("workstation", {
							_action: "by-id",
							workstation: keys
						})
						.then((res) => {
							return Promise.map(_.values(res), (rd) => {
								return this.actionCallTicket({
										ticket,
										workstation,
										default_voice_duration: rd.default_voice_duration,
										sound_theme: org_merged.sound_theme
									})
									.then((res) => {
										let to_join = ["roomdisplay.command", org_addr, rd.id];
										// console.log("EMITTING RD", res, _.join(to_join, "."));
										this.emitter.emit("broadcast", {
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
		return this.emitter.addTask("sound-conjunct", {
				_action: "audio-metadata",
				fpath
			})
			.then((res) => {
				return res.audio ? res.audio.length * 1300 : 0;
			});
	}

	actionReportPlayed({
		ticket,
		user_id,
		workstation,
		success
	}) {
		let status = success ? "success" : "fail";
		let event_name = "call-played";
		global.logger && logger.info("Roomdispay call for ticket %s played with result: %s", ticket, success);
		return Promise.props({
				ticket: this.emitter.addTask("ticket", {
						_action: "ticket",
						keys: [ticket]
					})
					.then(res => _.values(res)),
				history: this.emitter.addTask("history", {
					_action: "make-entry",
					subject: {
						type: "system",
						id: user_id
					},
					object: ticket,
					event_name,
					reason: {},
					context: {
						workstation
					}
				})
			})
			.then(({
				ticket,
				history
			}) => {
				let tick = ticket[0];
				if (_.find(tick.history, (e) => e.event_name == event_name))
					return true;
				history.local_time = moment()
					.utcOffset(moment.parseZone(tick.booking_date)
						.utcOffset())
					.format();
				tick.history.push(history);
				return this.emitter.addTask("ticket", {
					_action: "set-ticket",
					ticket: tick
				});
			});
	}

	actionMakeTicketPhrase({
		ticket = {},
		workstation = {},
		sound_theme
	}) {
		console.log("RD MAKE PHRASE", ticket, workstation);
		let tlabel = _.toString(ticket.label);
		let wlabel = _.toString(workstation.short_label || _(workstation.label)
			.words()
			.last());
		let ws_direction = _.get(workstation, ['device_placement', 'sound'], 'okno');
		ws_direction = this.direction_types[ws_direction];

		if (_.isEmpty(tlabel) || _.isEmpty(wlabel))
			return Promise.resolve(false);
		let parts = _.split(tlabel, "-");
		let letters = "";
		let numbers;
		if (_.size(parts) == 1) {
			[numbers] = parts;
		} else {
			[letters, numbers] = parts;
		}
		let tick_letters = _.split(_.lowerCase(letters), "");
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
		let tick_numbers = _.isNumber(number) && !_.isNaN(number) ? _.uniq(_.filter(parse(number, this.number_speech_precision, []))) : [];
		let dir = _.uniq(_.filter(parse(_.parseInt(wlabel), this.number_speech_precision, [])));
		// console.log("DIR", dir, workstation);
		let fnames = _.flatten([this.theme_params.gong, this.theme_params.invitation, tick_letters, tick_numbers, (ws_direction || this.theme_params.direction), dir]);
		let nm = _.join(_.map(fnames, (n) => _.last(_.split(n, "/"))), "_");
		fnames = _.map(fnames, (n) => (n + this.theme_params.extension));
		let outname = sound_theme + "_" + slugify(nm, {
			lowercase: true,
			separator: "_"
		}) + this.theme_params.extension;
		console.log("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA\n", fnames, outname);

		return this.emitter.addTask("sound-conjunct", {
			_action: "make-phrase",
			sound_theme: sound_theme,
			sound_names: fnames,
			outname
		});
	}

	actionCallTicket({
		ticket,
		workstation,
		sound_theme,
		default_voice_duration = 10
	}) {
		return this.actionMakeTicketPhrase({
				ticket,
				workstation,
				sound_theme: sound_theme || this.sound_theme
			})
			.then((name) => {
				let fpath = name ? path.relative("/var/www/html/", name) : name;
				fpath = this.data_server ? this.data_server + fpath : fpath;
				return Promise.props({
					ticket,
					workstation: _.pick(workstation, ['label', 'short_label', 'device_placement']),
					voice: fpath,
					voice_duration: this.getAudioLength(name, default_voice_duration)
				});
			});
	}

	actionBootstrap({
		workstation,
		user_id,
		user_type = "SystemEntity"
	}) {
		return this.emitter.addTask("workstation", {
			_action: "occupy",
			user_id,
			user_type,
			workstation
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