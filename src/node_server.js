
const spawnSync = require('child_process').spawnSync;
const uuid = require('uuid');
const url = require('url');

class Worker{
	constructor(){
		this.uuid = uuid.v4();
	}
};

let workers = new Map();

function callPotree(){
	//let converterExe = "D:/dev/workspaces/PotreeConverter/develop/build/PotreeConverter/Release/PotreeConverter.exe";
	let appProfile = "D:/dev/workspaces/CPotree/master/bin/Release_x64/PotreeElevationProfile.exe";
	
	let args = [
		"D:/dev/pointclouds/converted/CA13/cloud.js",
		"--coordinates", "{693550.968, 3915914.169},{693890.618, 3916387.819},{694584.820, 3916458.180},{694786.239, 3916307.199}",
		"--width", "14.0", "--min-level", "0", "--max-level", "3", "--stdout",
		"--estimate"
	];
	
	let result = spawnSync(appProfile, args, {shell: false});
	
	let worker = new Worker();
	workers.set(worker.uuid, worker);
	
	console.log(worker.uuid);
	
	return result;
}

function startServer(){
	const http = require('http')  
	const port = 3000

	const requestHandler = (request, response) => {  
		
		let purl = url.parse(request.url);
		let basename =purl.pathname.substr(purl.pathname.lastIndexOf("/") + 1);
		
		console.log(request.url, " ==> ", basename);
		
		if(basename === "getProfile"){
			let result = callPotree();
		
			let html = `
			<html>
			<body>
			Hello Node.js Server!<br>
			${workers.size}
			<br>
			<pre>
			${result.stdout}
			</pre>
			</body>
			</html>
			`;
			
			response.end(html);
		}else{
			response.end("");
		}
		
		
	}

	const server = http.createServer(requestHandler)

	server.listen(port, (err) => {  
		if (err) {
			return console.log('something bad happened', err)
		}
		
		console.log(`server is listening on ${port}`)
	})
}

startServer();