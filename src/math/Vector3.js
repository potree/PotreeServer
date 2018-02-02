

class Vector3{

	constructor(x, y, z){

		if(arguments.length === 0){
			this.x = 0;
			this.y = 0;
			this.z = 0;
		}else if(arguments.length === 1){
			this.x = x;
			this.y = x;
			this.z = x;
		}else if(arguments.length === 3){
			this.x = x;
			this.y = y;
			this.z = z;
		}

		
	}

	clone(){
		let vec = new Vector3(this.x, this.y, this.z);

		return vec;
	}

};

exports.Vector3 = Vector3;