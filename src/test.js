

const os = require("os");
const fs = require('fs');
const Vector3 = require("./Vector3.js").Vector3;
const Box3 = require("./Box3.js").Box3;
const Plane = require("./Plane.js").Plane;
const Frustum = require("./Frustum.js").Frustum;


//let lionPath = "./pointclouds/lion_takanawa/cloud.js";
//let lionPath = "D:/dev/pointclouds/lion_takanawa/cloud.js";




//let cloudPath = "C:/dev/workspaces/potree/develop/pointclouds/lion_takanawa/cloud.js";
//let planes = [
//	new Plane(new Vector3(-0.4482079723225482, -0.5119879644759681, -0.7327877849543242), 7.635331998803329),
//	new Plane(new Vector3(0.4482079723225482, 0.5119879644759681, 0.7327877849543242), -1.0383319988033284),
//	new Plane(new Vector3(0.6307569794996448, -0.7620063278215479, 0.1466014637457780), -2.251446493622594),
//	new Plane(new Vector3(-0.6307569794996448, 0.7620063278215479, -0.1466014637457780), 4.483446493622594),
//	new Plane(new Vector3(0.6334471140979291, 0.3965030650470118, -0.6644772931028794), 4.66099028959601),
//	new Plane(new Vector3(-0.6334471140979291, -0.3965030650470118, 0.6644772931028794), -3.234990289596011),
//];
//let inputPointByteSize = 18;

let cloudPath = "D:/dev/pointclouds/archpro/heidentor/cloud.js";
let planes = [
	new Plane(new Vector3(-0.0021499593298130, -0.9999976888347694, 0.0000000000000000), 12.755221474531359),
	new Plane(new Vector3(0.0021499593298130, 0.9999976888347694, 0.0000000000000000), 6.227651358182918),
	new Plane(new Vector3(0.9999976888347694, -0.0021499593298130, 0.0000000000000000), 5.49108018005949),
	new Plane(new Vector3(-0.9999976888347694, 0.0021499593298130, 0.0000000000000000), -2.2906946584275993),
	new Plane(new Vector3(0.0000000000000000, 0.0000000000000000, -1.0000000000000000), 12.696757412117096),
	new Plane(new Vector3(0.0000000000000000, 0.0000000000000000, 1.0000000000000000), 1.052287545266731),
];
let inputPointByteSize = 16;

let clipRegion = new Frustum(planes);



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

