
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
const log4js = require('log4js');
const os = require("os");

log4js.configure({
	appenders: {
		out: { 
			type: 'stdout', 
			layout: {
				type: 'pattern',
				pattern: '%[ %d %p %m %]' 
			}},
		app: { 
			type: 'file', 
			filename: `${__dirname}/potree_server.log`, 
			layout: {
				type: 'pattern',
				pattern: '%d %p %m' 
			},
			maxLogSize: 52428800, backups: 5, compress: true
		}
	},
	categories: {
		default: { appenders: [ 'out', 'app' ], level: 'debug' }
	}
});

const logger = log4js.getLogger();

process.on('uncaughtException', function(err) {
    logger.error(err);
    process.exit(1);
});

console.log = function(...args){
	logger.info(args.join(" "));
};

console.error = function(...args){
	logger.error(args.join(" "));
};


logger.info(`filename ${__filename}`);
logger.info(`dirname ${__dirname}`);

let settingsPath = `${__dirname}/settings.json`;
let settings = null;

logger.info("starting potree server");
logger.info(`Using settings from: '${settingsPath}'`);

if(fs.existsSync(settingsPath)){
	settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
}else{
	logger.error(`No settings found at: '${settingsPath}'`);
	process.exit()
}

// process.title = `potree_server started by ${os.userInfo().username} at port ${settings.port}`;
// process.title = `test`;


function findWorker(uuid){
	let activeWorker = workers.active.get(uuid);
	
	if(activeWorker){
		return activeWorker;
	}
	
	let finishedWorker = workers.finished.get(uuid);
	
	if(finishedWorker){
		return finishedWorker;
	}
	
	return null;
}

const workerStatus = {
	INACTIVE: 0,
	ACTIVE: 1,
	CANCELED: 2,
	FINISHED: 3
};

class Worker{
	constructor(){
		this.uuid = uuid.v4();
		this.started = new Date();
		this.finished = null;
		this.status = workerStatus.INACTIVE;
		this.user = null;
	}
	
	start(){
		workers.active.set(this.uuid, this);
		this.status = workerStatus.ACTIVE;
	}
	
	cancel(){
		workers.active.delete(this.uuid);
		workers.finished.set(this.uuid, this);
		this.finished = new Date();
		this.status = workerStatus.CANCELED;
	}
	
	done(){
		workers.active.delete(this.uuid);
		workers.finished.set(this.uuid, this);
		this.finished = new Date();
		this.status = workerStatus.FINISHED;
	}
	
	getStatusString(){
		let status = Object.keys(workerStatus).filter(key => workerStatus[key] === this.status)[0];
		return status;
	}
	
	getStatus(){
		let status = {
			type: this.constructor.name,
			uuid: this.uuid,
			started: this.started,
			finished: this.finished,
			status: Object.keys(workerStatus)[this.status]
		};
		
		return status;
	}
	
	statusPage(){
		
		
		let page = `
		<html>
		<body>
		
			worker id: ${this.uuid}<br>
			started at: ${this.started.toLocaleString()}<br>
			status: ${this.getStatusString()}
		
		</body>
		</html>
		`;
		
		return page;
	}
};
class PotreeExtractRegionWorker extends Worker{
	
	// box is a 4x4 matrix that specifies a transformation from a 
	// 1x1x1 box at the origin (coordinates from -0.5 to 0.)
	// to an oriented box in space. 
	// Points within that oriented box are considered "inside" and will be extracted.
	//
	constructor(pointclouds, box, minLevel, maxLevel){
		super();
		
		this.pointclouds = pointclouds;
		this.box = box;
		this.minLevel = minLevel;
		this.maxLevel = maxLevel;
	}
	
	start(){
		super.start();
		
		let purls = this.pointclouds.map(p => url.parse(p));
		let realPointcloudPaths = purls.map(p => settings.wwwroot + p.pathname.substr(1));
		
		logger.info(`realPointcloudPaths ${realPointcloudPaths}`);
		
		let year = this.started.getFullYear().toString();
		let month = (this.started.getMonth()+1).toString().padStart(2, "0");
		let day = this.started.getDate().toString().padStart(2, "0");
		let hours = this.started.getHours().toString().padStart(2, "0");
		let minutes = this.started.getMinutes().toString().padStart(2, "0");
		let seconds = this.started.getSeconds().toString().padStart(2, "0");
		
		if(this.user){
			let username = this.user ? this.user.substring(this.user.lastIndexOf("\\") + 1) : "anonymous";
			this.name = `${year}.${month}.${day}_${hours}.${minutes}.${seconds}_${username}`;
		}else{
			this.name = `${year}.${month}.${day}_${hours}.${minutes}.${seconds}`;
		}
		this.outDir = `${settings.outputDirectory}/${this.uuid}`;
		this.outPath = `${settings.outputDirectory}/${this.uuid}/${this.name}.las`;

		//logger.info("realPointcloudPath", realPointcloudPath);
		
		let args = [
			...realPointcloudPaths,
			"--box", this.box,
			"--min-level", this.minLevel, 
			"--max-level", this.maxLevel, 
			"-o", this.outPath,
			"--metadata", this.user,
		];
		
		//logger.info("spawing region extraction task with arguments: ");
		//logger.info(args);
		
		let process = spawn(getExtractRegionExe(), args, {shell: false, detached: true});
		process.on('close', (code) => {
			//this.done();
			this.archive();
		});
	}
	
