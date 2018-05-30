

const os = require("os");
const fs = require('fs');
const Vector3 = require("./Vector3.js").Vector3;
const Box3 = require("./Box3.js").Box3;
const Plane = require("./Plane.js").Plane;
const Frustum = require("./Frustum.js").Frustum;


//let lionPath = "./pointclouds/lion_takanawa/cloud.js";
//let lionPath = "C:/dev/workspaces/potree/develop/pointclouds/lion_takanawa/cloud.js";
//let lionPath = "D:/dev/pointclouds/lion_takanawa/cloud.js";
let cloudPath = "D:/dev/pointclouds/archpro/heidentor/cloud.js";

let readFile = function(file){
	return new Promise( (resolve, reject) => {
		fs.readFile(file, function (err, data) {
			if(err){
				reject();
			}else{
				resolve(data);
			}
		});
	});
};

// time in seconds
function now(){
	let hrTime = process.hrtime();
	let seconds = hrTime[0] + hrTime[1] / (1000 * 1000 * 1000);

	return seconds;
}

//fs.readFile(file, function (err, data) {
//	if(err){
//		throw err;
//	}
//
//	let jsonContent = JSON.parse(data.toString());
//
//	console.log(jsonContent);	
//});

//let done = false;
//let count = 0;

//function loop(){
//	if(!done){
//		setTimeout(loop, 1);
//	}
//
//	console.log(count);
//}
//
//setTimeout(loop, 0);


//async function parseJS(){
//
//	console.log("parseJS");
//
//	let data = await readFile(file);
//	//console.log("file has been read");
//	let cloudjs = JSON.parse(data.toString());
//
//
//
//	
//	console.log(cloudjs);
//
//	//done = true;
//	//count++;
//}
//parseJS();


//getHierarchyPath(){
//	let path = 'r/';
//
//	let hierarchyStepSize = this.pcoGeometry.hierarchyStepSize;
//	let indices = this.name.substr(1);
//
//	let numParts = Math.floor(indices.length / hierarchyStepSize);
//	for (let i = 0; i < numParts; i++) {
//		path += indices.substr(i * hierarchyStepSize, hierarchyStepSize) + '/';
//	}
//
//	path = path.slice(0, -1);
//
//	return path;
//}


class Node{
	
	constructor(){
		this.children = new Array(8).fill(null);
		this.index = null;
		this.name = "";
		this.box = null;
	}

	traverse(callback){
		let stack = [{node: this, level: 0}];

		while(stack.length > 0){
			let entry = stack.pop();
			let node = entry.node;
			let level = entry.level;

			callback(node, level);

			let children = node.children.filter( c => c !== null );
			for(let child of children.reverse()){
				stack.push({node: child, level: level + 1});
			}
		}
	}

	level(){
		return this.name.length - 1;
	}

}

function getHierarchyPath(name, hierarchyStepSize){
	let path = "r/";
	let indices = name.substr(1);
	let numParts = Math.floor(indices.length / hierarchyStepSize);
	for (let i = 0; i < numParts; i++) {
		path += indices.substr(i * hierarchyStepSize, hierarchyStepSize) + '/';
	}
	path = path.slice(0, -1);
	return path;
}

function parseHierarchy(hrcData){
	let root = new Node();
	root.name = "r";

	let nodes = [root];

	let n = hrcData.length / 5;

	for(let i = 0; i < n; i++){
		let childMask = hrcData[5 * i];

		let node = nodes[i];

		for(let j = 0; j < 8; j++){
			let hasChildJ = childMask & (1 << j);
			if(hasChildJ){
				let child = new Node();
				child.index = j;
				child.name = `${node.name}${j}`;

				node.children[j] = child;

				nodes.push(child);
			}
		}
	}

	return root;
}

function createChildAABB(aabb, index){
	let min = aabb.min.clone();
	let max = aabb.max.clone();
	let size = max.clone().sub(min);

	if ((index & 0b0001) > 0) {
		min.z += size.z / 2;
	} else {
		max.z -= size.z / 2;
	}

	if ((index & 0b0010) > 0) {
		min.y += size.y / 2;
	} else {
		max.y -= size.y / 2;
	}

	if ((index & 0b0100) > 0) {
		min.x += size.x / 2;
	} else {
		max.x -= size.x / 2;
	}

	return new Box3(min, max);
}

