//
// strongly inspired and adapted from the three.js's Frustum implementation that is under the MIT license [1]
//
// [1] https://github.com/mrdoob/three.js/blob/dev/src/math/Frustum.js
//

const Vector3 = require("./Vector3.js").Vector3;

class Frustum{

	constructor(planes){

		this.planes = planes;

	}

	intersectsBox(box){

		let p1 = new Vector3();
		let p2 = new Vector3();

		for(let plane of this.planes){

			p1.x = plane.normal.x > 0 ? box.min.x : box.max.x;
			p2.x = plane.normal.x > 0 ? box.max.x : box.min.x;
			p1.y = plane.normal.y > 0 ? box.min.y : box.max.y;
			p2.y = plane.normal.y > 0 ? box.max.y : box.min.y;
			p1.z = plane.normal.z > 0 ? box.min.z : box.max.z;
			p2.z = plane.normal.z > 0 ? box.max.z : box.min.z;

			let d1 = plane.distanceToPoint( p1 );
			let d2 = plane.distanceToPoint( p2 );

			if( d1 < 0 && d2 < 0 ){
				return false;
			}
		}

		return true;
	}

	containsPoint(point){

		for(let plane of this.planes){
			let distance = plane.distanceToPoint(point);
			if(distance < 0){
				return false;
			}
		}

		return true;

	}

}

module.exports.Frustum = Frustum;