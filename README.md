mcp-glicko2
===========

A node.js glicko2 implementation designed for use on the nerd.nu survival minecraft server.

The glicko2 math was primarily from https://github.com/RobKohr/glicko with step 5 ripped from https://github.com/mmai/glicko2 with some additional fixes that I can't remember.  


This glicko2 implementation uses json data received from a webserver in the form
```javascript
[{"killer_name": "Emery17", "player_name": "Castroph", "id": 17375, "killer_item": "DIAMOND_SWORD", "armor_kill": 0}, {"killer_name": "Fatalx_Bladez", "player_name": "Animator06", "id": 17374, "killer_item": "IRON_SWORD", "armor_kill": 1}]
```

The glicko2 ratings/rd/vol are then tracked and calculated for all kills, armored kills, and no armor kills seperately (each 'player' will have at least 2 sets of stats) and stored in memory.  Mcp-glicko2 will run in the background and periodically check for updated kill data and calculate based off a configurable timeframe.  


REST API 
========
The data is then served with a simple json REST api.  
```javascript
// GET   http://server:port/  - Returns all player data 
[{
    "rating": 2161.87303888707,
    "ratingArmor": 2292.8387525523276,
    "ratingNoArmor": 1951.3107162629283,
    "name": "nyislanders2121",
    "rank": 3,
    "rankArmor": 0,
    "rankNoArmor": 27,
    "rd" : 97.56178153473715
  },
  {
    "rating": 2132.372858152526,
    "ratingArmor": 1727.896777949494,
    "ratingNoArmor": 2247.4094113403276,
    "name": "bhrossman",
    "rank": 4,
    "rankArmor": 46,
    "rankNoArmor": 0,
    "rd": 102.22539832283118
  }
]


// GET   http://server:port/player?name=playername  - Returns single players data
{
  "name": "nyislanders2121",
  "rating": 2161.87303888707,
  "rd": 100.89729442334699,
  "vol": 0.060010712230690606,
  "rank": 3,
  "rankArmor": 0,
  "ratingArmor": 2292.8387525523276,
  "rdArmor": 160.11164312999563,
  "volArmor": 0.06002469492242501,
  "rankNoArmor": 27,
  "ratingNoArmor": 1951.3107162629283,
  "rdNoArmor": 137.7905236503313,
  "volNoArmor": 0.059989345992112184
}
```

Config and install
==================
Configuration is at the top of the mcp-glick2.js file.  If you wish to tweak the glick2o math settings they are in glicko2.js. 

Installation and starting is normal node.js.  
```
npm install
node mcp-glicko2.js
```
