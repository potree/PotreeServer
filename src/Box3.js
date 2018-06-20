
const Vector3 = require("./Vector3.js").Vector3;

class Box3{

	constructor(min, max){
		this.min = min;
		this.max = max;
	}

	clone(){
		return new Box3(this.min.clone(), this.max.clone());
	}

};

module.exports.Box3 = Box3;