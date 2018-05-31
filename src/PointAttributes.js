

let PointAttribute = {
	POSITION_CARTESIAN: {bytes: 12},
	COLOR_PACKED: {bytes: 4},
	NORMAL_SPHEREMAPPED: {bytes: 2}
};


class PointAttributes{

	constructor(attributes){
		this.attributes = attributes;
		this.bytes = attributes.reduce( (sum, attribute) => (sum + attribute.bytes), 0);

	}

}

module.exports.PointAttribute = PointAttribute;
module.exports.PointAttributes = PointAttributes;