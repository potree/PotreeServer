
const express = require("express");
const cors = require('cors');
const spawnSync = require('child_process').spawnSync;
const spawn = require('child_process').spawn;
const uuidv4 = require('uuid/v4');
const url = require('url');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require("os");
//const archiver = require('archiver');
//const log4js = require('log4js');

const PlaneClipRegion = require("./PlaneClipRegion.js").PlaneClipRegion;
const Vector3 = require("./Vector3.js").Vector3;
const Plane = require("./Plane.js").Plane;
const RegionsFilter = require("./RegionsFilter.js").RegionsFilter;

let app = express();
let server = http.createServer(app);

const logger = console;

logger.info(`filename ${__filename}`);
logger.info(`dirname ${__dirname}`);

let settingsPath = `./settings.json`;
let settings = null;

let maxNodes = 1000;
let maxPoints = 2 * 1000 * 1000;

logger.info("starting potree server");
logger.info(`Using settings from: '${settingsPath}'`);

if(fs.existsSync(settingsPath)){
	settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
}else{
	logger.error(`No settings found at: '${settingsPath}'`);
	process.exit()
}








function clipRegionsFromRequest(req){
	let purl = url.parse(req.url, true);
	let query = purl.query;

	let v = (value, def) => ((value === undefined) ? def : value);

	let qRegions = v(query["regions"], "");
	let jRegions = JSON.parse(qRegions);

	let clipRegions = [];
	for(let jregion of jRegions){

		let planes = jregion.map( jplane => {
			return new Plane(new Vector3(...jplane.slice(0,3)), jplane[3]);
		});

		let clipRegion = new PlaneClipRegion(planes);
		clipRegions.push(clipRegion);
	}

	return clipRegions;
};



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


	app.use("/create_regions_filter", async function (req, res, next) {

		let clipRegions = clipRegionsFromRequest(req);

		let pointcloudPath = "C:/dev/workspaces/potree/develop/pointclouds/heidentor/cloud.js";
		let regionsFilter = new RegionsFilter(pointcloudPath, clipRegions);

		let estimate = await regionsFilter.estimate();

		let requestTooBig = estimate.numNodes > maxNodes || estimate.numPoints > maxPoints;

		let response;

		if(requestTooBig){
			// return bad news

			let {numNodes, numPoints} = estimate;

			let message = `Too many points or nodes in filter region.`;
			message += `Estimated: ${numNodes} nodes, ${numPoints} points`;
			message += `Allowed: ${maxNodes} nodes, ${maxPoints} points`;

			response = {
				status: "ERROR",
				message: message
			};
		}else{
			// return handle to request, while request is being processed

			let handle = uuidv4();
			let outputDirectory = `${settings.outputDirectory}/${handle}`;

			regionsFilter.filter(outputDirectory);

			response = {
				status: "WORKING",
				handle: handle,
				estimate: {
					numNodes: estimate.numNodes,
					numPoints: estimate.numPoints
				}
			};
		}

		let responseString = JSON.stringify(response, null, "\t");

		res.send(responseString);
		res.end();
	});

	app.use("/check_regions_filter", async function (req, res, next) {
		let purl = url.parse(req.url, true);
		let query = purl.query;

		let v = (value, def) => ((value === undefined) ? def : value);

		let handle = v(query["handle"], null);

		if(!handle){
			let response = {
				status: "ERROR",
				message: "invalid handle"
			};
			let responseString = JSON.stringify(response, null, "\t");
			res.send(responseString);
			res.end();
		}

		let workDir = `${settings.outputDirectory}/${handle}`;
		let reportPath = `${workDir}/report.json`;
		if(!fs.existsSync(reportPath)){
			let response = {
				status: "ERROR",
				message: `could not find worker/results for handle '${handle}'`
			};
			let responseString = JSON.stringify(response, null, "\t");
			res.send(responseString);
			res.end();
		}else{
			let response = {
				status: "FINISHED",
				message: "yeah!"
			};
			let responseString = JSON.stringify(response, null, "\t");
			res.send(responseString);
			res.end();
		}
	});

	app.use("/download_regions_filter_result", async function (req, res, next) {
		let purl = url.parse(req.url, true);
		let query = purl.query;

		let v = (value, def) => ((value === undefined) ? def : value);

		let handle = v(query["handle"], null);

		let workDir = `${settings.outputDirectory}/${handle}`;
		let filePath = `${workDir}/clipped.las`;
		let stat = fs.statSync(filePath);

		res.writeHead(200, {
			'Content-Type': 'application/octet-stream',
			"Content-Disposition": `attachment;filename=clipped.las`,
			'Content-Length': stat.size,
			"Connection": "Close"
		});

		let readStream = fs.createReadStream(filePath);
		readStream.on('data', function(data) {
			res.write(data);
		});
		
		readStream.on('close', function() {
			res.end();
		});

	});
}

server.listen(settings.port, () => {
	logger.info(`server is listening on ${settings.port}`)
});