// for lion.html
let planes = [
	new Plane(new Vector3(-0.4482079723225482, -0.5119879644759681, -0.7327877849543242), 7.635331998803329),
	new Plane(new Vector3(0.4482079723225482, 0.5119879644759681, 0.7327877849543242), -1.0383319988033284),
	new Plane(new Vector3(0.6307569794996448, -0.7620063278215479, 0.1466014637457780), -2.251446493622594),
	new Plane(new Vector3(-0.6307569794996448, 0.7620063278215479, -0.1466014637457780), 4.483446493622594),
	new Plane(new Vector3(0.6334471140979291, 0.3965030650470118, -0.6644772931028794), 4.66099028959601),
	new Plane(new Vector3(-0.6334471140979291, -0.3965030650470118, 0.6644772931028794), -3.234990289596011),
];

let clipRegion = new Frustum(planes);

async function traversePointcloud(path){

	let start = now();

	let data = await readFile(path);
	let cloudjs = JSON.parse(data.toString());

	let boundingBox = new Box3(
		new Vector3(cloudjs.boundingBox.lx, cloudjs.boundingBox.ly, cloudjs.boundingBox.lz),
		new Vector3(cloudjs.boundingBox.ux, cloudjs.boundingBox.uy, cloudjs.boundingBox.uz)
	);

	let hrcRoot = `${path}/../data/r/r.hrc`;
	let hrcData = await readFile(hrcRoot);
	hrcData = new Uint8Array(hrcData);
	
	let root = parseHierarchy(hrcData);

	let visibleNodes = [root];

	{
		root.box = boundingBox.clone();
		let stack = [root];

		while(stack.length > 0){
			let node = stack.pop();

			for(let child of node.children){
				if(child && child.level() < cloudjs.hierarchyStepSize){

					child.box = createChildAABB(node.box, child.index);

					let intersects = clipRegion.intersectsBox(child.box);

					if(intersects){
						visibleNodes.push(child);
						stack.push(child);
					}

				}
			}
		}

		console.log(`visible nodes: ${visibleNodes.length}`);
	}

	let promises = [];

	let totalByteSize = 0;
	let inside = 0;
	let outside = 0;
	let lines = [];
	let bytesPerPoint = 16;

	for(let node of visibleNodes){

		let nodePath = `${path}/../data/r/${node.name}.bin`;
		let promise = readFile(nodePath);
		promises.push(promise);

		promise.then( (result) => {

			let buffer = result;

			let numPoints = buffer.length / bytesPerPoint;
			//let sum = [0, 0, 0];

			//console.log("numPoints", numPoints);

			let vec = new Vector3();

			for(let i = 0; i < numPoints; i++){
				let ux = buffer.readUInt32LE(bytesPerPoint * i + 0);
				let uy = buffer.readUInt32LE(bytesPerPoint * i + 4);
				let uz = buffer.readUInt32LE(bytesPerPoint * i + 8);

				let x = ux * cloudjs.scale + node.box.min.x;
				let y = uy * cloudjs.scale + node.box.min.y;
				let z = uz * cloudjs.scale + node.box.min.z;

				let r = buffer.readUInt8(bytesPerPoint * i + 12);
				let g = buffer.readUInt8(bytesPerPoint * i + 13);
				let b = buffer.readUInt8(bytesPerPoint * i + 14);

				vec.x = x;
				vec.y = y;
				vec.z = z;

				let isInside = clipRegion.containsPoint(vec);
				if(isInside){
					inside++;

					lines.push(`${x} ${y} ${z} ${r} ${g} ${b}`);
				}else{
					outside++;
				}

			}

			totalByteSize += buffer.length;

		});
	}

	await Promise.all(promises);

	let content = lines.join("\n");
	fs.writeFile("./testcloud.txt", content, function(err) {
		if(err) {
			return console.log(err);
		}

		console.log("The file was saved!");
	}); 

	console.log(totalByteSize);

	console.log(`inside: ${inside}`);
	console.log(`outside: ${outside}`);


	let end = now();
	let duration = end - start;
	console.log(`duration: ${duration}`);

}

traversePointcloud(cloudPath);