// ---- CONFIG OPTIONS

// How many fights to look calc at a time for initial load.
var CHUNK_SIZE = 110;

// how often to check for updates 14400000 milliseconds  = 4 hours
var UPDATE_INTERVAL = 14400000;

// Minimum RD threshold
var MINIMUM_RD = 170;
var MINIMUM_RD_ARMOR = 250;
var MINIMUM_RD_NOARMOR = 180;

// Path goodies
var FIGHT_JSON_HOST = 'nerd.nu';
var FIGHT_JSON_PATH = '/survival/survivalstats.json';

var SERVER_PORT = 8282;

var express = require('express');
var http = require('http');
var app = express();
var timers = require('timers');

var glicko = require('./glicko.js');

// Objects to store all player data playerMap.playername
var playerMap = {};
var playerMapArmor = {};
var playerMapNoArmor = {};

// lastId of calculated data
var lastId = 0;

function doMaths() {
	http.request(
			{
				host : FIGHT_JSON_HOST,
				path : FIGHT_JSON_PATH
			},
			function(response) {
				// Only chunk the first calculations during loadup.  After that we want it time based.  
				if (lastId != 0) {
					CHUNK_SIZE = 100000;
				}
				var str = '';
				response.on('data', function(chunk) {
					str += chunk;
				});

				response.on('end', function() {
					if (str) {
						var json = JSON.parse(str);
						json.sort(function(a, b) {
							return a.id - b.id
						});
						var calcCount = 0;
						var i2 = 0;
						var chunk = [];
						for (i = 0; i < json.length; i++) {
							if (lastId < json[i].id) {
								// Keeps track of the total;
								calcCount++;
								// Make sure we don't do the same ones twice. 
								lastId = json[i].id;
								chunk[i2++] = json[i];

								// Chunk it
								if (i2 >= CHUNK_SIZE || i == json.length - 1) {
									calcBattles(chunk);
									chunk = [];
									i2 = 0;
								}
							}
						}
						console.log('Successful: ' + calcCount
								+ ' - Now Sorting and Ranking');

						// Sort all of the lists
						var allPlayers = getSortedPlayers(playerMap, MINIMUM_RD, true);
						var allPlayersArmor = getSortedPlayers(playerMapArmor, MINIMUM_RD_ARMOR);
						var allPlayersUnArmored = getSortedPlayers(playerMapNoArmor, MINIMUM_RD_NOARMOR);

						// Update the variables in the main playerMap
						for (i = 0; i < allPlayers.length; i++) {
							var player = playerMap[allPlayers[i].name];
							if (allPlayers[i].name) {
								player.rank = i;
								player.rankArmor = null;
								player.rankNoArmor = null;
								playerMap[allPlayers[i].name] = player;
							}
						}
						for (i = 0; i < allPlayersArmor.length; i++) {
							var tempPlayer = allPlayersArmor[i];
							var player = playerMap[tempPlayer.name];
							if (player) {
								player.rankArmor = i;
								player.ratingArmor = tempPlayer.rating;
								player.rdArmor = tempPlayer.rd;
								player.volArmor = tempPlayer.vol;
								playerMap[tempPlayer.name] = player;
							}
						}
						for (i = 0; i < allPlayersUnArmored.length; i++) {
							var tempPlayer = allPlayersUnArmored[i];
							var player = playerMap[tempPlayer.name];
							if (player) {
								player.rankNoArmor = i;
								player.ratingNoArmor = tempPlayer.rating;
								player.rdNoArmor = tempPlayer.rd;
								player.volNoArmor = tempPlayer.vol;
								playerMap[tempPlayer.name] = player;
							}
						}
						console.log('Successful: ' + calcCount + ' - Done');
					}
				});
			}).end();
}

