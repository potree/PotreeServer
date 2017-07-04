
const archiver = require('archiver');
const express = require("express");
const cors = require('cors');
const spawnSync = require('child_process').spawnSync;
const spawn = require('child_process').spawn;
const uuid = require('uuid');
const url = require('url');
const http = require('http');
const fs = require('fs');
const path = require('path');

console.log("filename", __filename);
console.log("dirname", __dirname);

let settingsPath = `${__dirname}/settings.json`;
let settings = null;

console.log("starting potree server");
console.log(`Using settings from: '${settingsPath}'`);

let app = express();
let server = http.createServer(app);

if(fs.existsSync(settingsPath)){
	settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
}else{
	console.err(`No settings found at: '${settingsPath}'`);
	process.exit()
}

function getExtractRegionExe(){
	let exe = null;
	if(fs.existsSync(settings.extractRegionExe)){
		exe = settings.extractRegionExe;
	}else if(fs.existsSync(`${__dirname}/${settings.extractRegionExe}`)){
		exe = `${__dirname}/${settings.extractRegionExe}`;
	}else{
		console.log("extractRegionExe not found at expected location: ", settings.extractRegionExe);
	}
	
	return exe;
}

const workers = {
	active: new Map(),
	finished: new Map()
};

function potreeCheckRegionThreshold(pointclouds, box, minLevel, maxLevel, threshold){
	
	let purls = pointclouds.map(p => url.parse(p));
	let realPointcloudPaths = purls.map(p => settings.wwwroot + p.pathname.substr(1));
	
	console.log("realPointcloudPaths", realPointcloudPaths);
	
	let args = [
		...realPointcloudPaths,
		"--box", box,
		"--min-level", minLevel, 
		"--max-level", maxLevel, 
		"--stdout",
		"--check-threshold", threshold
	];
	
	
	let result = spawnSync(getExtractRegionExe(), args, {shell: false, detached: true});
	
	return result;
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
			
			//console.log("=== authenticate === ");
			
			nodeSSPIObj.authenticate(req, res, function(err){
				//console.log("authenticated");
				
				//if (req.connection.userGroups) {
				//	console.log(req.connection.userGroups.join(", "));
				//}else{
				//	console.log("no authentication");
				//}
				
				
				//console.log(err);
				res.finished || next();
			});
		});
	}
	
	app.use( (req, res, next) => {
		console.log("======= REQUEST START =======");
		console.log("date: ", new Date().toISOString());
		console.log("host: ", req.headers.host);
		console.log("request: ", req.url);
		
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

	app.use("/start_extract_region_worker", function(request, response, next){
		
		console.log("start_extract_region_worker");
		
		let purl = url.parse(request.url, true);
		let query = purl.query;
		
		let v = (value, def) => ((value === undefined) ? def : value);
		
		let minLevel = v(query.minLOD, 0);
		let maxLevel = v(query.maxLOD, 5);
		let box = v(query.box, null);
		let pointclouds = v(query["pointcloud[]"], []);
		
		let check = potreeCheckRegionThreshold(pointclouds, box, minLevel, maxLevel, settings.maxPointsProcessedThreshold);

		try{
			check = JSON.parse(check.stdout.toString());
		}catch(e){
			console.log(e);
			console.log("JSON: ", check.stdout.toString());
			let res = {
				status: "ERROR_START_EXTRACT_REGION_WORKER_FAILED",
				message: "Failed to start a region extraction worker"
			};
			
			response.end(JSON.stringify(res, null, "\t"));
		}
		
		if(check.result === "THRESHOLD_EXCEEDED"){
			let res = {
				status: "ERROR_POINT_PROCESSED_ESTIMATE_TOO_LARGE",
				message: `Too many candidate points within the selection.`
			};
			
			response.end(JSON.stringify(res, null, "\t"));
		}else if(check.result === "BELOW_THRESHOLD"){
			let worker = new PotreeExtractRegionWorker(pointclouds, box, minLevel, maxLevel);
			
			if(settings.authenticate){
				worker.user = request.connection.user ? request.connection.user : null;
			}
			
			worker.start();
			
			let res = {
				status: "OK",
				workerID: worker.uuid,
				message: `Worker sucessfully spawned: ${worker.uuid}`
			};
			
			response.end(JSON.stringify(res, null, "\t"));
		}
	});
	
	app.use("/get_las", function(request, response){
		let purl = url.parse(request.url, true);
		let query = purl.query;
		
		let workerID = query.workerID;
		let worker = findWorker(workerID);
		
		if(worker){
			
			// AUTHENTICATION & AUTHORIZATION
			if(settings.authenticate){
				if(request.connection.user){
					if(request.connection.user !== worker.user){
						let res = {
							status: "ERROR_AUTHORIZATION_FAILED",
							workerID: worker.uuid,
							message: `Authorization failed. Did you try to download someone elses results?`
						};
						
						response.end(JSON.stringify(res, null, "\t"));
						return;
					}
				}else{
					let res = {
						status: "ERROR_AUTHENTICATION_FAILED",
						workerID: worker.uuid,
						message: `Authentication failed, anonymous access not permitted.`
					};
					
					response.end(JSON.stringify(res, null, "\t"));
					return;
				}
			}
			
			let filePath = worker.archivePath;
			let stat = fs.statSync(filePath);

			response.writeHead(200, {
				'Content-Type': 'application/octet-stream',
				"Content-Disposition": `attachment;filename=${worker.name}.zip`,
				'Content-Length': stat.size,
				"Connection": "Close"
			});

			let readStream = fs.createReadStream(filePath);
			readStream.on('data', function(data) {
				response.write(data);
			});
			
			readStream.on('close', function() {
				worker.deleteArtifacts();
				
				response.end();        
			});
			
			return null;
		}else{
			response.statusCode = 404;
			response.end("");
		}
	});
	
	app.use("/observe_status", function(request, response){
		let purl = url.parse(request.url, true);
		let query = purl.query;
		
		let workerID = query.workerID;
		let worker = findWorker(workerID);
			
		if(!worker){
			let res = {
				status: "ERROR_WORKER_NOT_FOUND",
				message: `A worker with the specified ID could not be found.`
			};
			
			response.end(JSON.stringify(res, null, "\t"));
			return;
		}
		
		response.writeHead(200, {
			'Content-Type': 'text/plain; charset=utf-8',
			'Transfer-Encoding': 'chunked',
			'X-Content-Type-Options': 'nosniff'});
		
		let observe = () => {
			let status = worker.status;
			
			let res = null;
			
			if(status === workerStatus.ACTIVE){
				res = {
					status: "ACTIVE",
					message: ``
				};
			}else if(status === workerStatus.CANCELED){
				res = {
					status: "CANCELED",
					message: ``
				};
			}else if(status === workerStatus.FINISHED){
				res = {
					status: "FINISHED",
					message: ``
				};
			}
			
			if(status === workerStatus.FINISHED){
				response.end(JSON.stringify(res, null, "\t"));
			}else{
				response.write(JSON.stringify(res, null, "\t"));
				setTimeout(observe, 500);
			}
		};
		
		observe();
	});
	
	app.use("/get_status", function(request, response){
		let purl = url.parse(request.url, true);
		let query = purl.query;
		
		let workerID = query.workerID;
		
		if(!workerID){
			
			let res = `<html>
			<link rel="stylesheet" type="text/css" href="http://${request.headers.host}/server.css">
			<body>`;
			
			{ // ACTIVE WORKERS
				res += `
				Number of active workers: ${workers.active.size} <br>
				
				<table>
					<tr>
						<th>Type</th>
						<th>ID</th>
						<th>started</th>
						<th>status</th>
					</tr>
				`;
				
				for(let entry of workers.active){
					let worker = entry[1];
					
					res += `
					<tr>
						<td>${worker.constructor.name}</td>
						<td><a href="./get_status?workerID=${entry[0]}">${entry[0]}</a></td>
						<td>${worker.started.toLocaleString()}</td>
						<td>${worker.getStatusString()}</td>
					</tr>`;
				}
				
				res += `</table>`;
			}
			
			res += `<br>`;
			
			{ // FINISHED / CANCELED WORKERS
				res += `
				Number of finished / canceled workers: ${workers.finished.size} <br>
				
				<table>
					<tr>
						<th>Type</th>
						<th>ID</th>
						<th>started</th>
						<th>status</th>
					</tr>`;
				
				for(let entry of workers.finished){
					let worker = entry[1];
					
					res += `
					<tr>
						<td>${worker.constructor.name}</td>
						<td><a href="./get_status?workerID=${entry[0]}">${entry[0]}</a></td>
						<td>${worker.started.toLocaleString()}</td>
						<td>${worker.getStatusString()}</td>
					</tr>`;
				}
				
				res += `</table>`;
			}
			
			res += `</body></html>`;
			
			response.end(res);
		}else{
		
			//let worker = workers.active.get(workerID);
			let worker = findWorker(workerID);
			
			if(!worker){
				response.end(`no worker with specified ID found`);
				//return `no worker with specified ID found`;
			}else{
				//response.end(worker.statusPage());
				response.end(JSON.stringify(worker.getStatus(), null, "\t"));
			}
		}
	});
	
	app.use("/test", (req, res, next) => {
		console.log("start_extract_region_worker");
		
		let purl = url.parse(req.url, true);
		let query = purl.query;
		
		let v = (value, def) => ((value === undefined) ? def : value);
		
		//let minLevel = v(query.minLOD, 0);
		//let maxLevel = v(query.maxLOD, 5);
		//let box = v(query.box, null);
		//let pointcloud = v(query.pointcloud, null);
		
		console.log(query);
		
		res.end();
	});
}

server.listen(settings.port, () => {
	console.log(`server is listening on ${settings.port}`)
});
