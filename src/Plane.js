//
// strongly inspired and adapted from the three.js's Plane implementation that is under the MIT license [1]
//
// [1] https://github.com/mrdoob/three.js/blob/dev/src/math/Plane.js
//


class Plane{

	constructor(normal, distance){
		this.normal = normal;
		this.distance = distance;
	}

	distanceToPoint(point){
		let distance = this.normal.dot(point) + this.distance;
		return distance;
	}

}

module.exports.Plane = Plane;