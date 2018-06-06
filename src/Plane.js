//
// strongly inspired and adapted from the three.js's Plane implementation that is under the MIT license [1]
//
// [1] https://github.com/mrdoob/three.js/blob/dev/src/math/Plane.js
//

let Vector3 = require("./Vector3.js").Vector3;


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

	

}

module.exports.Plane = Plane;