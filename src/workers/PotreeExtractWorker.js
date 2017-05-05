class PotreeExtractRegionWorker extends Worker{
	
	// box is a 4x4 matrix that specifies a transformation from a 
	// 1x1x1 box at the origin (coordinates from -0.5 to 0.)
	// to an oriented box in space. 
	// Points within that oriented box are considered "inside" and will be extracted.
	//
	constructor(pointcloud, box){
		super();
		
		this.pointcloud = pointcloud;
		this.box = box;
	}
	
	start(){
		super.start();
		
		let purl = url.parse(this.pointcloud);
		let realPointcloudPath = serverWorkingDirectory + purl.pathname.substr(1);
		let outPath = `${outputDirectory}/${this.uuid}/result.las`;
		
		console.log("realPointcloudPath", realPointcloudPath);
		
		let args = [
			realPointcloudPath,
			"--coordinates", this.coordinates,
			"--width", this.width, 
			"--min-level", this.minLevel, 
			"--max-level", this.maxLevel, 
			"-o", outPath
		];
		
		this.outPath = outPath;
		
		console.log("spawing elevation profile task with arguments: ");
		console.log(args);
		
		let process = spawn(elevationProfileExe, args, {shell: false});
		process.on('close', (code) => {
			this.done();
		});

	}
	
	cancel(){
		super.cancel();
	}
	
	getStatus(){
		
		let status = super.getStatus();
		
		if(this.status === workerStatus.FINISHED){
			status.link = `./get_las?workerID=${this.uuid}`;
		}
		
		return status;
	};
	
	
	statusPage(){
		
		let finished = this.finished ? this.finished.toLocaleString() : "no yet";
		
		let content = "";
		if([workerStatus.FINISHED, workerStatus.CANCELED].includes(this.status)){
			// TODO URL is hardcoded!!
			let downloadLink = `./get_las?workerID=${this.uuid}`;
			content = `
			Extracted profile is available for download at: <br>
			<a href="${downloadLink}">${downloadLink}</a>
			`;
		}else{
			content = `Profile extraction in progress.`;
		}
		
		let page = `
		<html>
		<style>${css}</style>
		<body>
		
		<div class="centering">
		<div class="panel">
			<span id="titlebar" class="titlebar">Profile Extraction - Status</span>
			<span id="workerdata" class="workerdata">
				<table>
					<tr>
						<td>uuid</td>
						<td>${this.uuid}</td>
					</tr>
					<tr>
						<td>started</td>
						<td>${this.started.toLocaleString()}</td>
					</tr>
					<tr>
						<td>finished</td>
						<td>${finished}</td>
					</tr>
				</table>
			</span>
			<span id="content" class="content">
				${content}
			</span>
		</div>
		</div>	
		
		</body>
		</html>
		`;
		
		return page;
	}
};