	archive(){
		
		this.archivePath = `${settings.outputDirectory}/${this.uuid}/${this.name}.zip`;
		
		logger.info(`archiving results to ${this.archivePath}`);
		
		let output = fs.createWriteStream(this.archivePath);
		let archive = archiver('zip', {
			zlib: { level: 1 }
		});

		output.on('close', () => {
			logger.info("archiving finished");
			this.done();
		});
		
		archive.on('warning', function(err) {
			logger.info(`WARNING: encountered a problem while archiving results ${err.code}`);
		});
		
		archive.on('error', function(err) {
			logger.info(`ERROR: encountered a problem while archiving results ${err.code}`);
		});
		
		archive.pipe(output);
		
		let metadata = {
			user: this.user,
			started: this.started.toISOString(),
			ended: this.started.toISOString(),
		};
		
		archive.append(fs.createReadStream(this.outPath), { name: `${this.name}.las` });
		archive.append(JSON.stringify(metadata, null, "\t"), { name: 'metadata.txt' });
		
		archive.finalize();
	}
	
	done(){
		super.done();
		
		// delete artifacts after an hour, to avoid clogging the filesystem
		setTimeout(this.deleteArtifacts.bind(this), settings.deleteArtifactsAfter)
	}
	
	deleteArtifacts(){
		
		// make sure we don't accidentally delete things like "/" or "C:/"
		if(this.outPath.length < 5 || this.archivePath < 5 || this.outDir.length < 5){
			logger.info(`artifacts not deleted because they appeared unsafe: ${this.outDir}`);
			return;
		}
		
		fs.unlink(this.outPath, () => {
			fs.unlink(this.archivePath, () => {
				fs.rmdir(this.outDir, () => {});
			});
		});
	}
	
	cancel(){
		super.cancel();
	}
	
	getStatus(){
		
		let status = super.getStatus();
		
		if(this.status === workerStatus.FINISHED){
			status.link = `./get_las?workerID=${this.uuid}`;
		}
		
		return status;
	}
	
	statusPage(){
		
		let finished = this.finished ? this.finished.toLocaleString() : "no yet";
		
		let content = "";
		if([workerStatus.FINISHED, workerStatus.CANCELED].includes(this.status)){
			// TODO URL is hardcoded!!
			let downloadLink = `./get_las?workerID=${this.uuid}`;
			content = `
			Extracted profile is available for download at: <br>
			<a href="${downloadLink}">${downloadLink}</a>
			`;
		}else{
			content = `Region extraction in progress.`;
		}
		
		let page = `
		<html>
		<style>${css}</style>
		<body>
		
		<div class="centering">
		<div class="panel">
			<span id="titlebar" class="titlebar">Region Extraction - Status</span>
			<span id="workerdata" class="workerdata">
				<table>
					<tr>
						<td>uuid</td>
						<td>${this.uuid}</td>
					</tr>
					<tr>
						<td>started</td>
						<td>${this.started.toLocaleString()}</td>
					</tr>
					<tr>
						<td>finished</td>
						<td>${finished}</td>
					</tr>
				</table>
			</span>
			<span id="content" class="content">
				${content}
			</span>
		</div>
		</div>	
		
		</body>
		</html>
		`;
		
		return page;
	}
};


let app = express();
let server = http.createServer(app);

function getExtractRegionExe(){
	let exe = null;
	if(fs.existsSync(settings.extractRegionExe)){
		exe = settings.extractRegionExe;
	}else if(fs.existsSync(`${__dirname}/${settings.extractRegionExe}`)){
		exe = `${__dirname}/${settings.extractRegionExe}`;
	}else{
		logger.info(`extractRegionExe not found at expected location: ${settings.extractRegionExe}`);
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
	
	logger.info(`realPointcloudPaths ${realPointcloudPaths}`);
	
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

	app.use("/start_extract_region_worker", function(request, response, next){
		
		logger.info("start_extract_region_worker");
		
		let purl = url.parse(request.url, true);
		let query = purl.query;
		
		let v = (value, def) => ((value === undefined) ? def : value);
		
		let minLevel = v(query.minLOD, 0);
		let maxLevel = v(query.maxLOD, 5);
		let box = v(query.box, null);
		let pointclouds = v(query["pointcloud[]"], []);
		if(!(pointclouds instanceof Array)){
			pointclouds = [pointclouds];
		}
		
		if(pointclouds.length === 0){
			logger.warn("start_extract_region_worker was called without point cloud");
			
			let res = {
				status: "ERROR_NO_POINTCLOUD_SPECIFIED",
				message: "Failed to start a region extraction worker because no point cloud was specified"
			};
			
			response.end(JSON.stringify(res, null, "\t"));
			return;
		}
		
		let check = potreeCheckRegionThreshold(pointclouds, box, minLevel, maxLevel, settings.maxPointsProcessedThreshold);

		try{
			check = JSON.parse(check.stdout.toString());
		}catch(e){
			logger.info(e);
			logger.info(`JSON: ${check.stdout.toString()}`);
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
		logger.info("start_extract_region_worker");
		
		let purl = url.parse(req.url, true);
		let query = purl.query;
		
		let v = (value, def) => ((value === undefined) ? def : value);
		
		//let minLevel = v(query.minLOD, 0);
		//let maxLevel = v(query.maxLOD, 5);
		//let box = v(query.box, null);
		//let pointcloud = v(query.pointcloud, null);
		
		logger.info(query);
		
		res.end();
	});
}

server.listen(settings.port, () => {
	logger.info(`server is listening on ${settings.port}`)
});
