

const fs = require("fs");
const {logger} = require("./logger.js");
const {Vector3} = require("./math/Vector3.js");
const {AABB} = require("./math/AABB.js");
const {PointAttributeNames, PointAttributeTypes, PointAttribute, PointAttributes} = require("./PointAttributes");

const LoadState = {
	UNLOADED: 0,
	LOADING: 1,
	LOADED: 2
};


createChildAABB = function(aabb, index){
	let min = aabb.min.clone();
	let max = aabb.max.clone();
	let size = aabb.getSize();

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

	return new AABB(min, max);
};

class PointCloudOctreeNode{

	constructor(parent, index, boundingBox){
		this.parent = parent;
		this.index = index;
		this.name = (parent === null || parent === undefined) ? "r" : `${parent.name}${index}`;
		this.children = new Array(8).fill(null);

		this.boundingBox = boundingBox;
		this.state = LoadState.UNLOADED;
		this.data = null;
		this.level = this.name.length - 1;
	}

	traverse(callback){

		let keepGoing = callback(this);

		if(keepGoing !== false){
			for(let child of this.children){
				if(child !== null){
					child.traverse(callback);
				}
			}
		}

	}

	addChild(child){
		this.children[child.index] = child;
		child.parent = this;
	}

};

class PointCloudOctree{

	constructor(cloudJSPath){
		this.cloudJSPath = cloudJSPath;
		this.cloudJS = JSON.parse(fs.readFileSync(this.cloudJSPath, 'utf8'));
		
		this.boundingBox = new AABB(
			new Vector3(this.cloudJS.boundingBox.lx, this.cloudJS.boundingBox.ly, this.cloudJS.boundingBox.lz),
			new Vector3(this.cloudJS.boundingBox.ux, this.cloudJS.boundingBox.uy, this.cloudJS.boundingBox.uz)
		);

		this.scale = new Vector3(this.cloudJS.scale, this.cloudJS.scale, this.cloudJS.scale);

		this.root = new PointCloudOctreeNode(null, null, this.boundingBox);
		this.root.hasChildren = true;
		

		let mappedAttributes = this.cloudJS.pointAttributes.map(v => PointAttribute[v]);
		this.attributes = new PointAttributes(mappedAttributes);
	}

	traverse(callback){
		this.root.traverse(callback);
	}

	getHierarchyPath(node){
		let path = 'r/';

		let hierarchyStepSize = this.cloudJS.hierarchyStepSize;
		let indices = node.name.substr(1);

		let numParts = Math.floor(indices.length / hierarchyStepSize);
		for(let i = 0; i < numParts; i++){
			path += indices.substr(i * hierarchyStepSize, hierarchyStepSize) + '/';
		}

		path = path.slice(0, -1);

		return path;
	}

	loadHierarchy(node){

		let hierarchyPath = this.getHierarchyPath(node);
		let nodeHierarchyPath = `${this.cloudJSPath}/../data/${hierarchyPath}/${node.name}.hrc`;
		let hrBuffer = fs.readFileSync(nodeHierarchyPath);
		let hbuffer = hrBuffer.buffer;
		let view = new DataView(hbuffer);

		let stack = [];
		let children = view.getUint8(0);
		let numPoints = view.getUint32(1, true);
		node.numPoints = numPoints;
		stack.push({children: children, numPoints: numPoints, name: node.name});

		let decoded = [];

		let offset = 5;
		while (stack.length > 0) {
			let snode = stack.shift();
			let mask = 1;
			for (let i = 0; i < 8; i++) {
				if ((snode.children & mask) !== 0) {
					let childName = snode.name + i;

					let childChildren = view.getUint8(offset);
					let childNumPoints = view.getUint32(offset + 1, true);

					stack.push({children: childChildren, numPoints: childNumPoints, name: childName});

					decoded.push({children: childChildren, numPoints: childNumPoints, name: childName});

					offset += 5;
				}

				mask = mask * 2;
			}

			if (offset === hbuffer.byteLength) {
				break;
			}
		}

		let nodes = {};
		nodes[node.name] = node;

		for (let i = 0; i < decoded.length; i++) {
			let name = decoded[i].name;
			let decodedNumPoints = decoded[i].numPoints;
			let index = parseInt(name.charAt(name.length - 1));
			let parentName = name.substring(0, name.length - 1);
			let parentNode = nodes[parentName];
			let level = name.length - 1;

			let boundingBox = createChildAABB(parentNode.boundingBox, index);

			let currentNode = new PointCloudOctreeNode(parentNode, index, boundingBox);
			currentNode.level = level;
			currentNode.numPoints = decodedNumPoints;
			currentNode.hasChildren = decoded[i].children > 0;
			parentNode.addChild(currentNode);
			nodes[name] = currentNode;
		}
	}

	loadPoints(node){

		let hierarchyPath = this.getHierarchyPath(node);
		let nodePath = `${this.cloudJSPath}/../data/${hierarchyPath}/${node.name}`;

		logger.info(nodePath);

		logger.info(PointAttribute);
		logger.info(PointAttributes);


		let nodeDataFile = `${nodePath}.bin`;

		let stats = fs.statSync(nodeDataFile);
		let fileByteSize = stats.size;
		let bytesPerPoint = this.attributes.byteSize;
		let numPoints = fileByteSize / bytesPerPoint;

		logger.info("number of points: ", numPoints);

		fs.readFile(nodeDataFile, (err, data) => {

			let buffers = {};

			let scale = this.scale;
			let min = this.boundingBox.min;
			
			let attributeOffset = 0;
			for(let attribute of this.attributes.attributes){

				if(attribute === PointAttribute.POSITION_CARTESIAN){
					
					let buffer = new Float64Array(numPoints * 3);

					for(let i = 0; i < numPoints; i++){
						let ux = data.readUInt32LE(i * bytesPerPoint + 0);
						let uy = data.readUInt32LE(i * bytesPerPoint + 4);
						let uz = data.readUInt32LE(i * bytesPerPoint + 8);

						let x = (ux * scale.x) + min.x;
						let y = (uy * scale.y) + min.y;
						let z = (uz * scale.z) + min.z;

						buffer[3 * i + 0] = x;
						buffer[3 * i + 1] = y;
						buffer[3 * i + 2] = z;
					}


					buffers["position"] = buffer;
				}
			}

			node.data = buffers;
			node.state = LoadState.LOADED;
		});
	}

	loadNode(node){

		if(node.state === LoadState.LOADED || node.state === LoadState.LOADING){
			return;
		}

		node.state = LoadState.LOADING;

		if((node.level % this.cloudJS.hierarchyStepSize) === 0 && node.hasChildren){
			this.loadHierarchy(node);
			this.loadPoints(node);
		}else{
			this.loadPoints(node);
		}

		
	}

	getPointsInBoxes(boxes){

		

	}

};


exports.PointCloudOctree = PointCloudOctree;
exports.PointCloudOctreeNode = PointCloudOctreeNode;