//
// strongly inspired and adapted from the three.js's Vector3 implementation that is under the MIT license [1]
//
// [1] https://github.com/mrdoob/three.js/blob/dev/src/math/Vector3.js
//


class Vector3{

	constructor(x, y, z){
		this.x = x;
		this.y = y;
		this.z = z;
	}

	length(){
		return Math.sqrt(this.x ** 2 + this.y ** 2 + this.z ** 2);
	}

	dot(v){
		return this.x * v.x + this.y * v.y + this.z * v.z;
	}

	sub(v){
		let result = new Vector3(
			this.x - v.x,
			this.y - v.y,
			this.z - v.z
		);

		return result;
	}

	clone(){
		return new Vector3(this.x, this.y, this.z);
	}

};

module.exports.Vector3 = Vector3;