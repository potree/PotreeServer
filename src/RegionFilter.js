

const os = require("os");
const fs = require('fs');
const Vector3 = require("./Vector3.js").Vector3;
const Box3 = require("./Box3.js").Box3;
const Plane = require("./Plane.js").Plane;
const Frustum = require("./Frustum.js").Frustum;
const LASHeader = require("./LASHeader.js").LASHeader;
const PointAttribute = require("./PointAttributes.js").PointAttribute;
const PointAttributes = require("./PointAttributes.js").PointAttributes;


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

let endStream = function(stream){
	return new Promise( (resolve, reject) => {
		stream.on('finish', () => {
			resolve();
		});

		stream.end();
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

async function findVisibleNodes(path, cloudjs, boundingBox){

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
	}

	//{
	//	let message = visibleNodes.map(n => n.name).join("\n");
	//	var fs = require('fs');
	//	fs.writeFile("log.txt", message, function(err) {
	//		if(err) {
	//			return console.log(err);
	//		}
	//	});
	//}

	return visibleNodes;
}

async function traversePointcloud(path){

	let start = now();

	let data = await readFile(path);

	let cloudjs = JSON.parse(data.toString());

	let attributes = new PointAttributes(cloudjs.pointAttributes.map(name => PointAttribute[name]));

	let boundingBox = new Box3(
		new Vector3(cloudjs.boundingBox.lx, cloudjs.boundingBox.ly, cloudjs.boundingBox.lz),
		new Vector3(cloudjs.boundingBox.ux, cloudjs.boundingBox.uy, cloudjs.boundingBox.uz)
	);

	let visibleNodes = await findVisibleNodes(path, cloudjs, boundingBox);

	let promises = [];

	let inside = 0;
	let outside = 0;
	let lines = [];
	let outFile = "test.las";
	let wstream = fs.createWriteStream(outFile);

	let lasHeader = new LASHeader();
	lasHeader.scale = cloudjs.scale;
	lasHeader.min = boundingBox.min.toArray();
	lasHeader.max = boundingBox.max.toArray();

	wstream.write(lasHeader.toBuffer());

	let filterDuration = 0;

	// adding var, let or const specifiers to these variables carries huge performance penalties
	// like from 1.1s to 1.3s. 
	readPos = attributes.contains(PointAttribute.POSITION_CARTESIAN);
	readColor = attributes.contains(PointAttribute.COLOR_PACKED);
	offsetPos = attributes.offsetOf(PointAttribute.POSITION_CARTESIAN);
	offsetColor = attributes.offsetOf(PointAttribute.COLOR_PACKED);

	//ux = 0;
	//uy = 0;
	//uz = 0;
	//x = 0;
	//y = 0;
	//z = 0;
	//r = 0;
	//g = 0;
	//b = 0;

	//readPos = true;
	//readColor = true;
	//offsetPos = 0;
	//offsetColor = 12;

	for(let node of visibleNodes){

		let hierarchyPath = getHierarchyPath(node.name, cloudjs.hierarchyStepSize);
		let nodePath = `${path}/../data/${hierarchyPath}/${node.name}.bin`;
		let promise = readFile(nodePath);
		promises.push(promise);

		promise.then( (result) => {

			let filterStart = now();

			let buffer = result;

			let numPoints = buffer.length / attributes.bytes;
			let vec = new Vector3();

			let lasRecordLength = 26;
			let outBuffer = Buffer.from(new Uint8Array(lasRecordLength * numPoints));

			let tmpBuffer = new ArrayBuffer(4);
			let tmpUint32 = new Uint32Array(tmpBuffer);
			let tmpUint8 = new Uint8Array(tmpBuffer);

			let insideThis = 0;
			let outOffset = 0;
			let inOffset = 0;
			let [ux, uy, uz] = [0, 0, 0];
			let [x, y, z] = [0, 0, 0];
			let [r, g, b] = [0, 0, 0];

			for(let i = 0; i < numPoints; i++){

				inOffset = attributes.bytes * i;
				let poffset = 0;

				if(readPos){
					ux = buffer.readUInt32LE(inOffset + offsetPos + 0);
					uy = buffer.readUInt32LE(inOffset + offsetPos + 4);
					uz = buffer.readUInt32LE(inOffset + offsetPos + 8);

					x = ux * cloudjs.scale + node.box.min.x;
					y = uy * cloudjs.scale + node.box.min.y;
					z = uz * cloudjs.scale + node.box.min.z;
				}
						
				if(readColor){
					r = buffer[inOffset + offsetColor + 0];
					g = buffer[inOffset + offsetColor + 1];
					b = buffer[inOffset + offsetColor + 2];
				}

				vec.x = x;
				vec.y = y;
				vec.z = z;

				let isInside = clipRegion.containsPoint(vec);

				if(isInside){
					outOffset = i * lasRecordLength;

					let ux = (x - boundingBox.min.x) / cloudjs.scale;
					let uy = (y - boundingBox.min.y) / cloudjs.scale;
					let uz = (z - boundingBox.min.z) / cloudjs.scale;

					// relatively slow
					//outBuffer.writeInt32LE(ux, outOffset + 0);
					//outBuffer.writeInt32LE(uy, outOffset + 4);
					//outBuffer.writeInt32LE(uz, outOffset + 8);

					// reduces filter duration from ~1.95s to ~1.58s
					tmpUint32[0] = ux;
					outBuffer[outOffset + 0] = tmpUint8[0];
					outBuffer[outOffset + 1] = tmpUint8[1];
					outBuffer[outOffset + 2] = tmpUint8[2];
					outBuffer[outOffset + 3] = tmpUint8[3];

					tmpUint32[0] = uy;
					outBuffer[outOffset + 4] = tmpUint8[0];
					outBuffer[outOffset + 5] = tmpUint8[1];
					outBuffer[outOffset + 6] = tmpUint8[2];
					outBuffer[outOffset + 7] = tmpUint8[3];

					tmpUint32[0] = uz;
					outBuffer[outOffset + 8] = tmpUint8[0];
					outBuffer[outOffset + 9] = tmpUint8[1];
					outBuffer[outOffset + 10] = tmpUint8[2];
					outBuffer[outOffset + 11] = tmpUint8[3];

					
					// relatively slow
					//outBuffer.writeInt16LE(r, outOffset + 20);
					//outBuffer.writeInt16LE(g, outOffset + 22);
					//outBuffer.writeInt16LE(b, outOffset + 24);

					// further reduces filter duration from ~1.58s to ~1.27s
					outBuffer[outOffset + 20] = r;
					outBuffer[outOffset + 22] = g;
					outBuffer[outOffset + 24] = b;

					inside++;
					insideThis++;
				}else{
					outside++;
				}

			}

			outBuffer = outBuffer.subarray(0, insideThis * lasRecordLength);

			let filterEnd = now();
			filterDuration += filterEnd - filterStart;

			wstream.write(outBuffer);
		});
	}

	await Promise.all(promises);

	await endStream(wstream);

	// update header
	lasHeader.numPoints = inside;
	let headerBuffer = lasHeader.toBuffer();
	let filehandle = await fs.promises.open(outFile, 'r+');
	await filehandle.write(headerBuffer);
	await filehandle.close();

	let stats = fs.statSync(outFile);
	let mb = stats.size / (1024 * 1024)

	console.log(`visible nodes: ${visibleNodes.length}`);
	console.log(`inside: ${inside.toLocaleString("en")}, outside: ${outside.toLocaleString("en")}`);
	console.log(`wrote ${outFile} (${parseInt(mb)}MB)`);

	let end = now();
	let duration = end - start;
	console.log(`filter duration: ${filterDuration.toFixed(3)}s`);
	console.log(`total duration (with read/write): ${duration.toFixed(3)}s`);
}

//traversePointcloud(cloudPath);



function filter(path, region){
	clipRegion = region;
	traversePointcloud(path);
}

module.exports.filter = filter;
