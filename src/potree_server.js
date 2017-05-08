
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

console.log(`Using settings from: '${settingsPath}'`);

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

function potreeElevationProfile(pointcloud, coordinates, width, minLevel, maxLevel, estimate){

	let purl = url.parse(pointcloud);
	let realPointcloudPath = settings.serverWorkingDirectory + purl.pathname.substr(1);
	
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
	
	let result = spawnSync(settings.elevationProfileExe, args, {shell: false});
	
	return result;
}

function potreeExtractRegion(pointcloud, box, minLevel, maxLevel, estimate){

	let purl = url.parse(pointcloud);
	let realPointcloudPath = settings.serverWorkingDirectory + purl.pathname.substr(1);
	
	console.log("realPointcloudPath", realPointcloudPath);
	
	let args = [
		realPointcloudPath,
		"--box", box,
		"--min-level", minLevel, 
		"--max-level", maxLevel, 
		"--stdout"
	];
	
	if(estimate){
		args.push("--estimate");
	}
	
	let result = spawnSync(settings.extractRegionExe, args, {shell: false});
	
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
	
		response.end(result.stdout);
	},
	
	"get_profile_estimate": function(request, response){
		let purl = url.parse(request.url, true);
		let query = purl.query;
		
		let v = (value, def) => ((value === undefined) ? def : value);
		
		let minLevel = v(query.minLOD, 0);
		let maxLevel = v(query.maxLOD, 5);
		let width = v(query.width, 1);
		let coordinates = v(query.coordinates, null);
		let pointcloud = v(query.pointCloud, null);
		
		let result = potreeElevationProfile(pointcloud, coordinates, width, minLevel, maxLevel, true);
	
		response.end(result.stdout);
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
		try{
			result = JSON.parse(result.stdout);
		}catch(e){
			console.log(result);
			let res = {
				status: "ERROR_START_PROFILE_WORKER_FAILED",
				message: `Failed to start a profile worker`
			};
		}
		
		if(result.pointsProcessed > settings.maxPointsProcessedThreshold){
			let res = {
				status: "ERROR_POINT_PROCESSED_ESTIMATE_TOO_LARGE",
				estimate: result.pointsProcessed,
				message: `Too many candidate points within the selection: ${result.pointsProcessed}`
			};
			
			response.end(JSON.stringify(res, null, "\t"));
		}else{
			let worker = new PotreeElevationProfileWorker(pointcloud, coordinates, width, minLevel, maxLevel);
			worker.start();
			
			let res = {
				status: "OK",
				workerID: worker.uuid,
				message: `Worker sucessfully spawned: ${worker.uuid}`
			};
			
			response.end(JSON.stringify(res, null, "\t"));
		}
	},
	
	"start_extract_region_worker": function(request, response){
		let purl = url.parse(request.url, true);
		let query = purl.query;
		
		let v = (value, def) => ((value === undefined) ? def : value);
		
		let minLevel = v(query.minLOD, 0);
		let maxLevel = v(query.maxLOD, 5);
		let box = v(query.box, null);
		let pointcloud = v(query.pointCloud, null);
		
		console.log(`BOX: ${box}`);
		
		let result = potreeExtractRegion(pointcloud, box, minLevel, maxLevel, true);
		try{
			result = JSON.parse(result.stdout);
		}catch(e){
			console.log(result);
			let res = {
				status: "ERROR_START_EXTRACT_REGION_WORKER_FAILED",
				message: `Failed to start a region extraction worker`
			};
		}
		
		if(result.pointsProcessed > settings.maxPointsProcessedThreshold){
			let res = {
				status: "ERROR_POINT_PROCESSED_ESTIMATE_TOO_LARGE",
				estimate: result.pointsProcessed,
				message: `Too many candidate points within the selection: ${result.pointsProcessed}`
			};
			
			response.end(JSON.stringify(res, null, "\t"));
		}else{
			let worker = new PotreeExtractRegionWorker(pointcloud, box, minLevel, maxLevel);
			worker.start();
			
			let res = {
				status: "OK",
				workerID: worker.uuid,
				message: `Worker sucessfully spawned: ${worker.uuid}`
			};
			
			response.end(JSON.stringify(res, null, "\t"));
		}
	},
	
	"get_las": function(request, response){
		let purl = url.parse(request.url, true);
		let query = purl.query;
		
		let workerID = query.workerID;
		let worker = findWorker(workerID);
		
		if(worker){
			
			let filePath = `${settings.outputDirectory}/${worker.uuid}/result.las`;
			let stat = fs.statSync(filePath);

			response.writeHead(200, {
				'Content-Type': 'application/octet-stream',
				"Content-Disposition": `attachment;filename=${worker.uuid}.las`,
				'Content-Length': stat.size,
				"Connection": "Close"
			});

			let readStream = fs.createReadStream(filePath);
			readStream.on('data', function(data) {
				response.write(data);
			});
			
			readStream.on('finish', function() {
				response.end();        
			});
			
			return null;
		}else{
			response.statusCode = 404;
			response.end("");
		}
		
		
	},
	
	"get_status": function(request, response){
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
		
		
		
	}
};


function handleRequestFile(request, response){
	//http://localhost:3000/resources/server.css
	
	let purl = url.parse(request.url, true);
	let query = purl.query;
	
	
	let file = `${settings.wwwroot}${purl.pathname}`;
	
	if(fs.existsSync(file)){
		// TODO proper mime type handling, e.g.https://www.npmjs.com/package/mime-types
		if(file.toLowerCase().endsWith(".css")){
			response.writeHead(200, {
				'Content-Type': 'text/css'
			});
		}else{
			response.writeHead(200, {
				'Content-Type': 'application/octet-stream'
			});
		}
		
		
		let readStream = fs.createReadStream(file);
		readStream.pipe(response);
		
		readStream.on('close', () => {
			response.end();
		});
		
		readStream.on('error', () => {
			response.end();
		});

	}else{
		response.statusCode = 404;
		response.end("");
	}
	
}



function startServer(){

	let requestHandler = (request, response) => {  
		console.log();
		console.log("== REQUEST START ==");
		
		let purl = url.parse(request.url, true);
		let basename = purl.pathname.substr(purl.pathname.lastIndexOf("/") + 1);
		let query = purl.query;
		
		console.log("from: ", request.headers.host);
		console.log("request: ", request.url);
		
		if(request.headers.origin){
			response.setHeader('Access-Control-Allow-Origin', request.headers.origin);
		}
		response.setHeader('Access-Control-Allow-Headers', 'authorization, content-type');
		
		let handler = null;
		if(request.url === "/"){
			handler = handlers["get_status"];
		}else if(handlers[basename]){
			handler = handlers[basename];
		}else{
			handler = handleRequestFile;
		}
		
		if(handler){
			handler(request, response);
		}else{
			response.statusCode = 404;
			response.end("");
		}
		
		
		console.log("== REQUEST END ==");
	};

	let server = http.createServer(requestHandler);

	server.listen(settings.port, (err) => {  
		if (err) {
			return console.log('something bad happened', err)
		}
		
		console.log(`server is listening on ${settings.port}`)
	});
}

startServer();