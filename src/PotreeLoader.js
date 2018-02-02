
const fs = require('fs');
const {PointCloudOctree, PointCloudOctreeNode} = require("./PointCloudOctree.js");
const {logger} = require("./logger.js");

class PotreeLoader{

	constructor(){
		
	}

	static load(path){

		let cloudJSPath = path;

		if(fs.lstatSync(path).isDirectory()){
			if(fs.existsSync(`${path}/cloud.js`)){
				cloudJSPath = `${path}/cloud.js`;
			}
		}

		if(!fs.existsSync(cloudJSPath)){
			throw new Error(`File not found: ${cloudJSPath}`);
		}

		let cloudJS = JSON.parse(fs.readFileSync(cloudJSPath, 'utf8'));

		logger.info(this.cloudJS);

		let pointcloud = new PointCloudOctree(cloudJSPath);


		return pointcloud;
	}

	
};


exports.PotreeLoader = PotreeLoader;

