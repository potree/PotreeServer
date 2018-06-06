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

	distanceTo(vec){
		let dx = vec.x - this.x;
		let dy = vec.y - this.y;
		let dz = vec.z - this.z;

		let distance = Math.sqrt(dx ** 2 + dy ** 2 + dz ** 2);

		return distance;
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

	normalize(){
		let length = Math.sqrt(this.x ** 2 + this.y ** 2 + this.y ** 2);

		return this;
	}

	clone(){
		return new Vector3(this.x, this.y, this.z);
	}

	copy(vec){
		this.x = vec.x;
		this.y = vec.y;
		this.z = vec.z;
	}

	toArray(){
		return [this.x, this.y, this.z];
	}

};

module.exports.Vector3 = Vector3;