
const spawnSync = require('child_process').spawnSync;
const spawn = require('child_process').spawn;
const uuid = require('uuid');
const url = require('url');
const http = require('http');

const port = 3000;
const serverWorkingDirectory = "D:/";
const outputDirectory = "D:/dev/temp";
const elevationProfileExe = "D:/dev/workspaces/CPotree/master/bin/Release_x64/PotreeElevationProfile.exe";
let maxPointsProcessedThreshold = 10*1000*1000;

const css = `

body{
	display: flex;
	align-items: center;
	justify-content: center;
}

.panel{
	border: 1px solid black;
	position: absolute;
}

.titlebar{
	display: flex;
	justify-content: center;
	align-items: center;
	font-weight: bold;
	margin: 5px;
}

.workerdata{
	display: flex;
	margin: 5px;
}

.content{
	display: block;
	margin: 5px;
}

`;

const workers = {
	active: new Map(),
	finished: new Map()
};

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
}

class Worker{
	constructor(){
		this.uuid = uuid.v4();
		this.started = new Date();
		this.finished = null;
		this.status = workerStatus.INACTIVE;
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

class PotreeElevationProfileWorker extends Worker{
	constructor(pointcloud, coordinates, width, minLevel, maxLevel){
		super();
		
		this.pointcloud = pointcloud;
		this.coordinates = coordinates;
		this.width = width;
		this.minLevel = minLevel;
		this.maxLevel = maxLevel;
	}
	
	start(){
		super.start();
		
		let purl = url.parse(this.pointcloud);
		let realPointcloudPath = serverWorkingDirectory + purl.pathname.substr(1);
		let outPath = `${outputDirectory}/${this.uuid}/result.las`;
		
		console.log("realPointcloudPath", realPointcloudPath);
		
		let args = [
			realPointcloudPath,
			"--coordinates", this.coordinates,
			"--width", this.width, 
			"--min-level", this.minLevel, 
			"--max-level", this.maxLevel, 
			"-o", outPath
		];
		
		this.outPath = outPath;
		
		console.log("spawing elevation profile task with arguments: ");
		console.log(args);
		
		let process = spawn(elevationProfileExe, args, {shell: false});
		process.on('close', (code) => {
			this.done();
			//console.log(`child process exited with code ${code}`);
		});

	}
	
	cancel(){
		super.cancel();
	}
	
	
	statusPage(){
		
		let finished = this.finished ? this.finished.toLocaleString() : "no yet";
		
		let content = "";
		if([workerStatus.FINISHED, workerStatus.CANCELED].includes(this.status)){
			content = `
			Extracted profile is available for download at: <br>
			<a href="${this.outPath}">${this.outPath}</a>
			`;
		}else{
			content = `Profile extraction in progress.`;
		}
		
		let page = `
		<html>
		<style>${css}</style>
		<body>
		
		
		<div class="panel">
			<span id="titlebar" class="titlebar">Profile Extraction - Status</span>
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
			
		
		</body>
		</html>
		`;
		
		return page;
	}
};

function potreeElevationProfile(pointcloud, coordinates, width, minLevel, maxLevel, estimate){
	//let args = [
	//	"D:/dev/pointclouds/converted/CA13/cloud.js",
	//	"--coordinates", "{693550.968, 3915914.169},{693890.618, 3916387.819},{694584.820, 3916458.180},{694786.239, 3916307.199}",
	//	"--width", "14.0", "--min-level", "0", "--max-level", "3", "--stdout",
	//	"--estimate"
	//];

	let purl = url.parse(pointcloud);
	let realPointcloudPath = serverWorkingDirectory + purl.pathname.substr(1);
	
	console.log("realPointcloudPath", realPointcloudPath);
	
	let args = [
		realPointcloudPath,
		"--coordinates", coordinates,
		"--width", width, 
		"--min-level", minLevel, 
		"--max-level", maxLevel, 
		"--stdout"
	];
	
	if(estimate){
		args.push("--estimate");
	}
	
	let result = spawnSync(elevationProfileExe, args, {shell: false});
	
	return result;
}


let handlers = {
	
	"get_profile": function(request, response){
		let purl = url.parse(request.url, true);
		let query = purl.query;
		
		let v = (value, def) => ((value === undefined) ? def : value);
		
		let minLevel = v(query.minLOD, 0);
		let maxLevel = v(query.maxLOD, 5);
		let width = v(query.width, 1);
		let coordinates = v(query.coordinates, null);
		let pointcloud = v(query.pointCloud, null);
		
		let result = potreeElevationProfile(pointcloud, coordinates, width, minLevel, maxLevel, true);
		
		return result.stdout;
	},
	
	"start_profile_worker": function(request, response){
		let purl = url.parse(request.url, true);
		let query = purl.query;
		
		let v = (value, def) => ((value === undefined) ? def : value);
		
		let minLevel = v(query.minLOD, 0);
		let maxLevel = v(query.maxLOD, 5);
		let width = v(query.width, 1);
		let coordinates = v(query.coordinates, null);
		let pointcloud = v(query.pointCloud, null);
		
		let result = potreeElevationProfile(pointcloud, coordinates, width, minLevel, maxLevel, true);
		
		if(result.pointsProcessed > maxPointsProcessedThreshold){
			let res = {
				status: "ERROR_POINT_PROCESSED_ESTIMATE_TOO_LARGE",
				estimate: result.pointsProcessed,
				message: `Too many candidate points within the selection: ${result.pointsProcessed}`
			};
			
			return JSON.stringify(res, null, "\t");
		}else{
			let worker = new PotreeElevationProfileWorker(pointcloud, coordinates, width, minLevel, maxLevel);
			worker.start();
			
			let res = {
				status: "OK",
				workerID: worker.uuid,
				message: `Worker sucessfully spawned: ${worker.uuid}`
			};
			
			return JSON.stringify(res, null, "\t");
		}
		
		
	},
	
	"get_status": function(request, response){
		let purl = url.parse(request.url, true);
		let query = purl.query;
		
		let workerID = query.workerID;
		
		if(!workerID){
			
			
			
			let response = `<html><body>`;
			
			{ // ACTIVE WORKERS
				response += `
				Number of active workers: ${workers.active.size} <br>
				
				<table>`;
				
				for(let entry of workers.active){
					response += `
					<tr>
						<td>${entry[0]}</td>
						<td>${entry[1].started.toLocaleString()}</td>
						<td>${entry[1].getStatusString()}</td>
					</tr>`;
				}
				
				response += `</table>`;
			}
			
			{ // ACTIVE WORKERS
				response += `
				Number of finished / canceled workers: ${workers.finished.size} <br>
				
				<table>`;
				
				for(let entry of workers.finished){
					response += `
					<tr>
						<td>${entry[0]}</td>
						<td>${entry[1].started.toLocaleString()}</td>
						<td>${entry[1].getStatusString()}</td>
					</tr>`;
				}
				
				response += `</table>`;
			}
			
			response += `</body></html>`;
			
			return response;
		}else{
		
			//let worker = workers.active.get(workerID);
			let worker = findWorker(workerID);
			
			if(!worker){
				return `no worker with specified ID found`;
			}else{
				return worker.statusPage();
			}
		}
		
		
		
	}
};






function startServer(){

	let requestHandler = (request, response) => {  
		console.log();
		console.log("== REQUEST START ==");
		
		let purl = url.parse(request.url, true);
		let basename = purl.pathname.substr(purl.pathname.lastIndexOf("/") + 1);
		let query = purl.query;
		
		console.log("from: ", request.headers.origin);
		console.log("request: ", request.url);
		
		if(request.headers.origin){
			response.setHeader('Access-Control-Allow-Origin', request.headers.origin);
		}
		response.setHeader('Access-Control-Allow-Headers', 'authorization, content-type');
		
		let handler = handlers[basename];
		
		if(handler){
			let res = handler(request, response);
			response.write(res);
		}else{
			response.statusCode = 404;
		}
		
		response.end("");
		
		console.log("== REQUEST END ==");
	};

	let server = http.createServer(requestHandler);

	server.listen(port, (err) => {  
		if (err) {
			return console.log('something bad happened', err)
		}
		
		console.log(`server is listening on ${port}`)
	});
}

startServer();