function parseHierarchy(hrcData, rootName){
	let root = new Node();
	root.name = rootName;

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
	
	let root = parseHierarchy(hrcData, "r");

	let visibleNodes = [root];

	{
		root.box = boundingBox.clone();
		let stack = [root];

		while(stack.length > 0){
			// if the stack.shift() way of breadth-first traversal becomes a bottleneck,
			// try https://en.wikipedia.org/wiki/Iterative_deepening_depth-first_search
			let node = stack.shift(); 

			//console.log(node.name);

			for(let child of node.children){
				if(child){

					child.box = createChildAABB(node.box, child.index);

					let intersects = clipRegion.intersectsBox(child.box);
					let atHierarchyStep = (child.level() % cloudjs.hierarchyStepSize) === 0;

					if(intersects && !atHierarchyStep){
						visibleNodes.push(child);
						stack.push(child);
					}else if(intersects && atHierarchyStep){
						visibleNodes.push(child);

						let hierarchyPath = getHierarchyPath(child.name, cloudjs.hierarchyStepSize);
						let hrcPath = `${path}/../data/${hierarchyPath}/${child.name}.hrc`;

						let hrcData = await readFile(hrcPath);
						hrcData = new Uint8Array(hrcData);

						let croot = parseHierarchy(hrcData, child.name);
						croot.box = child.box;
						croot.index = child.index;

						//child.children = croot.children;
						stack.push(croot);
					}

				}
			}
		}

		console.log(`visible nodes: ${visibleNodes.length}`);
	}

	{
		let message = visibleNodes.map(n => n.name).join("\n");
		var fs = require('fs');
		fs.writeFile("log.txt", message, function(err) {
			if(err) {
				return console.log(err);
			}

			console.log("The file was saved!");
		});
	}

	let promises = [];

	let totalByteSize = 0;
	let inside = 0;
	let outside = 0;
	let lines = [];
	//let bytesPerPoint = 18;
	let bytesPerPoint = inputPointByteSize;
	let writeStream = fs.createWriteStream('teststream.txt');
	let wstream = fs.createWriteStream('test.las');

	{
		let buffer = Buffer.from(new Uint8Array(227));

		let fileSignature = "LASF";
		buffer[0] = fileSignature.charCodeAt(0);
		buffer[1] = fileSignature.charCodeAt(1);
		buffer[2] = fileSignature.charCodeAt(2);
		buffer[3] = fileSignature.charCodeAt(3);

		// buffer[4-5] file source id
		// buffer[6-7] global encoding
		// buffer[8-11] project id guid data 1
		// buffer[8-11] project id guid data 1
		// buffer[12-13] project id guid data 1
		// buffer[14-15] project id guid data 1
		// buffer[16-23] project id guid data 1

		// version major
		buffer[24] = 1;

		// version minor
		buffer[25] = 2;

		//buffer[26-57] system identifier
		//buffer[58-89] generating software
		//buffer[90-61] creation day of year
		//buffer[92-93] creation year
		
		// header size
		buffer.writeUInt16LE(227, 94);

		// offset to point data
		buffer.writeUInt32LE(227, 96);

		// num VLRs
		buffer.writeUInt32LE(0, 100);

		// point data format
		buffer[104] = 2;

		// point data record length
		buffer.writeUInt16LE(26, 105);
		
		// num points
		//buffer.writeUInt32LE(37810, 107);
		buffer.writeUInt32LE(12574343, 107);

		// number of points by return
		//buffer.writeUInt32LE(37810, 111);
		buffer.writeUInt32LE(12574343, 111);
		buffer.writeUInt32LE(0, 115);
		buffer.writeUInt32LE(0, 119);
		buffer.writeUInt32LE(0, 123);
		buffer.writeUInt32LE(0, 127);

		// scale factors
		buffer.writeDoubleLE(cloudjs.scale, 131);
		buffer.writeDoubleLE(cloudjs.scale, 139);
		buffer.writeDoubleLE(cloudjs.scale, 147);

		// offsets
		buffer.writeDoubleLE(0, 155);
		buffer.writeDoubleLE(0, 163);
		buffer.writeDoubleLE(0, 171);

		// bounding box [max x, min x, y, y, z, z]
		buffer.writeDoubleLE(boundingBox.max.x, 179);
		buffer.writeDoubleLE(boundingBox.min.x, 187);
		buffer.writeDoubleLE(boundingBox.max.y, 195);
		buffer.writeDoubleLE(boundingBox.min.y, 203);
		buffer.writeDoubleLE(boundingBox.max.z, 211);
		buffer.writeDoubleLE(boundingBox.min.z, 219);

		wstream.write(buffer);


		//let n = 12574343;
	}

	for(let node of visibleNodes){

		let hierarchyPath = getHierarchyPath(node.name, cloudjs.hierarchyStepSize);
		let nodePath = `${path}/../data/${hierarchyPath}/${node.name}.bin`;
		let promise = readFile(nodePath);
		promises.push(promise);

		promise.then( (result) => {

			let buffer = result;

			let numPoints = buffer.length / bytesPerPoint;
			//let sum = [0, 0, 0];

			//console.log("numPoints", numPoints);

			let vec = new Vector3();

			let lasRecordLength = 26;
			let outBuffer = Buffer.from(new Uint8Array(lasRecordLength * numPoints));

			let insideThis = 0;
			for(let i = 0; i < numPoints; i++){
				//let outBuffer = Buffer.from(new Uint8Array(lasRecordLength));

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

					//lines.push(`${x} ${y} ${z} ${r} ${g} ${b}`);
					//let line = `${x} ${y} ${z} ${r} ${g} ${b}\n`;
					//writeStream.write(line);

					let ux = parseInt((x - boundingBox.min.x) / cloudjs.scale);
					let uy = parseInt((y - boundingBox.min.y) / cloudjs.scale);
					let uz = parseInt((z - boundingBox.min.z) / cloudjs.scale);

					outBuffer.writeInt32LE(ux, i * lasRecordLength + 0);
					outBuffer.writeInt32LE(uy, i * lasRecordLength + 4);
					outBuffer.writeInt32LE(uz, i * lasRecordLength + 8);

					outBuffer.writeInt16LE(r, i * lasRecordLength + 20);
					outBuffer.writeInt16LE(g, i * lasRecordLength + 22);
					outBuffer.writeInt16LE(b, i * lasRecordLength + 24);

					//wstream.write(outBuffer);
					inside++;
					insideThis++;
				}else{
					outside++;
				}

			}

			outBuffer = outBuffer.subarray(0, insideThis * lasRecordLength);

			wstream.write(outBuffer);

			totalByteSize += buffer.length;

		});
	}

	await Promise.all(promises);

	writeStream.on('finish', () => {  
		console.log('wrote all data to file');
	});

	wstream.on('finish', () => {
		console.log('wrote test.las');

		let end = now();
		let duration = end - start;
		console.log(`duration: ${duration}`);
	});


	writeStream.end();
	wstream.end();

	//let content = lines.join("\n");
	//fs.writeFile("./testcloud.txt", content, function(err) {
	//	if(err) {
	//		return console.log(err);
	//	}

	//	console.log("The file was saved!");
	//}); 

	console.log(totalByteSize);

	console.log(`inside: ${inside}`);
	console.log(`outside: ${outside}`);


	let end = now();
	let duration = end - start;
	console.log(`duration: ${duration}`);

}

traversePointcloud(cloudPath);