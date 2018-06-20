
class LASHeader{

	constructor(){
		this.versionMajor = 1;
		this.versionMinor = 2;
		this.headerSize = 227;
		this.pointDataFormat = 2;
		this.pointDataRecordLength = 26;
		this.numPoints = 0;
		this.scale = 0.001;
		this.offset = [0, 0, 0];
		this.min = [0, 0, 0];
		this.max = [0, 0, 0];
	}

	toBuffer(){
		let buffer = Buffer.from(new Uint8Array(227));

		let fileSignature = "LASF";
		buffer[0] = fileSignature.charCodeAt(0);
		buffer[1] = fileSignature.charCodeAt(1);
		buffer[2] = fileSignature.charCodeAt(2);
		buffer[3] = fileSignature.charCodeAt(3);

		// buffer[4-5] file source id
		// buffer[6-7] global encoding
		// buffer[8-11] project id guid data 1
		// buffer[8-11] project id guid data 1
		// buffer[12-13] project id guid data 1
		// buffer[14-15] project id guid data 1
		// buffer[16-23] project id guid data 1

		// version major
		buffer[24] = this.versionMajor;

		// version minor
		buffer[25] = this.versionMinor;

		//buffer[26-57] system identifier
		//buffer[58-89] generating software
		//buffer[90-61] creation day of year
		//buffer[92-93] creation year
		
		// header size
		buffer.writeUInt16LE(this.headerSize, 94);

		// offset to point data
		buffer.writeUInt32LE(this.headerSize, 96);

		// num VLRs
		buffer.writeUInt32LE(0, 100);

		// point data format
		buffer[104] = this.pointDataFormat;

		// point data record length
		buffer.writeUInt16LE(this.pointDataRecordLength, 105);
		
		// num points
		buffer.writeUInt32LE(this.numPoints, 107);

		// number of points by return
		buffer.writeUInt32LE(this.numPoints, 111);
		buffer.writeUInt32LE(0, 115);
		buffer.writeUInt32LE(0, 119);
		buffer.writeUInt32LE(0, 123);
		buffer.writeUInt32LE(0, 127);

		// scale factors
		buffer.writeDoubleLE(this.scale, 131);
		buffer.writeDoubleLE(this.scale, 139);
		buffer.writeDoubleLE(this.scale, 147);

		// offsets
		buffer.writeDoubleLE(this.offset[0], 155);
		buffer.writeDoubleLE(this.offset[1], 163);
		buffer.writeDoubleLE(this.offset[2], 171);

		// bounding box [max x, min x, y, y, z, z]
		buffer.writeDoubleLE(this.max[0], 179);
		buffer.writeDoubleLE(this.min[0], 187);
		buffer.writeDoubleLE(this.max[1], 195);
		buffer.writeDoubleLE(this.min[1], 203);
		buffer.writeDoubleLE(this.max[2], 211);
		buffer.writeDoubleLE(this.min[2], 219);

		return buffer;
	}

}




module.exports.LASHeader = LASHeader;