function calcBattles(chunkedData) {
	// Go through fights, building player vs opponent maps
	var dupeCheck = [];
	var dupeCheckArmor = [];
	var dupeCheckNoArmor = [];

	for (vi = 0; vi < chunkedData.length; vi++) {
		var fight = chunkedData[vi];
		var killer = fight.killer_name;

		// We need to use both the "killer" and "killee"  killer attr used for both.
		while (killer) {
			if (!dupeCheck[killer]) {
				opponents = [];
				opponentsArmor = [];
				opponentsNoArmor = [];
				// Go through fights again, grab all opponents for 'killer'
				for (vi2 = vi; vi2 < chunkedData.length; vi2++) {
					// Check if killer is involved
					var altercation = chunkedData[vi2];

					var weapon = altercation.killer_item;
					// Only worry about certain weapons.
					if (weapon.indexOf('DIAMOND') == -1
							&& weapon.indexOf('IRON') == -1
							&& weapon.indexOf('BOW') == -1
							&& weapon.indexOf('POTION') == -1) {
						continue;
					}
					// Ignore suicides 
					if (altercation.killer_name == altercation.player_name) {
						continue;
					}
					var isArmor = altercation.armor_kill;
					// Handle the combined stats first
					if (altercation.killer_name == killer) {
						dupeCheck[killer] = true;
						updateOpponent(altercation.player_name, playerMap, opponents, 1);
						// Split stats
						if (isArmor) {
							dupeCheckArmor[killer] = true;
							updateOpponent(altercation.player_name, playerMapArmor, opponentsArmor, 1);
						} else {
							dupeCheckNoArmor[killer] = true;
							updateOpponent(altercation.player_name, playerMapNoArmor, opponentsNoArmor, 1);
						}
					}
					// Handle losses
					if (altercation.player_name == killer) {
						dupeCheck[killer] = true;
						updateOpponent(altercation.killer_name, playerMap, opponents, 0);
						if (isArmor) {
							dupeCheckArmor[killer] = true;
							updateOpponent(altercation.killer_name, playerMapArmor, opponentsArmor, 0);
						} else {
							dupeCheckNoArmor[killer] = true;
							updateOpponent(altercation.killer_name, playerMapNoArmor, opponentsNoArmor, 0);
						}
					}
				}
				// Do the actual glicko computations and update the players
				if (dupeCheck[killer]) {
					updatePlayer(killer, playerMap, opponents);
				}
				if (dupeCheckArmor[killer]) {
					updatePlayer(killer, playerMapArmor, opponentsArmor);
				}
				if (dupeCheckNoArmor[killer]) {
					updatePlayer(killer, playerMapNoArmor, opponentsNoArmor);
				}
			}

			// Do the killed player if we haven't already
			if (killer == fight.player_name) {
				killer = null;
			} else {
				killer = fight.player_name;
			}
		}
	}

	// Handle the rest of the players for this chunk.  This call will end up only updating the RD value
	// which is used to determine the variation of their rating. 
	for (playerName in playerMap) {
		if (!dupeCheck[playerName]) {
			updatePlayerNoKills(playerName, playerMap);
		}
	}
	for (playerName in playerMapArmor) {
		if (!dupeCheckArmor[playerName]) {
			updatePlayerNoKills(playerName, playerMapArmor);
		}
	}
	for (playerName in playerMapNoArmor) {
		if (!dupeCheckNoArmor[playerName]) {
			updatePlayerNoKills(playerName, playerMapNoArmor);
		}
	}
}

function updateOpponent(opponentName, mapOfPlayers, thisOpponents, score) {
	var opponent = {};
	opponent.temp_name = opponentName;
	opponent.s = score;
	// Pull the opponent out of the map if we have it and use those stats.
	if (mapOfPlayers[opponentName]) {
		var realOpponent = mapOfPlayers[opponentName];
		opponent.rating = realOpponent.rating;
		opponent.rd = realOpponent.rd;
		opponent.vol = realOpponent.vol;
	}
	thisOpponents[thisOpponents.length] = opponent;
	return thisOpponents;
}

function updatePlayer(playerName, mapOfPlayers, thisOpponents) {
	player = {};
	// Pull from the map if we have it, otherwise glicko.calc fills in the defaults 
	if (mapOfPlayers[playerName]) {
		player = mapOfPlayers[playerName];
	} else {
		player.name = playerName;
	}

	// Calc it!
	var update = glicko.calc(player, thisOpponents, null, .75, 1);

	// Update it
	player.rating = update.update.rating;
	player.rd = update.update.rd;
	player.vol = update.update.vol;
	mapOfPlayers[playerName] = player;
}

