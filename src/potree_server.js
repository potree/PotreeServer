
const spawnSync = require('child_process').spawnSync;
const spawn = require('child_process').spawn;
const uuid = require('uuid');
const url = require('url');
const http = require('http');

const fs = require('fs');
const path = require('path');

const port = 3000;
const serverWorkingDirectory = "D:/";
const outputDirectory = "D:/dev/temp";
const elevationProfileExe = "D:/dev/workspaces/CPotree/master/bin/Release_x64/PotreeElevationProfile.exe";
let maxPointsProcessedThreshold = 10*1000*1000;

const css = `

.centering{
	display: flex;
	align-items: center;
	justify-content: center;
	width: 100%;
	height: 100%;
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

td{
	padding: 2px 15px 2px 5px;
}

`;

const workers = {
	active: new Map(),
	finished: new Map()
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
		
		if(result.pointsProcessed > maxPointsProcessedThreshold){
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
	
	"get_las": function(request, response){
		let purl = url.parse(request.url, true);
		let query = purl.query;
		
		let workerID = query.workerID;
		let worker = findWorker(workerID);
		
		if(worker){
			
			let filePath = `${outputDirectory}/${worker.uuid}/result.las`;
			let stat = fs.statSync(filePath);

			response.writeHead(200, {
				'Content-Type': 'application/octet-stream',
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
			<style>${css}</style>
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
				response.end(worker.statusPage());
				//return worker.statusPage();
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
		
		let handler = handlers[basename] || handlers["get_status"];
		
		
		if(handler){
			handler(request, response);
		}else{
			response.statusCode = 404;
			response.end("");
		}
		
		
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