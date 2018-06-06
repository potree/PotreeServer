
//const archiver = require('archiver');
const express = require("express");
const cors = require('cors');
const spawnSync = require('child_process').spawnSync;
const spawn = require('child_process').spawn;
//const uuid = require('uuid');
const url = require('url');
const http = require('http');
const fs = require('fs');
const path = require('path');
//const log4js = require('log4js');
const os = require("os");

const PlaneClipRegion = require("./PlaneClipRegion.js").PlaneClipRegion;
const Vector3 = require("./Vector3.js").Vector3;
const Plane = require("./Plane.js").Plane;
const RegionFilter = require("./RegionFilter.js");
const RegionsFilter = require("./RegionsFilter.js").RegionsFilter;

let app = express();
let server = http.createServer(app);

const logger = console;

logger.info(`filename ${__filename}`);
logger.info(`dirname ${__dirname}`);

//let settingsPath = `${__dirname}/settings.json`;
let settingsPath = `./settings.json`;
let settings = null;

logger.info("starting potree server");
logger.info(`Using settings from: '${settingsPath}'`);

if(fs.existsSync(settingsPath)){
	settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
}else{
	logger.error(`No settings found at: '${settingsPath}'`);
	process.exit()
}


// various handlers that are invoked by accessing http://<server>/<handler>
// e.g. http://localhost:3000/observe_status?workerID=abc

{ // INSTALL HANDLERS

	app.use(cors({credentials: true, origin: true}));

	if(settings.authenticate){
		app.use(function (req, res, next) {
			var nodeSSPI = require('node-sspi');
			var nodeSSPIObj = new nodeSSPI({
				retrieveGroups: true
			});
			
			//logger.info("=== authenticate === ");
			
			nodeSSPIObj.authenticate(req, res, function(err){
				//logger.info("authenticated");
				
				//if (req.connection.userGroups) {
				//	logger.info(req.connection.userGroups.join(", "));
				//}else{
				//	logger.info("no authentication");
				//}
				
				
				//logger.info(err);
				res.finished || next();
			});
		});
	}
	
	app.use( (req, res, next) => {
		logger.info("======= REQUEST START =======");
		logger.info(`date: ${new Date().toISOString()}`);
		logger.info(`host: ${req.headers.host}`);
		logger.info(`request: ${req.url}`);
		
		if(settings.authenticate){
			if(req.connection.user){
				logger.info(`user: ${req.connection.user}`);
			}
		}
		
		next();
	});


	app.use("/authentication", function (req, res, next) {
		
		if(!settings.authenticate){
			res.send(`authentication disabled`);
			return;
		}
		
		let user = req.connection.user;
		let username = user.substring(user.lastIndexOf("\\") + 1);
		
		let msg = `user: ${req.connection.user} - ${username}<br>
		groups: <br>`;
	
		if (req.connection.userGroups) {
			msg += req.connection.userGroups.join("<br>");
		}else{
			msg += "no authentication";
		}
	
		res.send(msg);
	});

	app.use("/test", function (req, res, next) {
		let msg = "asd";
	
		res.send(msg);
	});

	app.use("/clip", function (req, res, next) {

		let purl = url.parse(req.url, true);
		let query = purl.query;
		
		let v = (value, def) => ((value === undefined) ? def : value);
		

		try{
			let qRegions = v(query["regions"], 0);
			let jRegions = JSON.parse(qRegions);

			let clipRegions = [];
			for(let jregion of jRegions){

				//for(let jplane of jregion){
				//	let plane = new Plane(new Vector3(...jregion.slice(0,3)), jregion[3]);
				//	planes.push(plane);
				//}

				let planes = jregion.map( jplane => {
					return new Plane(new Vector3(...jplane.slice(0,3)), jplane[3]);
				});

				let clipRegion = new PlaneClipRegion(planes);
				clipRegions.push(clipRegion);
			}

			let path = "D:/dev/pointclouds/archpro/heidentor/cloud.js";
			//RegionFilter.filter(path, clipRegions);

			RegionsFilter.filter(path, clipRegions);

		}catch(e){
			//TODO
			console.error(e);
		}
		



		let msg = "asd";
	
		res.send(msg);
		res.end();
	});
	
}

server.listen(settings.port, () => {
	logger.info(`server is listening on ${settings.port}`)
});
