
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

//console.log(__filename);
//console.log(__dirname);

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

const workers = {
	active: new Map(),
	finished: new Map()
};

function potreeCheckRegionThreshold(pointcloud, box, minLevel, maxLevel, threshold){
	
	let purl = url.parse(pointcloud);
	let realPointcloudPath = settings.serverWorkingDirectory + purl.pathname.substr(1);
	
	console.log("realPointcloudPath", realPointcloudPath);
	
	let args = [
		realPointcloudPath,
		"--box", box,
		"--min-level", minLevel, 
		"--max-level", maxLevel, 
		"--stdout",
		"--check-threshold", threshold
	];
	
	let result = spawnSync(settings.extractRegionExe, args, {shell: false});
	
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
		let pointcloud = v(query.pointCloud, null);
		
		let check = potreeCheckRegionThreshold(pointcloud, box, minLevel, maxLevel, settings.maxPointsProcessedThreshold);

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
			let worker = new PotreeExtractRegionWorker(pointcloud, box, minLevel, maxLevel);
			
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
		console.log("TEST!!")
		res.send("woah");
	});
}


//function handleRequestFile(request, response){
//	//http://localhost:3000/resources/server.css
//	
//	let purl = url.parse(request.url, true);
//	let query = purl.query;
//	
//	
//	let file = `${settings.wwwroot}${purl.pathname}`;
//	
//	if(fs.existsSync(file)){
//		// TODO proper mime type handling, e.g.https://www.npmjs.com/package/mime-types
//		if(file.toLowerCase().endsWith(".css")){
//			response.writeHead(200, {
//				'Content-Type': 'text/css'
//			});
//		}else{
//			response.writeHead(200, {
//				'Content-Type': 'application/octet-stream'
//			});
//		}
//		
//		let readStream = fs.createReadStream(file);
//		readStream.pipe(response);
//		
//		readStream.on('close', response.end);
//		readStream.on('error', response.end);
//	}else{
//		response.statusCode = 404;
//		response.end("");
//	}
//	
//}



server.listen(settings.port, () => {
	console.log(`server is listening on ${settings.port}`)
});

//function startServer(){
//
//	let requestHandler = (request, response) => {  
//		console.log();
//		console.log("======= REQUEST START =======");
//		
//		let purl = url.parse(request.url, true);
//		let basename = purl.pathname.substr(purl.pathname.lastIndexOf("/") + 1);
//		let query = purl.query;
//		
//		console.log("date: ", new Date().toISOString());
//		console.log("from: ", request.headers.host);
//		console.log("request: ", request.url);
//		
//		if(request.headers.origin){
//			response.setHeader('Access-Control-Allow-Origin', request.headers.origin);
//		}
//		response.setHeader('Access-Control-Allow-Headers', 'authorization, content-type');
//		
//		let handler = null;
//		if(request.url === "/"){
//			handler = handlers["get_status"];
//		}else if(handlers[basename]){
//			handler = handlers[basename];
//		}else{
//			handler = handleRequestFile;
//		}
//		
//		if(handler){
//			handler(request, response);
//		}else{
//			response.statusCode = 404;
//			response.end("");
//		}
//		
//		
//		console.log("======= REQUEST END =======");
//	};
//
//	let server = http.createServer(requestHandler);
//
//	server.listen(settings.port, (err) => {  
//		if (err) {
//			return console.log('could not start server', err)
//		}
//		
//		console.log(`server is listening on ${settings.port}`)
//	});
//}
//
//startServer();