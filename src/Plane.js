//
// strongly inspired and adapted from the three.js's Plane implementation that is under the MIT license [1]
//
// [1] https://github.com/mrdoob/three.js/blob/dev/src/math/Plane.js
//

let Vector3 = require("./Vector3.js").Vector3;
let Vector4 = require("./Vector4.js").Vector4;


class Plane{

	constructor(normal, distance){
		this.normal = (normal !== undefined) ? normal : new Vector3(0, 0, 0);
		this.distance = distance;
	}

	setFromNormalAndCoplanarPoint(normal, point){
		this.normal.copy(normal);
		this.distance = -point.dot(this.normal);

		return this;
	}

	distanceToPoint(point){
		let distance = this.normal.dot(point) + this.distance;
		return distance;
	}

	applyMatrix4(matrix){
		let newNormal = new Vector4(this.normal.x, this.normal.y, this.normal.z, 0).applyMatrix4(matrix);
		let newCoplanar = this.normal.clone().multiplyScalar(-this.distance).applyMatrix4(matrix);

		this.setFromNormalAndCoplanarPoint(newNormal, newCoplanar);
	}

	clone(){
		let cloned = new Plane(this.normal.clone(), this.distance);

		return cloned;
	}

}

module.exports.Plane = Plane;