function updatePlayerNoKills(playerName, mapOfPlayers) {
	// Player must be in map, run it throught the calc to update the RD. 
	player = mapOfPlayers[playerName];
	var update = glicko.calc(player, [], null, .75, 1);
	player.rating = update.update.rating;
	player.rd = update.update.rd;
	player.vol = update.update.vol;
	mapOfPlayers[playerName] = player;
}

function getSortedPlayers(mapOfPlayers, minimum_rd, resetRanks) {
	var allPlayers = [];
	var xi = 0;
	for (player in mapOfPlayers) {
		playerObj = mapOfPlayers[player];

		// In loops are dumb on large objects
		if (playerObj.name == "") {
			continue;
		}

		if (resetRanks) {
			playerObj.rank = null;
			playerObj.rankArmor = null;
			playerObj.rankNoArmor = null;
		}

		// Drop out if below the minimum RD threshold
		if (playerObj.rd > minimum_rd) {
			continue;
		}

		var newPlayer = {};
		newPlayer.rating = playerObj.rating;
		newPlayer.name = playerObj.name;
		newPlayer.rd = playerObj.rd;
		newPlayer.vol = playerObj.vol;
		allPlayers[xi] = newPlayer;
		xi++;
	}

	allPlayers.sort(function(a, b) {
		if (a.rating && b.rating) {
			return b.rating - a.rating
		} else
			return -1
	});
	return allPlayers;
}

function getFinalArray(mapOfPlayers) {
	var allPlayers = [];
	var xi = 0;
	for (player in mapOfPlayers) {
		playerObj = mapOfPlayers[player];

		// In for loops seem to randomly contain blank entires. 
		if (playerObj.name == "") {
			continue;
		}

		var newPlayer = {};
		newPlayer.rating = playerObj.rating;
		newPlayer.ratingArmor = playerObj.ratingArmor;
		newPlayer.ratingNoArmor = playerObj.ratingNoArmor;
		newPlayer.name = playerObj.name;
		newPlayer.rank = playerObj.rank === 0 ? 1 : playerObj.rank ? playerObj.rank + 1 : playerObj.rank;
		newPlayer.rankArmor = playerObj.rankArmor === 0 ? 1 : playerObj.rankArmor ? playerObj.rankArmor + 1 : playerObj.rankArmor;
		newPlayer.rankNoArmor = playerObj.rankNoArmor === 0 ? 1 : playerObj.rankNoArmor ? playerObj.rankNoArmor + 1 : playerObj.rankNoArmor;
		newPlayer.rd = playerObj.rd;
		allPlayers[xi] = newPlayer;
		xi++;
	}

	allPlayers.sort(function(a, b) {
		if (a.rank == undefined) {
			return 1
		}
		if (b.rank == undefined) {
			return -1
		}
		if (a.rank && b.rank) {
			return a.rank === b.rank ? 0 : a.rank < b.rank ? -1 : 1
		} else
			return 1
	});
	return allPlayers;
}

// Do initial load and set a timer
doMaths();
timers.setInterval(doMaths, UPDATE_INTERVAL);

app.options('/', function(req, res) {
	res.header("Access-Control-Allow-Origin", "*");
	res.header("Access-Control-Allow-Headers", "X-Requested-With");
	res.end('');
});

app.get('/', function(req, res) {
	res.header("Access-Control-Allow-Origin", "*");
	res.header("Access-Control-Allow-Headers", "X-Requested-With");
	res.send(getFinalArray(playerMap));
	console.log('Connection: ' + req);
});

app.options('/player', function(req, res) {
	res.header("Access-Control-Allow-Origin", "*");
	res.header("Access-Control-Allow-Headers", "X-Requested-With");
	res.end('');
});

app.get('/player', function(req, res) {
	res.header("Access-Control-Allow-Origin", "*");
	res.header("Access-Control-Allow-Headers", "X-Requested-With");
	res.send(playerMap[req.query['name']]);
	console.log('Connection: ' + req);
});

app.listen(SERVER_PORT);
console.log('Server running at http://127.0.0.1:' + SERVER_PORT);
