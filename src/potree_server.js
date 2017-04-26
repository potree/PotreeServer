
const spawnSync = require('child_process').spawnSync;
const uuid = require('uuid');
const url = require('url');
const http = require('http');

const port = 3000;
const serverWorkingDirectory = "D:/";
const elevationProfileExe = "D:/dev/workspaces/CPotree/master/bin/Release_x64/PotreeElevationProfile.exe";

//class Worker{
//	constructor(){
//		this.uuid = uuid.v4();
//	}
//};
//
//let workers = new Map();

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
	
	//let worker = new Worker();
	//workers.set(worker.uuid, worker);
	
	return result;
}

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
		
		if(["getProfile", "get_profile"].includes(basename)){
			let v = (value, def) => ((value === undefined) ? def : value);
			
			let minLevel = v(query.minLOD, 0);
			let maxLevel = v(query.maxLOD, 5);
			let width = v(query.width, 1);
			let coordinates = v(query.coordinates, null);
			let pointcloud = v(query.pointCloud, null);
			
			let result = potreeElevationProfile(pointcloud, coordinates, width, minLevel, maxLevel, false);
			
			response.write(result.stdout);
		}else{
			
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