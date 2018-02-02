
const {Vector3} = require("./Vector3.js");

class AABB{

	constructor(min, max){

		if(arguments.length === 0){
			this.min = new Vector3(Infinity, Infinity, Infinity);
			this.max = new Vector3(-Infinity, -Infinity, -Infinity);
		}else if(arguments.length === 2){
			this.min = min;
			this.max = max;
		}
		
	}

	clone(){
		let aabb = new AABB(min.clone(), max.clone());

		return aabb;
	}

	getSize(){
		let size = new Vector3(
			this.max.x - this.min.x,
			this.max.y - this.min.y,
			this.max.z - this.min.z,
		);

		return size;
	}

}

exports.AABB = AABB;